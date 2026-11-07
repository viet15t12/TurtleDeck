// src-tauri/src/services/backup_service.rs — Quản lý sao lưu, khôi phục và dọn dẹp bản sao lưu
use crate::error::AppResult;
use crate::state::AppState;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

pub fn prune_temporary_db_backups(dir: &Path, max_keep: usize) -> AppResult<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(()),
    };

    let mut pre_import = Vec::new();
    let mut pre_restore = Vec::new();

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with("pre-import-") && name.ends_with(".db") {
            pre_import.push(name);
        } else if name.starts_with("pre-restore-") && name.ends_with(".db") {
            pre_restore.push(name);
        }
    }

    pre_import.sort();
    pre_restore.sort();

    if pre_import.len() > max_keep {
        let to_delete = &pre_import[0..pre_import.len() - max_keep];
        for f in to_delete {
            let _ = fs::remove_file(dir.join(f));
        }
    }

    if pre_restore.len() > max_keep {
        let to_delete = &pre_restore[0..pre_restore.len() - max_keep];
        for f in to_delete {
            let _ = fs::remove_file(dir.join(f));
        }
    }

    Ok(())
}

pub fn get_day_key(now_ms: u64, tz_offset_secs: i64) -> String {
    let total_secs = (now_ms / 1000) as i64 + tz_offset_secs;
    let days = total_secs.div_euclid(86400);
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

pub fn is_valid_backup_name(name: &str) -> bool {
    if !name.starts_with("progress-") || !name.ends_with(".json") {
        return false;
    }
    let middle = &name["progress-".len()..name.len() - ".json".len()];
    if middle.is_empty() {
        return false;
    }
    middle
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

pub fn ensure_daily_backup(backups_dir: &Path, state: &AppState) -> AppResult<()> {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let day_key = get_day_key(now_ms, 7 * 3600);
    let file_name = format!("progress-{day_key}.json");
    let _ = fs::create_dir_all(backups_dir);
    let dest = backups_dir.join(&file_name);

    if !dest.is_file() {
        let _ = state.with_db(|conn| {
            crate::services::progress_service::export_progress_to_file(conn, &dest)
        });
        let db_backup_name = format!("progress-{day_key}.db");
        let db_dest = backups_dir.join(db_backup_name);
        let _ = state.with_db(|conn| {
            let _ = conn.execute(
                "VACUUM INTO ?1",
                rusqlite::params![db_dest.to_string_lossy().to_string()],
            );
            Ok(())
        });
    }

    if let Ok(entries) = fs::read_dir(backups_dir) {
        let mut daily_backups: Vec<String> = entries
            .flatten()
            .map(|e| e.file_name().to_string_lossy().to_string())
            .filter(|n| {
                n.starts_with("progress-") && n.ends_with(".json") && !n.contains("-manual-")
            })
            .collect();
        daily_backups.sort();
        if daily_backups.len() > 7 {
            let to_del = &daily_backups[0..daily_backups.len() - 7];
            for name in to_del {
                let _ = fs::remove_file(backups_dir.join(name));
                let db_sibling = name.replace(".json", ".db");
                let _ = fs::remove_file(backups_dir.join(db_sibling));
            }
        }
    }

    let _ = prune_temporary_db_backups(backups_dir, 5);
    Ok(())
}

pub fn create_backup(backups_dir: &Path, state: &AppState) -> AppResult<Value> {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let day_key = get_day_key(now_ms, 7 * 3600);
    let name = format!("progress-{day_key}-manual-{now_ms}.json");
    let _ = fs::create_dir_all(backups_dir);
    let dest = backups_dir.join(&name);

    state
        .with_db(|conn| crate::services::progress_service::export_progress_to_file(conn, &dest))?;

    let db_name = name.replace(".json", ".db");
    let db_dest = backups_dir.join(&db_name);
    let _ = state.with_db(|conn| {
        let _ = conn.execute(
            "VACUUM INTO ?1",
            rusqlite::params![db_dest.to_string_lossy().to_string()],
        );
        Ok(())
    });

    Ok(json!({ "ok": true, "name": name }))
}

pub fn list_backups(backups_dir: &Path) -> AppResult<Vec<Value>> {
    let _ = fs::create_dir_all(backups_dir);
    let entries = match fs::read_dir(backups_dir) {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };

    let mut result = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".json") {
            continue;
        }
        if let Ok(meta) = entry.metadata() {
            let mtime_ms = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            result.push(json!({
                "name": name,
                "size": meta.len(),
                "mtime": mtime_ms,
            }));
        }
    }

    result.sort_by(|a, b| {
        let ma = a.get("mtime").and_then(|v| v.as_u64()).unwrap_or(0);
        let mb = b.get("mtime").and_then(|v| v.as_u64()).unwrap_or(0);
        mb.cmp(&ma)
    });

    Ok(result)
}

