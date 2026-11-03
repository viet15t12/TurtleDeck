// src-tauri/src/commands/deck.rs — Các IPC commands xử lý gói thẻ (.sdeck)
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn deck_open(
    _state: State<'_, AppState>,
    _file_path: Option<Value>,
) -> AppResult<Vec<Value>> {
    // Kênh mảng: trong giai đoạn 1 trả mảng rỗng nếu chưa triển khai
    Ok(vec![])
}

#[tauri::command]
pub async fn deck_import(_state: State<'_, AppState>, _kind: Option<String>) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:import chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
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
    Err(AppError::NotImplemented(
        "deck:save chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn deck_import_sdeck(
    _state: State<'_, AppState>,
    _file_paths: Option<Vec<String>>,
    _target_folder_id: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:importSdeck chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn deck_close(_state: State<'_, AppState>, _deck_key: String) -> AppResult<bool> {
    Ok(true)
}

#[tauri::command]
pub async fn deck_duplicate(
    _state: State<'_, AppState>,
    _old_deck_key: String,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:duplicate chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn deck_export_copy(_state: State<'_, AppState>, _file_path: String) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:exportCopy chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn deck_show_in_folder(
    _state: State<'_, AppState>,
    _file_path: String,
) -> AppResult<bool> {
    Err(AppError::NotImplemented(
        "deck:showInFolder chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn deck_new(_state: State<'_, AppState>) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:new chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryItemsParams {
    pub deck_id: String,
    pub query: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub starred_only: Option<bool>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
    pub tag: Option<String>,
}

#[tauri::command]
pub async fn deck_query_items(
    _state: State<'_, AppState>,
    _params: QueryItemsParams,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:queryItems chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}
