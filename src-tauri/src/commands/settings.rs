// src-tauri/src/commands/settings.rs — Đọc và lưu cấu hình người dùng
use serde_json::Value;
use tauri::State;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn settings_load(
    _state: State<'_, AppState>,
) -> AppResult<Value> {
    // Trả object rỗng ban đầu để renderer áp dụng giá trị mặc định
    Ok(serde_json::json!({}))
}

#[tauri::command]
pub async fn settings_save(
    _state: State<'_, AppState>,
    _data: Value,
) -> AppResult<Value> {
    Ok(serde_json::json!({ "ok": true }))
}
