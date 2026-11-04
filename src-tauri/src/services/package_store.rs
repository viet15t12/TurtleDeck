// src-tauri/src/services/package_store.rs — Quản lý bộ nhớ các gói thẻ đang mở, import tạm và đóng gói/giải nén .sdeck
use crate::error::{AppError, AppResult};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

pub const LIMITS_ENTRIES: usize = 2000;
pub const LIMITS_DECK_JSON: u64 = 20_000_000; // 20 MB
pub const LIMITS_IMAGE: u64 = 5_000_000; // 5 MB
pub const LIMITS_TOTAL: u64 = 500_000_000; // 500 MB

pub const FORMAT: &str = "studydeck";
pub const FORMAT_VERSION: u32 = 1;

#[derive(Clone, Debug)]
pub struct OpenPackage {
    pub file: Option<PathBuf>,
    pub assets: HashMap<String, Vec<u8>>,
    pub source_dir: Option<PathBuf>,
}

#[derive(Clone, Debug)]
pub struct TempImport {
    pub path: PathBuf,
    pub created_at: u64,
}

#[derive(Debug, Clone)]
pub struct TempImportSession {
    pub assets: HashMap<String, Vec<u8>>,
    pub source_dir: Option<PathBuf>,
    pub items: Vec<Value>,
    pub created_at: u64,
}

pub struct PackageStore {
    packages: RwLock<HashMap<String, OpenPackage>>,
    temp_imports: RwLock<HashMap<String, TempImport>>,
    temp_import_sessions: RwLock<HashMap<String, TempImportSession>>,
    known_saves: RwLock<HashMap<PathBuf, u64>>,
}

impl Default for PackageStore {
    fn default() -> Self {
        Self::new()
    }
}

impl PackageStore {
    pub fn new() -> Self {
        Self {
            packages: RwLock::new(HashMap::new()),
            temp_imports: RwLock::new(HashMap::new()),
            temp_import_sessions: RwLock::new(HashMap::new()),
            known_saves: RwLock::new(HashMap::new()),
        }
    }

    pub fn new_key(&self) -> String {
        uuid::Uuid::new_v4().to_string().replace('-', "")[..12].to_string()
    }

    pub fn get(&self, deck_key: &str) -> Option<OpenPackage> {
        self.packages.read().ok()?.get(deck_key).cloned()
    }

    pub fn set(&self, deck_key: String, pkg: OpenPackage) {
        if let Ok(mut lock) = self.packages.write() {
            lock.insert(deck_key, pkg);
        }
    }

    pub fn delete(&self, deck_key: &str) -> bool {
        if let Ok(mut lock) = self.packages.write() {
            lock.remove(deck_key).is_some()
        } else {
            false
        }
    }

    pub fn has(&self, deck_key: &str) -> bool {
        self.packages
            .read()
            .map(|l| l.contains_key(deck_key))
            .unwrap_or(false)
    }

    pub fn keys(&self) -> Vec<String> {
        self.packages
            .read()
            .map(|l| l.keys().cloned().collect())
            .unwrap_or_default()
    }

    pub fn find_by_file(&self, file_path: &Path) -> Option<(String, OpenPackage)> {
        let lock = self.packages.read().ok()?;
        let canonical_target =
            fs::canonicalize(file_path).unwrap_or_else(|_| file_path.to_path_buf());
        for (k, v) in lock.iter() {
            if let Some(f) = &v.file {
                let canonical_f = fs::canonicalize(f).unwrap_or_else(|_| f.clone());
                if canonical_f == canonical_target {
                    return Some((k.clone(), v.clone()));
                }
            }
        }
        None
    }

    pub fn set_temp_import(&self, token: String, path: PathBuf) {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        self.set_temp_import_at(token, path, now);
    }

    pub fn set_temp_import_at(&self, token: String, path: PathBuf, created_at: u64) {
        if let Ok(mut lock) = self.temp_imports.write() {
            lock.insert(token, TempImport { path, created_at });
        }
    }

