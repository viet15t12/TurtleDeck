// src-tauri/src/commands/library.rs — Quản lý và quét thư mục chứa các bộ thẻ
use crate::error::{AppError, AppResult};
use crate::services::library_service::scan_library;
use crate::services::settings_service::{load_settings, save_settings};
use crate::state::AppState;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn library_get_dir(state: State<'_, AppState>) -> AppResult<String> {
    Ok(state.get_active_library_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub async fn library_pick_dir(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<String>> {
    let current = state.get_active_library_dir();
    let picked = app
        .dialog()
        .file()
        .set_title("Chọn thư mục Thư viện bộ thẻ")
        .set_directory(&current)
        .blocking_pick_folder();

    let picked_str = match picked {
        Some(f) => f.to_string(),
        None => return Ok(None),
    };

    let resolved = fs::canonicalize(&picked_str).unwrap_or_else(|_| PathBuf::from(&picked_str));
    let resolved_str = resolved.to_string_lossy().to_string();

    let mut settings = load_settings(&state.paths.settings_file);
    if let Some(obj) = settings.as_object_mut() {
        obj.insert("libraryDir".into(), Value::String(resolved_str.clone()));
    }
    let _ = save_settings(&state.paths.settings_file, &settings);

    if let Ok(lock) = state.watcher.lock() {
        if let Some(w) = lock.as_ref() {
            w.watch_path(&resolved);
        }
    }

    Ok(Some(resolved_str))
}

#[tauri::command]
pub async fn library_set_dir(state: State<'_, AppState>, dir: String) -> AppResult<Value> {
    if dir.trim().is_empty() {
        return Err(AppError::Custom("Đường dẫn không hợp lệ.".into()));
    }

    let p = PathBuf::from(&dir);
    let _ = fs::create_dir_all(&p);
    let resolved = fs::canonicalize(&p).unwrap_or_else(|_| p.clone());
    let resolved_str = resolved.to_string_lossy().to_string();

    let mut settings = load_settings(&state.paths.settings_file);
    if let Some(obj) = settings.as_object_mut() {
        obj.insert("libraryDir".into(), Value::String(resolved_str.clone()));
    }
    let _ = save_settings(&state.paths.settings_file, &settings);

    if let Ok(lock) = state.watcher.lock() {
        if let Some(w) = lock.as_ref() {
            w.watch_path(&resolved);
        }
    }

    Ok(json!({ "ok": true, "libraryDir": resolved_str }))
}

#[tauri::command]
pub async fn library_scan(state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    let lib_dir = state.get_active_library_dir();
    if let Ok(lock) = state.watcher.lock() {
        if let Some(w) = lock.as_ref() {
            w.watch_path(&lib_dir);
        }
    }
    let decks = scan_library(&lib_dir, &state.library_cache);
    Ok(decks)
}
