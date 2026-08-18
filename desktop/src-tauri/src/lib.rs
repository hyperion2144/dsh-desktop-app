//! DeepSeek Harness 桌面壳核心逻辑。
//!
//! 职责：
//! 1. 启动时探测本地 dsh 服务（默认 127.0.0.1:3080），空闲则 spawn `dsh web` 子进程；
//! 2. 轮询服务就绪后把主窗口从 loading 页导航到 Web GUI；
//! 3. 托盘常驻：关闭窗口仅隐藏，托盘菜单可显示/退出；
//! 4. 应用退出时回收本次启动的子进程，复用已有实例时不动它。

use std::{
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant},
};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_notification::NotificationExt;

/// 桌面壳与 dsh 服务的约定端口（可用 `DSH_DESKTOP_PORT` 覆盖，调试用）。
fn app_port() -> u16 {
    std::env::var("DSH_DESKTOP_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3080)
}

/// 等待服务就绪的超时时间。
const READY_TIMEOUT: Duration = Duration::from_secs(60);

/// 从 nvm 版本目录名（如 v22.12.0）解析可比较的版本键；无法解析的返回 (0,0,0)。
/// 注意：目录名必须按 semver 比较排序，字符串排序会把 v9.11.0 排在 v22.12.0 之后。
fn version_key(path: &std::path::Path) -> (u64, u64, u64) {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let parts: Vec<u64> = name
        .trim_start_matches('v')
        .split('.')
        .map(|p| p.parse().unwrap_or(0))
        .collect();
    (
        parts.first().copied().unwrap_or(0),
        parts.get(1).copied().unwrap_or(0),
        parts.get(2).copied().unwrap_or(0),
    )
}

/// spawn dsh 的失败原因：NotFound 供错误页提示"未找到"，其余归为其它失败。
enum SpawnError {
    NotFound(String),
    Other(String),
}

impl std::fmt::Display for SpawnError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpawnError::NotFound(m) | SpawnError::Other(m) => f.write_str(m),
        }
    }
}

/// 桌面壳的共享运行时状态。
struct DshState {
    /// 本次运行 spawn 的 dsh 子进程（None = 复用了已有实例）。
    child: Mutex<Option<Child>>,
    /// 子进程是否由本次运行启动（决定退出时是否回收）。
    spawned_this_run: AtomicBool,
    /// spawn 失败标志（立即终止等待并跳错误页）。
    spawn_failed: AtomicBool,
    /// 托盘"退出"标志（置位后放行窗口关闭与应用退出）。
    quitting: AtomicBool,
    /// 是否已提示过"隐藏到托盘"。
    tray_tip_shown: AtomicBool,
    /// 未读任务完成数（Dock 角标）。
    unread: AtomicU32,
    /// 桌宠上次落盘位置的时间（Moved 事件 400ms 防抖）。
    pet_save_at: Mutex<Option<Instant>>,
}

/// 定位 dsh 可执行文件。
///
/// Finder 启动的 GUI 应用 PATH 里没有终端配置（nvm bin、npm 全局 bin 都不在），
/// 所以除 PATH 外还要探测常见安装位置。
#[cfg(unix)]
fn find_dsh_bin() -> Option<PathBuf> {
    // 1. 显式覆盖：DSH_BIN 环境变量
    if let Ok(p) = std::env::var("DSH_BIN") {
        let pb = PathBuf::from(&p);
        if pb.is_file() {
            log::info!("使用 DSH_BIN 指定的 dsh：{}", pb.display());
            return Some(pb);
        }
        log::warn!("DSH_BIN 指向的文件不存在：{}", pb.display());
    }
    // 2. PATH（终端启动 / tauri dev 场景）
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let pb = dir.join("dsh");
            if pb.is_file() {
                log::info!("在 PATH 中找到 dsh：{}", pb.display());
                return Some(pb);
            }
        }
    }
    // 3. 常见安装位置
    let home = std::env::var("HOME").unwrap_or_default();
    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from("/opt/homebrew/bin/dsh"),
        PathBuf::from("/usr/local/bin/dsh"),
        PathBuf::from(&home).join(".npm-global/bin/dsh"),
    ];
    // 3a. nvm 管理的 node（按 semver 取版本号最高的目录）
    let nvm_root = PathBuf::from(&home).join(".nvm/versions/node");
    if let Ok(entries) = std::fs::read_dir(&nvm_root) {
        let mut dirs: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort_by_key(|d| version_key(d));
        for d in dirs.iter().rev() {
            candidates.push(d.join("bin/dsh"));
        }
    }
    // 3b. npx 缓存（取修改时间最新的目录，防缓存漂移）
    let npx_root = PathBuf::from(&home).join(".npm/_npx");
    if let Ok(entries) = std::fs::read_dir(&npx_root) {
        let mut dirs: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort_by_key(|p| p.metadata().and_then(|m| m.modified()).ok());
        for d in dirs.iter().rev() {
            candidates.push(d.join("node_modules/.bin/dsh"));
        }
    }
    candidates.into_iter().find(|p| {
        if p.is_file() {
            log::info!("找到 dsh：{}", p.display());
            true
        } else {
            false
        }
    })
}

