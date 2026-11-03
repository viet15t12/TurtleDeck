// tests/sdeck_package_test.rs — Kiểm thử đóng gói, giải nén .sdeck, an toàn ZIP và slugify
use serde_json::json;
use std::collections::HashMap;
use turtle_deck_lib::services::package_store::{
    detect_image_type, is_image_entry, is_safe_entry, read_package, read_package_meta, slugify,
    write_package,
};

#[test]
fn test_slugify_vietnamese_and_special_chars() {
    assert_eq!(
        slugify("Bộ Thẻ Tiếng Anh Lớp 10"),
        "bo-the-tieng-anh-lop-10"
    );
    assert_eq!(
        slugify("Động Từ Bất Quy Tắc (Irregular Verbs)"),
        "dong-tu-bat-quy-tac-irregular-verbs"
    );
    assert_eq!(slugify("   ---   "), "bo-the-moi");
    assert_eq!(slugify("Toán & Khoa Học @ 2026!"), "toan-khoa-hoc-2026");
}

#[test]
fn test_safe_entry_and_image_detection() {
    assert!(is_safe_entry("deck.json"));
    assert!(is_safe_entry("img/card1.png"));
    assert!(!is_safe_entry("/etc/passwd"));
    assert!(!is_safe_entry("../deck.json"));
    assert!(!is_safe_entry("img/../evil.png"));
    assert!(!is_safe_entry("img\\card.png"));

    assert!(is_image_entry("img/card.png"));
    assert!(is_image_entry("img/photo.jpeg"));
    assert!(is_image_entry("img/photo.webp"));
    assert!(is_image_entry("img/vector.svg"));
    assert!(!is_image_entry("deck.json"));
    assert!(!is_image_entry("img/script.sh"));

    // PNG magic bytes
    let png_bytes = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    assert_eq!(detect_image_type(&png_bytes), Some("png"));

    // JPG magic bytes
    let jpg_bytes = [0xff, 0xd8, 0xff, 0xe0];
    assert_eq!(detect_image_type(&jpg_bytes), Some("jpg"));

    // GIF magic bytes
    let gif_bytes = b"GIF89a\x01\x00";
    assert_eq!(detect_image_type(gif_bytes), Some("gif"));

    // SVG
    let svg_bytes = b"<?xml version=\"1.0\"?><svg width=\"100\"></svg>";
    assert_eq!(detect_image_type(svg_bytes), Some("svg"));

    // Non-image
    assert_eq!(detect_image_type(b"Hello world!"), None);
}

#[test]
fn test_write_and_read_package_roundtrip_with_prune() {
    let png_asset = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    let mut assets = HashMap::new();
    assets.insert("img/used.png".to_string(), png_asset.clone());
    assets.insert("img/unused.png".to_string(), png_asset.clone());

    let deck_json = json!({
        "meta": {
            "id": "deck-test-1",
            "title": "Bộ thẻ kiểm thử"
        },
        "items": [
            {
                "id": "item-1",
                "type": "card",
                "front": "Câu hỏi kèm ảnh ![ảnh](img/used.png)",
                "back": "Đáp án"
            }
        ]
    });

    // 1. Đóng gói với prune = true (chỉ giữ used.png)
    let write_res = write_package(&deck_json.to_string(), &assets, true).expect("write package");
    assert!(write_res.kept_assets.contains_key("img/used.png"));
    assert!(!write_res.kept_assets.contains_key("img/unused.png"));

    // 2. Đọc nhanh riêng metadata deck.json
    let meta_text = read_package_meta(&write_res.bytes).expect("read meta");
    let meta_parsed: serde_json::Value = serde_json::from_str(&meta_text).unwrap();
    assert_eq!(meta_parsed["meta"]["id"], "deck-test-1");
    assert_eq!(meta_parsed["meta"]["format"], "studydeck");
    assert_eq!(meta_parsed["meta"]["formatVersion"], 1);

    // 3. Đọc toàn bộ gói
    let read_res = read_package(&write_res.bytes).expect("read package");
    assert_eq!(read_res.assets.len(), 1);
    assert!(read_res.assets.contains_key("img/used.png"));
    assert_eq!(read_res.assets.get("img/used.png").unwrap(), &png_asset);
}
