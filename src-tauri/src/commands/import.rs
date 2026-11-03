// src-tauri/src/commands/import.rs — Nhập dữ liệu bộ thẻ từ CSV/TSV/Markdown
use serde_json::Value;
use tauri::State;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub async fn import_pick_file(
    _state: State<'_, AppState>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("import:pickFile chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn import_preview(
    _state: State<'_, AppState>,
    _token: Option<String>,
    _file_path: Option<String>,
    _format: Option<String>,
    _separator: Option<String>,
    _has_header: Option<bool>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("import:preview chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn import_commit(
    _state: State<'_, AppState>,
    _token: Option<String>,
    _file_path: Option<String>,
    _items: Option<Vec<Value>>,
    _options: Option<Value>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("import:commit chưa hỗ trợ trong khung Giai đoạn 1".into()))
}
