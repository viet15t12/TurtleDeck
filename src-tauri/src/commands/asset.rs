// src-tauri/src/commands/asset.rs — Quản lý ảnh và assets trong gói thẻ
use serde_json::Value;
use tauri::State;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub async fn asset_add(
    _state: State<'_, AppState>,
    _deck_key: String,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("asset:add chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn asset_add_bytes(
    _state: State<'_, AppState>,
    _deck_key: String,
    _name: String,
    _bytes: Vec<u8>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("asset:addBytes chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn asset_list(
    _state: State<'_, AppState>,
    _deck_key: String,
) -> AppResult<Vec<String>> {
    Ok(vec![])
}

#[tauri::command]
pub async fn asset_remove(
    _state: State<'_, AppState>,
    _deck_key: String,
    _asset_path: String,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("asset:remove chưa hỗ trợ trong khung Giai đoạn 1".into()))
}