pub fn restore_backup(backups_dir: &Path, name: &str, state: &AppState) -> AppResult<Value> {
    if !is_valid_backup_name(name) {
        return Ok(json!({ "ok": false, "error": "Tên file sao lưu không hợp lệ." }));
    }

    let src = backups_dir.join(name);
    if !src.is_file() {
        return Ok(json!({ "ok": false, "error": "Không tìm thấy file sao lưu." }));
    }

    let content = match fs::read_to_string(&src) {
        Ok(c) => c,
        Err(e) => return Ok(json!({ "ok": false, "error": format!("Không đọc được file: {e}") })),
    };

    let progress: Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(e) => {
            return Ok(
                json!({ "ok": false, "error": format!("Nội dung file sao lưu không hợp lệ: {e}") }),
            )
        }
    };

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let pre_restore_name = format!("pre-restore-{now_ms}.db");
    let pre_restore_path = backups_dir.join(&pre_restore_name);
    let _ = state.with_db(|conn| {
        let _ = conn.execute(
            "VACUUM INTO ?1",
            rusqlite::params![pre_restore_path.to_string_lossy().to_string()],
        );
        Ok(())
    });

    state.with_db_mut(|conn| {
        crate::db::repositories::srs::SrsRepository::import_progress_data(
            conn, &progress, "replace",
        )
    })?;

    Ok(json!({ "ok": true, "progress": progress }))
}

pub fn collect_all_sdeck_files(dir: &Path, root_dir: &Path) -> Vec<(PathBuf, String)> {
    let mut result = Vec::new();

    fn walk(current: &Path, root: &Path, result: &mut Vec<(PathBuf, String)>) {
        let entries = match fs::read_dir(current) {
            Ok(e) => e,
            Err(_) => return,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name.ends_with(".bak") || name.ends_with(".tmp") {
                continue;
            }
            let p = entry.path();
            if p.is_dir() {
                walk(&p, root, result);
            } else if p.is_file() && name.to_lowercase().ends_with(".sdeck") {
                if let Ok(rel) = p.strip_prefix(root) {
                    let rel_str = rel.to_string_lossy().replace('\\', "/");
                    result.push((p, rel_str));
                }
            }
        }
    }

    walk(dir, root_dir, &mut result);
    result
}

