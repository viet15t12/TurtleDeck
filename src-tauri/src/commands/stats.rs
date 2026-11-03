// src-tauri/src/commands/stats.rs — Thống kê học tập, báo cáo và chuỗi học tập (streak)
use serde_json::Value;
use tauri::State;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub async fn stats_get_deck_report(
    _state: State<'_, AppState>,
    _deck_id: String,
    _days: Option<u32>,
) -> AppResult<Value> {
    Ok(serde_json::json!({
        "totalReviews": 0,
        "correctCount": 0,
        "passRate": 0.0,
        "streakDays": 0,
        "dailyCounts": [],
        "leeches": []
    }))
}

#[tauri::command]
pub async fn stats_get_overall_streak(
    _state: State<'_, AppState>,
) -> AppResult<Value> {
    Ok(serde_json::json!({
        "streak": 0,
        "lastStudyDate": null,
        "studiedToday": false
    }))
}
