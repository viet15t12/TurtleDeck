// tests/sdeck_v2_test.rs — Kiểm thử toàn diện định dạng .sdeck Version 2 và tính tương thích ngược
use rusqlite::Connection;
use serde_json::json;
use std::collections::HashMap;
use turtle_deck_lib::services::package_store::{
    read_package, read_package_meta, write_package, write_package_v2,
};
use turtle_deck_lib::services::sdeck_v2::{
    build_questions_db_bytes, init_deck_db, is_v2_deck, merge_v2_to_unified_items,
    read_questions_db_bytes, split_v1_items_to_v2, DECK_DB_ENTRY, SOLUTIONS_ENTRY,
};

#[test]
fn test_sdeck_v2_schema_and_cascade_delete() {
    let conn = Connection::open_in_memory().expect("open sqlite");
    init_deck_db(&conn).expect("init schema");

    // 1. Thêm bản ghi vào bảng cha items
    conn.execute(
        "INSERT INTO items (id, type, topic, tags_json, image, answer_image, order_index, created_at, updated_at)
         VALUES ('item-card-1', 'card', 'Lịch sử', '[\"su-viet-nam\", \"lop-10\"]', 'img/map.png', NULL, 0, 1000, 1000)",
        [],
    ).expect("insert items");

    // 2. Thêm vào bảng con item_cards
    conn.execute(
        "INSERT INTO item_cards (item_id, front, back) VALUES ('item-card-1', 'Chiến thắng Bạch Đằng năm nào?', 'Năm 938')",
        [],
    ).expect("insert item_cards");

    // 3. Truy vấn view v_deck_items
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM v_deck_items WHERE id = 'item-card-1' AND front = 'Chiến thắng Bạch Đằng năm nào?'",
            [],
            |r| r.get(0),
        )
        .expect("query view");
    assert_eq!(count, 1);

    // 4. Kiểm tra ON DELETE CASCADE: Xóa bảng cha items -> bản ghi bảng con phải tự động bị xóa
    conn.execute("DELETE FROM items WHERE id = 'item-card-1'", [])
        .expect("delete parent");

    let child_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM item_cards WHERE item_id = 'item-card-1'",
            [],
            |r| r.get(0),
        )
        .expect("check child count");
    assert_eq!(
        child_count, 0,
        "Khóa ngoại ON DELETE CASCADE phải xóa tự động bản ghi bảng con"
    );
}

#[test]
fn test_sdeck_v2_vocab_anki_compatibility() {
    let vocab_item = json!({
        "id": "vocab-ubiquitous",
        "type": "vocab",
        "topic": "IELTS Academic",
        "tags": ["ielts", "c1", "band8"],
        "term": "ubiquitous",
        "definition": "present, appearing, or found everywhere",
        "phonetic": "/juːˈbɪk.wɪ.təs/",
        "pos": "adj",
        "example": "Smartphones are ubiquitous in modern society.",
        "exampleMeaning": "Điện thoại thông minh hiện diện ở khắp mọi nơi trong xã hội hiện đại.",
        "audio": "audio/ubiquitous.mp3",
        "forms": ["ubiquity", "ubiquitously"],
        "synonyms": ["omnipresent", "pervasive"],
        "antonyms": ["rare", "scarce"],
        "ankiGuid": "uB1qUiT0uS",
        "ankiNoteId": 1730001234567i64,
        "explanation": "Từ bắt nguồn từ tiếng Latin 'ubique' có nghĩa là 'khắp mọi nơi'."
    });

    let items = vec![vocab_item];
    let (clean_items, solutions) = split_v1_items_to_v2(&items);

    // Kiểm tra tách lời giải
    assert_eq!(
        clean_items[0].get("explanation"),
        None,
        "clean_items không còn chứa explanation"
    );
    assert_eq!(
        solutions
            .solutions
            .get("vocab-ubiquitous")
            .unwrap()
            .explanation
            .as_deref(),
        Some("Từ bắt nguồn từ tiếng Latin 'ubique' có nghĩa là 'khắp mọi nơi'.")
    );

    // Ghi vào SQLite nhị phân
    let db_bytes = build_questions_db_bytes(&clean_items).expect("build db");
    assert!(!db_bytes.is_empty());

    // Đọc ngược lại từ SQLite nhị phân
    let loaded_items = read_questions_db_bytes(&db_bytes).expect("read db");
    assert_eq!(loaded_items.len(), 1);

    let loaded = &loaded_items[0];
    assert_eq!(loaded["id"], "vocab-ubiquitous");
    assert_eq!(loaded["term"], "ubiquitous");
    assert_eq!(
        loaded["definition"],
        "present, appearing, or found everywhere"
    );
    assert_eq!(loaded["phonetic"], "/juːˈbɪk.wɪ.təs/");
    assert_eq!(loaded["pos"], "adj");
    assert_eq!(
        loaded["example"],
        "Smartphones are ubiquitous in modern society."
    );
    assert_eq!(
        loaded["exampleMeaning"],
        "Điện thoại thông minh hiện diện ở khắp mọi nơi trong xã hội hiện đại."
    );
    assert_eq!(loaded["audio"], "audio/ubiquitous.mp3");
    assert_eq!(loaded["ankiGuid"], "uB1qUiT0uS");
    assert_eq!(loaded["ankiNoteId"], 1730001234567i64);

    let forms: Vec<String> = serde_json::from_value(loaded["forms"].clone()).unwrap();
    assert_eq!(forms, vec!["ubiquity", "ubiquitously"]);

    let synonyms: Vec<String> = serde_json::from_value(loaded["synonyms"].clone()).unwrap();
    assert_eq!(synonyms, vec!["omnipresent", "pervasive"]);

    // Ghép lại với solutions
    let merged = merge_v2_to_unified_items(loaded_items, &solutions);
    assert_eq!(
        merged[0]["explanation"],
        "Từ bắt nguồn từ tiếng Latin 'ubique' có nghĩa là 'khắp mọi nơi'."
    );
}

