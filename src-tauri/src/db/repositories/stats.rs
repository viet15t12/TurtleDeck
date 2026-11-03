// src-tauri/src/db/repositories/stats.rs — Thống kê học tập hiệu năng cao bằng truy vấn SQL
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyReviewStat {
    pub date: String,
    pub count: i64,
    pub retention_rate: f64,
    pub time_spent_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RetentionBreakdown {
    pub again: i64,
    pub hard: i64,
    pub good: i64,
    pub easy: i64,
    pub total: i64,
    pub retention_percentage: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeechItemInfo {
    pub deck_id: String,
    pub item_id: String,
    pub direction: String,
    pub lapses: i64,
    pub prompt: String,
    pub last_rating: i64,
    pub last_review_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverallStreak {
    pub current_streak: i64,
    pub longest_streak: i64,
    pub best_streak: i64,
    pub total_reviews: i64,
}

pub fn get_tz_modifier(tz: Option<&str>) -> &'static str {
    match tz {
        Some("Asia/Saigon") | Some("Asia/Ho_Chi_Minh") => "+07:00",
        _ => "localtime",
    }
}

// Chuyển chuỗi YYYY-MM-DD thành số ngày kể từ 1970-01-01 (Unix epoch day)
fn parse_date_to_days(d: &str) -> Option<i64> {
    let parts: Vec<&str> = d.split('-').collect();
    if parts.len() != 3 {
        return None;
    }
    let mut y: i64 = parts[0].parse().ok()?;
    let m: u32 = parts[1].parse().ok()?;
    let day: u32 = parts[2].parse().ok()?;

    y -= if m <= 2 { 1 } else { 0 };
    let era = (if y >= 0 { y } else { y - 399 }) / 400;
    let yoe = (y - era * 400) as u32;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    Some(era * 146097 + (doe as i64) - 719468)
}

fn days_to_date_str(z: i64) -> String {
    let z = z + 719468;
    let era = (if z >= 0 { z } else { z - 146096 }) / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let final_y = y + if m <= 2 { 1 } else { 0 };
    format!("{final_y:04}-{m:02}-{d:02}")
}

pub struct StatsRepository;

impl StatsRepository {
    pub fn get_daily_activity(
        conn: &Connection,
        deck_id: Option<&str>,
        limit_days: u32,
        tz: Option<&str>,
    ) -> AppResult<Vec<DailyReviewStat>> {
        let tz_mod = get_tz_modifier(tz);
        let sql = if deck_id.is_some() {
            format!(
                "SELECT 
                   strftime('%Y-%m-%d', datetime(review_time / 1000, 'unixepoch', '{tz_mod}')) as d,
                   COUNT(*),
                   ROUND(AVG(CASE WHEN rating >= 2 THEN 1.0 ELSE 0.0 END) * 100, 1),
                   SUM(elapsed_ms)
                 FROM review_logs
                 WHERE deck_id = ?1
                 GROUP BY d
                 ORDER BY d DESC
                 LIMIT ?2"
            )
        } else {
            format!(
                "SELECT 
                   strftime('%Y-%m-%d', datetime(review_time / 1000, 'unixepoch', '{tz_mod}')) as d,
                   COUNT(*),
                   ROUND(AVG(CASE WHEN rating >= 2 THEN 1.0 ELSE 0.0 END) * 100, 1),
                   SUM(elapsed_ms)
                 FROM review_logs
                 GROUP BY d
                 ORDER BY d DESC
                 LIMIT ?1"
            )
        };

        let mut stmt = conn.prepare(&sql)?;
        let mut result = Vec::new();

        if let Some(did) = deck_id {
            let rows = stmt.query_map(params![did, limit_days], |row| {
                let d: Option<String> = row.get(0)?;
                let count: i64 = row.get(1)?;
                let ret_rate: Option<f64> = row.get(2)?;
                let time_spent: Option<i64> = row.get(3)?;
                Ok(DailyReviewStat {
                    date: d.unwrap_or_default(),
                    count,
                    retention_rate: ret_rate.unwrap_or(0.0),
                    time_spent_ms: time_spent.unwrap_or(0),
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        } else {
            let rows = stmt.query_map(params![limit_days], |row| {
                let d: Option<String> = row.get(0)?;
                let count: i64 = row.get(1)?;
                let ret_rate: Option<f64> = row.get(2)?;
                let time_spent: Option<i64> = row.get(3)?;
                Ok(DailyReviewStat {
                    date: d.unwrap_or_default(),
                    count,
                    retention_rate: ret_rate.unwrap_or(0.0),
                    time_spent_ms: time_spent.unwrap_or(0),
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        }

        Ok(result)
    }

    pub fn get_retention_breakdown(
        conn: &Connection,
        deck_id: Option<&str>,
    ) -> AppResult<RetentionBreakdown> {
        let sql = if deck_id.is_some() {
            "SELECT
               COUNT(CASE WHEN rating = 1 THEN 1 END),
               COUNT(CASE WHEN rating = 2 THEN 1 END),
               COUNT(CASE WHEN rating = 3 THEN 1 END),
               COUNT(CASE WHEN rating = 4 THEN 1 END),
               COUNT(*)
             FROM review_logs
             WHERE deck_id = ?1"
        } else {
            "SELECT
               COUNT(CASE WHEN rating = 1 THEN 1 END),
               COUNT(CASE WHEN rating = 2 THEN 1 END),
               COUNT(CASE WHEN rating = 3 THEN 1 END),
               COUNT(CASE WHEN rating = 4 THEN 1 END),
               COUNT(*)
             FROM review_logs"
        };

        let mut stmt = conn.prepare(sql)?;
        let (again, hard, good, easy, total): (i64, i64, i64, i64, i64) = if let Some(did) = deck_id
        {
            stmt.query_row(params![did], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })?
        } else {
            stmt.query_row([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            })?
        };

        let correct = hard + good + easy;
        let percentage = if total > 0 {
            ((correct as f64 / total as f64) * 100.0).round() as i64
        } else {
            0
        };

        Ok(RetentionBreakdown {
            again,
            hard,
            good,
            easy,
            total,
            retention_percentage: percentage,
        })
    }

    pub fn get_leech_cards(
        conn: &Connection,
        deck_id: Option<&str>,
        threshold: i64,
    ) -> AppResult<Vec<LeechItemInfo>> {
        let sql = if deck_id.is_some() {
            "SELECT 
               c.deck_id,
               c.item_id,
               c.direction,
               c.lapses,
               COALESCE(i.search_text, c.item_id),
               COALESCE(
                 (SELECT rating FROM review_logs WHERE deck_id = c.deck_id AND item_id = c.item_id ORDER BY review_time DESC, id DESC LIMIT 1),
                 1
               ),
               c.updated_at
             FROM srs_cards c
             LEFT JOIN items i ON c.deck_id = i.deck_id AND c.item_id = i.id
             WHERE c.lapses >= ?1 AND c.deck_id = ?2
             ORDER BY c.lapses DESC"
        } else {
            "SELECT 
               c.deck_id,
               c.item_id,
               c.direction,
               c.lapses,
               COALESCE(i.search_text, c.item_id),
               COALESCE(
                 (SELECT rating FROM review_logs WHERE deck_id = c.deck_id AND item_id = c.item_id ORDER BY review_time DESC, id DESC LIMIT 1),
                 1
               ),
               c.updated_at
             FROM srs_cards c
             LEFT JOIN items i ON c.deck_id = i.deck_id AND c.item_id = i.id
             WHERE c.lapses >= ?1
             ORDER BY c.lapses DESC"
        };

        let mut stmt = conn.prepare(sql)?;
        let mut result = Vec::new();

        if let Some(did) = deck_id {
            let rows = stmt.query_map(params![threshold, did], |row| {
                Ok(LeechItemInfo {
                    deck_id: row.get(0)?,
                    item_id: row.get(1)?,
                    direction: row.get(2)?,
                    lapses: row.get(3)?,
                    prompt: row.get(4)?,
                    last_rating: row.get(5)?,
                    last_review_time: row.get(6)?,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        } else {
            let rows = stmt.query_map(params![threshold], |row| {
                Ok(LeechItemInfo {
                    deck_id: row.get(0)?,
                    item_id: row.get(1)?,
                    direction: row.get(2)?,
                    lapses: row.get(3)?,
                    prompt: row.get(4)?,
                    last_rating: row.get(5)?,
                    last_review_time: row.get(6)?,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        }

        Ok(result)
    }

    pub fn get_overall_streak(
        conn: &Connection,
        tz: Option<&str>,
        now: i64,
    ) -> AppResult<OverallStreak> {
        let tz_mod = get_tz_modifier(tz);

        let total_reviews: i64 = conn
            .query_row("SELECT COUNT(*) FROM review_logs", [], |row| row.get(0))
            .unwrap_or(0);

        let distinct_sql = format!(
            "SELECT DISTINCT strftime('%Y-%m-%d', datetime(review_time / 1000, 'unixepoch', '{tz_mod}')) as d
             FROM review_logs
             ORDER BY d ASC"
        );

        let mut stmt = conn.prepare(&distinct_sql)?;
        let date_rows = stmt.query_map([], |row| {
            let d: Option<String> = row.get(0)?;
            Ok(d)
        })?;

        let mut sorted_days: Vec<String> = Vec::new();
        let mut active_days_set: HashSet<String> = HashSet::new();

        for r in date_rows {
            if let Some(d_str) = r? {
                if !d_str.is_empty() {
                    active_days_set.insert(d_str.clone());
                    sorted_days.push(d_str);
                }
            }
        }

        if sorted_days.is_empty() {
            return Ok(OverallStreak {
                current_streak: 0,
                longest_streak: 0,
                best_streak: 0,
                total_reviews,
            });
        }

        // Longest streak
        let mut longest = 0;
        let mut current_run = 0;
        let mut prev_day_num: Option<i64> = None;

        for d_str in &sorted_days {
            if let Some(day_num) = parse_date_to_days(d_str) {
                if let Some(prev) = prev_day_num {
                    if day_num - prev == 1 {
                        current_run += 1;
                    } else {
                        current_run = 1;
                    }
                } else {
                    current_run = 1;
                }
                prev_day_num = Some(day_num);
                if current_run > longest {
                    longest = current_run;
                }
            }
        }

        // Current streak
        let today_sql =
            format!("SELECT strftime('%Y-%m-%d', datetime(?1 / 1000, 'unixepoch', '{tz_mod}'))");
        let today_str: String = conn
            .query_row(&today_sql, params![now], |row| row.get(0))
            .unwrap_or_default();

        let today_days = parse_date_to_days(&today_str).unwrap_or(0);
        let yesterday_str = days_to_date_str(today_days - 1);

        let check_days: Option<i64> = if active_days_set.contains(&today_str) {
            Some(today_days)
        } else if active_days_set.contains(&yesterday_str) {
            Some(today_days - 1)
        } else {
            None
        };

        let mut current_streak = 0;
        if let Some(mut cd) = check_days {
            loop {
                let d_str = days_to_date_str(cd);
                if active_days_set.contains(&d_str) {
                    current_streak += 1;
                    cd -= 1;
                } else {
                    break;
                }
            }
        }

        let best_streak = longest.max(current_streak);

        Ok(OverallStreak {
            current_streak,
            longest_streak: best_streak,
            best_streak,
            total_reviews,
        })
    }
}
