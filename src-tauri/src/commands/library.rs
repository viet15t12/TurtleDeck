// src-tauri/src/commands/library.rs — Quản lý và quét thư mục chứa các bộ thẻ
use serde_json::Value;
use tauri::State;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub async fn library_get_dir(
    state: State<'_, AppState>,
) -> AppResult<String> {
    Ok(state.paths.default_library_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn library_pick_dir(
    _state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    Err(AppError::NotImplemented("library:pickDir chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn library_set_dir(
    _state: State<'_, AppState>,
    _dir: String,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("library:setDir chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn library_scan(
    _state: State<'_, AppState>,
) -> AppResult<Vec<Value>> {
    // Kênh mảng: trả mảng rỗng ban đầu
    Ok(vec![])
}
