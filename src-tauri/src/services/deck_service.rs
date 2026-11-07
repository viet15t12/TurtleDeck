// src-tauri/src/services/deck_service.rs — Quản lý mở, đọc, lưu và nén các file .sdeck
use crate::error::{AppError, AppResult};
use crate::services::package_store::{
    atomic_write, backup_file, read_package, slugify, write_package, OpenPackage, LIMITS_TOTAL,
};
use crate::state::AppState;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub fn validate_sdeck_path(p: &str) -> Option<PathBuf> {
    if p.trim().is_empty() {
        return None;
    }
    let path = PathBuf::from(p);
    if !path.to_string_lossy().to_lowercase().ends_with(".sdeck") {
        return None;
    }
    if let Ok(real) = fs::canonicalize(&path) {
        if real.is_file() {
            return Some(real);
        }
    }
    None
}

pub fn open_one(p: &str, state: &AppState) -> Value {
    if p.trim().is_empty() {
        return json!({
            "path": p,
            "ok": false,
            "error": "Đường dẫn không hợp lệ.",
            "issues": [{ "level": "error", "msg": "Đường dẫn không hợp lệ." }]
        });
    }

    let file_path = PathBuf::from(p);
    let resolved = fs::canonicalize(&file_path).unwrap_or_else(|_| file_path.clone());
    let path_str = resolved.to_string_lossy().to_string();

    let fail = |error: &str, extra: Option<Value>| -> Value {
        let mut base = json!({
            "path": path_str,
            "ok": false,
            "error": error,
            "issues": [{ "level": "error", "msg": error }]
        });
        if let Some(Value::Object(map)) = extra {
            for (k, v) in map {
                base.as_object_mut().unwrap().insert(k, v);
            }
        }
        base
    };

    if !path_str.to_lowercase().ends_with(".sdeck") {
        return fail("Chỉ mở được file bộ thẻ có đuôi .sdeck.", None);
    }

    let meta = match fs::metadata(&resolved) {
        Ok(m) => m,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                return fail(
                    "File không còn tồn tại (đã bị xoá hoặc di chuyển).",
                    Some(json!({ "missing": true })),
                );
            }
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                return fail("Không có quyền đọc file.", None);
            }
            return fail(&format!("Không đọc được file: {e}"), None);
        }
    };

    if !meta.is_file() {
        return fail("Đường dẫn không phải là file.", None);
    }

    if meta.len() > LIMITS_TOTAL {
        return fail("File quá lớn (hơn 500 MB).", None);
    }

    let bytes = match fs::read(&resolved) {
        Ok(b) => b,
        Err(e) => return fail(&format!("Không đọc được file: {e}"), None),
    };

    let pkg = match read_package(&bytes) {
        Ok(p) => p,
        Err(e) => return fail(&e.to_string(), None),
    };

    let deck: Value = match serde_json::from_str(&pkg.deck_text) {
        Ok(d) => d,
        Err(e) => return fail(&format!("deck.json không hợp lệ: {e}"), None),
    };

    let total = deck
        .get("items")
        .and_then(|i| i.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let deck_key = state.package_store.new_key();
    let asset_count = pkg.assets.len();

    state.package_store.set(
        deck_key.clone(),
        OpenPackage {
            file: Some(resolved.clone()),
            assets: pkg.assets,
            source_dir: None,
        },
    );

    // Đồng bộ vào cache SQLite (nếu có id)
    if let Some(_deck_id) = deck
        .get("meta")
        .and_then(|m| m.get("id"))
        .and_then(|v| v.as_str())
    {
        let p_str = resolved.to_string_lossy().to_string();
        let _ = state.with_db_mut(|conn| {
            crate::db::repositories::deck::DeckRepository::sync_deck(conn, &deck, Some(&p_str))
                .map(|_| ())
        });
    }

    // Watch thư mục chứa file
    if let Some(parent) = resolved.parent() {
        if let Ok(lock) = state.watcher.lock() {
            if let Some(w) = lock.as_ref() {
                w.watch_path(parent);
            }
        }
    }

    let issues_val: Vec<Value> = pkg
        .issues
        .into_iter()
        .map(|msg| json!({ "level": "warn", "msg": msg }))
        .collect();

    json!({
        "path": path_str,
        "ok": true,
        "deckKey": deck_key,
        "deckText": pkg.deck_text,
        "deck": deck,
        "issues": issues_val,
        "total": total,
        "skipped": 0,
        "assetCount": asset_count,
    })
}

