// src-tauri/src/services/asset_service.rs — Quản lý hình ảnh và tập tin đính kèm trong gói thẻ
use crate::error::{AppError, AppResult};
use crate::services::package_store::{detect_image_type, PackageStore, LIMITS_IMAGE};
use serde_json::{json, Value};
use std::fs;
use std::path::Path;

pub fn add_asset_files(
    package_store: &PackageStore,
    deck_key: &str,
    file_paths: &[String],
) -> Vec<Value> {
    if !package_store.has(deck_key) {
        return vec![];
    }

    let mut added = Vec::new();
    for p_str in file_paths {
        let p = Path::new(p_str);
        let meta = match fs::metadata(p) {
            Ok(m) => m,
            Err(_) => continue,
        };
        if meta.len() > LIMITS_IMAGE {
            continue;
        }

        let bytes = match fs::read(p) {
            Ok(b) => b,
            Err(_) => continue,
        };

        if detect_image_type(&bytes).is_none() {
            continue;
        }

        let base = match p.file_name().and_then(|n| n.to_str()) {
            Some(b) => b.to_string(),
            None => continue,
        };

        let key = format!("img/{base}");
        if package_store.add_asset(deck_key, key.clone(), bytes) {
            added.push(json!({
                "path": key,
                "name": base,
            }));
        }
    }

    added
}

pub fn add_asset_bytes(
    package_store: &PackageStore,
    deck_key: &str,
    name: &str,
    bytes: &[u8],
) -> AppResult<Value> {
    if !package_store.has(deck_key) {
        return Err(AppError::Custom("Bộ thẻ không còn mở.".into()));
    }

    if name.is_empty() || bytes.is_empty() {
        return Err(AppError::Custom("Thiếu tên hoặc dữ liệu ảnh.".into()));
    }

    if bytes.len() as u64 > LIMITS_IMAGE {
        return Err(AppError::Custom("Ảnh quá lớn (hơn 5 MB).".into()));
    }

    if detect_image_type(bytes).is_none() {
        return Err(AppError::Custom(
            "Nội dung không phải là ảnh hợp lệ.".into(),
        ));
    }

    let p = Path::new(name);
    let base = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("image.png");

    let key = format!("img/{base}");
    package_store.add_asset(deck_key, key.clone(), bytes.to_vec());

    Ok(json!({
        "ok": true,
        "path": key,
    }))
}

pub fn list_assets(package_store: &PackageStore, deck_key: &str) -> Vec<String> {
    package_store.list_assets(deck_key)
}

pub fn remove_asset(
    package_store: &PackageStore,
    deck_key: &str,
    asset_path: &str,
) -> AppResult<Value> {
    if !package_store.has(deck_key) {
        return Err(AppError::Custom("Bộ thẻ không còn mở.".into()));
    }

    if asset_path.is_empty() {
        return Err(AppError::Custom("Thiếu đường dẫn ảnh cần xoá.".into()));
    }

    let norm = if asset_path.starts_with("img/") {
        asset_path.to_string()
    } else {
        format!("img/{asset_path}")
    };

    if package_store.remove_asset(deck_key, &norm) {
        Ok(json!({ "ok": true }))
    } else {
        Err(AppError::Custom("Không tìm thấy ảnh trong gói.".into()))
    }
}
