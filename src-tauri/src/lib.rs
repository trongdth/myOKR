use std::process::Command as OsCommand;
use tauri::{
    tray::TrayIconBuilder,
    Manager,
};

/// Update the tray title (native text) and ensure it uses the default app icon.
#[tauri::command]
fn update_tray_title(app: tauri::AppHandle, title: String, tooltip: String) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png")) {
            let _ = tray.set_icon(Some(icon));
            let _ = tray.set_icon_as_template(true);
        }
        let _ = tray.set_title(Some(&title));
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// Open a URL using the OS default handler.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    OsCommand::new("open")
        .arg(&url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reset tray to default state (usually called on unmount).
#[tauri::command]
fn reset_tray(app: tauri::AppHandle) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        if let Ok(icon) = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png")) {
            let _ = tray.set_icon(Some(icon));
            let _ = tray.set_icon_as_template(true);
        }
        let _ = tray.set_title(None::<&str>);
        let _ = tray.set_tooltip(Some("myOKR — Pomodoro Timer"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Build system tray
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png")).unwrap())
                .icon_as_template(true)
                .tooltip("myOKR — Pomodoro Timer")
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                window.hide().unwrap();
            }
        })
        .invoke_handler(tauri::generate_handler![update_tray_title, reset_tray, open_external])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
