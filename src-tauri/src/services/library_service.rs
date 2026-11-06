// src-tauri/src/services/library_service.rs — Quét và quản lý thư viện bộ thẻ
use crate::services::package_store::{read_package_meta, LIMITS_TOTAL};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

pub fn is_path_inside_root(target: &Path, root: &Path) -> bool {
    let norm_root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());
    let norm_target = fs::canonicalize(target).unwrap_or_else(|_| target.to_path_buf());
    norm_target.starts_with(&norm_root) || norm_target == norm_root
}

pub fn infer_group(rel_path: &str) -> Option<String> {
    let parts: Vec<&str> = rel_path
        .split(['/', '\\'])
        .filter(|p| !p.is_empty())
        .collect();
    if parts.len() > 1 {
        Some(parts[0].to_string())
    } else {
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedFile {
    pub full_path: PathBuf,
    pub rel_path: String,
    pub name: String,
    pub is_link: bool,
    pub link_target: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LibraryCacheEntry {
    pub mtime_ms: u64,
    pub size: u64,
    pub deck: Value,
    pub total: usize,
}

pub fn scan_library_recursively(
    dir: &Path,
    root: &Path,
    depth: usize,
    results: &mut Vec<ScannedFile>,
    max_files: usize,
) {
    if depth > 9 || results.len() >= max_files {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    let real_root = fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf());

    for entry in entries.flatten() {
        if results.len() >= max_files {
            break;
        }

        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with('.') {
            continue;
        }

        let full_path = entry.path();
        let mut is_link = false;
        let mut link_target = None;

        if let Ok(sym) = fs::symlink_metadata(&full_path) {
            if sym.is_symlink() {
                is_link = true;
                if let Ok(target) = fs::read_link(&full_path) {
                    link_target = Some(target.to_string_lossy().to_string());
                }
            }
        }

        // Bỏ qua nếu nằm ngoài thư viện và không phải link hợp lệ
        if let Ok(real) = fs::canonicalize(&full_path) {
            if !is_link && !real.starts_with(&real_root) {
                continue;
            }
        }

        if let Ok(file_type) = entry.file_type() {
            if file_type.is_dir() {
                scan_library_recursively(&full_path, root, depth + 1, results, max_files);
            } else if (file_type.is_file() || is_link)
                && file_name.to_lowercase().ends_with(".sdeck")
            {
                if file_name.ends_with(".bak") || file_name.ends_with(".tmp") {
                    continue;
                }
                let rel_path = pathdiff::diff_paths(&full_path, root)
                    .map(|p| p.to_string_lossy().replace('\\', "/"))
                    .unwrap_or_else(|| file_name.clone());

                results.push(ScannedFile {
                    full_path,
                    rel_path,
                    name: file_name,
                    is_link,
                    link_target,
                });
            }
        }
    }
}

// Fallback tính diff paths nếu không dùng crate ngoài
mod pathdiff {
    use std::path::{Path, PathBuf};

    pub fn diff_paths(path: &Path, base: &Path) -> Option<PathBuf> {
        let path = path
            .canonicalize()
            .ok()
            .unwrap_or_else(|| path.to_path_buf());
        let base = base
            .canonicalize()
            .ok()
            .unwrap_or_else(|| base.to_path_buf());

        let mut ita = path.components();
        let mut itb = base.components();
        let mut comps = Vec::new();

        loop {
            match (ita.next(), itb.next()) {
                (None, None) => break,
                (Some(a), None) => {
                    comps.push(a);
                    for a in ita {
                        comps.push(a);
                    }
                    break;
                }
                (None, _) => return None,
                (Some(a), Some(b)) if comps.is_empty() && a == b => (),
                (Some(a), Some(b)) if b != a => {
                    return None;
                }
                _ => unreachable!(),
            }
        }

        Some(comps.iter().collect())
    }
}

pub fn scan_library(
    lib_dir: &Path,
    cache: &RwLock<HashMap<PathBuf, LibraryCacheEntry>>,
) -> Vec<Value> {
    let _ = fs::create_dir_all(lib_dir);
    let mut scanned_files = Vec::new();
    scan_library_recursively(lib_dir, lib_dir, 0, &mut scanned_files, 2000);

    let mut decks = Vec::new();

    for item in scanned_files {
        let group = infer_group(&item.rel_path);
        let st = match fs::metadata(&item.full_path) {
            Ok(s) => s,
            Err(e) => {
                decks.push(json!({
                    "path": item.full_path.to_string_lossy(),
                    "relPath": item.rel_path,
                    "group": group,
                    "ok": false,
                    "error": format!("Không đọc được thông tin file: {e}"),
                    "isLink": item.is_link,
                    "linkTarget": item.link_target,
                }));
                continue;
            }
        };

        if st.len() > LIMITS_TOTAL {
            continue;
        }

        let mtime_ms = st
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let size = st.len();

        // Kiểm tra cache
        if let Ok(lock) = cache.read() {
            if let Some(cached) = lock.get(&item.full_path) {
                if cached.mtime_ms == mtime_ms && cached.size == size {
                    decks.push(json!({
                        "path": item.full_path.to_string_lossy(),
                        "relPath": item.rel_path,
                        "group": group,
                        "ok": true,
                        "deck": cached.deck,
                        "total": cached.total,
                        "isLink": item.is_link,
                        "linkTarget": item.link_target,
                    }));
                    continue;
                }
            }
        }

        // Đọc package meta
        let bytes = match fs::read(&item.full_path) {
            Ok(b) => b,
            Err(e) => {
                decks.push(json!({
                    "path": item.full_path.to_string_lossy(),
                    "relPath": item.rel_path,
                    "group": group,
                    "ok": false,
                    "error": format!("Không đọc được file: {e}"),
                    "isLink": item.is_link,
                    "linkTarget": item.link_target,
                }));
                continue;
            }
        };

        let deck_text = match read_package_meta(&bytes) {
            Ok(t) => t,
            Err(e) => {
                decks.push(json!({
                    "path": item.full_path.to_string_lossy(),
                    "relPath": item.rel_path,
                    "group": group,
                    "ok": false,
                    "error": e.to_string(),
                    "isLink": item.is_link,
                    "linkTarget": item.link_target,
                }));
                continue;
            }
        };

        let deck: Value = match serde_json::from_str(&deck_text) {
            Ok(d) => d,
            Err(e) => {
                decks.push(json!({
                    "path": item.full_path.to_string_lossy(),
                    "relPath": item.rel_path,
                    "group": group,
                    "ok": false,
                    "error": format!("deck.json không hợp lệ: {e}"),
                    "isLink": item.is_link,
                    "linkTarget": item.link_target,
                }));
                continue;
            }
        };

        let total = deck
            .get("items")
            .and_then(|i| i.as_array())
            .map(|a| a.len())
            .or_else(|| {
                deck.get("meta")
                    .and_then(|m| m.get("stats"))
                    .and_then(|s| s.get("totalItems"))
                    .and_then(|t| t.as_u64())
                    .map(|t| t as usize)
            })
            .unwrap_or(0);

        // Cập nhật cache
        if let Ok(mut lock) = cache.write() {
            lock.insert(
                item.full_path.clone(),
                LibraryCacheEntry {
                    mtime_ms,
                    size,
                    deck: deck.clone(),
                    total,
                },
            );
        }

        decks.push(json!({
            "path": item.full_path.to_string_lossy(),
            "relPath": item.rel_path,
            "group": group,
            "ok": true,
            "deck": deck,
            "total": total,
            "isLink": item.is_link,
            "linkTarget": item.link_target,
        }));
    }

    decks
}
