// tests/asset_and_library_test.rs — Kiểm thử giao thức asset://, quản lý asset và quét thư viện
use std::collections::HashMap;
use std::fs;
use std::sync::{Arc, RwLock};
use tauri::http::{Request, StatusCode};
use turtle_deck_lib::services::asset_protocol::handle_asset_request;
use turtle_deck_lib::services::asset_service::{add_asset_bytes, list_assets, remove_asset};
use turtle_deck_lib::services::library_service::scan_library;
use turtle_deck_lib::services::package_store::{write_package, OpenPackage, PackageStore};

#[test]
fn test_asset_protocol_security_and_content_delivery() {
    let store = Arc::new(PackageStore::new());
    let deck_key = "a1b2c3d4e5f6";

    let png_data = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    let mut assets = HashMap::new();
    assets.insert("img/photo.png".to_string(), png_data.clone());

    store.set(
        deck_key.to_string(),
        OpenPackage {
            file: None,
            assets,
            source_dir: None,
        },
    );

    // 1. Yêu cầu hợp lệ: asset://a1b2c3d4e5f6/img/photo.png
    let req = Request::builder()
        .uri(format!("asset://{deck_key}/img/photo.png"))
        .body(vec![])
        .unwrap();

    let res = handle_asset_request(&store, &req);
    assert_eq!(res.status(), StatusCode::OK);
    assert_eq!(res.headers().get("Content-Type").unwrap(), "image/png");
    assert!(res
        .headers()
        .get("Content-Security-Policy")
        .unwrap()
        .to_str()
        .unwrap()
        .contains("sandbox"));
    assert_eq!(res.body(), &png_data);

    // 2. Chặn truy cập deck.json qua giao thức asset://
    let req_deck_json = Request::builder()
        .uri(format!("asset://{deck_key}/deck.json"))
        .body(vec![])
        .unwrap();
    let res_deck_json = handle_asset_request(&store, &req_deck_json);
    assert_eq!(res_deck_json.status(), StatusCode::NOT_FOUND);

    // 3. Chặn tấn công path traversal (..)
    let req_traversal = Request::builder()
        .uri(format!("asset://{deck_key}/img/../../etc/passwd"))
        .body(vec![])
        .unwrap();
    let res_traversal = handle_asset_request(&store, &req_traversal);
    assert_eq!(res_traversal.status(), StatusCode::NOT_FOUND);

    // 4. Chặn đường dẫn lạ / không tồn tại
    let req_missing = Request::builder()
        .uri(format!("asset://{deck_key}/img/missing.png"))
        .body(vec![])
        .unwrap();
    let res_missing = handle_asset_request(&store, &req_missing);
    assert_eq!(res_missing.status(), StatusCode::NOT_FOUND);
}

#[test]
fn test_asset_service_operations() {
    let store = PackageStore::new();
    let deck_key = "deck-123";

    store.set(
        deck_key.to_string(),
        OpenPackage {
            file: None,
            assets: HashMap::new(),
            source_dir: None,
        },
    );

    let png_data = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];

    // Thêm ảnh bytes hợp lệ
    let add_res = add_asset_bytes(&store, deck_key, "avatar.png", &png_data).expect("add bytes");
    assert_eq!(add_res["ok"], true);
    assert_eq!(add_res["path"], "img/avatar.png");

    // Thử thêm byte không phải ảnh
    let err_res = add_asset_bytes(&store, deck_key, "bad.txt", b"plain text");
    assert!(err_res.is_err());

    // Liệt kê
    let list = list_assets(&store, deck_key);
    assert_eq!(list, vec!["img/avatar.png"]);

    // Xoá
    let rem_res = remove_asset(&store, deck_key, "img/avatar.png").expect("remove asset");
    assert_eq!(rem_res["ok"], true);
    assert!(list_assets(&store, deck_key).is_empty());
}

#[test]
fn test_library_scan_and_cache() {
    let tmp_dir = std::env::temp_dir().join(format!("turtle_lib_test_{}", uuid::Uuid::new_v4()));
    let sub_dir = tmp_dir.join("Tiếng Anh");
    fs::create_dir_all(&sub_dir).unwrap();

    let deck_json = serde_json::json!({
        "meta": {
            "id": "deck-eng-1",
            "title": "Từ vựng Unit 1"
        },
        "items": [
            { "id": "q1", "type": "card", "front": "hello", "back": "xin chào" }
        ]
    });

    let pkg_bytes = write_package(&deck_json.to_string(), &HashMap::new(), false)
        .unwrap()
        .bytes;
    let sdeck_path = sub_dir.join("unit-1.sdeck");
    fs::write(&sdeck_path, &pkg_bytes).unwrap();

    // Tạo các file cần bỏ qua
    fs::write(sub_dir.join("ignore.bak"), b"bak").unwrap();
    fs::write(sub_dir.join("ignore.tmp"), b"tmp").unwrap();
    fs::write(sub_dir.join(".hidden.sdeck"), b"hidden").unwrap();

    let cache = RwLock::new(HashMap::new());

    // Quét lần 1 (chưa có cache)
    let decks_1 = scan_library(&tmp_dir, &cache);
    assert_eq!(decks_1.len(), 1);
    assert_eq!(decks_1[0]["ok"], true);
    assert_eq!(decks_1[0]["deck"]["meta"]["id"], "deck-eng-1");
    assert_eq!(decks_1[0]["group"], "Tiếng Anh");
    assert_eq!(decks_1[0]["total"], 1);

    // Quét lần 2 (nạp từ cache theo mtime + size)
    let decks_2 = scan_library(&tmp_dir, &cache);
    assert_eq!(decks_2.len(), 1);
    assert_eq!(decks_2[0]["deck"]["meta"]["id"], "deck-eng-1");

    let _ = fs::remove_dir_all(&tmp_dir);
}
