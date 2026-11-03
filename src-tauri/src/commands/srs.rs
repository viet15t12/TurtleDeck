// src-tauri/src/commands/srs.rs — Các thao tác thuật toán lặp lại ngắt quãng (SRS) và đánh dấu thẻ
use crate::db::migration::rating_to_number;
use crate::db::repositories::deck::DeckRepository;
use crate::db::repositories::srs::{schedule_card, SrsCard, SrsRepository};
use crate::error::AppResult;
use crate::state::AppState;
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

fn current_time_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub async fn srs_get_deck_summary(
    state: State<'_, AppState>,
    deck_id: Option<String>,
    now: Option<i64>,
) -> AppResult<Value> {
    let now_ts = now.unwrap_or_else(current_time_ms);
    let did = deck_id.unwrap_or_default();
    let summary = state.with_db(|conn| SrsRepository::get_summary(conn, &did, now_ts))?;
    Ok(serde_json::to_value(summary)?)
}

#[tauri::command]
pub async fn srs_get_due_items(
    state: State<'_, AppState>,
    deck_id: String,
    limit: Option<u32>,
    now: Option<i64>,
) -> AppResult<Vec<Value>> {
    let now_ts = now.unwrap_or_else(current_time_ms);
    let lim = limit.unwrap_or(50);

    let (due_cards, items) = state.with_db(|conn| {
        let cards = SrsRepository::get_due_cards(conn, &deck_id, now_ts, lim)?;
        let items = DeckRepository::get_items(conn, &deck_id)?;
        Ok((cards, items))
    })?;

    let mut item_map = HashMap::new();
    for it in items {
        if let Some(id) = it.get("id").and_then(|i| i.as_str()) {
            item_map.insert(id.to_string(), it);
        }
    }

    let mut result = Vec::new();
    for card in due_cards {
        if let Some(ref iid) = card.item_id {
            if let Some(item_val) = item_map.get(iid) {
                result.push(serde_json::json!({
                    "item": item_val,
                    "card": card,
                }));
            }
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn srs_record_review(
    state: State<'_, AppState>,
    deck_id: String,
    item_id: String,
    direction: String,
    rating: Value,
    elapsed_ms: u64,
) -> AppResult<Value> {
    let now = current_time_ms();
    let rating_num = rating_to_number(&rating);

    let next_card = state.with_db_mut(|conn| {
        let existing = SrsRepository::get_card(conn, &deck_id, &item_id, &direction)?
            .unwrap_or_else(|| SrsCard {
                deck_id: Some(deck_id.clone()),
                item_id: Some(item_id.clone()),
                direction: Some(direction.clone()),
                state: "new".to_string(),
                step: 0,
                ease: 2.5,
                interval: 0,
                due: 0,
                reps: 0,
                lapses: 0,
                updated_at: Some(now),
            });

        let is_new = existing.state == "new";
        let mut next = schedule_card(&existing, rating_num, now, None);
        next.updated_at = Some(now);
        next.deck_id = Some(deck_id.clone());
        next.item_id = Some(item_id.clone());
        next.direction = Some(direction.clone());

        SrsRepository::record_review(conn, &next, rating_num, now, elapsed_ms as i64, is_new)?;
        Ok(next)
    })?;

    Ok(serde_json::json!({ "ok": true, "card": next_card }))
}

#[tauri::command]
pub async fn srs_get_card(
    state: State<'_, AppState>,
    deck_id: String,
    item_id: String,
    direction: String,
) -> AppResult<Option<Value>> {
    let card =
        state.with_db(|conn| SrsRepository::get_card(conn, &deck_id, &item_id, &direction))?;
    Ok(card.map(|c| serde_json::to_value(c).unwrap_or(Value::Null)))
}

#[tauri::command]
pub async fn meta_get(
    state: State<'_, AppState>,
    deck_id: String,
    item_id: String,
) -> AppResult<Option<Value>> {
    let meta = state.with_db(|conn| SrsRepository::get_meta(conn, &deck_id, &item_id))?;
    Ok(meta.map(|m| serde_json::to_value(m).unwrap_or(Value::Null)))
}

#[tauri::command]
pub async fn meta_set_starred(
    state: State<'_, AppState>,
    deck_id: String,
    item_id: String,
    starred: bool,
) -> AppResult<Value> {
    state.with_db(|conn| SrsRepository::set_starred(conn, &deck_id, &item_id, starred))?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub async fn meta_set_note(
    state: State<'_, AppState>,
    deck_id: String,
    item_id: String,
    note: String,
) -> AppResult<Value> {
    state.with_db(|conn| SrsRepository::set_note(conn, &deck_id, &item_id, &note))?;
    Ok(serde_json::json!({ "ok": true }))
}
