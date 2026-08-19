//! DeepSeek Harness 桌面壳核心逻辑。
//!
//! 职责：
//! 1. 启动时探测本地 dsh 服务（默认 127.0.0.1:3080，`DSH_DESKTOP_PORT` 可覆盖）：
//!    已监听则复用现有实例并「降级接入」（不带 advanced 标记，避免 layout 服务冲突）；
//!    空闲则由本应用 spawn 一个带禁 stock ui-layout 的 `--patch` overlay 的实例并启用桌面 chrome；
//! 2. 轮询服务就绪后把主窗口从 loading 页导航到 Web GUI；
//! 3. 托盘常驻：关闭窗口仅隐藏，托盘菜单可显示/退出；
//! 4. 应用退出时回收本次启动的子进程，复用已有实例时不动它。

use std::{
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpStream},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
atomic::{AtomicBool, AtomicU16, AtomicU32, Ordering},
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

/// dsh 服务端口（默认 3080，与浏览器/终端共用；`DSH_DESKTOP_PORT` 可覆盖）。
/// 策略：端口已有 dsh web → 复用并降级接入（不带 advanced 标记）；空闲 → 由本应用
/// spawn 一个携带禁 stock ui-layout 的 `--patch` overlay 的实例并启用桌面 chrome。
/// 注意：同一 profile 只允许一个 dsh web 实例并发（task-board 等插件持有排它锁），
/// 因此不要用独立端口再起第二实例。
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
    /// 子进程是否由本次启动启动（决定退出时是否回收、重启时是否生效）。
    spawned_this_run: AtomicBool,
    /// spawn 失败标志（立即终止等待并跳错误页）。
    spawn_failed: AtomicBool,
    /// 重启流程进行中（防止重复点击托盘重启项导致并发 kill/spawn）。
    restarting: AtomicBool,
    /// 托盘"退出"标志（置位后放行窗口关闭与应用退出）。
    quitting: AtomicBool,
    /// 是否已提示过"隐藏到托盘"。
    tray_tip_shown: AtomicBool,
    /// 未读任务完成数（Dock 角标）。
    unread: AtomicU32,
    /// 桌宠上次落盘位置的时间（Moved 事件 400ms 防抖）。
    pet_save_at: Mutex<Option<Instant>>,
    /// 任务通知服务器端口（重启 dsh 后复用同一端口重新注入 JS）。
    notify_port: AtomicU16,
    /// 任务通知服务器访问 token（仅启动时生成一次，重启复用）。
    notify_token: Mutex<String>,
    /// 双击拖拽区"缩放"前的主窗口几何（None = 当前处于标准尺寸，可触发放大；
    /// Some = 当前已放大，再双击恢复到此几何）。Mutex 防并发双击。
    pre_zoom_geom: Mutex<Option<(tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>)>>,
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

/// 返回当前监听 `port` 的进程 PID 列表（跨平台）。
/// 说明：端口「是否在监听」的探测（port_open）是纯 TcpStream 代码，不依赖命令行；
/// 但「由监听的端口反查 PID」在纯 std 里没有跨平台 API，这里按平台调用系统自带工具：
/// macOS/Linux 用 lsof（Linux 缺 lsof 时回退 ss），Windows 用 netstat -ano。
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn listener_pids(port: u16) -> Vec<u32> {
    let port_tag = format!("{port}");
    let out = std::process::Command::new("lsof")
        .arg("-t")
        .arg("-iTCP:")
        .arg(&port_tag)
        .arg("-sTCP:LISTEN")
        .output();
    match out {
        Ok(o) if o.status.success() => {
            let ids: Vec<u32> = String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter_map(|l| l.trim().parse::<u32>().ok())
                .collect();
            if !ids.is_empty() {
                return ids;
            }
        }
        _ => {}
    }
    // Linux 缺 lsof 时回退 ss -ltnpH 'sport = :PORT'
    #[cfg(target_os = "linux")]
    {
        let mut ids = Vec::new();
        if let Ok(o) = std::process::Command::new("ss")
            .args(["-ltnpH", &format!("sport = :{port}")])
            .output()
        {
            for line in String::from_utf8_lossy(&o.stdout).lines() {
                if let Some(pos) = line.rfind("pid=") {
                    let tail = &line[pos + 4..];
                    let pid: String = tail.chars().take_while(|c| c.is_ascii_digit()).collect();
                    if let Ok(pid) = pid.parse::<u32>() {
                        ids.push(pid);
                    }
                }
            }
        }
        return ids;
    }
    #[cfg(target_os = "macos")]
    {
        Vec::new()
    }
}

