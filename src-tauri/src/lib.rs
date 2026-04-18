use std::sync::{Arc, Mutex};
use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

type ChildLock = Arc<Mutex<Option<CommandChild>>>;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let child_lock: ChildLock = Arc::new(Mutex::new(None));
    let child_lock_clone = child_lock.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(child_lock)
        .setup(move |app| {
            let handle = app.handle().clone();
            let lock = child_lock_clone.clone();
            tauri::async_runtime::spawn(async move {
                start_backend(&handle, lock).await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill the sidecar when the last window closes
                let lock = window.state::<ChildLock>();
                if let Ok(mut guard) = lock.lock() {
                    if let Some(child) = guard.take() {
                        let _ = child.kill();
                    }
                };
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn start_backend(app: &tauri::AppHandle, lock: ChildLock) {
    let shell = app.shell();
    match shell.sidecar("sharely-server") {
        Ok(cmd) => {
            match cmd.spawn() {
                Ok((_rx, child)) => {
                    if let Ok(mut guard) = lock.lock() {
                        *guard = Some(child);
                    }
                }
                Err(e) => eprintln!("Failed to spawn sidecar: {e}"),
            }
        }
        Err(e) => eprintln!("Sidecar not found: {e}"),
    }
}
