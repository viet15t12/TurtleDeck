// src-tauri/src/commands/srs.rs — Các thao tác thuật toán lặp lại ngắt quãng (SRS) và đánh dấu thẻ
use serde_json::Value;
use tauri::State;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
pub async fn srs_get_deck_summary(
    _state: State<'_, AppState>,
    _deck_id: Option<String>,
    _now: Option<i64>,
) -> AppResult<Value> {
    // Trả summary mặc định
    Ok(serde_json::json!({
        "newCount": 0,
        "learningCount": 0,
        "reviewCount": 0,
        "total": 0,
        "dueCount": 0
    }))
}

#[tauri::command]
pub async fn srs_get_due_items(
    _state: State<'_, AppState>,
    _deck_id: String,
    _limit: Option<u32>,
    _now: Option<i64>,
) -> AppResult<Vec<Value>> {
    // Kênh mảng: trả mảng rỗng ban đầu
    Ok(vec![])
}

#[tauri::command]
pub async fn srs_record_review(
    _state: State<'_, AppState>,
    _deck_id: String,
    _item_id: String,
    _direction: String,
    _rating: String,
    _elapsed_ms: u64,
) -> AppResult<Value> {
    Err(AppError::NotImplemented("srs:recordReview chưa hỗ trợ trong khung Giai đoạn 1".into()))
}

#[tauri::command]
pub async fn srs_get_card(
    _state: State<'_, AppState>,
    _deck_id: String,
    _item_id: String,
    _direction: String,
) -> AppResult<Option<Value>> {
    Ok(None)
}

#[tauri::command]
pub async fn meta_get(
    _state: State<'_, AppState>,
    _deck_id: String,
    _item_id: String,
) -> AppResult<Option<Value>> {
    Ok(None)
}

#[tauri::command]
pub async fn meta_set_starred(
    _state: State<'_, AppState>,
    _deck_id: String,
    _item_id: String,
    _starred: bool,
) -> AppResult<Value> {
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn meta_set_note(
    _state: State<'_, AppState>,
    _deck_id: String,
    _item_id: String,
    _note: String,
) -> AppResult<Value> {
    Ok(serde_json::json!({ "ok": true }))
}
