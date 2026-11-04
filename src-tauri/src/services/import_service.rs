// src-tauri/src/services/import_service.rs — Thu thập assets và xử lý nhập dữ liệu hàng loạt
use crate::error::{AppError, AppResult};
use crate::services::package_store::{
    detect_image_type, item_image_refs, PackageStore, TempImportSession, LIMITS_IMAGE,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

pub const MAX_IMPORT_BYTES: u64 = 5 * 1024 * 1024; // 5 MB
pub const MAX_IMPORT_ITEMS: usize = 1000;

pub fn normalize_term(term: &str) -> String {
    let trimmed = term.trim();
    let mut result = String::new();
    let mut in_space = false;
    for c in trimmed.chars() {
        if c.is_whitespace() {
            if !in_space {
                result.push(' ');
                in_space = true;
            }
        } else {
            result.push(c.to_ascii_lowercase());
            in_space = false;
        }
    }
    result
}

pub fn stable_vocab_id(term: &str) -> String {
    let norm = normalize_term(term);
    let mut hasher = Sha256::new();
    hasher.update(norm.as_bytes());
    let hex = format!("{:x}", hasher.finalize());
    let short = if hex.len() >= 10 { &hex[..10] } else { &hex };
    format!("w-{short}")
}

pub fn parse_delimited_rows(text: &str, delim: char) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut current_row = Vec::new();
    let mut current_cell = String::new();
    let mut in_quotes = false;
    let mut chars = text.chars().peekable();

    while let Some(c) = chars.next() {
        if in_quotes {
            if c == '"' {
                if chars.peek() == Some(&'"') {
                    chars.next();
                    current_cell.push('"');
                } else {
                    in_quotes = false;
                }
            } else {
                current_cell.push(c);
            }
        } else if c == '"' {
            in_quotes = true;
        } else if c == delim {
            current_row.push(std::mem::take(&mut current_cell));
        } else if c == '\n' || c == '\r' {
            if c == '\r' && chars.peek() == Some(&'\n') {
                chars.next();
            }
            current_row.push(std::mem::take(&mut current_cell));
            rows.push(std::mem::take(&mut current_row));
        } else {
            current_cell.push(c);
        }
    }

    if !current_cell.is_empty() || !current_row.is_empty() {
        current_row.push(current_cell);
        rows.push(current_row);
    }

    rows
}

pub fn detect_delimiter(text: &str) -> char {
    let lines: Vec<&str> = text.lines().take(5).collect();
    let mut tabs = 0;
    let mut semicolons = 0;
    let mut commas = 0;

    for line in lines {
        tabs += line.chars().filter(|c| *c == '\t').count();
        semicolons += line.chars().filter(|c| *c == ';').count();
        commas += line.chars().filter(|c| *c == ',').count();
    }

    if tabs > 0 && tabs >= semicolons && tabs >= commas {
        '\t'
    } else if semicolons > 0 && semicolons >= commas {
        ';'
    } else if commas > 0 {
        ','
    } else {
        '\t'
    }
}

pub fn detect_import_format(text: &str) -> &'static str {
    let trimmed = text.trim_start_matches('\u{feff}').trim();
    if trimmed.starts_with("## Q ") || trimmed.contains("\n## Q ") {
        return "md-quiz";
    }
    if (trimmed.starts_with("## ") || trimmed.contains("\n## "))
        && (trimmed
            .lines()
            .any(|l| l.trim_start().starts_with("- ") && l.contains(':'))
            || trimmed.contains('|'))
    {
        return "md-vocab";
    }
    let delim = detect_delimiter(trimmed);
    if delim == '\t' {
        "tsv"
    } else {
        "csv"
    }
}

