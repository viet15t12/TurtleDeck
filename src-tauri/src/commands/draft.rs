// src-tauri/src/commands/draft.rs — Quản lý bản nháp tự động lưu của Editor
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn draft_save(
    _state: State<'_, AppState>,
    _meta_id: String,
    _deck_key: String,
    _deck_text: String,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "draft:save chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn draft_delete(_state: State<'_, AppState>, _meta_id: String) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "draft:delete chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn draft_list(_state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    // Kênh mảng: trả mảng rỗng ban đầu
    Ok(vec![])
}

#[tauri::command]
pub async fn draft_load(_state: State<'_, AppState>, _draft_id: String) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "draft:load chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}