/// 探测 127.0.0.1:port 是否已有服务在监听。
fn port_open(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(300),
    )
    .is_ok()
}

/// 构造 spawn dsh 时的运行时 PATH。
///
/// Finder 启动的 GUI 应用 PATH 只有 `/usr/bin:/bin`，而 dsh 是 Node 脚本
/// （shebang 依赖 `node`）。把 dsh 所在目录、nvm 各版本 bin、Homebrew 等
/// 候选目录补充到子进程 PATH 前面。
#[cfg(unix)]
fn dsh_runtime_path(bin: &std::path::Path) -> std::ffi::OsString {
    let mut paths: Vec<PathBuf> = Vec::new();
    if let Some(parent) = bin.parent() {
        paths.push(parent.to_path_buf());
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let nvm_root = PathBuf::from(&home).join(".nvm/versions/node");
    if let Ok(entries) = std::fs::read_dir(&nvm_root) {
        let mut dirs: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        dirs.sort_by_key(|d| version_key(d));
        for d in dirs.iter().rev() {
            paths.push(d.join("bin"));
        }
    }
    for p in ["/opt/homebrew/bin", "/usr/local/bin"] {
        paths.push(PathBuf::from(p));
    }
    paths.push(PathBuf::from(&home).join(".npm-global/bin"));
    // rustup 的 cargo/rustc：终端启动的 dsh 有，GUI 启动的 dsh 子进程没有
    paths.push(PathBuf::from(&home).join(".cargo/bin"));
    if let Some(existing) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&existing));
    }
    std::env::join_paths(paths).unwrap_or_else(|_| std::ffi::OsString::from("/usr/bin:/bin"))
}

/// spawn `dsh web --host 127.0.0.1 --port <port>`，stdout/stderr 转发到日志。
#[cfg(unix)]
fn spawn_dsh(port: u16) -> Result<Child, SpawnError> {
    let bin = find_dsh_bin().ok_or_else(|| {
        SpawnError::NotFound(
            "未找到 dsh 命令。请执行 `npm i -g @deepseek-ai/dsh` 或设置 DSH_BIN 环境变量。"
                .to_string(),
        )
    })?;
    let mut cmd = Command::new(&bin);
    cmd.args(["web", "--host", "127.0.0.1", "--port", &port.to_string()])
        .env("PATH", dsh_runtime_path(&bin))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| SpawnError::Other(format!("spawn {} 失败：{e}", bin.display())))?;
    log::info!("已启动 dsh web（{}，PID {}）", bin.display(), child.id());
    if let Some(out) = child.stdout.take() {
        thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                log::info!("[dsh] {line}");
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                log::warn!("[dsh] {line}");
            }
        });
    }
    Ok(child)
}

// ==================== Windows 分支 ====================
// 注意：以下代码只在 Windows 上编译（macOS 构建时被 cfg 完全排除），
// 已在 macOS 之外无法本机验证；若 Windows 编译报错，按编译器提示修正。