fn map_column_name(raw: &str) -> Option<&'static str> {
    let lower = raw.trim().to_lowercase();
    match lower.as_str() {
        "term" | "word" | "từ" | "từ vựng" | "thuật ngữ" => Some("term"),
        "definition" | "meaning" | "nghĩa" | "định nghĩa" => Some("definition"),
        "phonetic" | "ipa" | "phiên âm" => Some("phonetic"),
        "pos" | "part of speech" | "từ loại" => Some("pos"),
        "example" | "ví dụ" => Some("example"),
        "forms" | "dạng từ" => Some("forms"),
        "synonyms" | "đồng nghĩa" => Some("synonyms"),
        "tags" | "nhãn" => Some("tags"),
        "image" | "ảnh" | "hình ảnh" => Some("image"),
        "audio" | "âm thanh" | "phát âm" => Some("audio"),
        _ => None,
    }
}

pub fn parse_csv_import(text: &str, delim: char, has_source_dir: bool) -> (Vec<Value>, Vec<Value>) {
    let rows = parse_delimited_rows(text, delim);
    let mut items = Vec::new();
    let mut issues = Vec::new();
    let mut seen_terms = HashSet::new();
    let mut warned_audio = false;

    let valid_rows: Vec<(usize, Vec<String>)> = rows
        .into_iter()
        .enumerate()
        .filter(|(_, r)| r.iter().any(|c| !c.trim().is_empty()))
        .map(|(idx, r)| (idx + 1, r))
        .collect();

    if valid_rows.is_empty() {
        issues.push(json!({ "level": "error", "msg": "Tập tin không có dữ liệu dòng nào." }));
        return (items, issues);
    }

    let first_row = &valid_rows[0].1;
    let matched_cols: Vec<Option<&'static str>> =
        first_row.iter().map(|c| map_column_name(c)).collect();
    let has_term_col = matched_cols.contains(&Some("term"));
    let all_known = matched_cols
        .iter()
        .zip(first_row.iter())
        .all(|(col, raw)| col.is_some() || raw.trim().is_empty());

    let mut header_map: HashMap<&'static str, usize> = HashMap::new();
    let mut data_rows = valid_rows.as_slice();

    if has_term_col && all_known {
        for (idx, col) in matched_cols.into_iter().enumerate() {
            if let Some(col_name) = col {
                header_map.insert(col_name, idx);
            }
        }
        data_rows = &valid_rows[1..];
    }

    for (row_idx, cells) in data_rows {
        let mut term = String::new();
        let mut definition = String::new();
        let mut phonetic = String::new();
        let mut pos = String::new();
        let mut example = String::new();
        let mut forms: Vec<String> = Vec::new();
        let mut synonyms: Vec<String> = Vec::new();
        let mut tags: Vec<String> = Vec::new();
        let mut image = String::new();
        let mut has_audio_cell = false;

        if !header_map.is_empty() {
            if cells.len() != first_row.len() {
                issues.push(json!({
                    "level": "warn",
                    "row": row_idx,
                    "msg": format!("Dòng {row_idx} có {} ô (so với {} ô ở tiêu đề).", cells.len(), first_row.len()),
                }));
            }

            if let Some(&idx) = header_map.get("term") {
                if let Some(c) = cells.get(idx) {
                    term = c.trim().to_string();
                }
            }
            if let Some(&idx) = header_map.get("definition") {
                if let Some(c) = cells.get(idx) {
                    definition = c.trim().to_string();
                }
            }
            if let Some(&idx) = header_map.get("phonetic") {
                if let Some(c) = cells.get(idx) {
                    phonetic = c.trim().to_string();
                }
            }
            if let Some(&idx) = header_map.get("pos") {
                if let Some(c) = cells.get(idx) {
                    pos = c.trim().to_lowercase();
                }
            }
            if let Some(&idx) = header_map.get("example") {
                if let Some(c) = cells.get(idx) {
                    example = c.trim().to_string();
                }
            }
            if let Some(&idx) = header_map.get("forms") {
                if let Some(c) = cells.get(idx) {
                    forms = c
                        .split([';', '|'])
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            }
            if let Some(&idx) = header_map.get("synonyms") {
                if let Some(c) = cells.get(idx) {
                    synonyms = c
                        .split([';', '|'])
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            }
            if let Some(&idx) = header_map.get("tags") {
                if let Some(c) = cells.get(idx) {
                    tags = c
                        .split([';', '|'])
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                }
            }
            if let Some(&idx) = header_map.get("image") {
                if let Some(c) = cells.get(idx) {
                    image = c.trim().to_string();
                }
            }
            if let Some(&idx) = header_map.get("audio") {
                if let Some(c) = cells.get(idx) {
                    if !c.trim().is_empty() {
                        has_audio_cell = true;
                    }
                }
            }
        } else {
            term = cells
                .first()
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            definition = cells
                .get(1)
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            phonetic = cells
                .get(2)
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            example = cells
                .get(3)
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
        }

        if term.is_empty() {
            issues.push(json!({ "level": "error", "row": row_idx, "msg": format!("Dòng {row_idx}: thiếu từ vựng (term).") }));
            continue;
        }
        if definition.is_empty() {
            issues.push(json!({ "level": "error", "row": row_idx, "msg": format!("Dòng {row_idx}: từ vựng \"{term}\" thiếu nghĩa (definition).") }));
            continue;
        }

        if has_audio_cell && !warned_audio {
            issues.push(json!({ "level": "warn", "msg": "Chưa hỗ trợ audio trong gói bộ thẻ ở giai đoạn này." }));
            warned_audio = true;
        }

        if !image.is_empty() && !has_source_dir {
            issues.push(json!({
                "level": "warn",
                "row": row_idx,
                "field": "image",
                "msg": format!("Từ \"{term}\": cần nhập từ file để lấy ảnh \"{image}\"."),
            }));
        }

        let norm = normalize_term(&term);
        if seen_terms.contains(&norm) {
            issues.push(json!({
                "level": "warn",
                "row": row_idx,
                "msg": format!("Từ vựng \"{term}\" bị trùng trong lần nhập này (đã giữ mục đầu tiên, bỏ qua dòng {row_idx})."),
            }));
            continue;
        }
        seen_terms.insert(norm);

        let mut item = json!({
            "id": stable_vocab_id(&term),
            "type": "vocab",
            "term": term,
            "definition": definition,
        });

        let obj = item.as_object_mut().unwrap();
        if !phonetic.is_empty() {
            obj.insert("phonetic".into(), json!(phonetic));
        }
        if !pos.is_empty() {
            obj.insert("pos".into(), json!(pos));
        }
        if !example.is_empty() {
            obj.insert("example".into(), json!(example));
        }
        if !forms.is_empty() {
            obj.insert("forms".into(), json!(forms));
        }
        if !synonyms.is_empty() {
            obj.insert("synonyms".into(), json!(synonyms));
        }
        if !tags.is_empty() {
            obj.insert("tags".into(), json!(tags));
        }
        if !image.is_empty() {
            obj.insert("image".into(), json!(image));
        }

        items.push(item);
    }

    (items, issues)
}

pub fn parse_markdown_vocab_import(text: &str, has_source_dir: bool) -> (Vec<Value>, Vec<Value>) {
    let mut items = Vec::new();
    let mut issues = Vec::new();
    let mut current_item: Option<serde_json::Map<String, Value>> = None;

    let finish_item = |it: Option<serde_json::Map<String, Value>>,
                       items: &mut Vec<Value>,
                       issues: &mut Vec<Value>| {
        if let Some(map) = it {
            let term = map.get("term").and_then(|v| v.as_str()).unwrap_or("");
            let def = map.get("definition").and_then(|v| v.as_str()).unwrap_or("");
            if term.is_empty() {
                issues.push(json!({ "level": "error", "msg": "Mục từ vựng thiếu thuật ngữ." }));
            } else if def.is_empty() {
                issues.push(
                    json!({ "level": "error", "msg": format!("Từ \"{term}\" thiếu định nghĩa.") }),
                );
            } else {
                items.push(Value::Object(map));
            }
        }
    };

    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(stripped) = trimmed.strip_prefix("## ") {
            finish_item(current_item.take(), &mut items, &mut issues);
            let header = stripped.trim();
            let mut parts = header.splitn(2, '|');
            let term = parts.next().unwrap_or("").trim().to_string();
            let def = parts.next().unwrap_or("").trim().to_string();

            let mut map = serde_json::Map::new();
            map.insert("id".into(), json!(stable_vocab_id(&term)));
            map.insert("type".into(), json!("vocab"));
            map.insert("term".into(), json!(term));
            if !def.is_empty() {
                map.insert("definition".into(), json!(def));
            }
            current_item = Some(map);
        } else if let Some(ref mut map) = current_item {
            if let Some(stripped) = trimmed.strip_prefix("- ") {
                let kv = stripped.trim();
                if let Some((k, v)) = kv.split_once(':') {
                    let key = k.trim().to_lowercase();
                    let val = v.trim();
                    match key.as_str() {
                        "pos" | "từ loại" => {
                            map.insert("pos".into(), json!(val.to_lowercase()));
                        }
                        "ipa" | "phonetic" | "phiên âm" => {
                            map.insert("phonetic".into(), json!(val));
                        }
                        "example" | "ví dụ" => {
                            map.insert("example".into(), json!(val));
                        }
                        "definition" | "nghĩa" | "định nghĩa" => {
                            map.insert("definition".into(), json!(val));
                        }
                        "forms" => {
                            let f: Vec<String> = val
                                .split(',')
                                .map(|s| s.trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                            map.insert("forms".into(), json!(f));
                        }
                        "synonyms" => {
                            let s: Vec<String> = val
                                .split(',')
                                .map(|s| s.trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                            map.insert("synonyms".into(), json!(s));
                        }
                        "tags" => {
                            let t: Vec<String> = val
                                .split(',')
                                .map(|s| s.trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                            map.insert("tags".into(), json!(t));
                        }
                        "image" => {
                            if !has_source_dir {
                                issues.push(json!({ "level": "warn", "msg": format!("Cần nhập từ file để lấy ảnh \"{val}\".") }));
                            }
                            map.insert("image".into(), json!(val));
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    finish_item(current_item, &mut items, &mut issues);
    (items, issues)
}

pub fn collect_import_assets(
    source_dir: &Path,
    items: &[Value],
) -> (HashMap<String, Vec<u8>>, Vec<Value>) {
    let mut assets = HashMap::new();
    let mut issues = Vec::new();

    let root_prefix = match fs::canonicalize(source_dir) {
        Ok(p) => p,
        Err(_) => source_dir.to_path_buf(),
    };

    for item in items {
        let refs = item_image_refs(item);
        for ref_str in refs {
            if ref_str.starts_with("//") || ref_str.contains("://") {
                issues.push(
                    json!({ "level": "warn", "msg": format!("Bỏ qua ảnh ngoài gói: {ref_str}") }),
                );
                continue;
            }
            let lower = ref_str.to_lowercase();
            if !(lower.ends_with(".png")
                || lower.ends_with(".jpg")
                || lower.ends_with(".jpeg")
                || lower.ends_with(".gif")
                || lower.ends_with(".webp")
                || lower.ends_with(".svg"))
            {
                issues.push(json!({ "level": "warn", "msg": format!("Bỏ qua ảnh không hợp lệ: {ref_str}") }));
                continue;
            }
            let full_path = source_dir.join(&ref_str);
            let canonical = match fs::canonicalize(&full_path) {
                Ok(c) => c,
                Err(_) => {
                    issues.push(
                        json!({ "level": "warn", "msg": format!("Không tìm thấy ảnh: {ref_str}") }),
                    );
                    continue;
                }
            };
            if !canonical.starts_with(&root_prefix) {
                issues.push(json!({ "level": "warn", "msg": format!("Bỏ qua ảnh nằm ngoài thư mục nguồn: {ref_str}") }));
                continue;
            }
            let meta = match fs::metadata(&canonical) {
                Ok(m) => m,
                Err(_) => {
                    issues.push(
                        json!({ "level": "warn", "msg": format!("Không tìm thấy ảnh: {ref_str}") }),
                    );
                    continue;
                }
            };
            if !meta.is_file() || meta.len() > LIMITS_IMAGE {
                issues.push(json!({ "level": "warn", "msg": format!("Bỏ qua {ref_str}: tập tin không hợp lệ hoặc lớn hơn 5 MB.") }));
                continue;
            }
            let bytes = match fs::read(&canonical) {
                Ok(b) => b,
                Err(_) => continue,
            };
            if detect_image_type(&bytes).is_none() {
                issues.push(json!({ "level": "warn", "msg": format!("Bỏ qua {ref_str}: nội dung không phải ảnh thật.") }));
                continue;
            }
            let norm_ref = if ref_str.starts_with("img/") {
                ref_str.clone()
            } else {
                format!("img/{ref_str}")
            };
            assets.insert(norm_ref, bytes);
        }
    }

    (assets, issues)
}

pub fn import_pick_file(app: &AppHandle, package_store: &PackageStore) -> AppResult<Value> {
    let file = app
        .dialog()
        .file()
        .set_title("Chọn file nguồn bộ thẻ")
        .add_filter(
            "File dữ liệu (.csv, .tsv, .txt, .md, .json)",
            &["csv", "tsv", "txt", "md", "json"],
        )
        .add_filter("Tất cả tập tin", &["*"])
        .blocking_pick_file();

    match file {
        Some(fp) => {
            let path_buf = fp
                .into_path()
                .map_err(|e| AppError::Custom(e.to_string()))?;
            let token = package_store.new_key();
            package_store.set_temp_import(token.clone(), path_buf.clone());
            let meta = fs::metadata(&path_buf)?;
            let file_name = path_buf
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            Ok(json!({
                "ok": true,
                "token": token,
                "path": path_buf.to_string_lossy().to_string(),
                "name": file_name,
                "size": meta.len(),
            }))
        }
        None => Ok(json!({ "ok": false, "canceled": true })),
    }
}

pub fn preview_import(
    package_store: &PackageStore,
    token: Option<&str>,
    file_path: Option<&str>,
    raw_text: Option<&str>,
    format_opt: Option<&str>,
    separator: Option<&str>,
) -> AppResult<Value> {
    let mut resolved_path: Option<PathBuf> = None;
    let mut has_source_dir = false;

    if let Some(tok) = token {
        if !tok.trim().is_empty() {
            match package_store.get_temp_import(tok) {
                Some(p) => {
                    resolved_path = Some(p);
                    has_source_dir = true;
                }
                None => {
                    return Ok(json!({
                        "ok": false,
                        "error": "Token tệp nhập không hợp lệ hoặc đã hết hạn."
                    }));
                }
            }
        }
    } else if let Some(fp) = file_path {
        if !fp.trim().is_empty() {
            return Ok(json!({
                "ok": false,
                "error": "Đường dẫn chưa được cấp phép. Vui lòng chọn file qua hộp thoại."
            }));
        }
    }

    let (content, source_dir) = if let Some(ref p) = resolved_path {
        match fs::read_to_string(p) {
            Ok(c) => (c, p.parent().map(|d| d.to_path_buf())),
            Err(e) => {
                return Ok(json!({
                    "ok": false,
                    "error": format!("Không đọc được file: {e}")
                }));
            }
        }
    } else if let Some(txt) = raw_text {
        (txt.to_string(), None)
    } else {
        return Ok(json!({
            "ok": false,
            "error": "Chưa có nội dung văn bản để nhập."
        }));
    };

    let clean_text = content.trim_start_matches('\u{feff}');
    if clean_text.trim().is_empty() {
        return Ok(json!({
            "ok": false,
            "error": "Chưa có nội dung văn bản để nhập."
        }));
    }

    if clean_text.len() as u64 > MAX_IMPORT_BYTES {
        return Ok(json!({
            "ok": false,
            "error": format!("Dung lượng văn bản nhập ({} MB) vượt quá giới hạn cho phép (tối đa 5 MB).", clean_text.len() / (1024 * 1024))
        }));
    }

    let detected_fmt = detect_import_format(clean_text);
    let fmt = match format_opt {
        Some(f) if !f.is_empty() && f != "auto" => f,
        _ => detected_fmt,
    };

    let (mut items, mut issues) = match fmt {
        "md-vocab" => parse_markdown_vocab_import(clean_text, has_source_dir),
        "tsv" => parse_csv_import(clean_text, '\t', has_source_dir),
        "csv" => {
            let delim = separator
                .and_then(|s| s.chars().next())
                .unwrap_or_else(|| detect_delimiter(clean_text));
            parse_csv_import(clean_text, delim, has_source_dir)
        }
        _ => {
            let delim = separator
                .and_then(|s| s.chars().next())
                .unwrap_or_else(|| detect_delimiter(clean_text));
            parse_csv_import(clean_text, delim, has_source_dir)
        }
    };

    let (temp_assets, asset_issues) = match (has_source_dir, source_dir.as_ref()) {
        (true, Some(dir)) => collect_import_assets(dir, &items),
        _ => (HashMap::new(), Vec::new()),
    };

    issues.extend(asset_issues);

    if items.len() > MAX_IMPORT_ITEMS {
        issues.push(json!({
            "level": "warn",
            "msg": format!("Số lượng mục nhập ({}) vượt quá {MAX_IMPORT_ITEMS}. Chỉ lấy {MAX_IMPORT_ITEMS} mục đầu tiên.", items.len())
        }));
        items.truncate(MAX_IMPORT_ITEMS);
    }

    let asset_count = temp_assets.len();
    let import_id = uuid::Uuid::new_v4().to_string();
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    package_store.set_temp_import_session(
        import_id.clone(),
        TempImportSession {
            assets: temp_assets,
            source_dir,
            items: items.clone(),
            created_at: now_ms,
        },
    );

    Ok(json!({
        "ok": true,
        "format": fmt,
        "items": items,
        "issues": issues,
        "importId": import_id,
        "assetCount": asset_count,
    }))
}

pub fn commit_import(
    package_store: &PackageStore,
    deck_key: Option<&str>,
    import_id: Option<&str>,
    selected_ids: Option<&[String]>,
) -> AppResult<Value> {
    let import_id = match import_id {
        Some(id) if !id.is_empty() => id,
        _ => return Ok(json!({ "ok": true, "assetCount": 0 })),
    };

    let session = match package_store.delete_temp_import_session(import_id) {
        Some(s) => s,
        None => return Ok(json!({ "ok": true, "assetCount": 0 })),
    };

    let deck_key = match deck_key {
        Some(k) if !k.is_empty() => k,
        _ => return Ok(json!({ "ok": true, "assetCount": 0 })),
    };

    let mut pkg = match package_store.get(deck_key) {
        Some(p) => p,
        None => return Ok(json!({ "ok": true, "assetCount": 0 })),
    };

    if !session.assets.is_empty() {
        let allowed_refs: Option<HashSet<String>> = selected_ids.map(|ids| {
            let id_set: HashSet<&str> = ids.iter().map(|s| s.as_str()).collect();
            let mut refs = HashSet::new();
            for item in &session.items {
                if let Some(item_id) = item.get("id").and_then(|v| v.as_str()) {
                    if id_set.contains(item_id) {
                        for r in item_image_refs(item) {
                            let norm = if r.starts_with("img/") {
                                r.clone()
                            } else {
                                format!("img/{r}")
                            };
                            refs.insert(norm);
                            refs.insert(r);
                        }
                    }
                }
            }
            refs
        });

        for (k, v) in session.assets {
            let k_stripped = k.trim_start_matches("img/").to_string();
            let is_allowed = match &allowed_refs {
                Some(refs) => refs.contains(&k) || refs.contains(&k_stripped),
                None => true,
            };
            if is_allowed {
                pkg.assets.insert(k, v);
            }
        }

        let asset_count = pkg.assets.len();
        package_store.set(deck_key.to_string(), pkg);
        return Ok(json!({ "ok": true, "assetCount": asset_count }));
    }

    Ok(json!({ "ok": true, "assetCount": pkg.assets.len() }))
}
