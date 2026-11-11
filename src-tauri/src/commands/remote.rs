// src-tauri/src/commands/remote.rs — IPC commands cho Phone Remote Controller
use crate::services::remote_server::protocol::{RemoteServerInfo, RemoteState};
use crate::state::AppState;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn remote_start(
    state: State<'_, AppState>,
    app: AppHandle,
    port: Option<u16>,
    pin: Option<String>,
) -> Result<RemoteServerInfo, String> {
    let mut service = state.remote_service.lock().await;
    service.start(port, pin, app).await
}

#[tauri::command]
pub async fn remote_stop(state: State<'_, AppState>) -> Result<(), String> {
    let mut service = state.remote_service.lock().await;
    service.stop();
    Ok(())
}

#[tauri::command]
pub async fn remote_status(state: State<'_, AppState>) -> Result<RemoteServerInfo, String> {
    let service = state.remote_service.lock().await;
    Ok(service.get_info().await)
}

#[tauri::command]
pub async fn remote_broadcast_state(
    state: State<'_, AppState>,
    remote_state: Option<serde_json::Value>,
    payload: Option<serde_json::Value>,
) -> Result<(), String> {
    let raw = remote_state.or(payload).unwrap_or(serde_json::Value::Null);
    let parsed: RemoteState =
        if raw.get("session_active").is_some() || raw.get("sessionActive").is_some() {
            serde_json::from_value(raw)
                .map_err(|e| format!("Dữ liệu RemoteState không hợp lệ: {}", e))?
        } else if let Some(inner) = raw.get("remoteState").or_else(|| raw.get("remote_state")) {
            serde_json::from_value(inner.clone())
                .map_err(|e| format!("Dữ liệu RemoteState không hợp lệ: {}", e))?
        } else {
            serde_json::from_value(raw)
                .map_err(|e| format!("Dữ liệu RemoteState không hợp lệ: {}", e))?
        };
    let service = state.remote_service.lock().await;
    service.broadcast_state(parsed).await
}

#[tauri::command]
pub async fn remote_set_pin(state: State<'_, AppState>, pin: String) -> Result<(), String> {
    let mut service = state.remote_service.lock().await;
    service.set_pin(pin).await;
    Ok(())
}