#[test]
fn test_sdeck_v2_all_item_types_roundtrip() {
    let items = vec![
        json!({
            "id": "q-card-1",
            "type": "card",
            "topic": "Sinh học",
            "tags": ["adn", "gen"],
            "front": "ADN là gì?",
            "back": "Axit đeoxiribonucleic"
        }),
        json!({
            "id": "q-single-1",
            "type": "single",
            "topic": "Địa lý",
            "question": "Thủ đô của Việt Nam là gì?",
            "choices": ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Huế"],
            "answer": [0],
            "explanation": "Hà Nội là thủ đô của nước CHXHCN Việt Nam."
        }),
        json!({
            "id": "q-multi-1",
            "type": "multi",
            "topic": "Linux",
            "tags": ["cli", "bash"],
            "question": "Lệnh nào dùng để liệt kê file?",
            "choices": ["ls", "dir", "cd", "pwd"],
            "answer": [0, 1],
            "answerDisplay": "Lựa chọn ls và dir",
            "explanation": "Cả ls và dir đều liệt kê thư mục."
        }),
        json!({
            "id": "q-fill-1",
            "type": "fill",
            "topic": "Vật lý",
            "question": "Nước sôi ở [___] độ C ở áp suất tiêu chuẩn.",
            "match": "normalized",
            "tolerance": 0.5,
            "answer": ["100", "100.0"],
            "answerDisplay": "100"
        }),
        json!({
            "id": "q-cmd-1",
            "type": "command",
            "topic": "Git",
            "question": "Tạo nhánh mới tên là 'feature'",
            "match": "exact",
            "answer": ["git checkout -b feature", "git switch -c feature"],
            "answerDisplay": "git switch -c feature"
        }),
    ];

    let (clean_items, solutions) = split_v1_items_to_v2(&items);
    assert_eq!(clean_items.len(), 5);
    assert_eq!(solutions.solutions.len(), 4); // card không có answer/explanation

    let db_bytes = build_questions_db_bytes(&clean_items).expect("build db");
    let loaded_items = read_questions_db_bytes(&db_bytes).expect("read db");
    assert_eq!(loaded_items.len(), 5);

    let unified = merge_v2_to_unified_items(loaded_items, &solutions);
    assert_eq!(unified.len(), 5);

    // Kiểm tra từng item sau khi phục hồi
    assert_eq!(unified[0]["type"], "card");
    assert_eq!(unified[0]["front"], "ADN là gì?");

    assert_eq!(unified[1]["type"], "single");
    assert_eq!(
        unified[1]["choices"],
        json!(["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Huế"])
    );
    assert_eq!(unified[1]["answer"], json!([0]));

    assert_eq!(unified[2]["type"], "multi");
    assert_eq!(unified[2]["tags"], json!(["cli", "bash"]));
    assert_eq!(unified[2]["answer"], json!([0, 1]));

    assert_eq!(unified[3]["type"], "fill");
    assert_eq!(unified[3]["match"], "normalized");
    assert_eq!(unified[3]["tolerance"], 0.5);
    assert_eq!(unified[3]["answer"], json!(["100", "100.0"]));

    assert_eq!(unified[4]["type"], "command");
    assert_eq!(unified[4]["match"], "exact");
    assert_eq!(unified[4]["answerDisplay"], "git switch -c feature");
}

