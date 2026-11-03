// src-tauri/src/db/repositories/match_repo.rs — Quản lý kỷ lục chế độ Match
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchRecord {
    pub deck_id: String,
    pub best_time_ms: i64,
    pub achieved_at: i64,
    pub pairs_count: i64,
}

pub struct MatchRepository;

impl MatchRepository {
    pub fn get_record(conn: &Connection, deck_id: &str) -> AppResult<Option<MatchRecord>> {
        let mut stmt = conn.prepare(
            "SELECT deck_id, best_time_ms, achieved_at, pairs_count
             FROM match_records
             WHERE deck_id = ?1",
        )?;

        let mut rows = stmt.query(params![deck_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(MatchRecord {
                deck_id: row.get(0)?,
                best_time_ms: row.get(1)?,
                achieved_at: row.get(2)?,
                pairs_count: row.get(3)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn save_record(
        conn: &Connection,
        deck_id: &str,
        time_ms: i64,
        pairs_count: i64,
        achieved_at: Option<i64>,
    ) -> AppResult<bool> {
        let current = Self::get_record(conn, deck_id)?;
        if let Some(curr) = current {
            if time_ms >= curr.best_time_ms {
                return Ok(false);
            }
        }

        let at = achieved_at.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as i64
        });

        conn.execute(
            "INSERT INTO match_records (deck_id, best_time_ms, achieved_at, pairs_count)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(deck_id) DO UPDATE SET
               best_time_ms = excluded.best_time_ms,
               achieved_at = excluded.achieved_at,
               pairs_count = excluded.pairs_count
             WHERE excluded.best_time_ms < match_records.best_time_ms",
            params![deck_id, time_ms, at, pairs_count],
        )?;

        Ok(true)
    }
}
