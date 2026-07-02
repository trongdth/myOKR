use std::process::Command as OsCommand;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_notification::NotificationExt;

#[derive(Default)]
pub struct TimerState {
    pub remaining_secs: Mutex<u32>,
    pub is_running: Mutex<bool>,
    pub session_type: Mutex<String>,
}

/// Update the tray title (native text).
#[tauri::command]
fn update_tray_title(app: tauri::AppHandle, title: String, tooltip: String) {
    if let Some(tray) = app.tray_by_id("main-tray") {
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
        let _ = tray.set_title(None::<&str>);
        let _ = tray.set_tooltip(Some("myOKR — Pomodoro Timer"));
    }
}

#[tauri::command]
fn start_timer(state: State<'_, Arc<TimerState>>, app: AppHandle, secs: u32, session_type: String) {
    *state.remaining_secs.lock().unwrap() = secs;
    *state.session_type.lock().unwrap() = session_type.clone();

    let mut is_running = state.is_running.lock().unwrap();
    if *is_running {
        return;
    }
    *is_running = true;

    let state_clone = Arc::clone(&state);
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            // Check if still running
            {
                let is_running = state_clone.is_running.lock().unwrap();
                if !*is_running {
                    break;
                }
            }

            let mut secs = state_clone.remaining_secs.lock().unwrap();
            if *secs > 0 {
                *secs -= 1;

                let timer_text = format!("{:02}:{:02}", *secs / 60, *secs % 60);
                let session_label = state_clone.session_type.lock().unwrap().clone();
                let display_label = if session_label == "focus" { "Focus" } else { "Break" };

                // Update tray directly
                if let Some(tray) = app_clone.tray_by_id("main-tray") {
                    let _ = tray.set_title(Some(&timer_text));
                    let _ = tray.set_tooltip(Some(&format!("{} — {}", timer_text, display_label)));
                }

                // Emit tick to frontend
                let _ = app_clone.emit("timer-tick", *secs);

                if *secs == 0 {
                    let mut is_running = state_clone.is_running.lock().unwrap();
                    *is_running = false;

                    // Play native notification via tauri-plugin-notification
                    let title = if session_label == "focus" { "🍅 Pomodoro Complete!" } else { "☕ Break Complete!" };
                    let body = if session_label == "focus" { "Great work! Time for a break." } else { "Time to focus!" };

                    app_clone.notification()
                        .builder()
                        .title(title)
                        .body(body)
                        .show()
                        .unwrap_or(());

                    let _ = app_clone.emit("timer-complete", ());
                    break;
                }
            } else {
                let mut is_running = state_clone.is_running.lock().unwrap();
                *is_running = false;
                break;
            }
        }
    });
}

#[tauri::command]
fn pause_timer(state: State<'_, Arc<TimerState>>) {
    *state.is_running.lock().unwrap() = false;
}

#[tauri::command]
fn reset_timer_state(state: State<'_, Arc<TimerState>>, app: AppHandle) {
    *state.is_running.lock().unwrap() = false;
    *state.remaining_secs.lock().unwrap() = 0;
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_title(None::<&str>);
        let _ = tray.set_tooltip(Some("myOKR — Pomodoro Timer"));
    }
}

#[tauri::command]
fn get_timer_state(state: State<'_, Arc<TimerState>>) -> (u32, bool, String) {
    (
        *state.remaining_secs.lock().unwrap(),
        *state.is_running.lock().unwrap(),
        state.session_type.lock().unwrap().clone()
    )
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
            app.manage(Arc::new(TimerState::default()));

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
        .invoke_handler(tauri::generate_handler![
            update_tray_title,
            reset_tray,
            open_external,
            start_timer,
            pause_timer,
            reset_timer_state,
            get_timer_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
