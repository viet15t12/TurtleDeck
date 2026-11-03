// src-tauri/src/commands/settings.rs — Đọc và lưu cấu hình người dùng
use crate::error::AppResult;
use crate::services::settings_service::{load_settings, save_settings};
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn settings_load(state: State<'_, AppState>) -> AppResult<Value> {
    Ok(load_settings(&state.paths.settings_file))
}

#[tauri::command]
pub async fn settings_save(state: State<'_, AppState>, data: Value) -> AppResult<Value> {
    save_settings(&state.paths.settings_file, &data)
}
