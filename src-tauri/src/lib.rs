use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, State,
};
use tauri_plugin_notification::NotificationExt;

#[derive(Default)]
struct TimerData {
    end_timestamp_secs: u64,
    paused_secs: u32,
    is_running: bool,
    session_type: String,
}

/// All mutable timer state lives behind a single lock so that reads are atomic
/// (no torn state visible to a concurrent `get_timer_state`) and no handler ever
/// holds nested locks. `generation` is bumped on every start/reset; the background
/// loop captures its generation and exits when it no longer matches, so a stale
/// loop can never keep ticking — or fire a duplicate completion — after a pause
/// or restart.
#[derive(Default)]
pub struct TimerState {
    data: Mutex<TimerData>,
    generation: Mutex<u64>,
}

impl TimerState {
    /// Seeds a run of `secs` seconds and returns its generation. The spawned
    /// background loop captures the generation and exits when it no longer
    /// matches, so a stale loop can never keep ticking — or fire a duplicate
    /// completion — after a pause, reset, or restart.
    fn start(&self, secs: u32, session_type: String) -> u64 {
        let my_generation = {
            let mut gen = self.generation.lock().unwrap();
            *gen += 1;
            *gen
        };
        let now = get_current_time_secs();
        let mut data = self.data.lock().unwrap();
        data.end_timestamp_secs = now + secs as u64;
        data.paused_secs = secs;
        data.session_type = session_type;
        data.is_running = true;
        my_generation
    }

    /// Freezes the run, keeping the remaining seconds for a later resume.
    fn pause(&self) {
        let mut data = self.data.lock().unwrap();
        if data.is_running {
            data.is_running = false;
            let now = get_current_time_secs();
            data.paused_secs = if data.end_timestamp_secs > now {
                (data.end_timestamp_secs - now) as u32
            } else {
                0
            };
        }
    }

    /// Marks the run completed: stopped AND reporting 0 remaining. Returns
    /// false without mutating when a newer start has superseded
    /// `my_generation` — the caller's loop must then exit without completing.
    fn complete(&self, my_generation: u64) -> bool {
        let current_gen = *self.generation.lock().unwrap();
        let mut data = self.data.lock().unwrap();
        if current_gen != my_generation {
            return false;
        }
        data.is_running = false;
        // A completed timer must report 0 remaining: the frontend's
        // window-focus sync detects a missed `timer-complete` event via
        // `!running && secs == 0` and processes the completion itself.
        // Leaving `paused_secs` at its stale start value (the full duration)
        // made that check never match, so a completion missed by a suspended
        // webview froze the clock at 00:01 until a manual pause/start
        // recovered it.
        data.paused_secs = 0;
        true
    }

    /// Atomic single-lock read backing `get_timer_state`.
    fn snapshot(&self) -> (u32, bool, String) {
        let data = self.data.lock().unwrap();
        let is_running = data.is_running;
        let session_type = data.session_type.clone();

        let remaining_secs = if is_running {
            let now = get_current_time_secs();
            if data.end_timestamp_secs > now {
                (data.end_timestamp_secs - now) as u32
            } else {
                0
            }
        } else {
            data.paused_secs
        };

        (remaining_secs, is_running, session_type)
    }
}

fn get_current_time_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

/// Update the tray title (native text).
#[tauri::command]
fn update_tray_title(app: tauri::AppHandle, title: String, tooltip: String) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_title(Some(&title));
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// Reset tray to default state (usually called on unmount).
#[tauri::command]
fn reset_tray(app: tauri::AppHandle) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_title(None::<&str>);
        let _ = tray.set_tooltip(Some("myOKR — Pomodoro Timer"));
    }
}

/// Hide the main window safely (called after pending writes are flushed)
#[tauri::command]
fn hide_window(window: tauri::Window) {
    let _ = window.hide();
}

/// Reads a credential from the OS keychain (service "myokr"). Returns None
/// when absent or the keychain is unavailable (ticket 28).
#[tauri::command]
fn secure_get(key: String) -> Option<String> {
    keyring::Entry::new("myokr", &key)
        .ok()?
        .get_password()
        .ok()
}

/// Stores a credential in the OS keychain (ticket 28).
#[tauri::command]
fn secure_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new("myokr", &key).map_err(|e| e.to_string())?;
    entry.set_password(&value).map_err(|e| e.to_string())
}

