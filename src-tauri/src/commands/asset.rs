// src-tauri/src/commands/asset.rs — Quản lý ảnh và assets trong gói thẻ
use crate::error::AppResult;
use crate::services::asset_service;
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn asset_add(
    app: AppHandle,
    state: State<'_, AppState>,
    deck_key: String,
) -> AppResult<Vec<Value>> {
    let picked = app
        .dialog()
        .file()
        .set_title("Thêm ảnh vào bộ thẻ")
        .add_filter(
            "Hình ảnh",
            &["png", "jpg", "jpeg", "gif", "webp", "svg"],
        )
        .blocking_pick_files();

    let paths: Vec<String> = match picked {
        Some(files) => files.into_iter().map(|f| f.to_string()).collect(),
        None => return Ok(vec![]),
    };

    let added = asset_service::add_asset_files(&state.package_store, &deck_key, &paths);
    Ok(added)
}

#[tauri::command]
pub async fn asset_add_bytes(
    state: State<'_, AppState>,
    deck_key: String,
    name: String,
    bytes: Vec<u8>,
) -> AppResult<Value> {
    asset_service::add_asset_bytes(&state.package_store, &deck_key, &name, &bytes)
}

#[tauri::command]
pub async fn asset_list(state: State<'_, AppState>, deck_key: String) -> AppResult<Vec<String>> {
    Ok(asset_service::list_assets(&state.package_store, &deck_key))
}

#[tauri::command]
pub async fn asset_remove(
    state: State<'_, AppState>,
    deck_key: String,
    asset_path: String,
) -> AppResult<Value> {
    asset_service::remove_asset(&state.package_store, &deck_key, &asset_path)
}
