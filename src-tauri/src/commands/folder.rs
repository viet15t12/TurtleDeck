// src-tauri/src/commands/folder.rs — Quản lý thư mục cây phân cấp và vị trí bộ thẻ
use crate::error::AppResult;
use crate::services::{deck_location_service, folder_service};
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[tauri::command]
pub async fn folder_create(
    state: State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
) -> AppResult<Value> {
    let lib_dir = state.get_active_library_dir();
    let folder = state.with_db(|conn| {
        folder_service::create_folder(conn, Some(&lib_dir), &name, parent_id.as_deref())
    })?;
    Ok(serde_json::json!({ "ok": true, "folder": folder }))
}

#[tauri::command]
pub async fn folder_rename(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> AppResult<Value> {
    let lib_dir = state.get_active_library_dir();
    state
        .with_db_mut(|conn| folder_service::rename_folder(conn, Some(&lib_dir), &id, &new_name))?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn folder_move(
    state: State<'_, AppState>,
    id: String,
    new_parent_id: Option<String>,
) -> AppResult<Value> {
    let lib_dir = state.get_active_library_dir();
    state.with_db_mut(|conn| {
        folder_service::move_folder(conn, Some(&lib_dir), &id, new_parent_id.as_deref())
    })?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn folder_delete(state: State<'_, AppState>, id: String) -> AppResult<Value> {
    let lib_dir = state.get_active_library_dir();
    state.with_db_mut(|conn| folder_service::delete_folder(conn, Some(&lib_dir), &id))?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn folder_get_tree(state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    let tree = state.with_db(folder_service::get_folder_tree)?;
    let val_tree: Vec<Value> = tree
        .into_iter()
        .map(|f| serde_json::to_value(f).unwrap_or(Value::Null))
        .collect();
    Ok(val_tree)
}

#[tauri::command]
pub async fn deck_move(
    state: State<'_, AppState>,
    deck_id: String,
    new_folder_id: Option<String>,
) -> AppResult<Value> {
    let lib_dir = state.get_active_library_dir();
    state.with_db(|conn| {
        deck_location_service::move_deck(conn, Some(&lib_dir), &deck_id, new_folder_id.as_deref())
    })?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn deck_link(
    state: State<'_, AppState>,
    deck_id: String,
    target_folder_id: Option<String>,
) -> AppResult<Value> {
    let lib_dir = state.get_active_library_dir();
    state.with_db(|conn| {
        deck_location_service::link_deck(
            conn,
            Some(&lib_dir),
            &deck_id,
            target_folder_id.as_deref(),
        )
    })?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn deck_unlink(
    state: State<'_, AppState>,
    location_id: String,
    delete_file: Option<bool>,
) -> AppResult<Value> {
    state.with_db(|conn| {
        deck_location_service::unlink_deck(conn, &location_id, delete_file.unwrap_or(false))
    })?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn deck_get_locations(
    state: State<'_, AppState>,
    deck_id: Option<String>,
) -> AppResult<Vec<Value>> {
    let locs =
        state.with_db(|conn| deck_location_service::get_locations(conn, deck_id.as_deref()))?;
    let val_locs: Vec<Value> = locs
        .into_iter()
        .map(|l| serde_json::to_value(l).unwrap_or(Value::Null))
        .collect();
    Ok(val_locs)
}
