// src-tauri/src/commands/progress.rs — Đọc, lưu, xuất và nhập tiến độ học tập
use crate::error::AppResult;
use crate::services::progress_service;
use crate::state::AppState;
use serde_json::Value;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn progress_load(state: State<'_, AppState>) -> AppResult<Value> {
    state.with_db(progress_service::load_progress)
}

#[tauri::command]
pub async fn progress_save(state: State<'_, AppState>, data: Value) -> AppResult<Value> {
    state.with_db_mut(|conn| progress_service::save_progress(conn, &data))
}

#[tauri::command]
pub async fn progress_export(app: AppHandle, state: State<'_, AppState>) -> AppResult<Value> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let default_name = format!("turtle-deck-progress-{now}.json");

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("JSON Backup", &["json"])
        .blocking_save_file();

    match file_path {
        Some(fp) => {
            let path_buf: PathBuf = fp
                .into_path()
                .map_err(|e| crate::error::AppError::Custom(e.to_string()))?;
            state.with_db(|conn| progress_service::export_progress_to_file(conn, &path_buf))
        }
        None => Ok(serde_json::json!({ "ok": false, "canceled": true })),
    }
}

#[tauri::command]
pub async fn progress_pick_import(app: AppHandle) -> AppResult<Value> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("JSON Backup", &["json"])
        .blocking_pick_file();

    match file_path {
        Some(fp) => {
            let path_buf: PathBuf = fp
                .into_path()
                .map_err(|e| crate::error::AppError::Custom(e.to_string()))?;
            progress_service::read_and_validate_import_file(&path_buf)
        }
        None => Ok(Value::Null),
    }
}

#[tauri::command]
pub async fn progress_apply_import(
    state: State<'_, AppState>,
    imported_progress: Value,
    mode: Option<String>,
) -> AppResult<Value> {
    let m = mode.as_deref().unwrap_or("merge");
    state.with_db_mut(|conn| {
        progress_service::apply_import(conn, &state.paths.backups_dir, &imported_progress, m)
    })
}