    pub fn get_temp_import(&self, token: &str) -> Option<PathBuf> {
        self.temp_imports
            .read()
            .ok()?
            .get(token)
            .map(|e| e.path.clone())
    }

    pub fn delete_temp_import(&self, token: &str) -> bool {
        if let Ok(mut lock) = self.temp_imports.write() {
            lock.remove(token).is_some()
        } else {
            false
        }
    }

    pub fn prune_temp_imports(&self, max_age_ms: u64, now: u64) {
        if let Ok(mut lock) = self.temp_imports.write() {
            lock.retain(|_, entry| now.saturating_sub(entry.created_at) <= max_age_ms);
        }
        if let Ok(mut lock) = self.temp_import_sessions.write() {
            lock.retain(|_, entry| now.saturating_sub(entry.created_at) <= max_age_ms);
        }
    }

    pub fn set_temp_import_session(&self, id: String, session: TempImportSession) {
        if let Ok(mut lock) = self.temp_import_sessions.write() {
            lock.insert(id, session);
        }
    }

    pub fn get_temp_import_session(&self, id: &str) -> Option<TempImportSession> {
        self.temp_import_sessions.read().ok()?.get(id).cloned()
    }

    pub fn delete_temp_import_session(&self, id: &str) -> Option<TempImportSession> {
        if let Ok(mut lock) = self.temp_import_sessions.write() {
            lock.remove(id)
        } else {
            None
        }
    }

    pub fn record_save(&self, path: &Path, timestamp_ms: u64) {
        let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if let Ok(mut lock) = self.known_saves.write() {
            lock.insert(canonical, timestamp_ms);
        }
    }

    pub fn is_self_save(&self, path: &Path, mtime_ms: u64) -> bool {
        let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if let Ok(lock) = self.known_saves.read() {
            if let Some(&saved_at) = lock.get(&canonical) {
                let diff = saved_at.abs_diff(mtime_ms);
                return diff < 2000;
            }
        }
        false
    }

    pub fn clear(&self) {
        if let Ok(mut lock) = self.packages.write() {
            lock.clear();
        }
        if let Ok(mut lock) = self.temp_imports.write() {
            lock.clear();
        }
        if let Ok(mut lock) = self.temp_import_sessions.write() {
            lock.clear();
        }
        if let Ok(mut lock) = self.known_saves.write() {
            lock.clear();
        }
    }
}

// Kiểm tra tên entry ZIP an toàn
pub fn is_safe_entry(name: &str) -> bool {
    if name.is_empty() || name.starts_with('/') || name.contains('\\') {
        return false;
    }
    if name
        .chars()
        .any(|c| (c as u32) <= 0x1f || (c as u32) == 0x7f)
    {
        return false;
    }
    name.split('/')
        .all(|seg| !seg.is_empty() && seg != "." && seg != "..")
}

// Kiểm tra entry ảnh hợp lệ trong gói: img/<...>, đuôi ảnh chuẩn
pub fn is_image_entry(name: &str) -> bool {
    if !is_safe_entry(name) || !name.starts_with("img/") {
        return false;
    }
    let lower = name.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".svg")
}

// Nhận diện định dạng ảnh dựa trên nội dung byte (magic bytes)
pub fn detect_image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.is_empty() {
        return None;
    }
    // PNG: \x89PNG
    if bytes.len() >= 8 && bytes[0..4] == [0x89, b'P', b'N', b'G'] {
        return Some("png");
    }
    // JPG: \xFF\xD8\xFF
    if bytes.len() >= 3 && bytes[0..3] == [0xff, 0xd8, 0xff] {
        return Some("jpg");
    }
    // GIF: GIF87a hoặc GIF89a
    if bytes.len() >= 6 && (&bytes[0..6] == b"GIF87a" || &bytes[0..6] == b"GIF89a") {
        return Some("gif");
    }
    // WEBP: RIFF....WEBP
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    // SVG: chứa <svg
    let head_len = bytes.len().min(2048);
    if let Ok(head) = std::str::from_utf8(&bytes[..head_len]) {
        let trimmed = head.trim_start_matches('\u{feff}').trim_start();
        if trimmed.starts_with("<svg")
            || trimmed.starts_with("<?xml")
            || trimmed.starts_with("<!DOCTYPE")
            || trimmed.contains("<svg")
        {
            return Some("svg");
        }
    }
    None
}

