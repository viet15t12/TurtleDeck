// src-tauri/src/commands/import.rs — Nhập dữ liệu bộ thẻ từ CSV/TSV/Markdown
use crate::error::AppResult;
use crate::services::import_service;
use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, State};

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewArgs {
    pub token: Option<String>,
    pub file_path: Option<String>,
    pub path: Option<String>,
    pub text: Option<String>,
    pub format: Option<String>,
    pub separator: Option<String>,
    pub options: Option<Value>,
}

#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitArgs {
    pub deck_key: Option<String>,
    pub import_id: Option<String>,
    pub selected_ids: Option<Vec<String>>,
    pub items: Option<Vec<Value>>,
    pub options: Option<Value>,
}

#[tauri::command]
pub async fn import_pick_file(app: AppHandle, state: State<'_, AppState>) -> AppResult<Value> {
    import_service::import_pick_file(&app, &state.package_store)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn import_preview(
    state: State<'_, AppState>,
    token: Option<String>,
    file_path: Option<String>,
    path: Option<String>,
    text: Option<String>,
    format: Option<String>,
    separator: Option<String>,
    options: Option<Value>,
) -> AppResult<Value> {
    let effective_path = path.or(file_path);
    let term_sep = options
        .as_ref()
        .and_then(|o| o.get("termSep"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or(separator);

    import_service::preview_import(
        &state.package_store,
        token.as_deref(),
        effective_path.as_deref(),
        text.as_deref(),
        format.as_deref(),
        term_sep.as_deref(),
    )
}

#[tauri::command]
pub async fn import_commit(
    state: State<'_, AppState>,
    deck_key: Option<String>,
    import_id: Option<String>,
    selected_ids: Option<Vec<String>>,
    _items: Option<Vec<Value>>,
    _options: Option<Value>,
) -> AppResult<Value> {
    import_service::commit_import(
        &state.package_store,
        deck_key.as_deref(),
        import_id.as_deref(),
        selected_ids.as_deref(),
    )
}
