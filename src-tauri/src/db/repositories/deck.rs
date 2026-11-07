// src-tauri/src/db/repositories/deck.rs — Quản lý bộ thẻ, cache items và tìm kiếm FTS5
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncDeckResult {
    pub synced: bool,
    pub hash: String,
    pub changed: bool,
    pub items_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct QueryItemsParams {
    pub deck_id: Option<String>,
    pub query: Option<String>,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub topic: Option<String>,
    pub tag: Option<String>,
    pub starred_only: Option<bool>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryItemsResult {
    pub items: Vec<Value>,
    pub total: i64,
}

pub fn extract_search_text(item: &Value) -> String {
    let mut parts = Vec::new();

    let fields = [
        "question",
        "prompt",
        "front",
        "back",
        "term",
        "definition",
        "example",
        "explanation",
    ];
    for f in fields {
        if let Some(s) = item.get(f).and_then(|v| v.as_str()) {
            parts.push(s.to_string());
        }
    }

    if let Some(choices) = item.get("choices").and_then(|c| c.as_array()) {
        for c in choices {
            if let Some(s) = c.as_str() {
                parts.push(s.to_string());
            } else if let Some(s) = c.get("text").and_then(|v| v.as_str()) {
                parts.push(s.to_string());
            }
        }
    }

    if let Some(answer) = item.get("answer").and_then(|a| a.as_array()) {
        for a in answer {
            if let Some(s) = a.as_str() {
                parts.push(s.to_string());
            }
        }
    }

    let joined = parts.join(" ");
    joined.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub struct DeckRepository;

impl DeckRepository {
    pub fn get_deck(conn: &Connection, deck_id: &str) -> AppResult<Option<Value>> {
        let mut stmt = conn.prepare(
            "SELECT id, file_path, title, kind, lang, description, version, deck_hash, created_at, updated_at
             FROM decks
             WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![deck_id])?;
        if let Some(row) = rows.next()? {
            let id: String = row.get(0)?;
            let file_path: Option<String> = row.get(1)?;
            let title: String = row.get(2)?;
            let kind: String = row.get(3)?;
            let lang: Option<String> = row.get(4)?;
            let description: Option<String> = row.get(5)?;
            let version: i64 = row.get(6)?;
            let deck_hash: Option<String> = row.get(7)?;
            let created_at: i64 = row.get(8)?;
            let updated_at: i64 = row.get(9)?;

            Ok(Some(serde_json::json!({
                "id": id,
                "filePath": file_path,
                "title": title,
                "kind": kind,
                "lang": lang,
                "description": description,
                "version": version,
                "deckHash": deck_hash,
                "createdAt": created_at,
                "updatedAt": updated_at,
            })))
        } else {
            Ok(None)
        }
    }

    pub fn get_deck_hash(conn: &Connection, deck_id: &str) -> AppResult<Option<String>> {
        let hash: Option<String> = conn
            .query_row(
                "SELECT deck_hash FROM decks WHERE id = ?1",
                params![deck_id],
                |row| row.get(0),
            )
            .ok();
        Ok(hash)
    }

    pub fn get_items(conn: &Connection, deck_id: &str) -> AppResult<Vec<Value>> {
        let mut stmt =
            conn.prepare("SELECT content_json FROM items WHERE deck_id = ?1 ORDER BY rowid ASC")?;

        let rows = stmt.query_map(params![deck_id], |row| {
            let s: String = row.get(0)?;
            Ok(s)
        })?;

        let mut items = Vec::new();
        for r in rows {
            let s = r?;
            if let Ok(v) = serde_json::from_str(&s) {
                items.push(v);
            }
        }
        Ok(items)
    }

    pub fn sync_deck(
        conn: &mut Connection,
        deck: &Value,
        file_path: Option<&str>,
    ) -> AppResult<SyncDeckResult> {
        let deck_text = serde_json::to_string(deck).unwrap_or_default();
        let current_hash = format!("{:x}", Sha256::digest(deck_text.as_bytes()));

        let meta = deck.get("meta").unwrap_or(&Value::Null);
        let deck_id = meta
            .get("id")
            .and_then(|id| id.as_str())
            .or_else(|| deck.get("id").and_then(|id| id.as_str()))
            .unwrap_or("")
            .to_string();

        let existing_hash = Self::get_deck_hash(conn, &deck_id)?;
        let changed = existing_hash.as_deref() != Some(&current_hash);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let title = meta
            .get("title")
            .and_then(|t| t.as_str())
            .unwrap_or("Bộ thẻ");
        let kind = meta.get("kind").and_then(|k| k.as_str()).unwrap_or("quiz");
        let lang = meta.get("lang").and_then(|l| l.as_str()).unwrap_or("vi");
        let description = meta.get("description").and_then(|d| d.as_str());
        let version = deck
            .get("formatVersion")
            .or_else(|| meta.get("version"))
            .and_then(|v| v.as_i64())
            .unwrap_or(1);
        let created_at = meta.get("created").and_then(|c| c.as_i64()).unwrap_or(now);
        let updated_at = meta.get("updated").and_then(|u| u.as_i64()).unwrap_or(now);

        let items_slice = deck.get("items").and_then(|i| i.as_array());
        let items_count = items_slice
            .map(|i| i.len())
            .or_else(|| {
                meta.get("stats")
                    .and_then(|s| s.get("totalItems"))
                    .and_then(|t| t.as_u64())
                    .map(|t| t as usize)
            })
            .unwrap_or(0);

        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;

        if let Some(fp) = file_path {
            tx.execute(
                "UPDATE decks SET file_path = NULL WHERE file_path = ?1 AND id <> ?2",
                params![fp, deck_id],
            )?;
        }

        tx.execute(
            "INSERT INTO decks (id, file_path, title, kind, lang, description, version, deck_hash, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
               file_path = COALESCE(excluded.file_path, decks.file_path),
               title = excluded.title,
               kind = excluded.kind,
               lang = excluded.lang,
               description = excluded.description,
               version = excluded.version,
               deck_hash = excluded.deck_hash,
               updated_at = excluded.updated_at",
            params![
                deck_id,
                file_path,
                title,
                kind,
                lang,
                description,
                version,
                current_hash,
                created_at,
                updated_at,
            ],
        )?;

        // Bất biến 1: Mỗi bộ thẻ trong decks có đúng một hàng vị trí chính (is_link = 0), tạo trong cùng transaction
        let loc_id = uuid::Uuid::new_v4().to_string();
        tx.execute(
            "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
             VALUES (?1, ?2, NULL, 0, ?3)
             ON CONFLICT(deck_id) WHERE is_link = 0 DO NOTHING",
            params![loc_id, deck_id, now],
        )?;

        if !changed {
            tx.commit()?;
            return Ok(SyncDeckResult {
                synced: true,
                hash: current_hash,
                changed: false,
                items_count,
            });
        }

        // 1. Cập nhật / thêm mới items
        let mut current_item_ids = HashSet::new();
        if let Some(items) = items_slice {
            let mut insert_item = tx.prepare(
                "INSERT INTO items (id, deck_id, type, topic, tags_json, content_json, search_text, starred, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(deck_id, id) DO UPDATE SET
                   type = excluded.type,
                   topic = excluded.topic,
                   tags_json = excluded.tags_json,
                   content_json = excluded.content_json,
                   search_text = excluded.search_text",
            )?;

            for item in items {
                let item_id = match item.get("id").and_then(|id| id.as_str()) {
                    Some(id) => id,
                    None => continue,
                };
                current_item_ids.insert(item_id.to_string());

                let itype = item
                    .get("type")
                    .and_then(|t| t.as_str())
                    .unwrap_or("single");
                let topic = item.get("topic").and_then(|t| t.as_str());
                let tags_json = item
                    .get("tags")
                    .map(|t| serde_json::to_string(t).unwrap_or_default());
                let content_json = serde_json::to_string(item).unwrap_or_default();
                let search_text = extract_search_text(item);
                let starred = item
                    .get("starred")
                    .and_then(|s| s.as_bool())
                    .map(|b| if b { 1 } else { 0 })
                    .unwrap_or(0);

                insert_item.execute(params![
                    item_id,
                    deck_id,
                    itype,
                    topic,
                    tags_json,
                    content_json,
                    search_text,
                    starred,
                    now,
                ])?;
            }
        }

        // 2. Xoá các items không còn trong deck
        let mut cached_ids = Vec::new();
        {
            let mut stmt = tx.prepare("SELECT id FROM items WHERE deck_id = ?1")?;
            let rows = stmt.query_map(params![deck_id], |row| row.get::<_, String>(0))?;
            for r in rows {
                cached_ids.push(r?);
            }
        }

        let mut delete_item = tx.prepare("DELETE FROM items WHERE deck_id = ?1 AND id = ?2")?;
        for cached in cached_ids {
            if !current_item_ids.contains(&cached) {
                delete_item.execute(params![deck_id, cached])?;
            }
        }

        drop(delete_item);
        tx.commit()?;

        Ok(SyncDeckResult {
            synced: true,
            hash: current_hash,
            changed: true,
            items_count,
        })
    }

    pub fn query_items(
        conn: &Connection,
        params: &QueryItemsParams,
    ) -> AppResult<QueryItemsResult> {
        let mut conditions = Vec::new();
        let mut sql_params: Vec<rusqlite::types::Value> = Vec::new();

        if let Some(ref did) = params.deck_id {
            conditions.push("i.deck_id = ?".to_string());
            sql_params.push(did.clone().into());
        }
        if let Some(ref itype) = params.item_type {
            conditions.push("i.type = ?".to_string());
            sql_params.push(itype.clone().into());
        }
        if let Some(ref topic) = params.topic {
            conditions.push("i.topic = ?".to_string());
            sql_params.push(topic.clone().into());
        }
        if let Some(ref tag) = params.tag {
            conditions.push("(i.tags_json LIKE ? OR instr(i.tags_json, ?))".to_string());
            sql_params.push(format!("%\"{tag}\"%").into());
            sql_params.push(tag.clone().into());
        }
        if let Some(starred_only) = params.starred_only {
            if starred_only {
                conditions.push("(i.starred = 1 OR m.starred = 1)".to_string());
            }
        }

        let mut fts_join = String::new();
        if let Some(ref query) = params.query {
            let cleaned = query.trim().replace(['*', '"', '\''], "");
            if !cleaned.is_empty() {
                fts_join = "JOIN items_fts fts ON fts.deck_id = i.deck_id AND fts.item_id = i.id"
                    .to_string();
                conditions.push("fts.search_text MATCH ?".to_string());
                sql_params.push(format!("{cleaned}*").into());
            }
        }

        let where_clause = if conditions.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", conditions.join(" AND "))
        };

        let count_sql = format!(
            "SELECT COUNT(*)
             FROM items i
             LEFT JOIN item_meta m ON m.deck_id = i.deck_id AND m.item_id = i.id
             {fts_join}
             {where_clause}"
        );

        let total: i64 = conn.query_row(
            &count_sql,
            rusqlite::params_from_iter(sql_params.iter()),
            |row| row.get(0),
        )?;

        let limit = params.limit.unwrap_or(50) as i64;
        let offset = params.offset.unwrap_or(0) as i64;

        let query_sql = format!(
            "SELECT i.content_json, COALESCE(m.starred, i.starred) as isStarred, COALESCE(m.note, '') as note
             FROM items i
             LEFT JOIN item_meta m ON m.deck_id = i.deck_id AND m.item_id = i.id
             {fts_join}
             {where_clause}
             ORDER BY i.rowid ASC
             LIMIT ? OFFSET ?"
        );

        let mut query_params = sql_params;
        query_params.push(limit.into());
        query_params.push(offset.into());

        let mut stmt = conn.prepare(&query_sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(query_params.iter()), |row| {
            let json_str: String = row.get(0)?;
            let starred_int: i64 = row.get(1)?;
            let note: String = row.get(2)?;
            Ok((json_str, starred_int != 0, note))
        })?;

        let mut items = Vec::new();
        for r in rows {
            let (json_str, is_starred, note) = r?;
            if let Ok(mut item_val) = serde_json::from_str::<Value>(&json_str) {
                if let Some(obj) = item_val.as_object_mut() {
                    if is_starred {
                        obj.insert("starred".to_string(), Value::Bool(true));
                    }
                    if !note.is_empty() {
                        obj.insert("note".to_string(), Value::String(note));
                    }
                }
                items.push(item_val);
            }
        }

        Ok(QueryItemsResult { items, total })
    }

    pub fn delete_deck(conn: &mut Connection, deck_id: &str) -> AppResult<()> {
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        tx.execute("DELETE FROM decks WHERE id = ?1", params![deck_id])?;
        tx.execute("DELETE FROM items WHERE deck_id = ?1", params![deck_id])?;
        let _ = tx.execute("DELETE FROM items_fts WHERE deck_id = ?1", params![deck_id]);
        tx.execute("DELETE FROM deck_locations WHERE deck_id = ?1", params![deck_id])?;
        tx.execute("DELETE FROM srs_cards WHERE deck_id = ?1", params![deck_id])?;
        tx.execute("DELETE FROM review_logs WHERE deck_id = ?1", params![deck_id])?;
        tx.execute("DELETE FROM item_meta WHERE deck_id = ?1", params![deck_id])?;
        tx.execute("DELETE FROM match_records WHERE deck_id = ?1", params![deck_id])?;
        tx.commit()?;
        Ok(())
    }

    /// Khi file .sdeck bị xóa khỏi đĩa: xóa hẳn hàng `decks` -> `deck_locations` và `items` bị cascade xóa theo.
    pub fn remove_deck_by_file_path(
        conn: &mut Connection,
        file_path: &str,
    ) -> AppResult<Option<String>> {
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;
        let deck_id: Option<String> = tx
            .query_row(
                "SELECT id FROM decks WHERE file_path = ?1 LIMIT 1",
                params![file_path],
                |row| row.get(0),
            )
            .ok();

        if let Some(ref did) = deck_id {
            tx.execute("DELETE FROM decks WHERE id = ?1", params![did])?;
        }
        tx.commit()?;
        Ok(deck_id)
    }
}