#[derive(Debug, Clone)]
pub struct ReadPackageResult {
    pub deck_text: String,
    pub assets: HashMap<String, Vec<u8>>,
    pub issues: Vec<String>,
}

// Đọc toàn bộ gói .sdeck từ bộ nhớ byte
pub fn read_package(bytes: &[u8]) -> AppResult<ReadPackageResult> {
    if bytes.len() < 4 || bytes[0] != 0x50 || bytes[1] != 0x4b {
        return Err(AppError::Custom(
            "Không phải file .sdeck (không phải gói nén ZIP).".into(),
        ));
    }

    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| AppError::Custom(format!("File hỏng hoặc không đọc được: {e}")))?;

    if archive.len() > LIMITS_ENTRIES {
        return Err(AppError::Custom("Gói có quá nhiều tập tin.".into()));
    }

    let mut issues = Vec::new();
    let mut deck_text: Option<String> = None;
    let mut assets = HashMap::new();
    let mut total_decompressed: u64 = 0;

    for i in 0..archive.len() {
        let mut file = archive
            .by_index(i)
            .map_err(|e| AppError::Custom(format!("Lỗi đọc entry #{i}: {e}")))?;

        let name = file.name().to_string();
        if name.ends_with('/') {
            continue;
        }

        if !is_safe_entry(&name) {
            issues.push(format!("Bỏ qua tập tin có tên không an toàn: {name}"));
            continue;
        }

        let is_deck = name == "deck.json";
        if !is_deck && !is_image_entry(&name) {
            issues.push(format!("Bỏ qua tập tin lạ trong gói: {name}"));
            continue;
        }

        let max_size = if is_deck {
            LIMITS_DECK_JSON
        } else {
            LIMITS_IMAGE
        };

        if file.size() > max_size {
            issues.push(format!("Bỏ qua {name}: dung lượng quá lớn."));
            continue;
        }

        total_decompressed += file.size();
        if total_decompressed > LIMITS_TOTAL {
            return Err(AppError::Custom(
                "Dung lượng giải nén vượt quá 500 MB.".into(),
            ));
        }

        let mut data = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut data)
            .map_err(|e| AppError::Custom(format!("Lỗi đọc dữ liệu {name}: {e}")))?;

        if is_deck {
            let text = String::from_utf8(data)
                .map_err(|_| AppError::Custom("deck.json không phải UTF-8 hợp lệ.".into()))?;
            let clean_text = text.trim_start_matches('\u{feff}').to_string();
            deck_text = Some(clean_text);
        } else if detect_image_type(&data).is_some() {
            assets.insert(name, data);
        } else {
            issues.push(format!("Bỏ qua {name}: nội dung không phải ảnh."));
        }
    }

    let text = deck_text.ok_or_else(|| {
        AppError::Custom("Gói không có deck.json — đây không phải bộ thẻ hợp lệ.".into())
    })?;

    Ok(ReadPackageResult {
        deck_text: text,
        assets,
        issues,
    })
}

// Đọc nhanh riêng file deck.json từ gói .sdeck mà không unpack ảnh
pub fn read_package_meta(bytes: &[u8]) -> AppResult<String> {
    if bytes.len() < 4 || bytes[0] != 0x50 || bytes[1] != 0x4b {
        return Err(AppError::Custom(
            "Không phải file .sdeck (không phải gói nén ZIP).".into(),
        ));
    }

    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor)
        .map_err(|e| AppError::Custom(format!("File hỏng hoặc không đọc được: {e}")))?;

    let mut file = archive
        .by_name("deck.json")
        .map_err(|_| AppError::Custom("Gói không có deck.json.".into()))?;

    if file.size() > LIMITS_DECK_JSON {
        return Err(AppError::Custom("deck.json vượt quá 20 MB.".into()));
    }

    let mut data = Vec::with_capacity(file.size() as usize);
    file.read_to_end(&mut data)
        .map_err(|e| AppError::Custom(format!("Lỗi đọc deck.json: {e}")))?;

    let text = String::from_utf8(data)
        .map_err(|_| AppError::Custom("deck.json không phải UTF-8 hợp lệ.".into()))?;

    Ok(text.trim_start_matches('\u{feff}').to_string())
}

