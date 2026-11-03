// src-tauri/src/commands/deck.rs — Các IPC commands xử lý gói thẻ (.sdeck)
use crate::error::{AppError, AppResult};
use crate::services::deck_service::{
    import_sdeck as do_import_sdeck, open_one, save_deck as do_save_deck, validate_sdeck_path,
};
use crate::services::package_store::{
    detect_image_type, is_image_entry, slugify, OpenPackage, LIMITS_IMAGE,
};
use crate::state::AppState;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn deck_open(
    app: AppHandle,
    state: State<'_, AppState>,
    file_path: Option<Value>,
) -> AppResult<Vec<Value>> {
    let mut paths: Vec<String> = Vec::new();

    if let Some(val) = file_path {
        match val {
            Value::String(s) if !s.trim().is_empty() => {
                paths.push(s);
            }
            Value::Array(arr) => {
                for item in arr {
                    if let Some(s) = item.as_str() {
                        if !s.trim().is_empty() {
                            paths.push(s.to_string());
                        }
                    }
                }
            }
            Value::Object(map) => {
                if let Some(fp) = map.get("filePath") {
                    if let Some(s) = fp.as_str() {
                        if !s.trim().is_empty() {
                            paths.push(s.to_string());
                        }
                    } else if let Some(arr) = fp.as_array() {
                        for item in arr {
                            if let Some(s) = item.as_str() {
                                if !s.trim().is_empty() {
                                    paths.push(s.to_string());
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if paths.is_empty() {
        let picked = app
            .dialog()
            .file()
            .set_title("Mở bộ thẻ")
            .add_filter("Bộ thẻ (.sdeck)", &["sdeck"])
            .blocking_pick_files();

        if let Some(files) = picked {
            for f in files {
                paths.push(f.to_string());
            }
        }
    }

    if paths.is_empty() {
        return Ok(vec![]);
    }

    let mut out = Vec::new();
    for p in paths {
        out.push(open_one(&p, &state));
    }

    Ok(out)
}

#[tauri::command]
pub async fn deck_new(state: State<'_, AppState>) -> AppResult<Value> {
    let deck_key = state.package_store.new_key();
    state.package_store.set(
        deck_key.clone(),
        OpenPackage {
            file: None,
            assets: HashMap::new(),
            source_dir: None,
        },
    );
    Ok(json!({ "ok": true, "deckKey": deck_key }))
}

#[tauri::command]
pub async fn deck_save(
    app: AppHandle,
    state: State<'_, AppState>,
    deck_key: String,
    deck_text: Option<String>,
    file_path: Option<String>,
    save_as: Option<bool>,
    prune_unused: Option<bool>,
) -> AppResult<Value> {
    let pkg = state
        .package_store
        .get(&deck_key)
        .ok_or_else(|| AppError::Custom("Bộ thẻ không còn mở.".into()))?;

    let is_save_as = save_as.unwrap_or(false);
    let mut target = if is_save_as {
        None
    } else {
        file_path.map(PathBuf::from).or_else(|| pkg.file.clone())
    };

    if target.is_none() {
        let lib_dir = state.get_active_library_dir();
        let base_dir = pkg
            .file
            .as_ref()
            .and_then(|f| f.parent())
            .unwrap_or(&lib_dir);

        let title = deck_text
            .as_deref()
            .and_then(|t| serde_json::from_str::<Value>(t).ok())
            .and_then(|d| {
                d.get("meta")
                    .and_then(|m| m.get("title"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| "bo-the".to_string());

        let default_name = format!("{}.sdeck", slugify(&title));

        let picked = app
            .dialog()
            .file()
            .set_title("Lưu thành .sdeck")
            .set_directory(base_dir)
            .set_file_name(&default_name)
            .add_filter("Bộ thẻ (.sdeck)", &["sdeck"])
            .blocking_save_file();

        match picked {
            Some(f) => {
                let mut path_str = f.to_string();
                if !path_str.to_lowercase().ends_with(".sdeck") {
                    path_str.push_str(".sdeck");
                }
                target = Some(PathBuf::from(path_str));
            }
            None => {
                return Ok(json!({ "ok": false, "canceled": true }));
            }
        }
    }

    let text = deck_text.unwrap_or_default();
    do_save_deck(
        &state,
        &deck_key,
        &text,
        target,
        prune_unused.unwrap_or(true),
    )
}

#[tauri::command]
pub async fn deck_close(state: State<'_, AppState>, deck_key: String) -> AppResult<bool> {
    Ok(state.package_store.delete(&deck_key))
}

#[tauri::command]
pub async fn deck_duplicate(
    state: State<'_, AppState>,
    old_deck_key: String,
) -> AppResult<Value> {
    let old_pkg = state.package_store.get(&old_deck_key);
    let new_deck_key = state.package_store.new_key();

    let mut new_assets = HashMap::new();
    if let Some(pkg) = old_pkg {
        for (k, v) in pkg.assets {
            new_assets.insert(k, v.clone());
        }
    }

    let asset_count = new_assets.len();
    state.package_store.set(
        new_deck_key.clone(),
        OpenPackage {
            file: None,
            assets: new_assets,
            source_dir: None,
        },
    );

    Ok(json!({
        "ok": true,
        "deckKey": new_deck_key,
        "assetCount": asset_count,
    }))
}

#[tauri::command]
pub async fn deck_export_copy(
    app: AppHandle,
    _state: State<'_, AppState>,
    file_path: String,
) -> AppResult<Value> {
    let valid = validate_sdeck_path(&file_path)
        .ok_or_else(|| AppError::Custom("Bộ thẻ chưa có file trên đĩa hoặc đường dẫn không hợp lệ.".into()))?;

    let default_name = valid
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("bo-the.sdeck");

    let picked = app
        .dialog()
        .file()
        .set_title("Xuất bản sao bộ thẻ (giữ nguyên mã bộ thẻ)")
        .set_file_name(default_name)
        .add_filter("Bộ thẻ (.sdeck)", &["sdeck"])
        .blocking_save_file();

    let dest_str = match picked {
        Some(f) => {
            let mut s = f.to_string();
            if !s.to_lowercase().ends_with(".sdeck") {
                s.push_str(".sdeck");
            }
            s
        }
        None => return Ok(json!({ "ok": false, "canceled": true })),
    };

    let bytes = fs::read(&valid)
        .map_err(|e| AppError::Custom(format!("Không thể đọc file nguồn: {e}")))?;

    crate::services::package_store::atomic_write(Path::new(&dest_str), &bytes)
        .map_err(|e| AppError::Custom(format!("Không thể xuất bản sao: {e}")))?;

    Ok(json!({ "ok": true, "path": dest_str }))
}

#[tauri::command]
pub async fn deck_show_in_folder(
    _state: State<'_, AppState>,
    file_path: String,
) -> AppResult<bool> {
    let valid = match validate_sdeck_path(&file_path) {
        Some(p) => p,
        None => return Ok(false),
    };

    let target_dir = valid.parent().unwrap_or(&valid);

    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", valid.to_string_lossy()))
            .spawn();
    }

    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(target_dir)
            .spawn();
    }

    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open")
            .arg("-R")
            .arg(&valid)
            .spawn();
    }

    Ok(true)
}

#[tauri::command]
pub async fn deck_import(
    app: AppHandle,
    state: State<'_, AppState>,
    kind: Option<String>,
) -> AppResult<Value> {
    let is_dir_pick = kind.as_deref() == Some("dir");

    let picked = if is_dir_pick {
        app.dialog()
            .file()
            .set_title("Chọn thư mục chứa deck.json (và img/)")
            .blocking_pick_folder()
            .map(|f| f.to_string())
    } else {
        app.dialog()
            .file()
            .set_title("Chọn file nguồn bộ thẻ")
            .add_filter("Nguồn bộ thẻ", &["json", "csv", "tsv", "txt", "md"])
            .blocking_pick_file()
            .map(|f| f.to_string())
    };

    let src_str = match picked {
        Some(s) => s,
        None => return Ok(Value::Null),
    };

    let src_path = PathBuf::from(&src_str);
    let is_dir = src_path.is_dir();
    let target_file = if is_dir {
        src_path.join("deck.json")
    } else {
        src_path.clone()
    };

    if !target_file.exists() {
        return Err(AppError::Custom(if is_dir {
            "Thư mục này không có deck.json.".into()
        } else {
            "Không tìm thấy file.".into()
        }));
    }

    let dir = if is_dir {
        src_path.clone()
    } else {
        src_path.parent().unwrap_or(&src_path).to_path_buf()
    };

    // Đọc target file
    let content = fs::read_to_string(&target_file)
        .map_err(|e| AppError::Custom(format!("Không đọc được file: {e}")))?;

    // Nếu là file json
    if target_file.extension().and_then(|e| e.to_str()).unwrap_or("") == "json" {
        let deck: Value = serde_json::from_str(&content)
            .map_err(|e| AppError::Custom(format!("deck.json không hợp lệ: {e}")))?;

        let mut assets = HashMap::new();
        let img_dir = dir.join("img");
        if img_dir.is_dir() {
            if let Ok(entries) = fs::read_dir(&img_dir) {
                for ent in entries.flatten() {
                    let p = ent.path();
                    if p.is_file() {
                        let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        let key = format!("img/{name}");
                        if is_image_entry(&key) {
                            if let Ok(bytes) = fs::read(&p) {
                                if bytes.len() as u64 <= LIMITS_IMAGE
                                    && detect_image_type(&bytes).is_some()
                                {
                                    assets.insert(key, bytes);
                                }
                            }
                        }
                    }
                }
            }
        }

        let total = deck
            .get("items")
            .and_then(|i| i.as_array())
            .map(|a| a.len())
            .unwrap_or(0);

        let deck_key = state.package_store.new_key();
        let asset_count = assets.len();

        state.package_store.set(
            deck_key.clone(),
            OpenPackage {
                file: None,
                assets,
                source_dir: Some(dir),
            },
        );

        return Ok(json!({
            "ok": true,
            "source": src_str,
            "deckKey": deck_key,
            "deckText": content,
            "deck": deck,
            "issues": [],
            "total": total,
            "skipped": 0,
            "assetCount": asset_count,
        }));
    }

    // Nếu là file văn bản (csv, tsv, md...) — trả về chuỗi text để frontend parse
    let title = target_file
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("bo-the-moi")
        .to_string();

    let deck_id = format!("deck-{}", &uuid::Uuid::new_v4().to_string().replace('-', "")[..8]);
    let deck_key = state.package_store.new_key();

    state.package_store.set(
        deck_key.clone(),
        OpenPackage {
            file: None,
            assets: HashMap::new(),
            source_dir: Some(dir),
        },
    );

    Ok(json!({
        "ok": true,
        "source": src_str,
        "deckKey": deck_key,
        "rawContent": content,
        "title": title,
        "deckId": deck_id,
        "total": 0,
        "skipped": 0,
        "assetCount": 0,
    }))
}

#[tauri::command]
pub async fn deck_import_sdeck(
    app: AppHandle,
    state: State<'_, AppState>,
    file_paths: Option<Vec<String>>,
    target_folder_id: Option<String>,
) -> AppResult<Value> {
    let mut paths = file_paths.unwrap_or_default();

    if paths.is_empty() {
        let picked = app
            .dialog()
            .file()
            .set_title("Nhập bộ thẻ (.sdeck) vào hệ thống lưu trữ ứng dụng")
            .add_filter("Bộ thẻ (.sdeck)", &["sdeck"])
            .blocking_pick_files();

        if let Some(files) = picked {
            for f in files {
                paths.push(f.to_string());
            }
        }
    }

    if paths.is_empty() {
        return Ok(json!({ "ok": false, "canceled": true }));
    }

    do_import_sdeck(&state, &paths, target_folder_id)
}

#[tauri::command]
pub async fn deck_query_items(
    state: State<'_, AppState>,
    params: crate::db::repositories::deck::QueryItemsParams,
) -> AppResult<crate::db::repositories::deck::QueryItemsResult> {
    state.with_db(|conn| crate::db::repositories::deck::DeckRepository::query_items(conn, &params))
}