fn dump_database(conn: &Connection) -> AppResult<(Value, usize)> {
    let mut dump = serde_json::Map::new();

    // 1. folders
    let all_folders = crate::db::repositories::folder::FolderRepository::get_all_folders(conn)?;
    let folders_count = all_folders.len();
    let folders: Vec<Value> = all_folders
        .into_iter()
        .map(|f| {
            json!({
                "id": f.id,
                "name": f.name,
                "parent_id": f.parent_id,
                "sort_order": f.sort_order,
                "path": f.path,
                "depth": f.depth,
                "created_at": f.created_at,
                "updated_at": f.updated_at,
            })
        })
        .collect();
    dump.insert("folders".into(), json!(folders));

    // 2. deck_locations
    let mut stmt = conn.prepare(
        "SELECT l.id, l.deck_id, l.folder_id, COALESCE(d.file_path, ''), l.is_link, l.created_at
         FROM deck_locations l
         LEFT JOIN decks d ON d.id = l.deck_id",
    )?;
    let deck_locations: Vec<Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "deck_id": row.get::<_, String>(1)?,
                "folder_id": row.get::<_, Option<String>>(2)?,
                "file_path": row.get::<_, String>(3)?,
                "is_link": row.get::<_, i32>(4)?,
                "created_at": row.get::<_, i64>(5)?,
            }))
        })?
        .flatten()
        .collect();
    dump.insert("deck_locations".into(), json!(deck_locations));

    // 3. decks
    let mut stmt = conn.prepare(
        "SELECT id, file_path, title, kind, lang, description, version, deck_hash, created_at, updated_at FROM decks"
    )?;
    let decks: Vec<Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "file_path": row.get::<_, Option<String>>(1)?,
                "title": row.get::<_, String>(2)?,
                "kind": row.get::<_, String>(3)?,
                "lang": row.get::<_, Option<String>>(4)?,
                "description": row.get::<_, Option<String>>(5)?,
                "version": row.get::<_, i32>(6)?,
                "deck_hash": row.get::<_, Option<String>>(7)?,
                "created_at": row.get::<_, i64>(8)?,
                "updated_at": row.get::<_, i64>(9)?,
            }))
        })?
        .flatten()
        .collect();
    dump.insert("decks".into(), json!(decks));

    // 4. items
    let mut stmt = conn.prepare(
        "SELECT id, deck_id, type, topic, tags_json, content_json, search_text, starred, created_at FROM items"
    )?;
    let items: Vec<Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "deck_id": row.get::<_, String>(1)?,
                "type": row.get::<_, String>(2)?,
                "topic": row.get::<_, Option<String>>(3)?,
                "tags_json": row.get::<_, Option<String>>(4)?,
                "content_json": row.get::<_, String>(5)?,
                "search_text": row.get::<_, Option<String>>(6)?,
                "starred": row.get::<_, i32>(7)?,
                "created_at": row.get::<_, i64>(8)?,
            }))
        })?
        .flatten()
        .collect();
    dump.insert("items".into(), json!(items));

    // 5. srs_cards
    let mut stmt = conn.prepare(
        "SELECT deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at FROM srs_cards"
    )?;
    let srs_cards: Vec<Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "deck_id": row.get::<_, String>(0)?,
                "item_id": row.get::<_, String>(1)?,
                "direction": row.get::<_, String>(2)?,
                "state": row.get::<_, String>(3)?,
                "step": row.get::<_, i32>(4)?,
                "ease": row.get::<_, f64>(5)?,
                "interval": row.get::<_, i32>(6)?,
                "due": row.get::<_, i64>(7)?,
                "reps": row.get::<_, i32>(8)?,
                "lapses": row.get::<_, i32>(9)?,
                "updated_at": row.get::<_, i64>(10)?,
            }))
        })?
        .flatten()
        .collect();
    dump.insert("srs_cards".into(), json!(srs_cards));

    // 6. review_logs
    let mut stmt = conn.prepare(
        "SELECT id, deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new FROM review_logs"
    )?;
    let review_logs: Vec<Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, i64>(0)?,
                "deck_id": row.get::<_, String>(1)?,
                "item_id": row.get::<_, String>(2)?,
                "direction": row.get::<_, String>(3)?,
                "rating": row.get::<_, i32>(4)?,
                "review_time": row.get::<_, i64>(5)?,
                "elapsed_ms": row.get::<_, i32>(6)?,
                "is_new": row.get::<_, i32>(7)?,
            }))
        })?
        .flatten()
        .collect();
    dump.insert("review_logs".into(), json!(review_logs));

    // 7. item_meta
    let mut stmt =
        conn.prepare("SELECT deck_id, item_id, starred, note, updated_at FROM item_meta")?;
    let item_meta: Vec<Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "deck_id": row.get::<_, String>(0)?,
                "item_id": row.get::<_, String>(1)?,
                "starred": row.get::<_, i32>(2)?,
                "note": row.get::<_, Option<String>>(3)?,
                "updated_at": row.get::<_, i64>(4)?,
            }))
        })?
        .flatten()
        .collect();
    dump.insert("item_meta".into(), json!(item_meta));

    // 8. match_records
    let mut stmt =
        conn.prepare("SELECT deck_id, best_time_ms, achieved_at, pairs_count FROM match_records")?;
    let match_records: Vec<Value> = stmt
        .query_map([], |row| {
            Ok(json!({
                "deck_id": row.get::<_, String>(0)?,
                "best_time_ms": row.get::<_, i32>(1)?,
                "achieved_at": row.get::<_, i64>(2)?,
                "pairs_count": row.get::<_, i32>(3)?,
            }))
        })?
        .flatten()
        .collect();
    dump.insert("match_records".into(), json!(match_records));

    Ok((Value::Object(dump), folders_count))
}