// Thu thập mọi đường dẫn ảnh được tham chiếu trong bộ thẻ
pub fn collect_image_refs(deck: &Value) -> HashSet<String> {
    let mut out = HashSet::new();
    let re = regex_lite_or_simple_scan();

    fn walk(val: &Value, out: &mut HashSet<String>, key: Option<&str>) {
        match val {
            Value::String(s) => {
                if key == Some("image") || key == Some("answerImage") {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        out.insert(trimmed.to_string());
                    }
                }
                // Tìm kiếm ảnh markdown ![](/path) hoặc ![](path)
                let mut start = 0;
                while let Some(pos) = val.as_str().and_then(|t| t[start..].find("![")) {
                    let idx = start + pos;
                    if let Some(close_bracket) = val.as_str().and_then(|t| t[idx..].find("](")) {
                        let open_paren = idx + close_bracket + 2;
                        if let Some(close_paren) =
                            val.as_str().and_then(|t| t[open_paren..].find(')'))
                        {
                            let url_part =
                                &val.as_str().unwrap()[open_paren..open_paren + close_paren];
                            let img_path = url_part.split_whitespace().next().unwrap_or("").trim();
                            if !img_path.is_empty() {
                                out.insert(img_path.to_string());
                            }
                            start = open_paren + close_paren + 1;
                            continue;
                        }
                    }
                    start = idx + 2;
                }
            }
            Value::Array(arr) => {
                for it in arr {
                    walk(it, out, key);
                }
            }
            Value::Object(map) => {
                for (k, v) in map {
                    walk(v, out, Some(k));
                }
            }
            _ => {}
        }
    }

    if let Some(items) = deck.get("items").and_then(|v| v.as_array()) {
        for it in items {
            walk(it, &mut out, None);
        }
    }
    let _ = re;
    out
}

pub fn item_image_refs(item: &Value) -> HashSet<String> {
    let mut out = HashSet::new();
    let re = regex_lite_or_simple_scan();

    fn walk(val: &Value, out: &mut HashSet<String>, key: Option<&str>) {
        match val {
            Value::String(s) => {
                if key == Some("image") || key == Some("answerImage") {
                    let trimmed = s.trim();
                    if !trimmed.is_empty() {
                        out.insert(trimmed.to_string());
                    }
                }
                let mut start = 0;
                while let Some(pos) = val.as_str().and_then(|t| t[start..].find("![")) {
                    let idx = start + pos;
                    if let Some(close_bracket) = val.as_str().and_then(|t| t[idx..].find("](")) {
                        let open_paren = idx + close_bracket + 2;
                        if let Some(close_paren) =
                            val.as_str().and_then(|t| t[open_paren..].find(')'))
                        {
                            let url_part =
                                &val.as_str().unwrap()[open_paren..open_paren + close_paren];
                            let img_path = url_part.split_whitespace().next().unwrap_or("").trim();
                            if !img_path.is_empty() {
                                out.insert(img_path.to_string());
                            }
                            start = open_paren + close_paren + 1;
                            continue;
                        }
                    }
                    start = idx + 2;
                }
            }
            Value::Array(arr) => {
                for it in arr {
                    walk(it, out, key);
                }
            }
            Value::Object(map) => {
                for (k, v) in map {
                    walk(v, out, Some(k));
                }
            }
            _ => {}
        }
    }

    walk(item, &mut out, None);
    let _ = re;
    out
}

fn regex_lite_or_simple_scan() -> bool {
    true
}