/// Windows：定位 node.exe（nvm-windows / 官方安装器 / PATH）。
#[cfg(windows)]
fn find_node() -> Option<PathBuf> {
    // ① 显式覆盖：DSH_NODE
    if let Ok(p) = std::env::var("DSH_NODE") {
        let pb = PathBuf::from(&p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    // ② PATH 中的 node.exe
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            let pb = dir.join("node.exe");
            if pb.is_file() {
                return Some(pb);
            }
        }
    }
    // ③ nvm-windows：%NVM_HOME%\v*\node.exe、%NVM_SYMLINK%\node.exe、%APPDATA%\nvm\v*
    let mut candidates: Vec<PathBuf> = Vec::new();
    let mut nvm_roots: Vec<PathBuf> = Vec::new();
    if let Ok(h) = std::env::var("NVM_HOME") {
        nvm_roots.push(PathBuf::from(h));
    }
    if let Ok(a) = std::env::var("APPDATA") {
        nvm_roots.push(PathBuf::from(&a).join("nvm"));
    }
    for root in &nvm_roots {
        if let Ok(entries) = std::fs::read_dir(root) {
            let mut dirs: Vec<PathBuf> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.is_dir())
                .collect();
            dirs.sort_by_key(|d| version_key(d));
            for d in dirs.iter().rev() {
                candidates.push(d.join("node.exe"));
            }
        }
        candidates.push(root.join("node.exe"));
    }
    if let Ok(s) = std::env::var("NVM_SYMLINK") {
        candidates.push(PathBuf::from(s).join("node.exe"));
    }
    // ④ 官方安装器固定路径
    for p in [
        r"C:\Program Files\nodejs\node.exe",
        r"C:\Program Files (x86)\nodejs\node.exe",
    ] {
        candidates.push(PathBuf::from(p));
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// Windows：定位 dsh 的 bin.js（npm/nvm/pnpm 全局安装位置）。
/// 支持 DSH_BIN 直接指向 bin.js 或任意可执行文件。
#[cfg(windows)]
fn find_dsh_bin_js() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("DSH_BIN") {
        let pb = PathBuf::from(&p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    const REL: &str = "node_modules\\@deepseek-ai\\dsh\\lib\\bin.js";
    let mut roots: Vec<PathBuf> = Vec::new();
    if let Ok(a) = std::env::var("APPDATA") {
        roots.push(PathBuf::from(&a).join("npm"));
        roots.push(PathBuf::from(&a).join("pnpm"));
        let nvm_dir = PathBuf::from(&a).join("nvm");
        roots.push(nvm_dir.clone());
        // nvm 各版本目录（node_modules 可能装在版本目录下）
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            for e in entries.flatten() {
                if e.path().is_dir() {
                    roots.push(e.path());
                }
            }
        }
    }
    if let Ok(l) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(&l).join("pnpm"));
    }
    if let Ok(h) = std::env::var("NVM_HOME") {
        roots.push(PathBuf::from(&h));
        if let Ok(entries) = std::fs::read_dir(&h) {
            for e in entries.flatten() {
                if e.path().is_dir() {
                    roots.push(e.path());
                }
            }
        }
    }
    if let Ok(s) = std::env::var("NVM_SYMLINK") {
        roots.push(PathBuf::from(s));
    }
    roots.push(PathBuf::from(r"C:\Program Files\nodejs"));
    roots.push(PathBuf::from(r"C:\Program Files (x86)\nodejs"));
    // PATH 目录（dsh.cmd 所在目录一般就是全局 bin，node_modules 在附近）
    if let Some(paths) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&paths) {
            roots.push(dir);
        }
    }
    roots
        .into_iter()
        .map(|root| root.join(REL))
        .find(|p| p.is_file())
}

/// Windows：spawn `node <bin.js> web ...`。
///
/// npm 全局安装的 dsh 在 Windows 是 dsh.cmd shim，直接 CreateProcess 有引号
/// 转义坑，所以直接用 node.exe 执行 bin.js；CREATE_NO_WINDOW 防止闪黑窗。
#[cfg(windows)]
fn spawn_dsh(port: u16) -> Result<Child, SpawnError> {
    use std::os::windows::process::CommandExt;
    let node = find_node().ok_or_else(|| {
        SpawnError::NotFound(
            "未找到 node.exe。请安装 Node.js 或设置 DSH_NODE 环境变量。".to_string(),
        )
    })?;
    let bin_js = find_dsh_bin_js().ok_or_else(|| {
        SpawnError::NotFound(
            "未找到 @deepseek-ai/dsh。请执行 `npm i -g @deepseek-ai/dsh`，或设置 DSH_BIN 指向 bin.js。"
                .to_string(),
        )
    })?;
    let mut cmd = Command::new(&node);
    cmd.arg(&bin_js)
        .args(["web", "--host", "127.0.0.1", "--port", &port.to_string()])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let mut child = cmd
        .spawn()
        .map_err(|e| SpawnError::Other(format!("spawn node {} 失败：{e}", node.display())))?;
    log::info!(
        "已启动 dsh web（node {} {}，PID {}）",
        node.display(),
        bin_js.display(),
        child.id()
    );
    if let Some(out) = child.stdout.take() {
        thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                log::info!("[dsh] {line}");
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                log::warn!("[dsh] {line}");
            }
        });
    }
    Ok(child)
}

