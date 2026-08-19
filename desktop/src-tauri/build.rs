// 在 tauri_build::build() 之前把 dsh-desktop-app 插件包内嵌到
// src-tauri/embedded/dsh-desktop-app（作为 bundle.resources 的源目录，随后被打进
// .app 的 Contents/Resources/dsh-desktop-app）。这样打包场景下 desktop_plugin_dir()
// 能通过 Tauri resource_dir() 找到内嵌副本，不依赖开发仓库路径。
// 用 CARGO_MANIFEST_DIR 定位仓库根，与执行时的 cwd 无关。
use std::path::PathBuf;

fn main() {
    stage_embedded_plugin();
    tauri_build::build()
}

fn stage_embedded_plugin() {
    let manifest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    // src-tauri -> desktop -> 仓库根（package.json.name == dsh-desktop-app）
    let repo_root = match (manifest.parent(), manifest.parent().and_then(|p| p.parent())) {
        (Some(_d), Some(r)) => r.to_path_buf(),
        _ => {
            println!("cargo:warning=embed-plugin: 无法从 {} 定位仓库根，跳过内嵌", manifest.display());
            return;
        }
    };
    let dest = manifest.join("embedded").join("dsh-desktop-app");
    let _ = std::fs::remove_dir_all(&dest);
    if let Err(e) = std::fs::create_dir_all(&dest) {
        println!("cargo:warning=embed-plugin: 创建内嵌目录失败：{e}");
        return;
    }

    const FILES: [&str; 5] = ["package.json", "index.js", "cordis.patch.yml", "README.md", "LICENSE"];
    for f in FILES {
        let src = repo_root.join(f);
        println!("cargo:rerun-if-changed={}", src.display());
        match std::fs::copy(&src, dest.join(f)) {
            Ok(_) => {}
            Err(e) => println!("cargo:warning=embed-plugin: 复制 {f} 失败：{e}"),
        }
    }
    for d in ["lib"] {
        let src = repo_root.join(d);
        println!("cargo:rerun-if-changed={}", src.display());
        let ddest = dest.join(d);
        let _ = std::fs::create_dir_all(&ddest);
        if let Ok(entries) = std::fs::read_dir(&src) {
            for entry in entries.flatten() {
                let _ = std::fs::copy(entry.path(), ddest.join(entry.file_name()));
            }
        }
    }
    println!("cargo:warning=embed-plugin: 已内嵌 -> {}", dest.display());
}
