// src-tauri/src/commands/deck.rs — Các IPC commands xử lý gói thẻ (.sdeck)
use serde_json::Value;
use tauri::State;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub async fn deck_open(
    _state: State<'_, AppState>,
    _file_path: Option<Value>,
) -> AppResult<Vec<Value>> {
    // Kênh mảng: trong giai đoạn 1 trả mảng rỗng nếu chưa triển khai
    Ok(vec![])
}

#[tauri::command]
pub async fn deck_import(
    _state: State<'_, AppState>,
    _kind: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("deck:import chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn deck_save(
    _state: State<'_, AppState>,
    _deck_key: String,
    _deck_text: Option<String>,
    _file_path: Option<String>,
    _save_as: Option<bool>,
    _prune_unused: Option<bool>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("deck:save chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn deck_import_sdeck(
    _state: State<'_, AppState>,
    _file_paths: Option<Vec<String>>,
    _target_folder_id: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("deck:importSdeck chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn deck_close(
    _state: State<'_, AppState>,
    _deck_key: String,
) -> AppResult<bool> {
    Ok(true)
}

#[tauri::command]
pub async fn deck_duplicate(
    _state: State<'_, AppState>,
    _old_deck_key: String,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("deck:duplicate chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn deck_export_copy(
    _state: State<'_, AppState>,
    _file_path: String,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("deck:exportCopy chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn deck_show_in_folder(
    _state: State<'_, AppState>,
    _file_path: String,
) -> AppResult<bool> {
    Err(AppError::NotImplemented("deck:showInFolder chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn deck_new(
    _state: State<'_, AppState>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("deck:new chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn deck_query_items(
    _state: State<'_, AppState>,
    _deck_id: String,
    _query: Option<String>,
    _item_type: Option<String>,
    _starred_only: Option<bool>,
    _limit: Option<u32>,
    _offset: Option<u32>,
    _tag: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("deck:queryItems chưa hỗ trợ trong khung Giai đoạn 1".into()))
}