/// 生成把 Web GUI 顶部区域设为可拖拽窗口的 CSS（macOS `titleBarStyle: "Overlay"`
/// 需要显式拖拽区，否则窗口无法拖动）。仅设置 `-webkit-app-region: drag`，不改
/// 任何视觉/图标/名称——Web GUI 原样保留。
/// 选择器覆盖 sidebar 顶部品牌区与"鱼 logo"位（DSH Web GUI 编译产物稳定存在的类）。
fn drag_region_css() -> String {
    r#"[class*="brand"]{-webkit-app-region:drag !important}[class*="railFish"]{-webkit-app-region:drag !important}[class*="brand"] *{pointer-events:auto}[class*="brand"] a,[class*="brand"] button,[class*="brand"] input,[class*="brand"] [role="button"]{-webkit-app-region:no-drag !important}"#.to_string()
}

/// 导航完成后向 Web GUI 注入拖拽区 CSS（脚本自带 DOM 就绪重试）。
fn inject_drag_region(app: AppHandle) {
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        let css_json = serde_json::to_string(&drag_region_css()).unwrap_or_default();
        let script = format!(
            "(function(){{var css={css_json};function t(){{if(!document.head)return false;var s=document.getElementById('dsh-desktop-drag-region');if(!s){{s=document.createElement('style');s.id='dsh-desktop-drag-region';s.textContent=css;document.head.appendChild(s);}}return true;}}if(!t()){{var i=setInterval(function(){{if(t())clearInterval(i);}},250);setTimeout(function(){{clearInterval(i);}},15000);}}}})();"
        );
        if let Some(w) = handle.get_webview_window("main") {
            if let Err(e) = w.eval(&script) {
                log::warn!("拖拽区 CSS 注入失败：{e}");
            } else {
                log::info!("macOS 标题栏 Overlay 拖拽区已注入（不改名称/图标）");
            }
        }
    });
}

/// 生成本地通知服务器的访问 token（防本机其它进程误触发；非加密学强度）。
fn random_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("xnl{:x}{:x}", nanos, std::process::id())
}

/// 启动本地 HTTP 通知服务器（127.0.0.1 随机端口），返回 (端口, token)。
/// 页面注入 JS 通过 POST /notify 上报任务完成。
fn start_notify_server(app: AppHandle) -> (u16, String) {
    let token = random_token();
    let listener = match std::net::TcpListener::bind(("127.0.0.1", 0)) {
        Ok(l) => l,
        Err(e) => {
            log::warn!("通知服务器启动失败：{e}");
            return (0, token);
        }
    };
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(0);
    listener.set_nonblocking(true).ok();
    let handle = app.clone();
    let tok = token.clone();
    tauri::async_runtime::spawn(async move {
        let listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(l) => l,
            Err(_) => return,
        };
        loop {
            let (mut sock, _) = match listener.accept().await {
                Ok(x) => x,
                Err(_) => continue,
            };
            let handle = handle.clone();
            let tok = tok.clone();
            tauri::async_runtime::spawn(async move {
                handle_notify_conn(&mut sock, &handle, &tok).await;
            });
        }
    });
    log::info!("任务完成通知服务器已启动：127.0.0.1:{port}");
    (port, token)
}

/// CORS 响应头：注入脚本从 `127.0.0.1:3080` 跨源 fetch 到本桥（随机端口），
/// `Content-Type: application/json` + `Authorization` 头会触发浏览器 preflight；
/// 不回 OPTIONS 与 `Access-Control-Allow-*` 头，浏览器会直接拦截实际请求
/// （0.3.0 任务通知"收不到"的根因之一）。
const CORS_HEADERS: &str = "Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
Access-Control-Max-Age: 86400\r\n";

/// 处理单条通知连接：先应答 CORS 预检，再校验 Bearer token、解析 JSON body、触发通知。
async fn handle_notify_conn(sock: &mut tokio::net::TcpStream, app: &AppHandle, token: &str) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut buf = [0u8; 4096];
    let n = match sock.read(&mut buf).await {
        Ok(n) if n > 0 => n,
        _ => return,
    };
    let req = String::from_utf8_lossy(&buf[..n]).to_string();
    // 预检 OPTIONS 不带 body、不校验 token，回 204 + CORS 头后由浏览器发起正式 POST。
    if req.starts_with("OPTIONS ") {
        let _ = sock
            .write_all(
                format!("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n{CORS_HEADERS}\r\n")
                    .as_bytes(),
            )
            .await;
        return;
    }
    if !req.contains(&format!("Bearer {token}")) {
        let _ = sock
            .write_all(b"HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n")
            .await;
        return;
    }
    let body = req.split("\r\n\r\n").nth(1).unwrap_or("").trim().to_string();
    let mut msg = "任务已完成".to_string();
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&body) {
        if let Some(s) = v.get("body").and_then(|x| x.as_str()) {
            msg = s.to_string();
        }
    }
    notify_completed(app, &msg);
    let _ = sock
        .write_all(
            format!("HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n{CORS_HEADERS}\r\n")
                .as_bytes(),
        )
        .await;
}