/// Removes a credential from the OS keychain (ticket 28).
#[tauri::command]
fn secure_delete(key: String) -> Result<(), String> {
    match keyring::Entry::new("myokr", &key) {
        Ok(entry) => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn start_timer(state: State<'_, Arc<TimerState>>, app: AppHandle, secs: u32, session_type: String) {
    let is_focus = session_type == "focus";
    let display_label = if is_focus { "Focus" } else { "Break" };

    let my_generation = state.start(secs, session_type);

    let state_clone = Arc::clone(&state);
    let app_clone = app.clone();

    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;

            // Re-check that we are still the active loop: is_running may have been
            // cleared by pause/reset, or a newer start may have bumped the generation.
            let end_time = {
                let current_gen = *state_clone.generation.lock().unwrap();
                let data = state_clone.data.lock().unwrap();
                if !data.is_running || current_gen != my_generation {
                    break;
                }
                data.end_timestamp_secs
            };

            let now = get_current_time_secs();

            if now >= end_time {
                // Completed! Mark done only if a newer start hasn't superseded us
                // between the read above and now.
                if !state_clone.complete(my_generation) {
                    break;
                }

                // Reset tray title
                if let Some(tray) = app_clone.tray_by_id("main-tray") {
                    let _ = tray.set_title(None::<&str>);
                    let _ = tray.set_tooltip(Some("myOKR — Pomodoro Timer"));
                }

                let title = if is_focus { "🍅 Pomodoro Complete!" } else { "☕ Break Complete!" };
                let body = if is_focus { "Great work! Time for a break." } else { "Time to focus!" };

                // Trigger notification safely (WITHOUT holding locks, catching errors)
                let _ = app_clone.notification()
                    .builder()
                    .title(title)
                    .body(body)
                    .show();

                let _ = app_clone.emit("timer-complete", ());
                break;
            } else {
                let remaining = (end_time - now) as u32;

                let timer_text = format!("{:02}:{:02}", remaining / 60, remaining % 60);

                // Update tray directly
                if let Some(tray) = app_clone.tray_by_id("main-tray") {
                    let _ = tray.set_title(Some(&timer_text));
                    let _ = tray.set_tooltip(Some(&format!("{} — {}", timer_text, display_label)));
                }

                // Emit tick to frontend
                let _ = app_clone.emit("timer-tick", remaining);
            }
        }
    });
}

#[tauri::command]
fn pause_timer(state: State<'_, Arc<TimerState>>) {
    state.pause();
}

#[tauri::command]
fn reset_timer_state(state: State<'_, Arc<TimerState>>, app: AppHandle) {
    // Bump generation first so any in-flight loop exits before it can observe the
    // zeroed end_timestamp and spuriously fire a completion.
    {
        let mut gen = state.generation.lock().unwrap();
        *gen += 1;
    }
    {
        let mut data = state.data.lock().unwrap();
        data.is_running = false;
        data.end_timestamp_secs = 0;
        data.paused_secs = 0;
    }
    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_title(None::<&str>);
        let _ = tray.set_tooltip(Some("myOKR — Pomodoro Timer"));
    }
}

#[tauri::command]
fn get_timer_state(state: State<'_, Arc<TimerState>>) -> (u32, bool, String) {
    // Single lock acquisition → callers never observe a mix of old/new field values.
    state.snapshot()
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
                let _ = window.emit("window-close-requested", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            update_tray_title,
            reset_tray,
            start_timer,
            pause_timer,
            reset_timer_state,
            get_timer_state,
            hide_window,
            secure_get,
            secure_set,
            secure_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    // The frontend's window-focus sync detects a missed `timer-complete`
    // event via `!running && secs == 0` and processes the completion itself,
    // so a completed timer must report zero remaining — never the stale
    // duration it started with (the frozen-at-00:01 bug this pins).
    #[test]
    fn completed_timer_reports_zero_remaining() {
        let state = TimerState::default();
        let gen = state.start(300, "shortBreak".to_string());
        assert!(state.complete(gen));
        assert_eq!(state.snapshot(), (0, false, "shortBreak".to_string()));
    }

    // Pausing keeps the remaining seconds for a later resume — it must not
    // report 0 while time is genuinely left. (start stamps end = now + secs;
    // a second boundary can pass between start and pause, so accept secs..=1s
    // of drift.)
    #[test]
    fn paused_timer_reports_remaining_secs() {
        let state = TimerState::default();
        state.start(3600, "focus".to_string());
        state.pause();
        let (secs, running, session_type) = state.snapshot();
        assert_eq!(running, false);
        assert_eq!(session_type, "focus");
        assert!((3599..=3600).contains(&secs), "paused secs {secs}");
    }

    // A loop superseded by a newer start must not complete (or zero) the
    // newer timer's state — the generation guard.
    #[test]
    fn stale_loop_cannot_complete_a_newer_timer() {
        let state = TimerState::default();
        let stale = state.start(300, "focus".to_string());
        let fresh = state.start(1500, "focus".to_string());
        assert!(!state.complete(stale));
        assert_eq!(state.snapshot().1, true);
        assert!(state.complete(fresh));
        assert_eq!(state.snapshot(), (0, false, "focus".to_string()));
    }
}
