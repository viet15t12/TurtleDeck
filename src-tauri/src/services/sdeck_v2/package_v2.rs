// src-tauri/src/services/sdeck_v2/package_v2.rs — Đóng gói và giải nén định dạng gói .sdeck Version 2
// Trách nhiệm duy nhất: Đóng gói các thành phần v2 (deck.json, questions.db, solutions.json, img/) vào ZIP và trích xuất ngược lại.

use super::db_reader::read_questions_db_bytes;
use super::db_writer::{build_questions_db_bytes, DECK_DB_ENTRY};
use super::solutions::{
    merge_v2_to_unified_items, split_v1_items_to_v2, SolutionsFile, SOLUTIONS_ENTRY,
};
use crate::error::{AppError, AppResult};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

pub const LIMITS_DB: u64 = 50_000_000; // 50 MB
pub const LIMITS_SOLUTIONS: u64 = 20_000_000; // 20 MB

/// Kiểm tra xem một đối tượng deck JSON có yêu cầu định dạng Version 2 hay không
pub fn is_v2_deck(deck: &Value) -> bool {
    let meta = deck.get("meta");
    let version = meta
        .and_then(|m| m.get("formatVersion").or_else(|| m.get("version")))
        .or_else(|| deck.get("formatVersion").or_else(|| deck.get("version")))
        .and_then(|v| v.as_i64());

    version == Some(2)
}

/// Đóng gói cấu trúc bộ thẻ v2 thành các entry trong file nén ZIP .sdeck
pub fn build_v2_package(deck: &Value, assets: &HashMap<String, Vec<u8>>) -> AppResult<Vec<u8>> {
    let meta_obj = deck
        .get("meta")
        .and_then(|m| m.as_object())
        .ok_or_else(|| AppError::Custom("Thiếu phần 'meta' trong bộ thẻ.".into()))?;

    let deck_id = meta_obj
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| AppError::Custom("Thiếu meta.id của bộ thẻ.".into()))?;

    if deck_id.is_empty() {
        return Err(AppError::Custom("meta.id không được để trống.".into()));
    }

    let items = deck
        .get("items")
        .and_then(|i| i.as_array())
        .ok_or_else(|| AppError::Custom("Thiếu danh sách items.".into()))?;

    // 1. Tách các trường lời giải/đáp án sang solutions.json
    let (clean_items, solutions_file) = split_v1_items_to_v2(items);

    // 2. Tạo file CSDL quan hệ SQLite nhị phân questions.db
    let db_bytes = build_questions_db_bytes(&clean_items)?;

    // 3. Chuẩn bị nội dung deck.json v2 (chỉ chứa metadata & manifest)
    let mut v2_meta = meta_obj.clone();
    v2_meta.insert("format".into(), json!("studydeck"));
    v2_meta.insert("version".into(), json!(2));
    v2_meta.insert("formatVersion".into(), json!(2));
    v2_meta.insert(
        "files".into(),
        json!({
            "db": DECK_DB_ENTRY,
            "solutions": SOLUTIONS_ENTRY,
        }),
    );

    // Cập nhật thống kê stats
    let total_items = items.len();
    let vocab_count = items
        .iter()
        .filter(|i| i.get("type").and_then(|t| t.as_str()) == Some("vocab"))
        .count();
    let quiz_count = total_items.saturating_sub(vocab_count);

    let mut stats = v2_meta
        .get("stats")
        .and_then(|s| s.as_object())
        .cloned()
        .unwrap_or_default();
    stats.insert("totalItems".into(), json!(total_items));
    if vocab_count > 0 {
        stats.insert("vocabCount".into(), json!(vocab_count));
    }
    if quiz_count > 0 {
        stats.insert("quizCount".into(), json!(quiz_count));
    }
    v2_meta.insert("stats".into(), Value::Object(stats));

    let v2_deck_doc = json!({ "meta": Value::Object(v2_meta) });
    let deck_json_bytes = serde_json::to_vec_pretty(&v2_deck_doc)
        .map_err(|e| AppError::Custom(format!("Lỗi serialize deck.json v2: {e}")))?;

    // 4. Serialize solutions.json
    let solutions_bytes = serde_json::to_vec_pretty(&solutions_file)
        .map_err(|e| AppError::Custom(format!("Lỗi serialize solutions.json: {e}")))?;

    // 5. Nén toàn bộ vào gói ZIP
    let mut buf = Vec::new();
    {
        let cursor = Cursor::new(&mut buf);
        let mut zip = ZipWriter::new(cursor);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // Ghi deck.json
        zip.start_file("deck.json", options)
            .map_err(|e| AppError::Custom(format!("Lỗi tạo entry deck.json: {e}")))?;
        zip.write_all(&deck_json_bytes)
            .map_err(|e| AppError::Custom(format!("Lỗi ghi deck.json: {e}")))?;

        // Ghi questions.db
        zip.start_file(DECK_DB_ENTRY, options)
            .map_err(|e| AppError::Custom(format!("Lỗi tạo entry {DECK_DB_ENTRY}: {e}")))?;
        zip.write_all(&db_bytes)
            .map_err(|e| AppError::Custom(format!("Lỗi ghi {DECK_DB_ENTRY}: {e}")))?;

        // Ghi solutions.json
        zip.start_file(SOLUTIONS_ENTRY, options)
            .map_err(|e| AppError::Custom(format!("Lỗi tạo entry {SOLUTIONS_ENTRY}: {e}")))?;
        zip.write_all(&solutions_bytes)
            .map_err(|e| AppError::Custom(format!("Lỗi ghi {SOLUTIONS_ENTRY}: {e}")))?;

        // Ghi các assets ảnh
        for (name, data) in assets {
            zip.start_file(name, options)
                .map_err(|e| AppError::Custom(format!("Lỗi tạo entry asset {name}: {e}")))?;
            zip.write_all(data)
                .map_err(|e| AppError::Custom(format!("Lỗi ghi entry asset {name}: {e}")))?;
        }

        zip.finish()
            .map_err(|e| AppError::Custom(format!("Lỗi hoàn tất đóng gói zip v2: {e}")))?;
    }

    Ok(buf)
}

/// Tái hợp nhất deck.json v2 cùng questions.db và solutions.json thành đối tượng Deck hoàn chỉnh có items
pub fn unpack_v2_package(
    deck_json_text: &str,
    db_bytes: &[u8],
    solutions_json_bytes: Option<&[u8]>,
) -> AppResult<Value> {
    let mut deck: Value = serde_json::from_str(deck_json_text)
        .map_err(|e| AppError::Custom(format!("deck.json v2 không hợp lệ: {e}")))?;

    // Đọc danh sách câu hỏi từ CSDL SQLite
    let db_items = read_questions_db_bytes(db_bytes)?;

    // Đọc solutions nếu có
    let solutions = match solutions_json_bytes {
        Some(bytes) if !bytes.is_empty() => serde_json::from_slice::<SolutionsFile>(bytes)
            .unwrap_or_else(|_| SolutionsFile::default()),
        _ => SolutionsFile::default(),
    };

    // Ghép câu hỏi và lời giải
    let unified_items = merge_v2_to_unified_items(db_items, &solutions);

    // Gắn items vào đối tượng deck
    if let Some(obj) = deck.as_object_mut() {
        obj.insert("items".into(), Value::Array(unified_items));
    }

    Ok(deck)
}