#[cfg(target_os = "windows")]
fn listener_pids(port: u16) -> Vec<u32> {
    let port_tag = format!(":{port}");
    let out = std::process::Command::new("netstat").arg("-ano").output();
    let Ok(o) = out else { return Vec::new() };
    String::from_utf8_lossy(&o.stdout)
        .lines()
        .filter(|l| l.contains(&port_tag) && l.to_ascii_lowercase().contains("listening"))
        .filter_map(|l| l.split_whitespace().last()?.parse::<u32>().ok())
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn kill_process(pid: u32) {
    // SIGTERM，dsh web 会优雅退出；端口未被释放时由调用方在超时后中止重启
    let _ = std::process::Command::new("kill").arg(pid.to_string()).status();
}

#[cfg(target_os = "windows")]
fn kill_process(pid: u32) {
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/PID", &pid.to_string()])
        .status();
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

/// spawn `dsh web --host 127.0.0.1 --port <port>`；stdout/stderr 转发到日志，
/// 并实时 emit 到启动加载页的「本地服务输出」控制台（`dsh-console` 事件）。
#[cfg(unix)]
fn spawn_dsh(app: &tauri::AppHandle, port: u16) -> Result<Child, SpawnError> {
    let bin = find_dsh_bin().ok_or_else(|| {
        SpawnError::NotFound(
            "未找到 dsh 命令。请执行 `npm i -g @deepseek-ai/dsh` 或设置 DSH_BIN 环境变量。"
                .to_string(),
        )
    })?;
    let mut cmd = Command::new(&bin);
    // 统一用 `dsh --profile web ...`（等价于 `dsh web`）以便带 launcher 级
    // `--patch` overlay。桌面壳启动总是带内置 overlay（禁 stock ui-layout，
    // 让我们插件的 root slot + layout 服务接管桌面布局，等价参考项目 advanced
    // 组合），并可选叠加 DSH_DESKTOP_EXTRA_PATCH 调试 overlay（可重复 --patch）。
    let mut launcher_args: Vec<std::ffi::OsString> = vec!["--profile".into(), "web".into()];
    if let Some(overlay) = DESKTOP_OVERLAY.get() {
        launcher_args.push("--patch".into());
        launcher_args.push(overlay.clone().into_os_string());
    }
    if let Ok(patch) = std::env::var("DSH_DESKTOP_EXTRA_PATCH") {
        if !patch.trim().is_empty() {
            launcher_args.push("--patch".into());
            launcher_args.push(patch.into());
        }
    }
    launcher_args.extend([
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string().into(),
    ]);
    cmd.args(&launcher_args)
        .env("PATH", dsh_runtime_path(&bin))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| SpawnError::Other(format!("spawn {} 失败：{e}", bin.display())))?;
    log::info!("已启动 dsh web（{}，PID {}）", bin.display(), child.id());
    if let Some(out) = child.stdout.take() {
        let app = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                log::info!("[dsh] {line}");
                let _ = app
                    .emit("dsh-console", serde_json::json!({ "stream": "stdout", "line": line }));
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let app = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                log::warn!("[dsh] {line}");
                let _ = app
                    .emit("dsh-console", serde_json::json!({ "stream": "stderr", "line": line }));
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
fn spawn_dsh(app: &tauri::AppHandle, port: u16) -> Result<Child, SpawnError> {
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
    let mut launcher_args: Vec<std::ffi::OsString> =
        vec![bin_js.clone().into(), "--profile".into(), "web".into()];
    if let Some(overlay) = DESKTOP_OVERLAY.get() {
        launcher_args.push("--patch".into());
        launcher_args.push(overlay.clone().into_os_string());
    }
    if let Ok(patch) = std::env::var("DSH_DESKTOP_EXTRA_PATCH") {
        if !patch.trim().is_empty() {
            launcher_args.push("--patch".into());
            launcher_args.push(patch.into());
        }
    }
    launcher_args.extend([
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string().into(),
    ]);
    cmd.args(&launcher_args)
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
        let app = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                log::info!("[dsh] {line}");
                let _ = app
                    .emit("dsh-console", serde_json::json!({ "stream": "stdout", "line": line }));
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        let app = app.clone();
        thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                log::warn!("[dsh] {line}");
                let _ = app
                    .emit("dsh-console", serde_json::json!({ "stream": "stderr", "line": line }));
            }
        });
    }
    Ok(child)
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

