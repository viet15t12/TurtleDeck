// src-tauri/src/services/sdeck_v2/db_writer.rs — Ghi dữ liệu bộ câu hỏi vào CSDL SQLite questions.db
// Trách nhiệm duy nhất: Chuyển đổi danh sách items JSON thành các bản ghi quan hệ cha - con và xuất ra byte buffer SQLite.

use super::schema::init_deck_db;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde_json::Value;

pub const DECK_DB_ENTRY: &str = "questions.db";

/// Lưu danh sách items vào mô hình 1 bảng cha - nhiều bảng con trong CSDL SQLite nhị phân
pub fn build_questions_db_bytes(items: &[Value]) -> AppResult<Vec<u8>> {
    let temp_path = std::env::temp_dir().join(format!("build_db_{}.db", uuid::Uuid::new_v4()));
    let conn = Connection::open(&temp_path)
        .map_err(|e| AppError::Custom(format!("Không thể mở SQLite temp: {e}")))?;
    init_deck_db(&conn)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    for (index, it) in items.iter().enumerate() {
        let id = it.get("id").and_then(|v| v.as_str()).unwrap_or("");
        if id.is_empty() {
            continue;
        }

        let item_type = it.get("type").and_then(|v| v.as_str()).unwrap_or("card");
        let topic = it.get("topic").and_then(|v| v.as_str());
        let image = it.get("image").and_then(|v| v.as_str());
        let answer_image = it.get("answerImage").and_then(|v| v.as_str());

        // Tags JSON đảm bảo mảng JSON hợp lệ
        let tags_json = match it.get("tags") {
            Some(Value::Array(arr)) => serde_json::to_string(arr).unwrap_or_else(|_| "[]".into()),
            _ => "[]".to_string(),
        };

        // 1. Chèn vào bảng cha items
        conn.execute(
            "INSERT INTO items (id, type, topic, tags_json, image, answer_image, order_index, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                item_type,
                topic,
                tags_json,
                image,
                answer_image,
                index as i32,
                now,
                now
            ],
        )
        .map_err(|e| AppError::Custom(format!("Lỗi chèn bảng cha items '{id}': {e}")))?;

        // 2. Chèn vào bảng con tương ứng theo type
        match item_type {
            "card" => {
                let front = it.get("front").and_then(|v| v.as_str()).unwrap_or("");
                let back = it.get("back").and_then(|v| v.as_str()).unwrap_or("");
                conn.execute(
                    "INSERT INTO item_cards (item_id, front, back) VALUES (?1, ?2, ?3)",
                    params![id, front, back],
                )
                .map_err(|e| AppError::Custom(format!("Lỗi chèn item_cards '{id}': {e}")))?;
            }
            "single" => {
                let question = it.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let choices_json = it
                    .get("choices")
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "[]".into());
                conn.execute(
                    "INSERT INTO item_singles (item_id, question, choices_json) VALUES (?1, ?2, ?3)",
                    params![id, question, choices_json],
                )
                .map_err(|e| AppError::Custom(format!("Lỗi chèn item_singles '{id}': {e}")))?;
            }
            "multi" => {
                let question = it.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let choices_json = it
                    .get("choices")
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "[]".into());
                conn.execute(
                    "INSERT INTO item_multis (item_id, question, choices_json) VALUES (?1, ?2, ?3)",
                    params![id, question, choices_json],
                )
                .map_err(|e| AppError::Custom(format!("Lỗi chèn item_multis '{id}': {e}")))?;
            }
            "fill" => {
                let question = it.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let match_mode = it
                    .get("match")
                    .and_then(|v| v.as_str())
                    .unwrap_or("normalized");
                let tolerance = it.get("tolerance").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let answer_display = it.get("answerDisplay").and_then(|v| v.as_str());
                conn.execute(
                    "INSERT INTO item_fills (item_id, question, match_mode, tolerance, answer_display)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![id, question, match_mode, tolerance, answer_display],
                )
                .map_err(|e| AppError::Custom(format!("Lỗi chèn item_fills '{id}': {e}")))?;
            }
            "command" => {
                let question = it.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let match_mode = it.get("match").and_then(|v| v.as_str()).unwrap_or("exact");
                let answer_display = it.get("answerDisplay").and_then(|v| v.as_str());
                conn.execute(
                    "INSERT INTO item_commands (item_id, question, match_mode, answer_display)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![id, question, match_mode, answer_display],
                )
                .map_err(|e| AppError::Custom(format!("Lỗi chèn item_commands '{id}': {e}")))?;
            }
            "vocab" => {
                let term = it.get("term").and_then(|v| v.as_str()).unwrap_or("");
                let definition = it.get("definition").and_then(|v| v.as_str()).unwrap_or("");
                let phonetic = it.get("phonetic").and_then(|v| v.as_str());
                let pos = it.get("pos").and_then(|v| v.as_str());
                let example = it.get("example").and_then(|v| v.as_str());
                let example_meaning = it.get("exampleMeaning").and_then(|v| v.as_str());
                let audio = it.get("audio").and_then(|v| v.as_str());
                let forms_json = it
                    .get("forms")
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "[]".into());
                let synonyms_json = it
                    .get("synonyms")
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "[]".into());
                let antonyms_json = it
                    .get("antonyms")
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| "[]".into());
                let anki_guid = it.get("ankiGuid").and_then(|v| v.as_str());
                let anki_note_id = it.get("ankiNoteId").and_then(|v| v.as_i64());

                conn.execute(
                    "INSERT INTO item_vocabs (
                        item_id, term, definition, phonetic, pos, example, example_meaning,
                        audio, forms_json, synonyms_json, antonyms_json, anki_guid, anki_note_id
                     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    params![
                        id,
                        term,
                        definition,
                        phonetic,
                        pos,
                        example,
                        example_meaning,
                        audio,
                        forms_json,
                        synonyms_json,
                        antonyms_json,
                        anki_guid,
                        anki_note_id
                    ],
                )
                .map_err(|e| AppError::Custom(format!("Lỗi chèn item_vocabs '{id}': {e}")))?;
            }
            _ => {}
        }
    }

    // Đóng kết nối CSDL và đọc byte buffer từ tệp tạm
    drop(conn);

    let bytes = std::fs::read(&temp_path)
        .map_err(|e| AppError::Custom(format!("Lỗi đọc SQLite temp: {e}")))?;
    let _ = std::fs::remove_file(&temp_path);

    Ok(bytes)
}
