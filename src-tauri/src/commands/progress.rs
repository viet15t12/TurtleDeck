// src-tauri/src/commands/progress.rs — Đọc, lưu, xuất và nhập tiến độ học tập
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn progress_load(_state: State<'_, AppState>) -> AppResult<Value> {
    // Trả object rỗng ban đầu để không crash renderer
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn progress_save(_state: State<'_, AppState>, _data: Value) -> AppResult<Value> {
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn progress_export(_state: State<'_, AppState>) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "progress:export chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn progress_pick_import(_state: State<'_, AppState>) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "progress:pickImport chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn progress_apply_import(
    _state: State<'_, AppState>,
    _imported_progress: Value,
    _mode: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "progress:applyImport chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}
