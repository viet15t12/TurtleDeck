// src-tauri/src/db/repositories/srs.rs — Repository quản lý tiến trình SRS, logs và item_meta
use crate::db::migration::{parse_progress_card_key, parse_progress_meta_key, rating_to_number};
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const DAY_MS: i64 = 86_400_000;
pub const MINUTE_MS: i64 = 60_000;
pub const DEFAULT_LEARN_STEPS: [i64; 2] = [1, 10]; // phút

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SrsCard {
    pub deck_id: Option<String>,
    pub item_id: Option<String>,
    pub direction: Option<String>,
    pub state: String,
    pub step: i64,
    pub ease: f64,
    pub interval: i64,
    pub due: i64,
    pub reps: i64,
    pub lapses: i64,
    pub updated_at: Option<i64>,
    pub stability: Option<f64>,
    pub difficulty: Option<f64>,
    pub last_review: Option<i64>,
}

impl Default for SrsCard {
    fn default() -> Self {
        Self {
            deck_id: None,
            item_id: None,
            direction: Some("fwd".to_string()),
            state: "new".to_string(),
            step: 0,
            ease: 2.5,
            interval: 0,
            due: 0,
            reps: 0,
            lapses: 0,
            updated_at: None,
            stability: None,
            difficulty: None,
            last_review: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SrsDeckSummary {
    pub new_count: i64,
    pub learning_count: i64,
    pub due_count: i64,
    pub mastered_count: i64,
    pub total_cards: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemMetaRecord {
    pub deck_id: String,
    pub item_id: String,
    pub starred: bool,
    pub note: String,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewLogRecord {
    pub id: i64,
    pub deck_id: String,
    pub item_id: String,
    pub direction: String,
    pub rating: i64,
    pub review_time: i64,
    pub elapsed_ms: i64,
    pub is_new: bool,
}

pub struct SrsRepository;

impl SrsRepository {
    pub fn get_card(
        conn: &Connection,
        deck_id: &str,
        item_id: &str,
        direction: &str,
    ) -> AppResult<Option<SrsCard>> {
        let mut stmt = conn.prepare(
            "SELECT deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at, stability, difficulty, last_review
             FROM srs_cards
             WHERE deck_id = ?1 AND item_id = ?2 AND direction = ?3",
        )?;

        let mut rows = stmt.query(params![deck_id, item_id, direction])?;
        if let Some(row) = rows.next()? {
            Ok(Some(SrsCard {
                deck_id: Some(row.get(0)?),
                item_id: Some(row.get(1)?),
                direction: Some(row.get(2)?),
                state: row.get(3)?,
                step: row.get(4)?,
                ease: row.get(5)?,
                interval: row.get(6)?,
                due: row.get(7)?,
                reps: row.get(8)?,
                lapses: row.get(9)?,
                updated_at: Some(row.get(10)?),
                stability: row.get(11)?,
                difficulty: row.get(12)?,
                last_review: row.get(13)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn record_review(
        conn: &mut Connection,
        card: &SrsCard,
        rating: i64,
        review_time: i64,
        elapsed_ms: i64,
        is_new: bool,
    ) -> AppResult<()> {
        let tx = conn.transaction()?;

        let deck_id = card.deck_id.as_deref().unwrap_or("");
        let item_id = card.item_id.as_deref().unwrap_or("");
        let direction = card.direction.as_deref().unwrap_or("fwd");
        let updated_at = card.updated_at.unwrap_or(review_time);
        let stability = card.stability.unwrap_or(0.0);
        let difficulty = card.difficulty.unwrap_or(5.0);
        let last_review = card.last_review.unwrap_or(review_time);

        tx.execute(
            "INSERT INTO srs_cards (deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at, stability, difficulty, last_review)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(deck_id, item_id, direction) DO UPDATE SET
               state = excluded.state,
               step = excluded.step,
               ease = excluded.ease,
               interval = excluded.interval,
               due = excluded.due,
               reps = excluded.reps,
               lapses = excluded.lapses,
               updated_at = excluded.updated_at,
               stability = excluded.stability,
               difficulty = excluded.difficulty,
               last_review = excluded.last_review",
            params![
                deck_id,
                item_id,
                direction,
                card.state,
                card.step,
                card.ease,
                card.interval,
                card.due,
                card.reps,
                card.lapses,
                updated_at,
                stability,
                difficulty,
                last_review,
            ],
        )?;

        tx.execute(
            "INSERT INTO review_logs (deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                deck_id,
                item_id,
                direction,
                rating,
                review_time,
                elapsed_ms,
                if is_new { 1 } else { 0 }
            ],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn get_due_cards(
        conn: &Connection,
        deck_id: &str,
        now: i64,
        limit: u32,
    ) -> AppResult<Vec<SrsCard>> {
        let mut stmt = conn.prepare(
            "SELECT deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at, stability, difficulty, last_review
             FROM srs_cards
             WHERE deck_id = ?1 AND (state IN ('learning', 'relearning') OR (state = 'review' AND due <= ?2))
             ORDER BY due ASC
             LIMIT ?3",
        )?;

        let rows = stmt.query_map(params![deck_id, now, limit], |row| {
            Ok(SrsCard {
                deck_id: Some(row.get(0)?),
                item_id: Some(row.get(1)?),
                direction: Some(row.get(2)?),
                state: row.get(3)?,
                step: row.get(4)?,
                ease: row.get(5)?,
                interval: row.get(6)?,
                due: row.get(7)?,
                reps: row.get(8)?,
                lapses: row.get(9)?,
                updated_at: Some(row.get(10)?),
                stability: row.get(11)?,
                difficulty: row.get(12)?,
                last_review: row.get(13)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn get_deck_cards(conn: &Connection, deck_id: &str) -> AppResult<Vec<SrsCard>> {
        let mut stmt = conn.prepare(
            "SELECT deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at, stability, difficulty, last_review
             FROM srs_cards
             WHERE deck_id = ?1",
        )?;

        let rows = stmt.query_map(params![deck_id], |row| {
            Ok(SrsCard {
                deck_id: Some(row.get(0)?),
                item_id: Some(row.get(1)?),
                direction: Some(row.get(2)?),
                state: row.get(3)?,
                step: row.get(4)?,
                ease: row.get(5)?,
                interval: row.get(6)?,
                due: row.get(7)?,
                reps: row.get(8)?,
                lapses: row.get(9)?,
                updated_at: Some(row.get(10)?),
                stability: row.get(11)?,
                difficulty: row.get(12)?,
                last_review: row.get(13)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn get_summary(conn: &Connection, deck_id: &str, now: i64) -> AppResult<SrsDeckSummary> {
        let total_items: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM items WHERE deck_id = ?1",
                params![deck_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let (new_count_raw, learning_count, due_count, mastered_count, total_srs): (
            i64,
            i64,
            i64,
            i64,
            i64,
        ) = conn.query_row(
            "SELECT 
               COUNT(CASE WHEN state = 'new' THEN 1 END),
               COUNT(CASE WHEN state IN ('learning', 'relearning') THEN 1 END),
               COUNT(CASE WHEN state = 'review' AND due <= ?1 THEN 1 END),
               COUNT(CASE WHEN state = 'review' AND due > ?2 THEN 1 END),
               COUNT(*)
             FROM srs_cards
             WHERE deck_id = ?3",
            params![now, now, deck_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )?;

        let new_count = if total_items > 0 {
            (total_items - (learning_count + due_count + mastered_count)).max(0)
        } else {
            new_count_raw
        };

        Ok(SrsDeckSummary {
            new_count,
            learning_count,
            due_count,
            mastered_count,
            total_cards: total_items.max(total_srs),
        })
    }

    pub fn get_meta(
        conn: &Connection,
        deck_id: &str,
        item_id: &str,
    ) -> AppResult<Option<ItemMetaRecord>> {
        let mut stmt = conn.prepare(
            "SELECT deck_id, item_id, starred, note, updated_at
             FROM item_meta
             WHERE deck_id = ?1 AND item_id = ?2",
        )?;

        let mut rows = stmt.query(params![deck_id, item_id])?;
        if let Some(row) = rows.next()? {
            let starred_int: i64 = row.get(2)?;
            Ok(Some(ItemMetaRecord {
                deck_id: row.get(0)?,
                item_id: row.get(1)?,
                starred: starred_int != 0,
                note: row.get(3)?,
                updated_at: row.get(4)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn set_starred(
        conn: &Connection,
        deck_id: &str,
        item_id: &str,
        starred: bool,
    ) -> AppResult<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        conn.execute(
            "INSERT INTO item_meta (deck_id, item_id, starred, note, updated_at)
             VALUES (?1, ?2, ?3, '', ?4)
             ON CONFLICT(deck_id, item_id) DO UPDATE SET
               starred = excluded.starred,
               updated_at = excluded.updated_at",
            params![deck_id, item_id, if starred { 1 } else { 0 }, now],
        )?;
        Ok(())
    }

    pub fn set_note(conn: &Connection, deck_id: &str, item_id: &str, note: &str) -> AppResult<()> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        conn.execute(
            "INSERT INTO item_meta (deck_id, item_id, starred, note, updated_at)
             VALUES (?1, ?2, 0, ?3, ?4)
             ON CONFLICT(deck_id, item_id) DO UPDATE SET
               note = excluded.note,
               updated_at = excluded.updated_at",
            params![deck_id, item_id, note, now],
        )?;
        Ok(())
    }

    pub fn get_review_logs(
        conn: &Connection,
        deck_id: Option<&str>,
        limit: u32,
    ) -> AppResult<Vec<ReviewLogRecord>> {
        let mut result = Vec::new();
        if let Some(did) = deck_id {
            let mut stmt = conn.prepare(
                "SELECT id, deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new
                 FROM review_logs
                 WHERE deck_id = ?1
                 ORDER BY review_time DESC, id DESC
                 LIMIT ?2",
            )?;
            let rows = stmt.query_map(params![did, limit], |row| {
                let is_new_int: i64 = row.get(7)?;
                Ok(ReviewLogRecord {
                    id: row.get(0)?,
                    deck_id: row.get(1)?,
                    item_id: row.get(2)?,
                    direction: row.get(3)?,
                    rating: row.get(4)?,
                    review_time: row.get(5)?,
                    elapsed_ms: row.get(6)?,
                    is_new: is_new_int != 0,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new
                 FROM review_logs
                 ORDER BY review_time DESC, id DESC
                 LIMIT ?1",
            )?;
            let rows = stmt.query_map(params![limit], |row| {
                let is_new_int: i64 = row.get(7)?;
                Ok(ReviewLogRecord {
                    id: row.get(0)?,
                    deck_id: row.get(1)?,
                    item_id: row.get(2)?,
                    direction: row.get(3)?,
                    rating: row.get(4)?,
                    review_time: row.get(5)?,
                    elapsed_ms: row.get(6)?,
                    is_new: is_new_int != 0,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        }
        Ok(result)
    }

    pub fn clear_deck_progress(conn: &mut Connection, deck_id: Option<&str>) -> AppResult<()> {
        let tx = conn.transaction()?;
        if let Some(did) = deck_id {
            if did != "all" {
                tx.execute("DELETE FROM srs_cards WHERE deck_id = ?1", params![did])?;
                tx.execute("DELETE FROM review_logs WHERE deck_id = ?1", params![did])?;
                tx.execute("DELETE FROM item_meta WHERE deck_id = ?1", params![did])?;
                tx.commit()?;
                return Ok(());
            }
        }
        tx.execute("DELETE FROM srs_cards", [])?;
        tx.execute("DELETE FROM review_logs", [])?;
        tx.execute("DELETE FROM item_meta", [])?;
        tx.commit()?;
        Ok(())
    }

    pub fn export_progress_data(conn: &Connection) -> AppResult<Value> {
        let mut cards_map = serde_json::Map::new();
        let mut stmt = conn.prepare(
            "SELECT deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at, stability, difficulty, last_review
             FROM srs_cards",
        )?;
        let rows = stmt.query_map([], |row| {
            let deck_id: String = row.get(0)?;
            let item_id: String = row.get(1)?;
            let direction: String = row.get(2)?;
            let key = format!("{deck_id}:{item_id}:{direction}");
            let mut card_obj = serde_json::json!({
                "state": row.get::<_, String>(3)?,
                "step": row.get::<_, i64>(4)?,
                "ease": row.get::<_, f64>(5)?,
                "interval": row.get::<_, i64>(6)?,
                "due": row.get::<_, i64>(7)?,
                "reps": row.get::<_, i64>(8)?,
                "lapses": row.get::<_, i64>(9)?,
                "updatedAt": row.get::<_, i64>(10)?,
            });
            if let Ok(Some(s)) = row.get::<_, Option<f64>>(11) {
                card_obj["stability"] = serde_json::json!(s);
            }
            if let Ok(Some(d)) = row.get::<_, Option<f64>>(12) {
                card_obj["difficulty"] = serde_json::json!(d);
            }
            if let Ok(Some(lr)) = row.get::<_, Option<i64>>(13) {
                card_obj["lastReview"] = serde_json::json!(lr);
            }
            Ok((key, card_obj))
        })?;

        for r in rows {
            let (k, v) = r?;
            cards_map.insert(k, v);
        }

        let mut meta_map = serde_json::Map::new();
        let mut meta_stmt =
            conn.prepare("SELECT deck_id, item_id, starred, note FROM item_meta")?;
        let meta_rows = meta_stmt.query_map([], |row| {
            let deck_id: String = row.get(0)?;
            let item_id: String = row.get(1)?;
            let starred_int: i64 = row.get(2)?;
            let note: String = row.get(3)?;
            let key = format!("{deck_id}:{item_id}");
            let obj = serde_json::json!({
                "starred": starred_int != 0,
                "note": note,
            });
            Ok((key, obj))
        })?;

        for r in meta_rows {
            let (k, v) = r?;
            meta_map.insert(k, v);
        }

        let mut log_arr = Vec::new();
        let mut log_stmt = conn.prepare(
            "SELECT deck_id, item_id, direction, rating, review_time, elapsed_ms
             FROM review_logs
             ORDER BY review_time ASC",
        )?;
        let log_rows = log_stmt.query_map([], |row| {
            let deck_id: String = row.get(0)?;
            let item_id: String = row.get(1)?;
            let direction: String = row.get(2)?;
            let card_key = format!("{deck_id}:{item_id}:{direction}");
            let obj = serde_json::json!({
                "t": row.get::<_, i64>(4)?,
                "card": card_key,
                "rating": row.get::<_, i64>(3)?,
                "ms": row.get::<_, i64>(5)?,
            });
            Ok(obj)
        })?;

        for r in log_rows {
            log_arr.push(r?);
        }

        Ok(serde_json::json!({
            "version": 1,
            "cards": cards_map,
            "meta": meta_map,
            "log": log_arr,
        }))
    }

    pub fn import_progress_data(
        conn: &mut Connection,
        data: &Value,
        mode: &str,
    ) -> AppResult<(usize, usize, usize)> {
        if mode == "replace" {
            Self::clear_deck_progress(conn, Some("all"))?;
        }

        let mut cards_count = 0;
        let mut logs_count = 0;
        let mut meta_count = 0;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let tx = conn.transaction()?;

        if let Some(cards) = data.get("cards").and_then(|c| c.as_object()) {
            let mut stmt = tx.prepare(
                "INSERT INTO srs_cards (deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at, stability, difficulty, last_review)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
                 ON CONFLICT(deck_id, item_id, direction) DO UPDATE SET
                   state = excluded.state,
                   step = excluded.step,
                   ease = excluded.ease,
                   interval = excluded.interval,
                   due = excluded.due,
                   reps = excluded.reps,
                   lapses = excluded.lapses,
                   updated_at = excluded.updated_at,
                   stability = excluded.stability,
                   difficulty = excluded.difficulty,
                   last_review = excluded.last_review",
            )?;

            for (key, card) in cards {
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
                let stability = card
                    .get("stability")
                    .and_then(|s| s.as_f64())
                    .unwrap_or(0.0);
                let difficulty = card
                    .get("difficulty")
                    .and_then(|d| d.as_f64())
                    .unwrap_or(5.0);
                let last_review = card
                    .get("lastReview")
                    .or_else(|| card.get("last_review"))
                    .and_then(|lr| lr.as_i64())
                    .unwrap_or(0);

                stmt.execute(params![
                    deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses,
                    updated_at, stability, difficulty, last_review
                ])?;
                cards_count += 1;
            }
        }

        if let Some(meta) = data.get("meta").and_then(|m| m.as_object()) {
            let mut stmt_star = tx.prepare(
                "INSERT INTO item_meta (deck_id, item_id, starred, note, updated_at)
                 VALUES (?1, ?2, ?3, '', ?4)
                 ON CONFLICT(deck_id, item_id) DO UPDATE SET
                   starred = excluded.starred,
                   updated_at = excluded.updated_at",
            )?;
            let mut stmt_note = tx.prepare(
                "INSERT INTO item_meta (deck_id, item_id, starred, note, updated_at)
                 VALUES (?1, ?2, 0, ?3, ?4)
                 ON CONFLICT(deck_id, item_id) DO UPDATE SET
                   note = excluded.note,
                   updated_at = excluded.updated_at",
            )?;

            for (key, m) in meta {
                let (deck_id, item_id) = parse_progress_meta_key(key);
                if deck_id.is_empty() || item_id.is_empty() {
                    continue;
                }

                if let Some(st) = m.get("starred").and_then(|s| s.as_bool()) {
                    stmt_star.execute(params![deck_id, item_id, if st { 1 } else { 0 }, now])?;
                }
                if let Some(nt) = m.get("note").and_then(|n| n.as_str()) {
                    stmt_note.execute(params![deck_id, item_id, nt, now])?;
                }
                meta_count += 1;
            }
        }

        if let Some(log) = data.get("log").and_then(|l| l.as_array()) {
            let mut check_log = tx.prepare(
                "SELECT 1 FROM review_logs WHERE deck_id = ?1 AND item_id = ?2 AND direction = ?3 AND review_time = ?4 LIMIT 1",
            )?;
            let mut insert_log = tx.prepare(
                "INSERT INTO review_logs (deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )?;

            for entry in log {
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

        tx.commit()?;
        Ok((cards_count, logs_count, meta_count))
    }
}
