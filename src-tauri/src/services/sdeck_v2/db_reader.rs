// src-tauri/src/services/sdeck_v2/db_reader.rs — Đọc dữ liệu câu hỏi từ CSDL SQLite questions.db
// Trách nhiệm duy nhất: Đọc và ánh xạ các bản ghi từ VIEW v_deck_items trong SQLite sang danh sách items JSON.

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use serde_json::{json, Value};

/// Đọc toàn bộ danh sách items từ VIEW `v_deck_items` trong `questions.db`
pub fn read_questions_db_bytes(bytes: &[u8]) -> AppResult<Vec<Value>> {
    let temp_path = std::env::temp_dir().join(format!("read_db_{}.db", uuid::Uuid::new_v4()));
    std::fs::write(&temp_path, bytes)
        .map_err(|e| AppError::Custom(format!("Không thể ghi SQLite temp: {e}")))?;

    let conn = Connection::open(&temp_path)
        .map_err(|e| AppError::Custom(format!("Không thể mở SQLite temp: {e}")))?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                id, type, topic, tags_json, image, answer_image, order_index,
                front, back, question, choices_json, match_mode, tolerance, answer_display,
                term, definition, phonetic, pos, example, example_meaning, audio,
                forms_json, synonyms_json, antonyms_json, anki_guid, anki_note_id
             FROM v_deck_items
             ORDER BY order_index ASC",
        )
        .map_err(|e| AppError::Custom(format!("Lỗi truy vấn v_deck_items: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| AppError::Custom(format!("Lỗi query v_deck_items: {e}")))?;

    let mut items = Vec::new();

    while let Some(row) = rows.next().map_err(|e| AppError::Custom(e.to_string()))? {
        let id: String = row.get(0)?;
        let item_type: String = row.get(1)?;
        let topic: Option<String> = row.get(2)?;
        let tags_json_str: Option<String> = row.get(3)?;
        let image: Option<String> = row.get(4)?;
        let answer_image: Option<String> = row.get(5)?;

        let mut item_obj = serde_json::Map::new();
        item_obj.insert("id".into(), json!(id));
        item_obj.insert("type".into(), json!(item_type));
        if let Some(t) = topic {
            item_obj.insert("topic".into(), json!(t));
        }
        if let Some(img) = image {
            item_obj.insert("image".into(), json!(img));
        }
        if let Some(ai) = answer_image {
            item_obj.insert("answerImage".into(), json!(ai));
        }

        // Parse tags JSON
        if let Some(tj) = tags_json_str {
            if let Ok(tags_val) = serde_json::from_str::<Value>(&tj) {
                if let Some(arr) = tags_val.as_array() {
                    if !arr.is_empty() {
                        item_obj.insert("tags".into(), tags_val);
                    }
                }
            }
        }

        match item_type.as_str() {
            "card" => {
                let front: Option<String> = row.get(7)?;
                let back: Option<String> = row.get(8)?;
                item_obj.insert("front".into(), json!(front.unwrap_or_default()));
                item_obj.insert("back".into(), json!(back.unwrap_or_default()));
            }
            "single" | "multi" => {
                let question: Option<String> = row.get(9)?;
                let choices_json_str: Option<String> = row.get(10)?;
                item_obj.insert("question".into(), json!(question.unwrap_or_default()));
                if let Some(cj) = choices_json_str {
                    if let Ok(c_val) = serde_json::from_str::<Value>(&cj) {
                        item_obj.insert("choices".into(), c_val);
                    }
                }
            }
            "fill" => {
                let question: Option<String> = row.get(9)?;
                let match_mode: Option<String> = row.get(11)?;
                let tolerance: Option<f64> = row.get(12)?;
                let answer_display: Option<String> = row.get(13)?;
                item_obj.insert("question".into(), json!(question.unwrap_or_default()));
                if let Some(mm) = match_mode {
                    item_obj.insert("match".into(), json!(mm));
                }
                if let Some(tol) = tolerance {
                    item_obj.insert("tolerance".into(), json!(tol));
                }
                if let Some(ad) = answer_display {
                    item_obj.insert("answerDisplay".into(), json!(ad));
                }
            }
            "command" => {
                let question: Option<String> = row.get(9)?;
                let match_mode: Option<String> = row.get(11)?;
                let answer_display: Option<String> = row.get(13)?;
                item_obj.insert("question".into(), json!(question.unwrap_or_default()));
                if let Some(mm) = match_mode {
                    item_obj.insert("match".into(), json!(mm));
                }
                if let Some(ad) = answer_display {
                    item_obj.insert("answerDisplay".into(), json!(ad));
                }
            }
            "vocab" => {
                let term: Option<String> = row.get(14)?;
                let definition: Option<String> = row.get(15)?;
                let phonetic: Option<String> = row.get(16)?;
                let pos: Option<String> = row.get(17)?;
                let example: Option<String> = row.get(18)?;
                let example_meaning: Option<String> = row.get(19)?;
                let audio: Option<String> = row.get(20)?;
                let forms_json: Option<String> = row.get(21)?;
                let synonyms_json: Option<String> = row.get(22)?;
                let antonyms_json: Option<String> = row.get(23)?;
                let anki_guid: Option<String> = row.get(24)?;
                let anki_note_id: Option<i64> = row.get(25)?;

                item_obj.insert("term".into(), json!(term.unwrap_or_default()));
                item_obj.insert("definition".into(), json!(definition.unwrap_or_default()));
                if let Some(p) = phonetic {
                    item_obj.insert("phonetic".into(), json!(p));
                }
                if let Some(ps) = pos {
                    item_obj.insert("pos".into(), json!(ps));
                }
                if let Some(ex) = example {
                    item_obj.insert("example".into(), json!(ex));
                }
                if let Some(em) = example_meaning {
                    item_obj.insert("exampleMeaning".into(), json!(em));
                }
                if let Some(a) = audio {
                    item_obj.insert("audio".into(), json!(a));
                }
                if let Some(fj) = forms_json {
                    if let Ok(v) = serde_json::from_str::<Value>(&fj) {
                        if let Some(arr) = v.as_array() {
                            if !arr.is_empty() {
                                item_obj.insert("forms".into(), v);
                            }
                        }
                    }
                }
                if let Some(sj) = synonyms_json {
                    if let Ok(v) = serde_json::from_str::<Value>(&sj) {
                        if let Some(arr) = v.as_array() {
                            if !arr.is_empty() {
                                item_obj.insert("synonyms".into(), v);
                            }
                        }
                    }
                }
                if let Some(aj) = antonyms_json {
                    if let Ok(v) = serde_json::from_str::<Value>(&aj) {
                        if let Some(arr) = v.as_array() {
                            if !arr.is_empty() {
                                item_obj.insert("antonyms".into(), v);
                            }
                        }
                    }
                }
                if let Some(g) = anki_guid {
                    item_obj.insert("ankiGuid".into(), json!(g));
                }
                if let Some(nid) = anki_note_id {
                    item_obj.insert("ankiNoteId".into(), json!(nid));
                }
            }
            _ => {}
        }

        items.push(Value::Object(item_obj));
    }

    drop(rows);
    drop(stmt);
    drop(conn);
    let _ = std::fs::remove_file(&temp_path);

    Ok(items)
}

