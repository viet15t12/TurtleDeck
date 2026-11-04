// src-tauri/src/commands/draft.rs — Quản lý bản nháp tự động lưu của Editor
use crate::error::AppResult;
use crate::services::draft_service;
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDraftReq {
    pub meta_id: String,
    pub deck_key: String,
    pub deck_text: String,
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
pub enum MetaIdArg {
    Object {
        #[serde(rename = "metaId")]
        meta_id: String,
    },
    Raw(String),
}

#[derive(serde::Deserialize)]
#[serde(untagged)]
pub enum DraftIdArg {
    Object {
        #[serde(rename = "draftId")]
        draft_id: String,
    },
    Raw(String),
}

#[tauri::command]
pub async fn draft_save(
    state: State<'_, AppState>,
    meta_id: Option<String>,
    deck_key: Option<String>,
    deck_text: Option<String>,
) -> AppResult<Value> {
    let drafts_dir = &state.paths.drafts_dir;
    let m_id = meta_id.unwrap_or_default();
    let d_key = deck_key.unwrap_or_default();
    let d_text = deck_text.unwrap_or_default();
    draft_service::save_draft(drafts_dir, &state.package_store, &m_id, &d_key, &d_text)
}

#[tauri::command]
pub async fn draft_delete(
    state: State<'_, AppState>,
    meta_id: Option<MetaIdArg>,
) -> AppResult<Value> {
    let drafts_dir = &state.paths.drafts_dir;
    let id_str = match meta_id {
        Some(MetaIdArg::Object { meta_id }) => meta_id,
        Some(MetaIdArg::Raw(s)) => s,
        None => String::new(),
    };
    draft_service::delete_draft(drafts_dir, &id_str)
}

#[tauri::command]
pub async fn draft_list(state: State<'_, AppState>) -> AppResult<Vec<Value>> {
    let drafts_dir = &state.paths.drafts_dir;
    draft_service::list_drafts(drafts_dir)
}

#[tauri::command]
pub async fn draft_load(
    state: State<'_, AppState>,
    draft_id: Option<DraftIdArg>,
) -> AppResult<Value> {
    let drafts_dir = &state.paths.drafts_dir;
    let id_str = match draft_id {
        Some(DraftIdArg::Object { draft_id }) => draft_id,
        Some(DraftIdArg::Raw(s)) => s,
        None => String::new(),
    };
    draft_service::load_draft(drafts_dir, &id_str, &state)
}