/// 收到任务完成信号后的壳侧动作：Dock 角标 +1；仅窗口失焦/隐藏时弹通知并跳 Dock。
fn notify_completed(app: &AppHandle, body: &str) {
    let distracted = app
        .get_webview_window("main")
        .map(|w| {
            let focused = w.is_focused().unwrap_or(true);
            let visible = w.is_visible().unwrap_or(true);
            !focused || !visible
        })
        .unwrap_or(true);
    let state = app.state::<DshState>();
    let unread = state.unread.fetch_add(1, Ordering::SeqCst) + 1;
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.set_badge_count(Some(unread as i64));
        if distracted {
            let _ = app
                .notification()
                .builder()
                .title("Deepseek Harness · 任务完成")
                .body(body)
                .show();
            let _ = w.request_user_attention(Some(tauri::UserAttentionType::Informational));
        }
    }
    // 桌宠气泡：可见时推送 pet-say 事件（前端气泡 5s 自动收起）
    if let Some(pet) = app.get_webview_window("pet") {
        if pet.is_visible().unwrap_or(false) {
            let _ = app.emit("pet-say", serde_json::json!({ "body": body }));
        }
    }
    log::info!("任务完成通知：{}（未读 {unread}，失焦={distracted}）", body);
}

/// 生成页面侧任务完成监听脚本：轮询"忙碌→空闲"翻转，翻转即上报。
fn task_notifier_script(port: u16, token: &str) -> String {
    let js = r#"
(function(){
  if (window.__xnlNotify) return;
  window.__xnlNotify = true;
  var PORT = __PORT__, TOKEN = "__TOKEN__";
  var wasBusy = false, lastFire = 0;
  function isBusy(){
    try {
      // 运行中标记：GUI 的加载 spinner 用 data-state="ongoing"（编译产物实测存在；
      // 旧的"停止"是运行时 i18n 文案，bundle 里 0 次，永远判不出忙碌）
      if (document.querySelector('[data-state="ongoing"]')) return true;
      if (document.querySelector('[aria-busy="true"]')) return true;
    } catch(e){}
    return false;
  }
  function fire(){
    var now = Date.now();
    if (now - lastFire < 3000) return;
    lastFire = now;
    try {
      fetch('http://127.0.0.1:'+PORT+'/notify', {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+TOKEN},
        body: JSON.stringify({type:'task-complete', body:'任务已完成，回来看看吧'})
      });
    } catch(e){}
  }
  setInterval(function(){
    var b = isBusy();
    if (wasBusy && !b) fire();
    wasBusy = b;
  }, 1000);
})();
"#;
    js.replace("__PORT__", &port.to_string())
        .replace("__TOKEN__", token)
}

/// 导航完成后注入任务完成监听（脚本自带守卫，重复注入无害）。
fn inject_task_notifier(app: AppHandle, port: u16, token: &str) {
    if port == 0 {
        return;
    }
    let handle = app.clone();
    let script = task_notifier_script(port, token);
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(2500)).await;
        if let Some(w) = handle.get_webview_window("main") {
            if let Err(e) = w.eval(&script) {
                log::warn!("任务完成监听注入失败：{e}");
            } else {
                log::info!("任务完成监听已注入（忙碌→空闲检测）");
            }
        }
    });
}

