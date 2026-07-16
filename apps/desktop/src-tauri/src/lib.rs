use std::path::{Path, PathBuf};

use sqlx::{sqlite::SqliteConnectOptions, Connection};
use tauri::{Emitter, Manager};

struct RuntimeSession(String);
struct LaunchContext {
    autostart: bool,
}

fn has_autostart_argument(arguments: impl IntoIterator<Item = String>) -> bool {
    arguments
        .into_iter()
        .any(|argument| argument == "--autostart")
}

#[tauri::command]
fn is_autostart_launch(context: tauri::State<LaunchContext>) -> bool {
    context.autostart
}

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let filename = database_filename(cfg!(debug_assertions), option_env!("TEMPO_BUILD_FLAVOR"));
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(filename))
        .map_err(|error| error.to_string())
}

fn database_filename(debug_build: bool, flavor: Option<&str>) -> &'static str {
    if debug_build || flavor == Some("development") {
        "tempo-dev.db"
    } else {
        "tempo.db"
    }
}

fn ensure_extension(path: &Path, allowed: &[&str]) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if allowed.contains(&extension.as_str()) {
        Ok(())
    } else {
        Err(format!("Expected a .{} file.", allowed.join(" or .")))
    }
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "The selected destination has no parent folder.".to_string())?;
    let temporary = parent.join(format!(
        ".{}.tempo-tmp",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("export")
    ));
    std::fs::write(&temporary, contents).map_err(|error| error.to_string())?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    std::fs::rename(&temporary, path).map_err(|error| error.to_string())
}

#[tauri::command]
fn write_export_file(path: String, contents: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    ensure_extension(&path, &["csv", "json"])?;
    atomic_write(&path, contents.as_bytes())
}

#[tauri::command]
fn write_binary_export_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    let path = PathBuf::from(path);
    ensure_extension(&path, &["xlsx"])?;
    atomic_write(&path, &contents)
}

#[tauri::command]
fn backup_database(app: tauri::AppHandle, destination: String) -> Result<(), String> {
    let source = database_path(&app)?;
    let destination = PathBuf::from(destination);
    ensure_extension(&destination, &["db"])?;
    if !source.exists() {
        return Err("Tempo's database does not exist yet.".to_string());
    }
    let bytes = std::fs::read(source).map_err(|error| error.to_string())?;
    atomic_write(&destination, &bytes)
}

async fn validate_tempo_database(path: &Path) -> Result<(), String> {
    let options = SqliteConnectOptions::new().filename(path).read_only(true);
    let mut connection = sqlx::SqliteConnection::connect_with(&options)
        .await
        .map_err(|_| "The selected file is not a readable SQLite database.".to_string())?;
    let table_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('tasks', 'time_entries', 'settings', 'schema_migrations')",
    )
    .fetch_one(&mut connection)
    .await
    .map_err(|_| "The selected database could not be inspected.".to_string())?;
    connection
        .close()
        .await
        .map_err(|error| error.to_string())?;
    if table_count != 4 {
        return Err("The selected SQLite file is not a Tempo database.".to_string());
    }
    Ok(())
}

