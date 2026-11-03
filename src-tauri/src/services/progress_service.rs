// src-tauri/src/services/progress_service.rs — Logic xuất/nhập và lưu tiến độ học tập
use crate::db::repositories::srs::SrsRepository;
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde_json::Value;
use std::fs;
use std::path::Path;

pub fn load_progress(conn: &Connection) -> AppResult<Value> {
    SrsRepository::export_progress_data(conn)
}

pub fn save_progress(conn: &mut Connection, data: &Value) -> AppResult<Value> {
    SrsRepository::import_progress_data(conn, data, "replace")?;
    Ok(serde_json::json!({ "ok": true }))
}

pub fn export_progress_to_file(conn: &Connection, dest_path: &Path) -> AppResult<Value> {
    let progress_data = SrsRepository::export_progress_data(conn)?;
    let content = serde_json::to_string_pretty(&progress_data)?;

    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let temp_path = dest_path.with_extension("json.tmp");
    fs::write(&temp_path, content)?;
    fs::rename(&temp_path, dest_path)?;

    Ok(serde_json::json!({
        "ok": true,
        "path": dest_path.to_string_lossy().to_string(),
    }))
}

pub fn read_and_validate_import_file(file_path: &Path) -> AppResult<Value> {
    let content = match fs::read_to_string(file_path) {
        Ok(c) => c,
        Err(e) => {
            return Ok(serde_json::json!({
                "ok": false,
                "error": format!("Không đọc được file: {e}")
            }));
        }
    };

    let cleaned = content.trim_start_matches('\u{feff}');
    let data: Value = match serde_json::from_str(cleaned) {
        Ok(v) => v,
        Err(e) => {
            return Ok(serde_json::json!({
                "ok": false,
                "error": format!("File không đúng định dạng JSON: {e}")
            }));
        }
    };

    let cards_count = data
        .get("cards")
        .and_then(|c| c.as_object())
        .map(|m| m.len())
        .unwrap_or(0);
    let logs_count = data
        .get("log")
        .and_then(|l| l.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let meta_count = data
        .get("meta")
        .and_then(|m| m.as_object())
        .map(|m| m.len())
        .unwrap_or(0);

    if cards_count == 0 && logs_count == 0 && meta_count == 0 {
        return Ok(serde_json::json!({
            "ok": false,
            "error": "File không chứa dữ liệu tiến độ thẻ, nhật ký hay ghi chú hợp lệ."
        }));
    }

    Ok(serde_json::json!({
        "ok": true,
        "file": file_path.to_string_lossy().to_string(),
        "data": data,
        "stats": {
            "cardsCount": cards_count,
            "logsCount": logs_count,
            "metaCount": meta_count,
        }
    }))
}

pub fn apply_import(
    conn: &mut Connection,
    backups_dir: &Path,
    imported_progress: &Value,
    mode: &str,
) -> AppResult<Value> {
    if !imported_progress.is_object() {
        return Err(AppError::Custom(
            "Dữ liệu tiến độ nhập không hợp lệ.".into(),
        ));
    }

    // Sao lưu SQLite trước khi nhập
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let _ = fs::create_dir_all(backups_dir);
    let backup_file = backups_dir.join(format!("pre-import-{now}.db"));
    let backup_file_str = backup_file.to_string_lossy().to_string();
    let _ = conn.execute("VACUUM INTO ?1", rusqlite::params![backup_file_str]);

    let (cards_count, logs_count, _meta_count) =
        SrsRepository::import_progress_data(conn, imported_progress, mode)?;

    Ok(serde_json::json!({
        "ok": true,
        "stats": {
            "addedCards": cards_count,
            "addedLogs": logs_count,
        }
    }))
}
