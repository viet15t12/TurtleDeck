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
    let lib_dir = state.get_active_library_dir();
    let mut target_dir = lib_dir.clone();

    if let Some(ref folder_id) = target_folder_id {
        let _ = state.with_db(|conn| {
            if let Ok(Some(f)) =
                crate::db::repositories::folder::FolderRepository::get_folder_by_id(conn, folder_id)
            {
                let parts: Vec<&str> = f.path.split('/').filter(|p| !p.is_empty()).collect();
                let mut dir = lib_dir.clone();
                for p in parts {
                    dir.push(p);
                }
                target_dir = dir;
            }
            Ok(())
        });
    }

    let _ = fs::create_dir_all(&target_dir);

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
                let _ =
                    crate::db::repositories::deck_location::DeckLocationRepository::add_location(
                        conn,
                        &deck_id,
                        target_folder_id.as_deref(),
                        &dest_str,
                        false,
                        None,
                    );
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