/// CORS 响应头：注入脚本从 `127.0.0.1:<服务端口>` 跨源 fetch 到本桥（随机端口），
/// `Content-Type: application/json` + `Authorization` 头会触发浏览器 preflight；
/// 不回 OPTIONS 与 `Access-Control-Allow-*` 头，浏览器会直接拦截实际请求
/// （0.3.0 任务通知"收不到"的根因之一）。
const CORS_HEADERS: &str = "Access-Control-Allow-Origin: *\r\n\
Access-Control-Allow-Methods: POST, OPTIONS\r\n\
Access-Control-Allow-Headers: Content-Type, Authorization\r\n\
Access-Control-Max-Age: 86400\r\n";

/// 完整读取一条 HTTP 请求（头 + 可能分段的 body，按 Content-Length 收齐）。
/// 单次 read 只读头时 body 会丢（自诊断 / 通知的 JSON body 偶发单独到达）。
async fn read_full_request(sock: &mut tokio::net::TcpStream) -> String {
    use tokio::io::AsyncReadExt;
    let mut buf: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        match sock.read(&mut chunk).await {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => break,
        }
        let s = String::from_utf8_lossy(&buf);
        let Some((head, body)) = s.split_once("\r\n\r\n") else { continue };
        let clen = head.lines().find_map(|l| {
            let l = l.to_ascii_lowercase();
            l.strip_prefix("content-length:")
                .and_then(|v| v.trim().parse::<usize>().ok())
        });
        match clen {
            Some(len) if body.len() >= len || buf.len() < 5 => break, // 收齐或请求过小
            Some(_) => continue, // 等剩余 body
            None => break,       // 无 body：头完即止
        }
    }
    String::from_utf8_lossy(&buf).to_string()
}