fn restore_database(
    conn: &mut Connection,
    db_dump: &Value,
    library_dir: &Path,
) -> AppResult<usize> {
    let tx = conn.transaction()?;

    tx.execute("DELETE FROM deck_locations", [])?;
    tx.execute("DELETE FROM folders", [])?;
    tx.execute("DELETE FROM items", [])?;
    tx.execute("DELETE FROM decks", [])?;
    tx.execute("DELETE FROM srs_cards", [])?;
    tx.execute("DELETE FROM review_logs", [])?;
    tx.execute("DELETE FROM item_meta", [])?;
    tx.execute("DELETE FROM match_records", [])?;

    let mut folders_count = 0;

    // Folders
    if let Some(folders) = db_dump.get("folders").and_then(|v| v.as_array()) {
        let mut sorted = folders.clone();
        sorted.sort_by_key(|f| f.get("depth").and_then(|v| v.as_i64()).unwrap_or(0));
        let mut ins = tx.prepare(
            "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        for (idx, f) in sorted.into_iter().enumerate() {
            let sort_order = f
                .get("sort_order")
                .and_then(|v| v.as_i64())
                .unwrap_or(idx as i64);
            ins.execute(rusqlite::params![
                f.get("id").and_then(|v| v.as_str()),
                f.get("parent_id").and_then(|v| v.as_str()),
                f.get("name").and_then(|v| v.as_str()),
                sort_order,
                f.get("created_at").and_then(|v| v.as_i64()),
                f.get("updated_at").and_then(|v| v.as_i64()),
            ])?;
            folders_count += 1;
        }
    }

    // Decks
    if let Some(decks) = db_dump.get("decks").and_then(|v| v.as_array()) {
        let mut ins = tx.prepare(
            "INSERT OR REPLACE INTO decks (id, file_path, title, kind, lang, description, version, deck_hash, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )?;
        for d in decks {
            let adjusted_path = d.get("file_path").and_then(|v| v.as_str()).map(|fp| {
                let file_name = Path::new(fp).file_name().unwrap_or_default();
                library_dir.join(file_name).to_string_lossy().to_string()
            });
            ins.execute(rusqlite::params![
                d.get("id").and_then(|v| v.as_str()),
                adjusted_path,
                d.get("title").and_then(|v| v.as_str()),
                d.get("kind").and_then(|v| v.as_str()),
                d.get("lang").and_then(|v| v.as_str()),
                d.get("description").and_then(|v| v.as_str()),
                d.get("version").and_then(|v| v.as_i64()),
                d.get("deck_hash").and_then(|v| v.as_str()),
                d.get("created_at").and_then(|v| v.as_i64()),
                d.get("updated_at").and_then(|v| v.as_i64()),
            ])?;
        }
    }

    // Deck locations
    if let Some(locs) = db_dump.get("deck_locations").and_then(|v| v.as_array()) {
        let mut ins = tx.prepare(
            "INSERT OR REPLACE INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;
        for l in locs {
            let folder_id = l.get("folder_id").and_then(|v| v.as_str());
            let is_link = l.get("is_link").and_then(|v| v.as_i64()).unwrap_or(0);
            if is_link != 0 && folder_id.is_none() {
                continue;
            }
            ins.execute(rusqlite::params![
                l.get("id").and_then(|v| v.as_str()),
                l.get("deck_id").and_then(|v| v.as_str()),
                folder_id,
                if is_link != 0 { 1 } else { 0 },
                l.get("created_at").and_then(|v| v.as_i64()),
            ])?;
        }
    }

    // Items
    if let Some(items) = db_dump.get("items").and_then(|v| v.as_array()) {
        let mut ins = tx.prepare(
            "INSERT OR REPLACE INTO items (id, deck_id, type, topic, tags_json, content_json, search_text, starred, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )?;
        for it in items {
            ins.execute(rusqlite::params![
                it.get("id").and_then(|v| v.as_str()),
                it.get("deck_id").and_then(|v| v.as_str()),
                it.get("type").and_then(|v| v.as_str()),
                it.get("topic").and_then(|v| v.as_str()),
                it.get("tags_json").and_then(|v| v.as_str()),
                it.get("content_json").and_then(|v| v.as_str()),
                it.get("search_text").and_then(|v| v.as_str()),
                it.get("starred").and_then(|v| v.as_i64()),
                it.get("created_at").and_then(|v| v.as_i64()),
            ])?;
        }
    }

    // SRS cards
    if let Some(cards) = db_dump.get("srs_cards").and_then(|v| v.as_array()) {
        let mut ins = tx.prepare(
            "INSERT OR REPLACE INTO srs_cards (deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        )?;
        for c in cards {
            ins.execute(rusqlite::params![
                c.get("deck_id").and_then(|v| v.as_str()),
                c.get("item_id").and_then(|v| v.as_str()),
                c.get("direction").and_then(|v| v.as_str()),
                c.get("state").and_then(|v| v.as_str()),
                c.get("step").and_then(|v| v.as_i64()),
                c.get("ease").and_then(|v| v.as_f64()),
                c.get("interval").and_then(|v| v.as_i64()),
                c.get("due").and_then(|v| v.as_i64()),
                c.get("reps").and_then(|v| v.as_i64()),
                c.get("lapses").and_then(|v| v.as_i64()),
                c.get("updated_at").and_then(|v| v.as_i64()),
            ])?;
        }
    }

    // Review logs
    if let Some(logs) = db_dump.get("review_logs").and_then(|v| v.as_array()) {
        let mut ins = tx.prepare(
            "INSERT INTO review_logs (id, deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )?;
        for lg in logs {
            ins.execute(rusqlite::params![
                lg.get("id").and_then(|v| v.as_i64()),
                lg.get("deck_id").and_then(|v| v.as_str()),
                lg.get("item_id").and_then(|v| v.as_str()),
                lg.get("direction").and_then(|v| v.as_str()),
                lg.get("rating").and_then(|v| v.as_i64()),
                lg.get("review_time").and_then(|v| v.as_i64()),
                lg.get("elapsed_ms").and_then(|v| v.as_i64()),
                lg.get("is_new").and_then(|v| v.as_i64()),
            ])?;
        }
    }

    // Item meta
    if let Some(meta) = db_dump.get("item_meta").and_then(|v| v.as_array()) {
        let mut ins = tx.prepare(
            "INSERT OR REPLACE INTO item_meta (deck_id, item_id, starred, note, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?;
        for m in meta {
            ins.execute(rusqlite::params![
                m.get("deck_id").and_then(|v| v.as_str()),
                m.get("item_id").and_then(|v| v.as_str()),
                m.get("starred").and_then(|v| v.as_i64()),
                m.get("note").and_then(|v| v.as_str()),
                m.get("updated_at").and_then(|v| v.as_i64()),
            ])?;
        }
    }

    // Match records
    if let Some(mrs) = db_dump.get("match_records").and_then(|v| v.as_array()) {
        let mut ins = tx.prepare(
            "INSERT OR REPLACE INTO match_records (deck_id, best_time_ms, achieved_at, pairs_count)
             VALUES (?1, ?2, ?3, ?4)",
        )?;
        for mr in mrs {
            ins.execute(rusqlite::params![
                mr.get("deck_id").and_then(|v| v.as_str()),
                mr.get("best_time_ms").and_then(|v| v.as_i64()),
                mr.get("achieved_at").and_then(|v| v.as_i64()),
                mr.get("pairs_count").and_then(|v| v.as_i64()),
            ])?;
        }
    }

    tx.commit()?;
    Ok(folders_count)
}

pub fn create_full_backup(
    backups_dir: &Path,
    library_dir: &Path,
    settings_file: &Path,
    dest_path: Option<&Path>,
    state: &AppState,
) -> AppResult<Value> {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let day_key = get_day_key(now_ms, 7 * 3600);
    let default_name = format!("turtledeck-full-backup-{day_key}-{now_ms}.turtlebackup");
    let dest = dest_path
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| backups_dir.join(&default_name));

    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::create_dir_all(library_dir);

    let sdeck_files = collect_all_sdeck_files(library_dir, library_dir);
    let (db_dump, folders_count) = state.with_db(dump_database)?;

    let temp_zip_path = dest.with_extension("tmp");
    let file = File::create(&temp_zip_path)?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    // 1. Lưu các file bộ thẻ (.sdeck)
    for (full_path, rel_path) in &sdeck_files {
        if let Ok(bytes) = fs::read(full_path) {
            let zip_entry_name = format!("decks/{rel_path}");
            zip.start_file(zip_entry_name, options)?;
            zip.write_all(&bytes)?;
        }
    }

    // 2. Dump toàn bộ cơ sở dữ liệu SQLite
    let db_dump_bytes = serde_json::to_vec_pretty(&db_dump)?;
    zip.start_file("database_dump.json", options)?;
    zip.write_all(&db_dump_bytes)?;

    // 3. Tiến độ SRS & Cài đặt
    if let Ok(progress_data) = state.with_db(crate::services::progress_service::load_progress) {
        if let Ok(bytes) = serde_json::to_vec_pretty(&progress_data) {
            zip.start_file("progress.json", options)?;
            zip.write_all(&bytes)?;
        }
    }
    if settings_file.is_file() {
        if let Ok(bytes) = fs::read(settings_file) {
            zip.start_file("settings.json", options)?;
            zip.write_all(&bytes)?;
        }
    }

    // 4. Manifest
    let manifest = json!({
        "format": "turtledeck-full-backup",
        "version": 1,
        "appVersion": "0.1.3",
        "createdAt": now_ms,
        "decksCount": sdeck_files.len(),
        "foldersCount": folders_count,
    });
    zip.start_file("manifest.json", options)?;
    zip.write_all(serde_json::to_string_pretty(&manifest)?.as_bytes())?;

    zip.finish()?;
    fs::rename(&temp_zip_path, &dest)?;

    let dest_name = dest
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();

    Ok(json!({
        "ok": true,
        "filePath": dest.to_string_lossy().to_string(),
        "name": dest_name,
        "decksCount": sdeck_files.len(),
        "foldersCount": folders_count,
    }))
}

pub fn restore_full_backup(
    src_path: &Path,
    library_dir: &Path,
    settings_file: &Path,
    state: &AppState,
) -> AppResult<Value> {
    if !src_path.is_file() {
        return Ok(json!({ "ok": false, "error": "Tệp sao lưu không tồn tại." }));
    }

    let file = File::open(src_path)?;
    let mut archive = match ZipArchive::new(file) {
        Ok(a) => a,
        Err(e) => {
            return Ok(json!({
                "ok": false,
                "error": format!("Tệp sao lưu không hợp lệ hoặc bị hỏng: {e}")
            }));
        }
    };

    let _ = fs::create_dir_all(library_dir);
    let mut restored_decks = 0;
    let mut db_dump_opt: Option<Value> = None;
    let mut settings_bytes_opt: Option<Vec<u8>> = None;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let name = entry.name().to_string();

        if name.starts_with("decks/") && name.ends_with(".sdeck") {
            let rel = &name["decks/".len()..];
            let target_path = library_dir.join(rel);
            if let Some(parent) = target_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            fs::write(&target_path, &buf)?;
            restored_decks += 1;
        } else if name == "database_dump.json" {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            if let Ok(v) = serde_json::from_slice::<Value>(&buf) {
                db_dump_opt = Some(v);
            }
        } else if name == "settings.json" {
            let mut buf = Vec::new();
            entry.read_to_end(&mut buf)?;
            settings_bytes_opt = Some(buf);
        }
    }

    let mut folders_count = 0;
    if let Some(db_dump) = db_dump_opt {
        folders_count = state.with_db_mut(|conn| restore_database(conn, &db_dump, library_dir))?;
    }

    if let Some(bytes) = settings_bytes_opt {
        let _ = fs::write(settings_file, bytes);
    }

    Ok(json!({
        "ok": true,
        "decksCount": restored_decks,
        "foldersCount": folders_count,
    }))
}
