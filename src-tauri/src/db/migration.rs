// src-tauri/src/db/migration.rs — Chuyển đổi dữ liệu tự động từ progress.json sang SQLite
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    pub migrated: bool,
    pub cards_count: usize,
    pub logs_count: usize,
    pub meta_count: usize,
    pub error: Option<String>,
}

pub fn parse_progress_card_key(key: &str) -> (String, String, String) {
    let parts: Vec<&str> = key.split(':').collect();
    if parts.len() >= 3 {
        let deck_id = parts[0].to_string();
        let item_id = parts[1..parts.len() - 1].join(":");
        let direction = parts[parts.len() - 1].to_string();
        (deck_id, item_id, direction)
    } else if parts.len() == 2 {
        (
            parts[0].to_string(),
            parts[1].to_string(),
            "fwd".to_string(),
        )
    } else {
        (key.to_string(), key.to_string(), "fwd".to_string())
    }
}

pub fn parse_progress_meta_key(key: &str) -> (String, String) {
    let parts: Vec<&str> = key.split(':').collect();
    if parts.len() >= 2 {
        let deck_id = parts[0].to_string();
        let item_id = parts[1..].join(":");
        (deck_id, item_id)
    } else {
        (key.to_string(), key.to_string())
    }
}

pub fn rating_to_number(rating: &Value) -> i64 {
    if let Some(n) = rating.as_i64() {
        if (1..=4).contains(&n) {
            return n;
        }
    }
    if let Some(s) = rating.as_str() {
        match s {
            "again" => 1,
            "hard" => 2,
            "good" => 3,
            "easy" => 4,
            _ => 3,
        }
    } else {
        3
    }
}

pub fn number_to_rating(num: i64) -> &'static str {
    match num {
        1 => "again",
        2 => "hard",
        3 => "good",
        4 => "easy",
        _ => "good",
    }
}

