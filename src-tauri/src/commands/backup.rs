// src-tauri/src/commands/backup.rs — Sao lưu và khôi phục dữ liệu
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn backup_create(_state: State<'_, AppState>) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "backup:create chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn backup_create_full(
    _state: State<'_, AppState>,
    _dest_path: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "backup:createFull chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn backup_restore_full(
    _state: State<'_, AppState>,
    _file_path: Option<String>,
) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "backup:restoreFull chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn backup_list(_state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    // Kênh mảng: trả mảng rỗng ban đầu
    Ok(vec![])
}

#[tauri::command]
pub async fn backup_restore(_state: State<'_, AppState>, _name: String) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "backup:restore chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}

#[tauri::command]
pub async fn backup_open_folder(_state: State<'_, AppState>) -> AppResult<Value> {
    Err(AppError::NotImplemented(
        "backup:openFolder chưa hỗ trợ trong khung Giai đoạn 1".into(),
    ))
}