pub fn save_deck(
    state: &AppState,
    deck_key: &str,
    deck_text: &str,
    target_file: Option<PathBuf>,
    prune_unused: bool,
) -> AppResult<Value> {
    let mut pkg = state
        .package_store
        .get(deck_key)
        .ok_or_else(|| AppError::Custom("Bộ thẻ không còn mở.".into()))?;

    let file = target_file
        .or_else(|| pkg.file.clone())
        .ok_or_else(|| AppError::Custom("Chưa có đường dẫn đích để lưu.".into()))?;

    let built = write_package(deck_text, &pkg.assets, prune_unused)?;

    // Kiểm tra tính hợp lệ bằng cách đọc lại gói vừa nén
    let check = read_package(&built.bytes).map_err(|e| {
        AppError::Custom(format!(
            "Gói vừa nén không đọc lại được, chưa ghi file: {e}"
        ))
    })?;

    let parsed_deck: Value = serde_json::from_str(&check.deck_text)
        .map_err(|e| AppError::Custom(format!("deck.json sau khi nén bị hỏng: {e}")))?;

    // Tạo bản sao lưu .bak và ghi nguyên tử
    let _ = backup_file(&file);
    atomic_write(&file, &built.bytes)?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    state.package_store.record_save(&file, now);

    pkg.file = Some(file.clone());
    pkg.assets = built.kept_assets.clone();
    state.package_store.set(deck_key.to_string(), pkg);

    // Watch thư mục cha
    if let Some(parent) = file.parent() {
        if let Ok(lock) = state.watcher.lock() {
            if let Some(w) = lock.as_ref() {
                w.watch_path(parent);
            }
        }
    }

    // Đồng bộ vào DB
    let target_str = file.to_string_lossy().to_string();
    let _ = state.with_db_mut(|conn| {
        crate::db::repositories::deck::DeckRepository::sync_deck(
            conn,
            &parsed_deck,
            Some(&target_str),
        )
        .map(|_| ())
    });

    // Dọn dẹp bản nháp nếu có
    if let Some(deck_id) = parsed_deck
        .get("meta")
        .and_then(|m| m.get("id"))
        .and_then(|v| v.as_str())
    {
        let safe_id = slugify(deck_id);
        let draft_sdeck = state.paths.drafts_dir.join(format!("{safe_id}.sdeck"));
        let draft_json = state.paths.drafts_dir.join(format!("{safe_id}.json"));
        let _ = fs::remove_file(draft_sdeck);
        let _ = fs::remove_file(draft_json);
    }

    let total = parsed_deck
        .get("items")
        .and_then(|i| i.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let issues_val: Vec<Value> = check
        .issues
        .into_iter()
        .map(|msg| json!({ "level": "warn", "msg": msg }))
        .collect();

    Ok(json!({
        "ok": true,
        "path": file.to_string_lossy(),
        "deckText": check.deck_text,
        "deck": parsed_deck,
        "issues": issues_val,
        "total": total,
        "skipped": 0,
        "assetCount": built.kept_assets.len(),
    }))
}

pub fn import_sdeck(
    state: &AppState,
    file_paths: &[String],
    target_folder_id: Option<String>,
) -> AppResult<Value> {
    let target_dir = state.get_active_library_dir();
    let _ = fs::create_dir_all(&target_dir);
    let norm_folder =
        crate::db::repositories::folder::normalize_folder_id(target_folder_id.as_deref());

    let mut imported = Vec::new();

    for src_path in file_paths {
        let p = Path::new(src_path);
        let bytes = match fs::read(p) {
            Ok(b) => b,
            Err(_) => continue,
        };

        let deck_text = match crate::services::package_store::read_package_meta(&bytes) {
            Ok(t) => t,
            Err(_) => continue,
        };

        let deck: Value = match serde_json::from_str(&deck_text) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let deck_id = match deck
            .get("meta")
            .and_then(|m| m.get("id"))
            .and_then(|v| v.as_str())
        {
            Some(id) => id.to_string(),
            None => continue,
        };

        let title = deck
            .get("meta")
            .and_then(|m| m.get("title"))
            .and_then(|v| v.as_str())
            .unwrap_or_else(|| p.file_stem().and_then(|s| s.to_str()).unwrap_or("bo-the"));

        let base_slug = slugify(title);
        let mut dest_filename = format!("{base_slug}.sdeck");
        let mut dest_path = target_dir.join(&dest_filename);
        let mut counter = 1;

        while dest_path.exists() {
            dest_filename = format!("{base_slug} ({counter}).sdeck");
            dest_path = target_dir.join(&dest_filename);
            counter += 1;
        }

        if atomic_write(&dest_path, &bytes).is_ok() {
            let dest_str = dest_path.to_string_lossy().to_string();
            let _ = state.with_db_mut(|conn| {
                let _ = crate::db::repositories::deck::DeckRepository::sync_deck(
                    conn,
                    &deck,
                    Some(&dest_str),
                );
                if norm_folder.is_some() {
                    let _ =
                        crate::db::repositories::deck_location::DeckLocationRepository::move_deck(
                            conn,
                            &deck_id,
                            norm_folder.as_deref(),
                        );
                }
                Ok(())
            });

            imported.push(json!({
                "deckId": deck_id,
                "title": title,
                "path": dest_str,
            }));
        }
    }

    Ok(json!({
        "ok": true,
        "importedCount": imported.len(),
        "decks": imported,
    }))
}

pub fn delete_deck(
    state: &AppState,
    deck_key: Option<&str>,
    deck_id: Option<&str>,
    file_path: Option<&str>,
    delete_file: bool,
) -> AppResult<Value> {
    if let Some(key) = deck_key {
        state.package_store.delete(key);
    }

    let mut resolved_deck_id = deck_id.map(|s| s.to_string());
    if resolved_deck_id.is_none() {
        if let Some(fp) = file_path {
            if !fp.trim().is_empty() {
                let _ = state.with_db_mut(|conn| {
                    if let Ok(Some(did)) = crate::db::repositories::deck::DeckRepository::remove_deck_by_file_path(conn, fp) {
                        resolved_deck_id = Some(did);
                    }
                    Ok(())
                });
            }
        }
    }

    if let Some(ref did) = resolved_deck_id {
        let _ = state.with_db_mut(|conn| {
            crate::db::repositories::deck::DeckRepository::delete_deck(conn, did)
        });

        let safe_id = slugify(did);
        let draft_sdeck = state.paths.drafts_dir.join(format!("{safe_id}.sdeck"));
        let draft_json = state.paths.drafts_dir.join(format!("{safe_id}.json"));
        let _ = fs::remove_file(draft_sdeck);
        let _ = fs::remove_file(draft_json);
    }

    if let Some(fp) = file_path {
        if !fp.trim().is_empty() {
            let path = PathBuf::from(fp);
            let resolved = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
            let lib_dir = state.get_active_library_dir();
            let norm_lib = fs::canonicalize(&lib_dir).unwrap_or_else(|_| lib_dir.clone());
            let in_library = resolved.starts_with(&norm_lib);

            if in_library || delete_file {
                if resolved.exists() || resolved.is_symlink() {
                    let _ = fs::remove_file(&resolved);
                }
                let bak = resolved.with_extension("sdeck.bak");
                if bak.exists() {
                    let _ = fs::remove_file(bak);
                }
            }

            if let Ok(mut cache) = state.library_cache.write() {
                cache.remove(&resolved);
            }
        }
    }

    Ok(json!({ "ok": true }))
}

