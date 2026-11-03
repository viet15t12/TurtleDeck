// src-tauri/src/services/asset_protocol.rs — Giao thức tuỳ chỉnh asset:// phục vụ ảnh từ gói .sdeck
use crate::services::package_store::{is_image_entry, PackageStore};
use std::sync::Arc;
use tauri::http::{Request, Response, StatusCode};

pub fn mime_type_for_path(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else {
        "application/octet-stream"
    }
}

pub fn handle_asset_request(
    package_store: &Arc<PackageStore>,
    req: &Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = req.uri();

    // Lấy host (deckKey)
    let deck_key = match uri.host() {
        Some(h) if !h.is_empty() => h,
        _ => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(b"Missing deckKey in asset URL".to_vec())
                .unwrap();
        }
    };

    let path_raw = uri.path();

    // Chặn path traversal (.., %2e%2e)
    if path_raw.contains("..") || path_raw.contains("%2e") || path_raw.contains("%2E") {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(b"Invalid path traversal".to_vec())
            .unwrap();
    }

    // Bỏ dấu gạch chéo đầu
    let decoded_path = match urlencoding_decode(path_raw) {
        Some(p) => p,
        None => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(b"Invalid URI encoding".to_vec())
                .unwrap();
        }
    };
    let rel_path = decoded_path.trim_start_matches('/');

    // Chặn deck.json và các file không phải ảnh
    if rel_path == "deck.json" || !is_image_entry(rel_path) {
        return Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(b"Not a valid image path".to_vec())
            .unwrap();
    }

    let pkg = match package_store.get(deck_key) {
        Some(p) => p,
        None => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(b"Deck not found".to_vec())
                .unwrap();
        }
    };

    let asset_bytes = match pkg.assets.get(rel_path) {
        Some(b) => b.clone(),
        None => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(b"Asset not found".to_vec())
                .unwrap();
        }
    };

    let content_type = mime_type_for_path(rel_path);

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("X-Content-Type-Options", "nosniff")
        .header(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        )
        .body(asset_bytes)
        .unwrap()
}

// Giải mã URL component thủ công an toàn
fn urlencoding_decode(s: &str) -> Option<String> {
    let mut bytes = Vec::new();
    let mut chars = s.as_bytes().iter();
    while let Some(&b) = chars.next() {
        if b == b'%' {
            let h1 = *chars.next()?;
            let h2 = *chars.next()?;
            let hex_bytes = [h1, h2];
            let hex_str = std::str::from_utf8(&hex_bytes).ok()?;
            let val = u8::from_str_radix(hex_str, 16).ok()?;
            bytes.push(val);
        } else {
            bytes.push(b);
        }
    }
    String::from_utf8(bytes).ok()
}
