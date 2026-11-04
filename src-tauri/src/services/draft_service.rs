// src-tauri/src/services/draft_service.rs — Quản lý bản nháp tự lưu của Editor
use crate::error::{AppError, AppResult};
use crate::services::deck_service::open_one;
use crate::services::package_store::{atomic_write, write_package, PackageStore};
use crate::state::AppState;
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

pub fn sanitize_draft_id(meta_id: &str) -> String {
    if meta_id.trim().is_empty() {
        return "draft".to_string();
    }
    let mut clean = String::new();
    for c in meta_id.chars() {
        if c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-' {
            clean.push(c);
        } else {
            clean.push('_');
        }
        if clean.len() >= 80 {
            break;
        }
    }
    if clean.is_empty() {
        "draft".to_string()
    } else {
        clean
    }
}

pub fn save_draft(
    drafts_dir: &Path,
    package_store: &PackageStore,
    meta_id: &str,
    deck_key: &str,
    deck_text: &str,
) -> AppResult<Value> {
    if meta_id.trim().is_empty() || deck_text.trim().is_empty() {
        return Ok(json!({ "ok": false }));
    }

    let pkg = package_store.get(deck_key);
    let assets = pkg.as_ref().map(|p| p.assets.clone()).unwrap_or_default();
    let orig_file = pkg.and_then(|p| p.file);

    let draft_id = sanitize_draft_id(meta_id);
    let _ = fs::create_dir_all(drafts_dir);

    let built = write_package(deck_text, &assets, false)?;

    // Trích xuất tiêu đề từ deck_text JSON
    let title = serde_json::from_str::<Value>(deck_text)
        .ok()
        .and_then(|v| {
            v.get("meta")
                .and_then(|m| m.get("title"))
                .and_then(|t| t.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| "Bộ thẻ chưa đặt tên".to_string());

    let sdeck_path = drafts_dir.join(format!("{draft_id}.sdeck"));
    let meta_json_path = drafts_dir.join(format!("{draft_id}.json"));

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let meta_data = json!({
        "draftId": draft_id,
        "metaId": meta_id,
        "title": title,
        "origFile": orig_file.map(|p| p.to_string_lossy().to_string()),
        "draftedAt": now_ms,
    });

    atomic_write(&sdeck_path, &built.bytes)?;
    atomic_write(
        &meta_json_path,
        serde_json::to_string_pretty(&meta_data)
            .map_err(|e| AppError::Custom(e.to_string()))?
            .as_bytes(),
    )?;

    Ok(json!({ "ok": true, "draftId": draft_id }))
}

pub fn delete_draft(drafts_dir: &Path, meta_id: &str) -> AppResult<Value> {
    if meta_id.trim().is_empty() {
        return Ok(json!({ "ok": true }));
    }
    let draft_id = sanitize_draft_id(meta_id);
    let _ = fs::remove_file(drafts_dir.join(format!("{draft_id}.sdeck")));
    let _ = fs::remove_file(drafts_dir.join(format!("{draft_id}.json")));
    Ok(json!({ "ok": true }))
}

pub fn list_drafts(drafts_dir: &Path) -> AppResult<Vec<Value>> {
    let _ = fs::create_dir_all(drafts_dir);
    let entries = match fs::read_dir(drafts_dir) {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };

    let mut list = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let sdeck_path = p.with_extension("sdeck");
        if !sdeck_path.is_file() {
            continue;
        }

        let content = match fs::read_to_string(&p) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let mut data: Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let mut orig_changed = false;
        if let Some(orig_file_str) = data.get("origFile").and_then(|v| v.as_str()) {
            let orig_path = Path::new(orig_file_str);
            if let Ok(orig_meta) = fs::metadata(orig_path) {
                let orig_mtime = orig_meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);
                let drafted_at = data.get("draftedAt").and_then(|v| v.as_u64()).unwrap_or(0);
                if orig_mtime > drafted_at {
                    orig_changed = true;
                }
            }
        }

        if let Some(obj) = data.as_object_mut() {
            obj.insert(
                "sdeckPath".to_string(),
                json!(sdeck_path.to_string_lossy().to_string()),
            );
            obj.insert("origChanged".to_string(), json!(orig_changed));
        }

        list.push(data);
    }

    list.sort_by(|a, b| {
        let t_a = a.get("draftedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        let t_b = b.get("draftedAt").and_then(|v| v.as_u64()).unwrap_or(0);
        t_b.cmp(&t_a)
    });

    Ok(list)
}

pub fn load_draft(drafts_dir: &Path, draft_id: &str, state: &AppState) -> AppResult<Value> {
    let clean_id = sanitize_draft_id(draft_id);
    let sdeck_path = drafts_dir.join(format!("{clean_id}.sdeck"));
    let meta_json_path = drafts_dir.join(format!("{clean_id}.json"));

    let orig_file: Option<String> = if meta_json_path.is_file() {
        fs::read_to_string(&meta_json_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .and_then(|v| {
                v.get("origFile")
                    .and_then(|f| f.as_str())
                    .map(|s| s.to_string())
            })
    } else {
        None
    };

    let mut res = open_one(&sdeck_path.to_string_lossy(), state);
    if res.get("ok").and_then(|v| v.as_bool()) == Some(true) {
        if let Some(ref orig) = orig_file {
            if let Some(deck_key) = res.get("deckKey").and_then(|v| v.as_str()) {
                if let Some(mut pkg) = state.package_store.get(deck_key) {
                    pkg.file = Some(std::path::PathBuf::from(orig));
                    state.package_store.set(deck_key.to_string(), pkg);
                }
            }
            if let Some(obj) = res.as_object_mut() {
                obj.insert("origFile".to_string(), json!(orig));
            }
        }
    }

    Ok(res)
}
