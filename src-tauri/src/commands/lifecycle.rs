// src-tauri/src/commands/lifecycle.rs — Các lệnh IPC quản lý vòng đời ứng dụng
use crate::services::external_files::flush_pending_external_files;
use crate::state::AppState;
use tauri::{AppHandle, State};

/// Thông báo từ frontend (thông qua `window.api.notifyReady`) báo hiệu webview đã nạp xong
/// và sẵn sàng nhận các sự kiện IPC (như `deck:openExternal`).
#[tauri::command]
pub async fn app_ready(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    flush_pending_external_files(&app, &state);
    Ok(())
}