#[derive(Debug, Clone)]
pub struct WritePackageResult {
    pub bytes: Vec<u8>,
    pub kept_assets: HashMap<String, Vec<u8>>,
}

// Đóng gói bộ thẻ thành file nén .sdeck
pub fn write_package(
    deck_text: &str,
    assets: &HashMap<String, Vec<u8>>,
    prune: bool,
) -> AppResult<WritePackageResult> {
    let mut deck: Value = serde_json::from_str(deck_text)
        .map_err(|e| AppError::Custom(format!("deck.json không hợp lệ: {e}")))?;

    if deck
        .get("meta")
        .and_then(|m| m.get("id"))
        .and_then(|v| v.as_str())
        .is_none()
        || !deck.get("items").map(|i| i.is_array()).unwrap_or(false)
    {
        return Err(AppError::Custom(
            "Thiếu meta.id hoặc danh sách items.".into(),
        ));
    }

    if let Some(meta) = deck.get_mut("meta").and_then(|m| m.as_object_mut()) {
        meta.insert("format".into(), Value::String(FORMAT.into()));
        meta.insert("formatVersion".into(), Value::from(FORMAT_VERSION));
    }

    let deck_bytes = serde_json::to_vec_pretty(&deck)
        .map_err(|e| AppError::Custom(format!("Lỗi serialize deck.json: {e}")))?;

    if deck_bytes.len() as u64 > LIMITS_DECK_JSON {
        return Err(AppError::Custom("deck.json vượt quá 20 MB.".into()));
    }

    let used_images = collect_image_refs(&deck);
    let mut kept_assets = HashMap::new();
    let mut total_size = deck_bytes.len() as u64;

    for (name, data) in assets {
        if prune && !used_images.contains(name) {
            continue;
        }
        if !is_image_entry(name)
            || detect_image_type(data).is_none()
            || data.len() as u64 > LIMITS_IMAGE
        {
            continue;
        }
        total_size += data.len() as u64;
        kept_assets.insert(name.clone(), data.clone());
    }

    if kept_assets.len() + 1 > LIMITS_ENTRIES {
        return Err(AppError::Custom("Gói có quá nhiều tập tin.".into()));
    }
    if total_size > LIMITS_TOTAL {
        return Err(AppError::Custom(
            "Tổng dung lượng bộ thẻ vượt quá 500 MB.".into(),
        ));
    }

    let mut buf = Vec::new();
    {
        let cursor = Cursor::new(&mut buf);
        let mut zip = ZipWriter::new(cursor);

        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        zip.start_file("deck.json", options)
            .map_err(|e| AppError::Custom(format!("Lỗi tạo entry deck.json: {e}")))?;
        zip.write_all(&deck_bytes)
            .map_err(|e| AppError::Custom(format!("Lỗi ghi deck.json: {e}")))?;

        for (name, data) in &kept_assets {
            zip.start_file(name, options)
                .map_err(|e| AppError::Custom(format!("Lỗi tạo entry {name}: {e}")))?;
            zip.write_all(data)
                .map_err(|e| AppError::Custom(format!("Lỗi ghi entry {name}: {e}")))?;
        }

        zip.finish()
            .map_err(|e| AppError::Custom(format!("Lỗi hoàn tất đóng gói zip: {e}")))?;
    }

    Ok(WritePackageResult {
        bytes: buf,
        kept_assets,
    })
}