/// 轮询等待服务就绪，然后把主窗口导航到 Web GUI；失败则跳错误页。
/// `nport`/`ntoken` 是通知桥的端口与令牌，导航完成后才注入监听脚本。
async fn wait_ready_and_navigate(app: AppHandle, port: u16, nport: u16, ntoken: String) {
    let state = app.state::<DshState>();
    let url = format!("http://127.0.0.1:{port}/");
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if state.spawn_failed.load(Ordering::SeqCst) {
            // 错误页已由 setup 按具体原因（not-found / spawn-failed）显示，这里不再二次导航
            return;
        }
        if port_open(port) {
            if let Some(w) = app.get_webview_window("main") {
                let script = format!("window.location.replace({url:?});");
                if let Err(e) = w.eval(&script) {
                    log::warn!("窗口导航失败：{e}");
                    show_error(&app, "spawn-failed");
                    return;
                }
                inject_drag_region(app.clone());
                // 导航后注入监听：0.3.0 在 setup 阶段提前注入，冷启动时脚本
                // 落在加载页、随导航销毁（通知收不到的根因之二）。
                inject_task_notifier(app.clone(), nport, &ntoken);
            }
            log::info!("本地服务就绪，已导航到 {url}");
            return;
        }
        if Instant::now() >= deadline {
            log::error!("等待本地服务就绪超时（{}s）", READY_TIMEOUT.as_secs());
            show_error(&app, "timeout");
            return;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

/// 主窗口跳转到本地错误页并发系统通知。
fn show_error(app: &AppHandle, reason: &str) {
    if let Some(w) = app.get_webview_window("main") {
        let target = format!("error.html?reason={reason}");
        let _ = w.eval(&format!("window.location.replace({target:?});"));
    }
    let body = match reason {
        "not-found" => "未找到 dsh 命令，请按错误页提示安装。",
        "spawn-failed" => "dsh 进程启动失败，详见日志。",
        "timeout" => "等待本地服务就绪超时，详见日志。",
        _ => "未知错误，详见日志。",
    };
    let _ = app
        .notification()
        .builder()
        .title("Deepseek Harness 启动失败")
        .body(body)
        .show();
}

/// 显示并聚焦主窗口。
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// ==================== 桌宠（透明置顶小窗） ====================

/// 桌宠窗口尺寸（物理像素），与 tauri.conf.json 中 pet 窗口 width/height 一致，
/// 用于载入位置时的多屏钳位。
const PET_W: i32 = 260;
const PET_H: i32 = 300;

/// 桌宠持久化状态（存 app_config_dir/pet.json，物理像素坐标）。
#[derive(serde::Serialize, serde::Deserialize, Default, Clone)]
struct PetState {
    x: i32,
    y: i32,
    enabled: bool,
    passthrough: bool,
}

fn pet_state_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("pet.json"))
}