/// 处理单条通知连接：先应答 CORS 预检，再校验 Bearer token、解析 JSON body、触发通知。
async fn handle_notify_conn(sock: &mut tokio::net::TcpStream, app: &AppHandle, token: &str) {
    use tokio::io::AsyncWriteExt;
    let req = read_full_request(sock).await;
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
            show_notification(app, "Deepseek Harness · 任务完成", body);
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

/// 确认/申请系统通知权限（三平台通用）。
/// tauri-plugin-notification 桌面端 `request_permission`/`permission_state` 返回
/// `PermissionState`：macOS 走 UNUserNotificationCenter、Windows 走 Toast（AUMID）、
/// Linux 走 dbus 通知。放任何 `.show()` 之前 best-effort 调用并记录结果，便于排查
/// “通知不生效”（显示权限被拒 / 平台不支持 / 请求失败等）。
fn request_notification_permission(app: &tauri::AppHandle) {
    use tauri::plugin::PermissionState;
    match app.notification().permission_state() {
        Ok(PermissionState::Granted) => log::info!("通知权限：已授予"),
        Ok(PermissionState::Prompt | PermissionState::PromptWithRationale) => {
            match app.notification().request_permission() {
                Ok(_) => log::info!("通知权限：未决定，已发起请求"),
                Err(e) => log::warn!("申请通知权限失败：{e}"),
            }
        }
        Ok(PermissionState::Denied) => log::warn!("通知权限：被拒绝，任务完成通知将不可见"),
        Err(e) => log::warn!("查询通知权限失败：{e}"),
    }
}

/// 发一条系统通知并记录发送失败（用于排查“通知不生效”）。
/// `.show()` 返回的错在插件内部被吞掉，这里统一落日志。
fn show_notification(app: &tauri::AppHandle, title: &str, body: &str) {
    match app.notification().builder().title(title).body(body).show() {
        Ok(()) => log::info!("系统通知已发送：{title}"),
        Err(e) => log::warn!("系统通知发送失败（{title}）：{e}"),
    }
}
/// dsh 数据目录（$DSH_HOME 或 ~/.dsh）。
fn dsh_home() -> PathBuf {
    if let Ok(h) = std::env::var("DSH_HOME") {
        if !h.trim().is_empty() {
            return PathBuf::from(h);
        }
    }
    #[cfg(windows)]
    let base = std::env::var("USERPROFILE").map(PathBuf::from).unwrap_or_default();
    #[cfg(not(windows))]
    let base = std::env::var("HOME").map(PathBuf::from).unwrap_or_default();
    base.join(".dsh")
}

/// 定位本应用自带的桌面 chrome 插件包（dsh-desktop-app）。
/// 优先级：
/// 1. `DSH_DESKTOP_PLUGIN` 环境变量（目录）
/// 2. Tauri 运行时资源目录下的内嵌副本 `{resource_dir}/dsh-desktop-app` —— 打包场景，
///    由 tauri.conf.json 的 `bundle.resources` 内嵌；`resource_dir()` 按平台解析真实位置
///    （macOS=Contents/Resources、Windows=可执行文件所在目录、Linux=/usr/lib 或 AppImage
///    挂载点），因此无论 app 装到哪里都能拿到真实路径，无需写死。
/// 3. 与可执行文件同级的 dsh-desktop-app（老打包布局兼容）
/// 4. 从可执行文件向上找 package.json.name == dsh-desktop-app 的目录（开发仓库根）。
fn desktop_plugin_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("DSH_DESKTOP_PLUGIN") {
        let p = PathBuf::from(p);
        if p.join("package.json").exists() {
            return Some(p);
        }
    }
    // 打包内嵌副本：resource_dir 已按平台归一为真实资源目录
    if let Ok(res_dir) = app.path().resource_dir() {
        let embedded = res_dir.join("dsh-desktop-app");
        if embedded.join("package.json").exists() {
            log::info!("使用内嵌插件包：{}", embedded.display());
            return Some(embedded);
        }
    }
    let exe = std::env::current_exe().ok()?;
    let sibling = exe.parent()?.join("dsh-desktop-app");
    if sibling.join("package.json").exists() {
        return Some(sibling);
    }
    let mut dir = exe.parent()?;
    // 向上找 package.json.name == dsh-desktop-app 的目录（开发仓库根）。
    // 跳过中间非同名 package.json（如 desktop/、src-tauri/ 的脚手架清单）。
    for _ in 0..10 {
        let pkg = dir.join("package.json");
        if pkg.exists() {
            if let Ok(text) = std::fs::read_to_string(&pkg) {
                if text.contains("\"name\": \"dsh-desktop-app\"") || text.contains("\"name\":\"dsh-desktop-app\"") {
                    return Some(dir.to_path_buf());
                }
            }
        }
        dir = dir.parent()?;
    }
    None
}

/// 生成安装到 web profile 的插件 spec：开发（cargo target 内）用 link: 实时链接，
/// 打包用 file:（内嵌副本）。
fn desktop_plugin_spec(app: &tauri::AppHandle) -> Option<String> {
    let dir = desktop_plugin_dir(app)?;
    let abs = dir.canonicalize().ok()?;
    let dev = abs.to_string_lossy().contains("/target/");
    Some(if dev {
        format!("link:{}", abs.display())
    } else {
        format!("file:{}", abs.display())
    })
}

/// 在 web profile 里执行官方 `plugin add`（Windows 走 `node <bin.js>`，其余走 `dsh`）。
/// 参考项目同机制：dsh 会按需初始化 profile、转发给 pnpm、并把声明了 dsh.bundle 的
/// 新依赖自动 reconcile 进 dsh.profile.bundles。
fn run_dsh_plugin_add(spec: &str) -> Option<std::process::ExitStatus> {
    #[cfg(target_os = "windows")]
    {
        let node = find_node()?;
        let js = find_dsh_bin_js()?;
        std::process::Command::new(node)
            .arg(&js)
            .args(["plugin", "--profile", "web", "add", "--config.minimumReleaseAge=0"])
            .arg(spec)
            .status()
            .ok()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let dsh = find_dsh_bin()?;
        std::process::Command::new(&dsh)
            .args(["plugin", "--profile", "web", "add", "--config.minimumReleaseAge=0"])
            .arg(spec)
            .status()
            .ok()
    }
}