#[test]
fn test_sdeck_v2_package_write_and_read_roundtrip() {
    let png_asset = vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    let mut assets = HashMap::new();
    assets.insert("img/diagram.png".to_string(), png_asset.clone());

    let deck = json!({
        "meta": {
            "id": "deck-v2-full-test",
            "title": "Bộ thẻ Version 2 Mẫu",
            "kind": "vocab",
            "lang": "vi",
            "description": "Kiểm thử gói .sdeck Version 2",
            "formatVersion": 2
        },
        "items": [
            {
                "id": "v2-item-1",
                "type": "card",
                "front": "Mặt trước có ảnh ![sơ đồ](img/diagram.png)",
                "back": "Mặt sau của thẻ",
                "image": "img/diagram.png"
            },
            {
                "id": "v2-item-2",
                "type": "single",
                "question": "1 + 1 = ?",
                "choices": ["1", "2", "3"],
                "answer": [1],
                "explanation": "1 cộng 1 bằng 2"
            }
        ]
    });

    assert!(is_v2_deck(&deck), "Nhận diện đúng deck v2");

    // 1. Đóng gói với write_package_v2
    let write_res = write_package_v2(&deck.to_string(), &assets, true).expect("write package v2");
    assert!(write_res.kept_assets.contains_key("img/diagram.png"));

    // 2. Đọc metadata qua read_package_meta: siêu dữ liệu nhẹ, không chứa items
    let meta_text = read_package_meta(&write_res.bytes).expect("read meta");
    let meta_val: serde_json::Value = serde_json::from_str(&meta_text).unwrap();
    assert_eq!(meta_val["meta"]["id"], "deck-v2-full-test");
    assert_eq!(meta_val["meta"]["formatVersion"], 2);
    assert_eq!(meta_val["meta"]["version"], 2);
    assert_eq!(meta_val["meta"]["files"]["db"], DECK_DB_ENTRY);
    assert_eq!(meta_val["meta"]["files"]["solutions"], SOLUTIONS_ENTRY);
    assert_eq!(meta_val["meta"]["stats"]["totalItems"], 2);
    assert_eq!(
        meta_val.get("items"),
        None,
        "deck.json v2 không được chứa mảng items"
    );

    // 3. Đọc toàn bộ gói qua read_package: tự động giải nén questions.db & solutions.json và ghép thành items
    let read_res = read_package(&write_res.bytes).expect("read package v2");
    assert_eq!(read_res.assets.len(), 1);
    assert!(read_res.assets.contains_key("img/diagram.png"));

    let loaded_deck: serde_json::Value = serde_json::from_str(&read_res.deck_text).unwrap();
    let loaded_items = loaded_deck["items"].as_array().expect("items array");
    assert_eq!(loaded_items.len(), 2);

    assert_eq!(loaded_items[0]["id"], "v2-item-1");
    assert_eq!(loaded_items[0]["type"], "card");
    assert_eq!(
        loaded_items[0]["front"],
        "Mặt trước có ảnh ![sơ đồ](img/diagram.png)"
    );

    assert_eq!(loaded_items[1]["id"], "v2-item-2");
    assert_eq!(loaded_items[1]["type"], "single");
    assert_eq!(loaded_items[1]["answer"], json!([1]));
    assert_eq!(loaded_items[1]["explanation"], "1 cộng 1 bằng 2");
}

#[test]
fn test_sdeck_v1_backward_compatibility() {
    // Tạo gói Version 1 cũ (formatVersion = 1 hoặc không khai báo, chứa items trực tiếp trong deck.json)
    let v1_deck = json!({
        "meta": {
            "id": "legacy-v1-deck",
            "title": "Bộ thẻ Version 1 Cũ",
            "formatVersion": 1
        },
        "items": [
            {
                "id": "v1-card-1",
                "type": "card",
                "front": "Cũ 1",
                "back": "Đáp án 1"
            }
        ]
    });

    let assets = HashMap::new();
    let write_res = write_package(&v1_deck.to_string(), &assets, false).expect("write v1");

    // Đọc gói v1 bằng read_package mới
    let read_res = read_package(&write_res.bytes).expect("read v1 package");
    let loaded: serde_json::Value = serde_json::from_str(&read_res.deck_text).unwrap();

    assert_eq!(loaded["meta"]["id"], "legacy-v1-deck");
    assert_eq!(loaded["meta"]["formatVersion"], 1);
    assert_eq!(loaded["items"].as_array().unwrap().len(), 1);
    assert_eq!(loaded["items"][0]["front"], "Cũ 1");
}