fn read_pet_state(app: &AppHandle) -> PetState {
    let Some(path) = pet_state_path(app) else {
        return PetState::default();
    };
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write_pet_state(app: &AppHandle, st: &PetState) {
    let Some(path) = pet_state_path(app) else { return };
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string_pretty(st) {
        let _ = std::fs::write(&path, json);
    }
}

/// 载入坐标钳位到可见显示器；全都不在（如拔了外接屏）则回退主屏右下角。
fn clamp_pet_to_monitors(pet: &tauri::WebviewWindow, x: i32, y: i32) -> (i32, i32) {
    if let Ok(monitors) = pet.available_monitors() {
        for m in &monitors {
            let wa = m.work_area();
            let (wx, wy) = (wa.position.x, wa.position.y);
            let (ww, wh) = (wa.size.width as i32, wa.size.height as i32);
            if x >= wx && x + PET_W <= wx + ww && y >= wy && y + PET_H <= wy + wh {
                return (x, y);
            }
        }
    }
    if let Ok(Some(m)) = pet.primary_monitor() {
        let wa = m.work_area();
        let (wx, wy) = (wa.position.x, wa.position.y);
        let (ww, wh) = (wa.size.width as i32, wa.size.height as i32);
        return (wx + ww - PET_W - 16, wy + wh - PET_H - 16);
    }
    (x, y)
}

/// 启动时恢复桌宠位置与可见性（窗口由 tauri.conf.json 声明自动创建）。
fn setup_pet(app: &AppHandle) {
    let Some(pet) = app.get_webview_window("pet") else {
        return;
    };
    let st = read_pet_state(app);
    let (cx, cy) = clamp_pet_to_monitors(&pet, st.x, st.y);
    let _ = pet.set_position(tauri::PhysicalPosition::new(cx, cy));
    if st.passthrough {
        let _ = pet.set_ignore_cursor_events(true);
    }
    if st.enabled {
        let _ = pet.show();
    }
}

/// 显示/隐藏桌宠（托盘与右键共用），并写回 enabled 状态。
fn toggle_pet(app: &AppHandle) {
    let Some(pet) = app.get_webview_window("pet") else {
        return;
    };
    let mut st = read_pet_state(app);
    if pet.is_visible().unwrap_or(false) {
        let _ = pet.hide();
        st.enabled = false;
    } else {
        let _ = pet.show();
        st.enabled = true;
    }
    write_pet_state(app, &st);
}

#[tauri::command]
fn pet_show_main(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
fn pet_hide(app: AppHandle) {
    if let Some(pet) = app.get_webview_window("pet") {
        let _ = pet.hide();
    }
    let mut st = read_pet_state(&app);
    st.enabled = false;
    write_pet_state(&app, &st);
}

#[tauri::command]
fn pet_quit(app: AppHandle) {
    app.state::<DshState>().quitting.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
fn pet_toggle_passthrough(app: AppHandle) -> bool {
    let mut st = read_pet_state(&app);
    st.passthrough = !st.passthrough;
    if let Some(pet) = app.get_webview_window("pet") {
        let _ = pet.set_ignore_cursor_events(st.passthrough);
    }
    write_pet_state(&app, &st);
    st.passthrough
}

/// 构建菜单栏托盘：左键显示窗口，菜单提供显示/隐藏桌宠/退出。
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let pet = MenuItem::with_id(app, "pet", "显示/隐藏桌宠", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Deepseek Harness", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &pet, &quit])?;
    // 托盘专用图标：从 64x64 PNG（macOS 菜单栏 32pt @2x = 64px 甜点尺寸）加载，
    // 优先用 include_bytes 编译期嵌入；加载失败回退 default_window_icon。
    // DeepSeek Harness 图标本身有颜色，不当模板图（icon_as_template=false）。
    let icon: tauri::image::Image<'_> = tauri::image::Image::from_bytes(include_bytes!("../icons/64x64.png"))
        .ok()
        .map(tauri::image::Image::to_owned)
        .map(tauri::image::Image::into)
        .unwrap_or_else(|| {
            app.default_window_icon()
                .expect("缺少应用图标")
                .clone()
        });
    TrayIconBuilder::with_id("dsh-tray")
        .icon(icon)
        .icon_as_template(false)
        .tooltip("Deepseek Harness")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main(app),
            "pet" => toggle_pet(app),
            "quit" => {
                app.state::<DshState>().quitting.store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("dsh-desktop".into()),
                    }),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["pet"])
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .invoke_handler(tauri::generate_handler![
            pet_show_main,
            pet_hide,
            pet_quit,
            pet_toggle_passthrough
        ])
        .manage(DshState {
            child: Mutex::new(None),
            spawned_this_run: AtomicBool::new(false),
            spawn_failed: AtomicBool::new(false),
            quitting: AtomicBool::new(false),
            tray_tip_shown: AtomicBool::new(false),
            unread: AtomicU32::new(0),
            pet_save_at: Mutex::new(None),
        })
        .setup(|app| {
            let port = app_port();
            let state = app.state::<DshState>();
            if port_open(port) {
                log::info!("127.0.0.1:{port} 已有服务在监听，直接复用现有实例");
            } else {
                match spawn_dsh(port) {
                    Ok(child) => {
                        log::info!("dsh 子进程已启动（PID {}）", child.id());
                        *state.child.lock().unwrap() = Some(child);
                        state.spawned_this_run.store(true, Ordering::SeqCst);
                    }
                    Err(SpawnError::NotFound(e)) => {
                        log::error!("启动 dsh 失败：{e}");
                        state.spawn_failed.store(true, Ordering::SeqCst);
                        show_error(app.handle(), "not-found");
                    }
                    Err(SpawnError::Other(e)) => {
                        log::error!("启动 dsh 失败：{e}");
                        state.spawn_failed.store(true, Ordering::SeqCst);
                        show_error(app.handle(), "spawn-failed");
                    }
                }
            }
            // 先起通知桥，把端口/token 交给导航任务；导航完成后再注入监听脚本
            //（0.3.0 在导航前注入，冷启动时脚本随加载页销毁）。
            let (nport, ntoken) = start_notify_server(app.handle().clone());
            let handle = app.handle().clone();
            let nav_token = ntoken.clone();
            tauri::async_runtime::spawn(async move {
                wait_ready_and_navigate(handle, port, nport, nav_token).await;
            });
            // 测试钩子：DSH_DESKTOP_AUTO_QUIT=1 时延迟自动退出（模拟托盘退出，验证子进程回收）
            if std::env::var("DSH_DESKTOP_AUTO_QUIT").as_deref() == Ok("1") {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(8)).await;
                    log::info!("[auto-quit] 测试钩子触发退出");
                    handle
                        .state::<DshState>()
                        .quitting
                        .store(true, Ordering::SeqCst);
                    handle.exit(0);
                });
            }
            // 测试钩子：DSH_DESKTOP_NOTIFY_TEST=1 时延迟触发一次通知（验证通知链路）
            if std::env::var("DSH_DESKTOP_NOTIFY_TEST").as_deref() == Ok("1") {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(6)).await;
                    notify_completed(&handle, "这是测试通知：任务完成链路验证");
                });
            }
            build_tray(app)?;
            setup_pet(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            match window.label() {
                "pet" => match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        // 桌宠不退出，只隐藏（退出走托盘/右键 pet_quit）
                        api.prevent_close();
                        let _ = window.hide();
                        let mut st = read_pet_state(window.app_handle());
                        st.enabled = false;
                        write_pet_state(window.app_handle(), &st);
                    }
                    WindowEvent::Moved(pos) => {
                        // 拖拽结束才落盘位置（400ms 防抖，避免拖动期间高频写盘）
                        let app = window.app_handle();
                        let state = app.state::<DshState>();
                        let now = Instant::now();
                        let should_save = state
                            .pet_save_at
                            .lock()
                            .map(|last| {
                                last.map_or(true, |t| now.duration_since(t) >= Duration::from_millis(400))
                            })
                            .unwrap_or(true);
                        if should_save {
                            let mut st = read_pet_state(&app);
                            st.x = pos.x;
                            st.y = pos.y;
                            write_pet_state(&app, &st);
                            if let Ok(mut last) = state.pet_save_at.lock() {
                                *last = Some(now);
                            }
                        }
                    }
                    _ => {}
                },
                "main" => {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let state = window.state::<DshState>();
                        if state.quitting.load(Ordering::SeqCst) {
                            return; // 托盘退出流程：放行关闭
                        }
                        api.prevent_close();
                        let _ = window.hide();
                        if !state.tray_tip_shown.swap(true, Ordering::SeqCst) {
                            let _ = window
                                .app_handle()
                                .notification()
                                .builder()
                                .title("Deepseek Harness 仍在运行")
                                .body("窗口已隐藏到菜单栏托盘，点击托盘图标可重新打开；托盘菜单可退出。")
                                .show();
                        }
                    } else if let WindowEvent::Focused(true) = event {
                        // 用户回到窗口：清零角标与未读数
                        let state = window.state::<DshState>();
                        state.unread.store(0, Ordering::SeqCst);
                        let _ = window.set_badge_count(None);
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::ExitRequested { api, .. } => {
                let quitting = app.state::<DshState>().quitting.load(Ordering::SeqCst);
                if !quitting {
                    api.prevent_exit();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            }
            RunEvent::Exit => {
                let state = app.state::<DshState>();
                if state.spawned_this_run.load(Ordering::SeqCst) {
                    if let Some(mut child) = state.child.lock().unwrap().take() {
                        let pid = child.id();
                        log::info!("正在停止 dsh 子进程（PID {pid}）");
                        let _ = child.kill();
                        let _ = child.wait();
                        log::info!("dsh 子进程已退出");
                    }
                }
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_key_parses_semver() {
        assert_eq!(version_key(std::path::Path::new("v22.12.0")), (22, 12, 0));
        assert_eq!(version_key(std::path::Path::new("v1.2.3.4")), (1, 2, 3));
        assert_eq!(version_key(std::path::Path::new("not-a-version")), (0, 0, 0));
    }

    #[test]
    fn version_key_orders_correctly() {
        // 字符串排序会把 v9.11.0 排在 v22.12.0 之后（'9' > '2'），
        // 这是此前取错"最新版本"的 bug，必须由 semver 键规避。
        let v9 = version_key(std::path::Path::new("v9.11.0"));
        let v22 = version_key(std::path::Path::new("v22.12.0"));
        assert!(v9 < v22, "v9.11.0 应小于 v22.12.0");
        let v2 = version_key(std::path::Path::new("v2.0.0"));
        let v10 = version_key(std::path::Path::new("v10.0.0"));
        assert!(v2 < v10, "v2.0.0 应小于 v10.0.0");
    }

    #[test]
    fn random_token_nonempty_and_unique() {
        let a = random_token();
        let b = random_token();
        assert!(!a.is_empty());
        assert_ne!(a, b, "连续两次生成的 token 不应相同");
    }

    #[test]
    fn drag_region_css_marks_top_header_draggable() {
        let css = drag_region_css();
        assert!(css.contains("-webkit-app-region:drag"), "应启用 macOS 拖拽区");
        assert!(css.contains("-webkit-app-region:no-drag"), "应排除交互元素");
        assert!(css.contains("brand"), "应命中顶部品牌选择器");
        assert!(!css.contains("data:image/png;base64,"), "不应注入任何图标（不改 Web GUI 视觉）");
        assert!(!css.contains("Deepseek Harness"), "不应注入应用名（不改 Web GUI 文本）");
    }

    #[test]
    fn spawn_error_display() {
        assert_eq!(SpawnError::NotFound("nope".into()).to_string(), "nope");
        assert_eq!(SpawnError::Other("boom".into()).to_string(), "boom");
    }
}