/// 确保 web profile 已挂载桌面 chrome 插件（dsh-desktop-app）。
/// 检测缺失时通过官方 `dsh plugin --profile web add <spec>` 安装（代码内完成，
/// 不手工改任何 profile 配置）；幂等：bundles 已含且 node_modules 存在则跳过。
fn ensure_web_profile_plugin(app: &tauri::AppHandle) {
    let Some(spec) = desktop_plugin_spec(app) else {
        log::warn!("未定位到 dsh-desktop-app 插件包，跳过 web profile 接线");
        return;
    };
    let web_dir = dsh_home().join("profiles/web");
    let pkg_path = web_dir.join("package.json");
    let present_in_manifest = pkg_path
        .exists()
        .then(|| std::fs::read_to_string(&pkg_path).ok())
        .flatten()
        .map(|text| text.contains("dsh-desktop-app"))
        .unwrap_or(false);
    if present_in_manifest && web_dir.join("node_modules/dsh-desktop-app").exists() {
        log::info!("web profile 已含 dsh-desktop-app 插件，跳过安装");
        return;
    }
    match run_dsh_plugin_add(&spec) {
        Some(s) if s.success() => {
            log::info!("已通过 `dsh plugin --profile web add` 把桌面 chrome 插件装入 web profile：{spec}");
        }
        Some(s) => log::error!("dsh plugin add 失败（退出码 {}）", s.code().unwrap_or(-1)),
        None => log::error!("dsh plugin add 执行失败：找不到 dsh/node 命令"),
    }
}

/// 桌面壳启动时传给 dsh 的 launcher 级内置 overlay 路径（setup 阶段写入 OnceLock）。
static DESKTOP_OVERLAY: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

/// 桌面壳内置 overlay：禁用 stock `ui-layout`，让 dsh-desktop-app 插件的
/// root slot + layout 服务接管桌面布局（等价参考项目 advanced 组合里
/// `{ id: 'ui-layout', disabled: true }`）。写入 app 数据目录，幂等。
/// 只作用于桌面壳这次启动（`--patch` overlay），浏览器 GUI 不受影响。
fn desktop_overlay_path(app: &tauri::AppHandle) -> PathBuf {
    let Some(dir) = app.path().app_data_dir().ok() else {
        return PathBuf::from("/tmp/dsh-desktop-overlay.yml");
    };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("desktop-overlay.yml");
    let content = "- id: ui-layout\n  disabled: true\n";
    let stale = std::fs::read_to_string(&path).map(|t| t != content).unwrap_or(true);
    if stale {
        let _ = std::fs::write(&path, content);
    }
    path
}

/// 桌面壳加载 Web GUI 的地址。
/// `advanced=true`（本次由桌面壳 spawn 了带 overlay 的实例）：附加 desktop 标记，
/// 插件 client 借此接管 root slot 渲染标题栏/拖拽区；
/// `advanced=false`（复用了外部已有实例）：不带标记，按标准布局「降级接入」，
/// 避免与 stock ui-layout 的 layout 服务冲突。普通浏览器/无标记访问不激活桌面 UI。
fn desktop_url(port: u16, advanced: bool) -> String {
    if !advanced {
        return format!("http://127.0.0.1:{port}/");
    }
    let platform = if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        "linux"
    };
    format!(
        "http://127.0.0.1:{port}/?dsh-desktop-mode=advanced&dsh-desktop-platform={platform}"
    )
}

