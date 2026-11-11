// src-tauri/src/commands/folder.rs — Quản lý thư mục cây phân cấp ảo và vị trí bộ thẻ
use crate::error::AppResult;
use crate::services::{deck_location_service, folder_service};
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn folder_create(
    state: State<'_, AppState>,
    name: String,
    parent_id: Option<String>,
) -> AppResult<Value> {
    let folder = state
        .with_db(|conn| folder_service::create_folder(conn, None, &name, parent_id.as_deref()))?;
    Ok(serde_json::json!({ "ok": true, "folder": folder }))
}

#[tauri::command]
pub async fn folder_rename(
    state: State<'_, AppState>,
    id: String,
    new_name: String,
) -> AppResult<Value> {
    let folder =
        state.with_db_mut(|conn| folder_service::rename_folder(conn, None, &id, &new_name))?;
    Ok(serde_json::json!({ "ok": true, "folder": folder }))
}

#[tauri::command]
pub async fn folder_move(
    state: State<'_, AppState>,
    id: String,
    new_parent_id: Option<String>,
) -> AppResult<Value> {
    let folder = state.with_db_mut(|conn| {
        folder_service::move_folder(conn, None, &id, new_parent_id.as_deref())
    })?;
    Ok(serde_json::json!({ "ok": true, "folder": folder }))
}

#[tauri::command]
pub async fn folder_delete(state: State<'_, AppState>, id: String) -> AppResult<Value> {
    let affected_deck_ids =
        state.with_db_mut(|conn| folder_service::delete_folder(conn, None, &id))?;
    Ok(serde_json::json!({
        "ok": true,
        "deletedFolderId": id,
        "affectedDeckIds": affected_deck_ids,
    }))
}

#[tauri::command]
pub async fn folder_reorder(
    state: State<'_, AppState>,
    parent_id: Option<String>,
    ordered_ids: Vec<String>,
) -> AppResult<Value> {
    state.with_db_mut(|conn| {
        folder_service::reorder_folders(conn, parent_id.as_deref(), &ordered_ids)
    })?;
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
    app: AppHandle,
    state: State<'_, AppState>,
    deck_id: String,
    new_folder_id: Option<String>,
) -> AppResult<Value> {
    let location = state.with_db(|conn| {
        deck_location_service::move_deck(conn, None, &deck_id, new_folder_id.as_deref())
    })?;
    let _ = app.emit(
        "deck:moved",
        serde_json::json!({
            "deckId": deck_id,
            "newFolderId": location.folder_id,
            "location": location,
        }),
    );
    Ok(serde_json::json!({ "ok": true, "location": location }))
}

#[tauri::command]
pub async fn deck_link(
    app: AppHandle,
    state: State<'_, AppState>,
    deck_id: String,
    target_folder_id: Option<String>,
) -> AppResult<Value> {
    let location = state.with_db(|conn| {
        deck_location_service::link_deck(conn, None, &deck_id, target_folder_id.as_deref())
    })?;
    let _ = app.emit(
        "deck:linked",
        serde_json::json!({
            "deckId": deck_id,
            "targetFolderId": location.folder_id,
            "location": location,
        }),
    );
    Ok(serde_json::json!({ "ok": true, "location": location }))
}

#[tauri::command]
pub async fn deck_unlink(
    app: AppHandle,
    state: State<'_, AppState>,
    location_id: String,
    delete_file: Option<bool>,
) -> AppResult<Value> {
    state.with_db(|conn| {
        deck_location_service::unlink_deck(conn, &location_id, delete_file.unwrap_or(false))
    })?;
    let _ = app.emit(
        "deck:unlinked",
        serde_json::json!({
            "locationId": location_id,
        }),
    );
    Ok(serde_json::json!({ "ok": true, "locationId": location_id }))
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