// Chuyển chuỗi tiếng Việt có dấu thành slug an toàn cho tên file
pub fn slugify(s: &str) -> String {
    let mut out = String::new();
    for c in s.chars() {
        match c {
            'á' | 'à' | 'ả' | 'ã' | 'ạ' | 'ă' | 'ắ' | 'ằ' | 'ẳ' | 'ẵ' | 'ặ' | 'â' | 'ấ' | 'ầ'
            | 'ẩ' | 'ẫ' | 'ậ' | 'Á' | 'À' | 'Ả' | 'Ã' | 'Ạ' | 'Ă' | 'Ắ' | 'Ằ' | 'Ẳ' | 'Ẵ' | 'Ặ'
            | 'Â' | 'Ấ' | 'Ầ' | 'Ẩ' | 'Ẫ' | 'Ậ' => out.push('a'),
            'đ' | 'Đ' => out.push('d'),
            'é' | 'è' | 'ẻ' | 'ẽ' | 'ẹ' | 'ê' | 'ế' | 'ề' | 'ể' | 'ễ' | 'ệ' | 'É' | 'È' | 'Ẻ'
            | 'Ẽ' | 'Ẹ' | 'Ê' | 'Ế' | 'Ề' | 'Ể' | 'Ễ' | 'Ệ' => out.push('e'),
            'í' | 'ì' | 'ỉ' | 'ĩ' | 'ị' | 'Í' | 'Ì' | 'Ỉ' | 'Ĩ' | 'Ị' => {
                out.push('i')
            }
            'ó' | 'ò' | 'ỏ' | 'õ' | 'ọ' | 'ô' | 'ố' | 'ồ' | 'ổ' | 'ỗ' | 'ộ' | 'ơ' | 'ớ' | 'ờ'
            | 'ở' | 'ợ' | 'Ó' | 'Ò' | 'Ỏ' | 'Õ' | 'Ọ' | 'Ô' | 'Ố' | 'Ồ' | 'Ổ' | 'Ỗ' | 'Ộ' | 'Ơ'
            | 'Ớ' | 'Ờ' | 'Ở' | 'Ỡ' | 'Ợ' => out.push('o'),
            'ú' | 'ù' | 'ủ' | 'ũ' | 'ụ' | 'ư' | 'ứ' | 'ừ' | 'ử' | 'ữ' | 'ự' | 'Ú' | 'Ù' | 'Ủ'
            | 'Ũ' | 'Ụ' | 'Ư' | 'Ứ' | 'Ừ' | 'Ử' | 'Ữ' | 'Ự' => out.push('u'),
            'ý' | 'ỳ' | 'ỷ' | 'ỹ' | 'ỵ' | 'Ý' | 'Ỳ' | 'Ỷ' | 'Ỹ' | 'Ỵ' => {
                out.push('y')
            }
            'a'..='z' | '0'..='9' => out.push(c),
            'A'..='Z' => out.push(c.to_ascii_lowercase()),
            _ => out.push('-'),
        }
    }

    let mut slug = String::new();
    let mut prev_dash = true;
    for c in out.chars() {
        if c == '-' {
            if !prev_dash {
                slug.push('-');
                prev_dash = true;
            }
        } else {
            slug.push(c);
            prev_dash = false;
        }
    }

    let trimmed = slug.trim_matches('-');
    let final_slug = if trimmed.len() > 60 {
        &trimmed[..60]
    } else {
        trimmed
    };

    if final_slug.is_empty() {
        "bo-the-moi".to_string()
    } else {
        final_slug.trim_end_matches('-').to_string()
    }
}

// Tạo bản sao lưu .bak trước khi ghi đè file
pub fn backup_file(path: &Path) -> AppResult<Option<PathBuf>> {
    if !path.exists() {
        return Ok(None);
    }
    let bak_path = path.with_extension("sdeck.bak");
    fs::copy(path, &bak_path)
        .map_err(|e| AppError::Custom(format!("Không thể tạo bản sao lưu .bak: {e}")))?;
    Ok(Some(bak_path))
}

// Ghi nguyên tử bằng cách ghi vào file tạm .tmp rồi đổi tên (rename)
pub fn atomic_write(path: &Path, bytes: &[u8]) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| AppError::Custom(format!("Không thể tạo thư mục cha: {e}")))?;
    }

    let tmp_path = path.with_extension(format!("tmp.{}", uuid::Uuid::new_v4()));
    fs::write(&tmp_path, bytes)
        .map_err(|e| AppError::Custom(format!("Không thể ghi file tạm: {e}")))?;

    fs::rename(&tmp_path, path).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        AppError::Custom(format!("Không thể đổi tên file tạm sang đích: {e}"))
    })?;

    Ok(())
}