/// 轮询等待服务就绪，然后把主窗口导航到 Web GUI；失败则跳错误页。
/// `nport`/`ntoken` 是通知桥的端口与令牌，导航完成后才注入监听脚本。
async fn wait_ready_and_navigate(app: AppHandle, port: u16, nport: u16, ntoken: String) {
    let state = app.state::<DshState>();
    // advanced 以本次是否由桌面壳 spawn 为准（复用的外部实例不带标记、降级接入）
    let url = desktop_url(port, state.spawned_this_run.load(Ordering::SeqCst));
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
    show_notification(app, "Deepseek Harness 启动失败", body);
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

/// 双击拖拽区触发 macOS 风格的"zoom"——把窗口几何切到当前屏幕的 work area
///（MenuBar 与 Dock 不被覆盖），再次双击恢复到之前的几何。不是全屏 maximize
///（不调用 NSWindow zoom:，那在 WKWebView 下不会自动放大，且语义偏 Win 风格）。
///
/// work_area 由 `available_monitors` 取，与 NSWindow.visibleFrame 同语义。
fn current_monitor_for_window(
    window: &tauri::WebviewWindow,
) -> Option<tauri::Monitor> {
    let pos = window.outer_position().ok()?;
    let monitors = window.available_monitors().ok()?;
    // 优先匹配窗口中心所在屏（窗口跨屏时取主屏兜底）
    let size = window.outer_size().ok()?;
    let cx = pos.x + (size.width as i32) / 2;
    let cy = pos.y + (size.height as i32) / 2;
    monitors
        .into_iter()
        .find(|m| {
            let p = m.position();
            let s = m.size();
            cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
        })
        .or_else(|| window.primary_monitor().ok().flatten())
}

#[tauri::command]
fn toggle_zoom(window: tauri::WebviewWindow, state: tauri::State<DshState>) {
    let mut prev = match state.pre_zoom_geom.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if prev.is_none() {
        // 当前未放大 → 记录旧几何，把窗口设到 work area
        let pos = match window.outer_position() {
            Ok(p) => p,
            Err(e) => {
                log::warn!("[zoom] 读不到 outer_position：{e}");
                return;
            }
        };
        let size = match window.outer_size() {
            Ok(s) => s,
            Err(e) => {
                log::warn!("[zoom] 读不到 outer_size：{e}");
                return;
            }
        };
        let Some(mon) = current_monitor_for_window(&window) else {
            log::warn!("[zoom] 找不到窗口所在显示器，跳过");
            return;
        };
        let wa = mon.work_area();
        let target_pos = tauri::PhysicalPosition::new(wa.position.x, wa.position.y);
        let target_size = tauri::PhysicalSize::new(wa.size.width, wa.size.height);
        if let Err(e) = window.set_position(target_pos) {
            log::warn!("[zoom] set_position 失败：{e}");
            return;
        }
        if let Err(e) = window.set_size(target_size) {
            log::warn!("[zoom] set_size 失败：{e}");
            return;
        }
        *prev = Some((pos, size));
        log::info!(
            "[zoom] 已放大到显示器 work area（{}x{} at {},{}），原几何已暂存",
            wa.size.width, wa.size.height, wa.position.x, wa.position.y
        );
    } else {
        // 当前已放大 → 恢复旧几何
        if let Some((pos, size)) = prev.take() {
            if let Err(e) = window.set_position(pos) {
                log::warn!("[zoom] 恢复 set_position 失败：{e}");
            }
            if let Err(e) = window.set_size(size) {
                log::warn!("[zoom] 恢复 set_size 失败：{e}");
            }
            log::info!(
                "[zoom] 已恢复到 zoom 前几何（{}x{} at {},{}）",
                size.width, size.height, pos.x, pos.y
            );
        }
    }
}

/// 在系统默认浏览器/应用中打开外链（三平台：macOS `open`、Windows `cmd start`、
/// Linux `xdg-open`）。仅允许 http/https/mailto/tel，避免命令注入。
/// 由 dsh-desktop-app 插件 client 在 webview 里拦截外链点击后调用。
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("http://")
        || url.starts_with("https://")
        || url.starts_with("mailto:")
        || url.starts_with("tel:"))
    {
        return Err(format!("不允许打开的链接协议：{url}"));
    }
    let ok = open_external_impl(&url);
    if ok {
        log::info!("已在系统默认应用中打开：{url}");
        Ok(())
    } else {
        Err(format!("打开链接失败：{url}"))
    }
}

