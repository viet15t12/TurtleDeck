// src-tauri/src/commands/stats.rs — Thống kê học tập, báo cáo và chuỗi học tập (streak)
use crate::db::repositories::deck::DeckRepository;
use crate::db::repositories::srs::SrsRepository;
use crate::db::repositories::stats::StatsRepository;
use crate::error::AppResult;
use crate::state::AppState;
use serde_json::Value;
use tauri::State;

fn current_time_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub async fn stats_get_deck_report(
    state: State<'_, AppState>,
    deck_id: String,
    days: Option<u32>,
) -> AppResult<Value> {
    let now = current_time_ms();
    let num_days = days.unwrap_or(90);

    let (items, summary, daily_history, retention, leeches, streak) = state.with_db(|conn| {
        let items = DeckRepository::get_items(conn, &deck_id)?;
        let summary = SrsRepository::get_summary(conn, &deck_id, now)?;
        let daily_history = StatsRepository::get_daily_activity(
            conn,
            Some(&deck_id),
            num_days,
            Some("Asia/Saigon"),
        )?;
        let retention = StatsRepository::get_retention_breakdown(conn, Some(&deck_id))?;
        let leeches = StatsRepository::get_leech_cards(conn, Some(&deck_id), 8)?;
        let streak = StatsRepository::get_overall_streak(conn, Some("Asia/Saigon"), now)?;
        Ok((items, summary, daily_history, retention, leeches, streak))
    })?;

    let total_items = if !items.is_empty() {
        items.len() as i64
    } else {
        summary.total_cards
    };

    let learned_items = summary.learning_count + summary.due_count + summary.mastered_count;

    Ok(serde_json::json!({
        "deckId": deck_id,
        "totalItems": total_items,
        "learnedItems": learned_items,
        "matureItems": summary.mastered_count,
        "currentStreak": streak.current_streak,
        "longestStreak": streak.longest_streak,
        "retention": retention,
        "leeches": leeches,
        "dailyHistory": daily_history,
    }))
}

#[tauri::command]
pub async fn stats_get_overall_streak(state: State<'_, AppState>) -> AppResult<Value> {
    let now = current_time_ms();
    let streak = state
        .with_db(|conn| StatsRepository::get_overall_streak(conn, Some("Asia/Saigon"), now))?;
    Ok(serde_json::to_value(streak)?)
}