pub fn migrate_legacy_progress(
    conn: &mut Connection,
    user_data_or_file_path: &Path,
) -> MigrationResult {
    let legacy_path: PathBuf = if user_data_or_file_path.is_file() {
        user_data_or_file_path.to_path_buf()
    } else {
        user_data_or_file_path.join("progress.json")
    };

    if !legacy_path.exists() {
        return MigrationResult {
            migrated: false,
            cards_count: 0,
            logs_count: 0,
            meta_count: 0,
            error: None,
        };
    }

    let content = match fs::read_to_string(&legacy_path) {
        Ok(c) => c,
        Err(e) => {
            return MigrationResult {
                migrated: false,
                cards_count: 0,
                logs_count: 0,
                meta_count: 0,
                error: Some(format!("Không thể đọc file progress.json: {e}")),
            };
        }
    };

    let cleaned = content.trim_start_matches('\u{feff}');
    let legacy_val: Value = match serde_json::from_str(cleaned) {
        Ok(v) => v,
        Err(e) => {
            return MigrationResult {
                migrated: false,
                cards_count: 0,
                logs_count: 0,
                meta_count: 0,
                error: Some(format!("progress.json không phải JSON hợp lệ: {e}")),
            };
        }
    };

    let obj = match legacy_val.as_object() {
        Some(o) => o,
        None => {
            return MigrationResult {
                migrated: false,
                cards_count: 0,
                logs_count: 0,
                meta_count: 0,
                error: None,
            };
        }
    };

    let mut cards_count = 0;
    let mut logs_count = 0;
    let mut meta_count = 0;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let tx_res: AppResult<()> = (|| {
        let tx = conn.transaction()?;

        // 1. Thẻ SRS (cards)
        if let Some(cards_map) = obj.get("cards").and_then(|c| c.as_object()) {
            let mut insert_card = tx.prepare(
                "INSERT OR REPLACE INTO srs_cards (deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            )?;

            for (key, card) in cards_map {
                let (deck_id, item_id, direction) = parse_progress_card_key(key);
                if deck_id.is_empty() || item_id.is_empty() {
                    continue;
                }

                let state = card.get("state").and_then(|s| s.as_str()).unwrap_or("new");
                let step = card
                    .get("step")
                    .or_else(|| card.get("stepIndex"))
                    .and_then(|s| s.as_i64())
                    .unwrap_or(0);
                let ease = card.get("ease").and_then(|e| e.as_f64()).unwrap_or(2.5);
                let interval = card.get("interval").and_then(|i| i.as_i64()).unwrap_or(0);
                let due = card.get("due").and_then(|d| d.as_i64()).unwrap_or(0);
                let reps = card.get("reps").and_then(|r| r.as_i64()).unwrap_or(0);
                let lapses = card.get("lapses").and_then(|l| l.as_i64()).unwrap_or(0);
                let updated_at = card
                    .get("updatedAt")
                    .or_else(|| card.get("lastReview"))
                    .or_else(|| card.get("lastReviewed"))
                    .and_then(|u| u.as_i64())
                    .unwrap_or(now);

                insert_card.execute(params![
                    deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses,
                    updated_at
                ])?;
                cards_count += 1;
            }
        }

        // 2. Nhật ký ôn tập (log)
        if let Some(log_arr) = obj.get("log").and_then(|l| l.as_array()) {
            let mut check_log = tx.prepare(
                "SELECT 1 FROM review_logs WHERE deck_id = ?1 AND item_id = ?2 AND direction = ?3 AND review_time = ?4 LIMIT 1",
            )?;
            let mut insert_log = tx.prepare(
                "INSERT INTO review_logs (deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )?;

            for entry in log_arr {
                let card_key = entry
                    .get("card")
                    .and_then(|c| c.as_str())
                    .unwrap_or_default();
                let (deck_id, item_id, direction) = parse_progress_card_key(card_key);
                if deck_id.is_empty() || item_id.is_empty() {
                    continue;
                }

                let review_time = entry.get("t").and_then(|t| t.as_i64()).unwrap_or(now);

                let exists: bool =
                    check_log.exists(params![deck_id, item_id, direction, review_time])?;
                if exists {
                    continue;
                }

                let rating_val = entry.get("rating").unwrap_or(&Value::Null);
                let rating = rating_to_number(rating_val);
                let elapsed_ms = entry
                    .get("ms")
                    .or_else(|| entry.get("elapsedMs"))
                    .and_then(|m| m.as_i64())
                    .unwrap_or(0);
                let is_new = entry
                    .get("isNew")
                    .and_then(|n| n.as_bool())
                    .map(|b| if b { 1 } else { 0 })
                    .unwrap_or(0);

                insert_log.execute(params![
                    deck_id,
                    item_id,
                    direction,
                    rating,
                    review_time,
                    elapsed_ms,
                    is_new
                ])?;
                logs_count += 1;
            }
        }

        // 3. Ghi chú & sao (meta)
        if let Some(meta_map) = obj.get("meta").and_then(|m| m.as_object()) {
            let mut insert_meta = tx.prepare(
                "INSERT OR REPLACE INTO item_meta (deck_id, item_id, starred, note, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
            )?;

            for (key, m) in meta_map {
                let (deck_id, item_id) = parse_progress_meta_key(key);
                if deck_id.is_empty() || item_id.is_empty() {
                    continue;
                }

                let starred = m
                    .get("starred")
                    .and_then(|s| s.as_bool())
                    .map(|b| if b { 1 } else { 0 })
                    .unwrap_or(0);
                let note = m.get("note").and_then(|n| n.as_str()).unwrap_or("");
                let updated_at = m.get("updatedAt").and_then(|u| u.as_i64()).unwrap_or(now);

                insert_meta.execute(params![deck_id, item_id, starred, note, updated_at])?;
                meta_count += 1;
            }
        }

        tx.commit()?;
        Ok(())
    })();

    match tx_res {
        Ok(()) => {
            // Đổi tên file thành progress.json.migrated
            let migrated_path = legacy_path.with_extension("json.migrated");
            let _ = fs::rename(&legacy_path, &migrated_path);

            MigrationResult {
                migrated: true,
                cards_count,
                logs_count,
                meta_count,
                error: None,
            }
        }
        Err(e) => MigrationResult {
            migrated: false,
            cards_count: 0,
            logs_count: 0,
            meta_count: 0,
            error: Some(e.to_string()),
        },
    }
}