#[cfg(target_os = "macos")]
fn open_external_impl(url: &str) -> bool {
    std::process::Command::new("open")
        .arg(url)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn open_external_impl(url: &str) -> bool {
    use std::os::windows::process::CommandExt;
    // cmd 里 URL 的 `&` 会被当作命令分隔符，必须整体加引号（内层双引号转单引号）
    let quoted = format!("\"{}\x22", url.replace('"', "'"));
    std::process::Command::new("cmd")
        .arg("/C")
        .arg("start")
        .arg("")
        .arg(&quoted)
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn open_external_impl(url: &str) -> bool {
    std::process::Command::new("xdg-open")
        .arg(url)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}
/// 构建菜单栏托盘：左键显示窗口，菜单提供显示/隐藏桌宠/退出。
fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let pet = MenuItem::with_id(app, "pet", "显示/隐藏桌宠", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "restart", "重启 dsh 服务", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 Deepseek Harness", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &pet, &restart, &quit])?;
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
            "restart" => restart_dsh(app),
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

/// 重启 dsh web 服务（不退出桌面端）：升级为「桌面壳实例」。
///
/// 无论当前占用端口的 dsh 是否由本应用 spawn，都会先停掉它（复用外部实例时按端口
/// 查找其 PID 并 kill，跨平台），再以带桌面 overlay 的新实例重新拉起，从而从
/// 「降级接入」（复用外部实例、无桌面 chrome）升级为完整桌面 chrome。
/// 通知服务器在 setup 阶段就已启动并常驻，重启时复用同一端口/token。
fn restart_dsh(app: &AppHandle) {
    let state = app.state::<DshState>();
    if state.restarting.swap(true, Ordering::SeqCst) {
        log::warn!("已在重启中，忽略重复触发");
        return;
    }
    log::info!("[restart] 托盘触发重启 dsh 服务");
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let port = app_port();
        // 1) 停掉占用端口的现有 dsh：优先我们的子进程；否则按端口找外部进程 kill
        if let Some(mut child) = handle.state::<DshState>().child.lock().unwrap().take() {
            let pid = child.id();
            log::info!("[restart] 停止自管 dsh 子进程（PID {pid}）");
            let _ = child.kill();
            let _ = child.wait();
            log::info!("[restart] 旧 dsh 已退出");
        } else {
            let pids = listener_pids(port);
            if pids.is_empty() {
                log::warn!("[restart] 端口 {port} 没有找到可停止的 dsh 进程");
            } else {
                log::info!("[restart] 停止占用 {port} 的外部 dsh 进程：{pids:?}");
                for pid in pids {
                    kill_process(pid);
                }
            }
        }
        // 2) 等端口释放（kill 后 SO_REUSEADDR 偶发未及时释放）
        let mut freed = false;
        for _ in 0..40 {
            if !port_open(port) {
                freed = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
        if !freed {
            log::error!("[restart] 端口 {port} 在 4s 内未释放，重启中止");
            show_notification(&handle, "Deepseek Harness · 重启失败", &format!("端口 {port} 仍被占用"));
            handle.state::<DshState>().restarting.store(false, Ordering::SeqCst);
            return;
        }
        // 3) 以带桌面 overlay 的实例重新拉起
        match spawn_dsh(&handle, port) {
            Ok(child) => {
                let new_pid = child.id();
                log::info!("[restart] 新 dsh 子进程已启动（PID {new_pid}）");
                *handle.state::<DshState>().child.lock().unwrap() = Some(child);
                handle.state::<DshState>().spawned_this_run.store(true, Ordering::SeqCst);
            }
            Err(e) => {
                let msg = match &e {
                    SpawnError::NotFound(s) | SpawnError::Other(s) => s.clone(),
                };
                log::error!("[restart] spawn 失败：{msg}");
                show_notification(&handle, "Deepseek Harness · 重启失败", &format!("spawn 失败：{msg}"));
                handle.state::<DshState>().restarting.store(false, Ordering::SeqCst);
                return;
            }
        }
        // 4) 重置失败标志并等待就绪 + 重新导航（此时 advanced=true，桌面 chrome 生效）
        handle.state::<DshState>().spawn_failed.store(false, Ordering::SeqCst);
        let nport = handle.state::<DshState>().notify_port.load(Ordering::SeqCst);
        let ntoken = handle.state::<DshState>().notify_token.lock().unwrap().clone();
        wait_ready_and_navigate(handle.clone(), port, nport, ntoken).await;
        handle.state::<DshState>().restarting.store(false, Ordering::SeqCst);
        log::info!("[restart] 重启流程完成");
    });
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
            pet_toggle_passthrough,
            toggle_zoom,
            open_external
        ])
.manage(DshState {
            child: Mutex::new(None),
            spawned_this_run: AtomicBool::new(false),
            spawn_failed: AtomicBool::new(false),
            restarting: AtomicBool::new(false),
            quitting: AtomicBool::new(false),
            tray_tip_shown: AtomicBool::new(false),
            unread: AtomicU32::new(0),
            pet_save_at: Mutex::new(None),
            notify_port: AtomicU16::new(0),
            notify_token: Mutex::new(String::new()),
            pre_zoom_geom: Mutex::new(None),
        })
        .setup(|app| {
            // 桌面壳内置 overlay（禁 stock ui-layout），spawn 时作为 --patch 传入。
            let _ = DESKTOP_OVERLAY.set(desktop_overlay_path(app.handle()));
            let port = app_port();
            let state = app.state::<DshState>();
            // 申请系统通知权限（macOS 弹授权窗；Windows/Linux 幂等确认）。
            // 放在任何 .show() 之前，best-effort 不阻塞启动。
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                request_notification_permission(&handle);
            });
            if port_open(port) {
                log::info!("127.0.0.1:{port} 已有服务在监听，直接复用现有实例");
            } else {
                // 即将由本应用拉起 dsh：先确保 web profile 已挂载桌面 chrome 插件
                //（参考项目机制：检测缺失则用官方 `dsh plugin --profile web add` 装上）。
                ensure_web_profile_plugin(app.handle());
                match spawn_dsh(app.handle(), port) {
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
// 先起通知桥，把端口/token 交给导航任务并保存到 state（重启 dsh 时复用）；
// 导航完成后再注入监听脚本（0.3.0 在导航前注入，冷启动时脚本随加载页销毁）。
            let (nport, ntoken) = start_notify_server(app.handle().clone());
            state.notify_port.store(nport, Ordering::SeqCst);
            *state.notify_token.lock().unwrap() = ntoken.clone();
            let handle = app.handle().clone();
            let nav_token = ntoken.clone();
            tauri::async_runtime::spawn(async move {
                wait_ready_and_navigate(handle, port, nport, nav_token).await;
            });
            // 窗口拖动完全交由 dsh-desktop-app 插件的 client 端（root slot 里的
            // AdvancedFrame）渲染拖拽区并挂 data-tauri-drag-region；这里不再注入
            // 任何脚本，也不再使用 movableByWindowBackground（那会让整窗可拖）。
            // macOS 用 titleBarStyle:Overlay（保留原生红绿灯）；
            // Windows/Linux 隐藏原生标题栏（decorations:false），标题栏 UI 由
            // 插件 client 自绘 caption 行 + 窗口按钮。
            // Windows/Linux：仅当本次由桌面壳 spawn 了带 overlay 的实例（启用桌面
            // chrome）才隐藏原生标题栏；复用外部实例时保留原生标题栏（降级接入，
            // 窗口仍可拖动/关闭）。
            #[cfg(not(target_os = "macos"))]
            if state.spawned_this_run.load(Ordering::SeqCst) {
                if let Some(w) = app.get_webview_window("main") {
                    if let Err(e) = w.set_decorations(false) {
                        log::warn!("关闭主窗口原生标题栏失败：{e}");
                    }
                }
            }
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
                            show_notification(
                                window.app_handle(),
                                "Deepseek Harness 仍在运行",
                                "窗口已隐藏到菜单栏托盘，点击托盘图标可重新打开；托盘菜单可退出。",
                            );
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

    #[test]
    fn dsh_state_default_field_types() {
        // DshState 新增字段（notify_port / notify_token / restarting）默认值校验。
        use std::sync::atomic::Ordering;
        let state = DshState {
            child: Mutex::new(None),
            spawned_this_run: AtomicBool::new(false),
            spawn_failed: AtomicBool::new(false),
            restarting: AtomicBool::new(false),
            quitting: AtomicBool::new(false),
            tray_tip_shown: AtomicBool::new(false),
            unread: AtomicU32::new(0),
            pet_save_at: Mutex::new(None),
            notify_port: AtomicU16::new(0),
            notify_token: Mutex::new(String::new()),
            pre_zoom_geom: Mutex::new(None),
        };
        assert!(!state.restarting.load(Ordering::SeqCst));
        assert_eq!(state.notify_port.load(Ordering::SeqCst), 0);
        assert!(state.notify_token.lock().unwrap().is_empty());
        assert!(state.pre_zoom_geom.lock().unwrap().is_none());
    }

    #[test]
    fn pre_zoom_geom_starts_unset() {
        // 双击放大前的几何必须从 None 起步，否则启动后第一次双击会把当前尺寸
        // 当成"已放大态"误恢复回去。
        let g = Mutex::new(None);
        assert!(g.lock().unwrap().is_none());
        *g.lock().unwrap() = Some((tauri::PhysicalPosition::new(100, 200),
                                    tauri::PhysicalSize::new(800, 600)));
        assert!(g.lock().unwrap().is_some());
    }

    #[test]
    fn spawn_error_display() {
        assert_eq!(SpawnError::NotFound("nope".into()).to_string(), "nope");
        assert_eq!(SpawnError::Other("boom".into()).to_string(), "boom");
    }
}

