// src-tauri/src/commands/srs.rs — Các thao tác thuật toán lặp lại ngắt quãng (SRS) và đánh dấu thẻ
use crate::db::migration::rating_to_number;
use crate::db::repositories::deck::DeckRepository;
use crate::db::repositories::srs::{SrsCard, SrsRepository};
use crate::error::AppResult;
use crate::srs::adaptive_planner::{plan_adaptive_session, PlannedCardItem, PlannerConfig};
use crate::srs::fsrs::schedule_fsrs;
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
pub async fn srs_plan_session(
    state: State<'_, AppState>,
    deck_id: String,
    config: Option<PlannerConfig>,
    items: Option<Vec<Value>>,
    now: Option<i64>,
) -> AppResult<Vec<PlannedCardItem>> {
    let now_ts = now.unwrap_or_else(current_time_ms);
    let mut cfg = config.unwrap_or_default();
    if cfg.deck_id.is_none() {
        cfg.deck_id = Some(deck_id.clone());
    }

    let planned = state.with_db(|conn| {
        let deck_items = match items {
            Some(its) if !its.is_empty() => its,
            _ => DeckRepository::get_items(conn, &deck_id)?,
        };
        let cards = SrsRepository::get_deck_cards(conn, &deck_id)?;
        Ok(plan_adaptive_session(&deck_items, &cards, &cfg, now_ts))
    })?;

    Ok(planned)
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

    let (next_card, previews) = state.with_db_mut(|conn| {
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
                stability: None,
                difficulty: None,
                last_review: None,
            });

        let is_new = existing.state == "new";
        let mut next = schedule_fsrs(&existing, rating_num, now, 0.9, true);
        next.updated_at = Some(now);
        next.deck_id = Some(deck_id.clone());
        next.item_id = Some(item_id.clone());
        next.direction = Some(direction.clone());

        SrsRepository::record_review(conn, &next, rating_num, now, elapsed_ms as i64, is_new)?;

        let preview_intervals = serde_json::json!({
            "1": schedule_fsrs(&existing, 1, now, 0.9, false).interval,
            "2": schedule_fsrs(&existing, 2, now, 0.9, false).interval,
            "3": schedule_fsrs(&existing, 3, now, 0.9, false).interval,
            "4": schedule_fsrs(&existing, 4, now, 0.9, false).interval,
        });

        Ok((next, preview_intervals))
    })?;

    Ok(serde_json::json!({
        "ok": true,
        "card": next_card,
        "previews": previews,
    }))
}

#[tauri::command]
pub async fn srs_grade_answer(
    input: Value,
    answers: Value,
    mode: Option<String>,
    tolerance: Option<f64>,
) -> AppResult<Value> {
    let mode_str = mode.unwrap_or_else(|| "normalized".to_string());

    if mode_str == "choice" || mode_str == "choices" || mode_str == "single" || mode_str == "multi"
    {
        let selected: Vec<i64> = if let Some(arr) = input.as_array() {
            arr.iter().filter_map(|v| v.as_i64()).collect()
        } else if let Some(n) = input.as_i64() {
            vec![n]
        } else {
            Vec::new()
        };
        let correct: Vec<i64> = if let Some(arr) = answers.as_array() {
            arr.iter()
                .filter_map(|v| {
                    v.as_i64()
                        .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                })
                .collect()
        } else if let Some(n) = answers.as_i64() {
            vec![n]
        } else {
            Vec::new()
        };
        let res = crate::srs::grader::grade_choices(&selected, &correct);
        return Ok(serde_json::to_value(res)?);
    }

    let input_str = if let Some(s) = input.as_str() {
        s.to_string()
    } else {
        input.to_string().trim_matches('"').to_string()
    };

    let ans_vec: Vec<String> = if let Some(arr) = answers.as_array() {
        arr.iter()
            .map(|v| v.as_str().unwrap_or(&v.to_string()).to_string())
            .collect()
    } else if let Some(s) = answers.as_str() {
        vec![s.to_string()]
    } else {
        vec![answers.to_string()]
    };
    let ans_refs: Vec<&str> = ans_vec.iter().map(|s| s.as_str()).collect();

    let res = crate::srs::grader::grade_text(&input_str, &ans_refs, &mode_str, tolerance);
    Ok(serde_json::to_value(res)?)
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