fn replace_database(source: &Path, destination: &Path, safety: &Path) -> Result<(), String> {
    let directory = destination
        .parent()
        .ok_or_else(|| "Tempo's data folder is unavailable.".to_string())?;
    std::fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let temporary = directory.join("tempo-restore.tmp");
    if temporary.exists() {
        std::fs::remove_file(&temporary).map_err(|error| error.to_string())?;
    }
    std::fs::copy(source, &temporary).map_err(|error| error.to_string())?;
    if safety.exists() {
        std::fs::remove_file(safety).map_err(|error| error.to_string())?;
    }
    if destination.exists() {
        std::fs::rename(destination, safety).map_err(|error| error.to_string())?;
    }
    if let Err(error) = std::fs::rename(&temporary, destination) {
        if safety.exists() {
            let _ = std::fs::rename(safety, destination);
        }
        return Err(error.to_string());
    }
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{}", destination.display(), suffix));
        if sidecar.exists() {
            std::fs::remove_file(sidecar).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn restore_database(app: tauri::AppHandle, source: String) -> Result<String, String> {
    let source = PathBuf::from(source);
    ensure_extension(&source, &["db", "sqlite", "sqlite3"])?;
    validate_tempo_database(&source).await?;

    let destination = database_path(&app)?;
    if source.canonicalize().ok() == destination.canonicalize().ok() {
        return Err("The selected file is already Tempo's active database.".to_string());
    }
    let directory = destination
        .parent()
        .ok_or_else(|| "Tempo's data folder is unavailable.".to_string())?;
    let safety = directory.join(
        if database_filename(cfg!(debug_assertions), option_env!("TEMPO_BUILD_FLAVOR"))
            == "tempo-dev.db"
        {
            "tempo-dev-before-restore.db"
        } else {
            "tempo-before-restore.db"
        },
    );
    replace_database(&source, &destination, &safety)?;
    Ok(safety.to_string_lossy().into_owned())
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.restart()
}

#[tauri::command]
fn get_runtime_session_id(session: tauri::State<RuntimeSession>) -> String {
    session.0.clone()
}

#[tauri::command]
fn submit_work_check_action(
    app: tauri::AppHandle,
    action: serde_json::Value,
) -> Result<(), String> {
    app.emit_to("main", "tempo://work-check-action", action)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn close_work_check_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("work-check") {
        window.destroy().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_status_title(
    app: tauri::AppHandle,
    title: Option<String>,
    task_utf16_length: usize,
    elapsed_utf16_start: usize,
    confirmation_pending: bool,
) -> Result<(), String> {
    let tray = app
        .tray_by_id("tempo-main")
        .ok_or_else(|| "Tempo status item is unavailable".to_string())?;

    #[cfg(target_os = "macos")]
    {
        use objc2::MainThreadMarker;
        use objc2_app_kit::{
            NSColor, NSFont, NSFontAttributeName, NSFontWeightRegular,
            NSForegroundColorAttributeName,
        };
        use objc2_foundation::{NSMutableAttributedString, NSRange, NSString};

        let styled_title = title.clone();
        tray.with_inner_tray_icon(move |inner| {
            let Some(title) = styled_title else {
                // tray-icon treats `None` as a no-op on macOS, so explicitly clear
                // the button title when the timer returns to its icon-only state.
                inner.set_title(Some(""));
                return;
            };
            let Some(status_item) = inner.ns_status_item() else {
                inner.set_title(Some(&title));
                return;
            };
            let Some(marker) = MainThreadMarker::new() else {
                return;
            };
            let Some(button) = status_item.button(marker) else {
                return;
            };
            let source = NSString::from_str(&title);
            let attributed = NSMutableAttributedString::from_nsstring(&source);
            let utf16_length = title.encode_utf16().count();

            unsafe {
                if confirmation_pending && task_utf16_length <= utf16_length {
                    let orange = NSColor::systemOrangeColor();
                    attributed.addAttribute_value_range(
                        NSForegroundColorAttributeName,
                        &orange,
                        NSRange::new(0, task_utf16_length),
                    );
                }
                if elapsed_utf16_start <= utf16_length {
                    let font = NSFont::monospacedDigitSystemFontOfSize_weight(
                        NSFont::systemFontSize(),
                        NSFontWeightRegular,
                    );
                    attributed.addAttribute_value_range(
                        NSFontAttributeName,
                        &font,
                        NSRange::new(elapsed_utf16_start, utf16_length - elapsed_utf16_start),
                    );
                }
                button.setAttributedTitle(&attributed);
            }
        })
        .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    tray.set_title(title.as_deref())
        .map_err(|error| error.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let launch_context = LaunchContext {
        autostart: has_autostart_argument(std::env::args()),
    };
    let runtime_session = RuntimeSession(format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    tauri::Builder::default()
        .manage(launch_context)
        .manage(runtime_session)
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            write_export_file,
            write_binary_export_file,
            backup_database,
            restore_database,
            restart_app,
            is_autostart_launch,
            set_status_title,
            submit_work_check_action,
            close_work_check_window,
            get_runtime_session_id
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tempo");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary_directory(name: &str) -> PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!("tempo-{name}-{unique}"));
        std::fs::create_dir_all(&directory).unwrap();
        directory
    }

    #[test]
    fn validates_tempo_schema_and_rejects_other_sqlite_files() {
        let directory = temporary_directory("validation");
        let valid = directory.join("valid.db");
        let invalid = directory.join("invalid.db");
        tauri::async_runtime::block_on(async {
            for (path, tables) in [
                (
                    &valid,
                    ["tasks", "time_entries", "settings", "schema_migrations"].as_slice(),
                ),
                (&invalid, ["unrelated"].as_slice()),
            ] {
                let options = SqliteConnectOptions::new()
                    .filename(path)
                    .create_if_missing(true);
                let mut connection = sqlx::SqliteConnection::connect_with(&options)
                    .await
                    .unwrap();
                for table in tables {
                    sqlx::query(&format!("CREATE TABLE {table} (id TEXT)"))
                        .execute(&mut connection)
                        .await
                        .unwrap();
                }
                connection.close().await.unwrap();
            }
            assert!(validate_tempo_database(&valid).await.is_ok());
            assert!(validate_tempo_database(&invalid).await.is_err());
        });
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn restore_replaces_database_and_preserves_previous_copy() {
        let directory = temporary_directory("restore");
        let source = directory.join("source.db");
        let destination = directory.join("tempo.db");
        let safety = directory.join("tempo-before-restore.db");
        std::fs::write(&source, b"new database").unwrap();
        std::fs::write(&destination, b"old database").unwrap();
        std::fs::write(format!("{}-wal", destination.display()), b"stale").unwrap();

        replace_database(&source, &destination, &safety).unwrap();

        assert_eq!(std::fs::read(&destination).unwrap(), b"new database");
        assert_eq!(std::fs::read(&safety).unwrap(), b"old database");
        assert!(!PathBuf::from(format!("{}-wal", destination.display())).exists());
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn distinguishes_login_launches_from_manual_launches() {
        assert!(has_autostart_argument([
            "tempo".to_string(),
            "--autostart".to_string()
        ]));
        assert!(!has_autostart_argument(["tempo".to_string()]));
    }

    #[test]
    fn isolates_development_database_names_in_debug_and_packaged_flavors() {
        assert_eq!(database_filename(true, None), "tempo-dev.db");
        assert_eq!(
            database_filename(false, Some("development")),
            "tempo-dev.db"
        );
        assert_eq!(database_filename(false, Some("production")), "tempo.db");
        assert_eq!(database_filename(false, None), "tempo.db");
    }
}
