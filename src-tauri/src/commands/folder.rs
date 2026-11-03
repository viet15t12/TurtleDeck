// src-tauri/src/commands/folder.rs — Quản lý thư mục cây phân cấp và vị trí bộ thẻ
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn folder_create(
    _state: State<'_, AppState>,
    _name: String,
    _parent_id: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "folder:create chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn folder_rename(
    _state: State<'_, AppState>,
    _id: String,
    _new_name: String,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "folder:rename chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn folder_move(
    _state: State<'_, AppState>,
    _id: String,
    _new_parent_id: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "folder:move chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn folder_delete(_state: State<'_, AppState>, _id: String) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "folder:delete chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn folder_get_tree(_state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    // Kênh mảng: trả mảng cây thư mục rỗng ban đầu
    Ok(vec![])
}

#[tauri::command]
pub async fn deck_move(
    _state: State<'_, AppState>,
    _deck_id: String,
    _new_folder_id: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:move chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn deck_link(
    _state: State<'_, AppState>,
    _deck_id: String,
    _target_folder_id: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:link chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn deck_unlink(
    _state: State<'_, AppState>,
    _location_id: String,
    _delete_file: Option<bool>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "deck:unlink chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn deck_get_locations(
    _state: State<'_, AppState>,
    _deck_id: Option<String>,
) -> AppResult<Vec<Value>> {
    // Kênh mảng: trả mảng rỗng ban đầu
    Ok(vec![])
}
