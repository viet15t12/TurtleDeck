// src-tauri/src/commands/backup.rs — Sao lưu và khôi phục dữ liệu
use crate::error::{AppError, AppResult};
use crate::services::backup_service;
use crate::state::AppState;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[derive(serde::Deserialize)]
#[serde(untagged)]
pub enum DestPathArg {
    Object {
        #[serde(rename = "destPath")]
        dest_path: Option<String>,
    },
    Raw(String),
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
pub enum RestoreFullArg {
    Object {
        #[serde(rename = "filePath")]
        file_path: Option<String>,
        path: Option<String>,
    },
    Raw(String),
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
pub enum RestoreNameArg {
    Object { name: String },
    Raw(String),
}

#[tauri::command]
pub async fn backup_create(state: State<'_, AppState>) -> AppResult<Value> {
    backup_service::create_backup(&state.paths.backups_dir, &state)
}

#[tauri::command]
pub async fn backup_create_full(
    app: AppHandle,
    state: State<'_, AppState>,
    dest_path: Option<DestPathArg>,
) -> AppResult<Value> {
    let mut resolved_dest: Option<PathBuf> = match dest_path {
        Some(DestPathArg::Object { dest_path }) => dest_path.map(PathBuf::from),
        Some(DestPathArg::Raw(s)) if !s.trim().is_empty() => Some(PathBuf::from(s)),
        _ => None,
    };

    if resolved_dest.is_none() {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let date_str = backup_service::get_day_key(now_ms, 7 * 3600);
        let default_name = format!("turtledeck-full-backup-{date_str}.turtlebackup");

        let file = app
            .dialog()
            .file()
            .set_title("Xuất file sao lưu toàn bộ hệ thống (Bộ thẻ & Thư mục)")
            .set_file_name(&default_name)
            .add_filter(
                "File sao lưu Turtle Deck (*.turtlebackup, *.zip)",
                &["turtlebackup", "zip"],
            )
            .blocking_save_file();

        match file {
            Some(fp) => {
                resolved_dest = Some(
                    fp.into_path()
                        .map_err(|e| AppError::Custom(e.to_string()))?,
                );
            }
            None => return Ok(json!({ "ok": false, "canceled": true })),
        }
    }

    let library_dir = state.get_active_library_dir();
    backup_service::create_full_backup(
        &state.paths.backups_dir,
        &library_dir,
        &state.paths.settings_file,
        resolved_dest.as_deref(),
        &state,
    )
}

#[tauri::command]
pub async fn backup_restore_full(
    app: AppHandle,
    state: State<'_, AppState>,
    file_path: Option<RestoreFullArg>,
) -> AppResult<Value> {
    let mut resolved_src: Option<PathBuf> = match file_path {
        Some(RestoreFullArg::Object { file_path, path }) => file_path.or(path).map(PathBuf::from),
        Some(RestoreFullArg::Raw(s)) if !s.trim().is_empty() => Some(PathBuf::from(s)),
        _ => None,
    };

    if resolved_src.is_none() {
        let file = app
            .dialog()
            .file()
            .set_title("Chọn file sao lưu toàn bộ hệ thống để khôi phục")
            .add_filter(
                "File sao lưu Turtle Deck (*.turtlebackup, *.zip)",
                &["turtlebackup", "zip"],
            )
            .add_filter("Tất cả tập tin", &["*"])
            .blocking_pick_file();

        match file {
            Some(fp) => {
                resolved_src = Some(
                    fp.into_path()
                        .map_err(|e| AppError::Custom(e.to_string()))?,
                );
            }
            None => return Ok(json!({ "ok": false, "canceled": true })),
        }
    }

    let src = match resolved_src {
        Some(p) => p,
        None => {
            return Ok(json!({
                "ok": false,
                "error": "Chưa chọn file sao lưu để khôi phục."
            }));
        }
    };

    let library_dir = state.get_active_library_dir();
    let res = backup_service::restore_full_backup(
        &src,
        &library_dir,
        &state.paths.settings_file,
        &state,
    )?;

    if res.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        use tauri::Emitter;
        let _ = app.emit("folder:changed", json!({ "action": "restore" }));
        let _ = app.emit(
            "deck:changed",
            json!({ "filePath": library_dir.to_string_lossy() }),
        );
    }

    Ok(res)
}

#[tauri::command]
pub async fn backup_list(state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    backup_service::list_backups(&state.paths.backups_dir)
}

#[tauri::command]
pub async fn backup_restore(
    state: State<'_, AppState>,
    name: Option<RestoreNameArg>,
) -> AppResult<Value> {
    let name_str = match name {
        Some(RestoreNameArg::Object { name }) => name,
        Some(RestoreNameArg::Raw(s)) => s,
        None => String::new(),
    };
    backup_service::restore_backup(&state.paths.backups_dir, &name_str, &state)
}

#[tauri::command]
pub async fn backup_open_folder(state: State<'_, AppState>) -> AppResult<Value> {
    let dir = &state.paths.backups_dir;
    let _ = fs::create_dir_all(dir);

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer").arg(dir).spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open").arg(dir).spawn();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(dir).spawn();
    }

    Ok(json!({ "ok": true }))
}
