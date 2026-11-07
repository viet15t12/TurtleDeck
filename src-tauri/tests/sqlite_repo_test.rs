// src-tauri/tests/sqlite_repo_test.rs — Test SQLite Repositories (:memory:)
use serde_json::json;
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::deck::{DeckRepository, QueryItemsParams};
use turtle_deck_lib::db::repositories::match_repo::MatchRepository;
use turtle_deck_lib::db::repositories::srs::{SrsCard, SrsRepository};

#[test]
fn test_database_init_pragma_and_schema() {
    let conn = open_in_memory().expect("Khởi tạo database in-memory");

    let user_version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .expect("Lấy user_version");
    assert_eq!(
        user_version,
        turtle_deck_lib::db::schema::CURRENT_SCHEMA_VERSION,
        "user_version phải khớp CURRENT_SCHEMA_VERSION"
    );

    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .expect("Query tables");
    let tables: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();

    assert!(tables.contains(&"decks".to_string()));
    assert!(tables.contains(&"items".to_string()));
    assert!(tables.contains(&"srs_cards".to_string()));
    assert!(tables.contains(&"review_logs".to_string()));
    assert!(tables.contains(&"item_meta".to_string()));
    assert!(tables.contains(&"match_records".to_string()));
    assert!(tables.contains(&"folders".to_string()));
    assert!(tables.contains(&"deck_locations".to_string()));
    assert!(tables.contains(&"items_fts".to_string()));
}

#[test]
fn test_deck_repository_sync_hash_fts_query_and_item_removal() {
    let mut conn = open_in_memory().expect("Khởi tạo database in-memory");

    let sample_deck = json!({
        "id": "deck-1",
        "meta": {
            "id": "deck-1",
            "title": "Từ vựng tiếng Anh",
            "kind": "vocab"
        },
        "items": [
            { "id": "item-1", "type": "vocab", "term": "apple", "definition": "quả táo", "tags": ["fruit"] },
            { "id": "item-2", "type": "vocab", "term": "banana", "definition": "quả chuối", "tags": ["fruit"] },
            { "id": "item-3", "type": "single", "prompt": "Hà Nội là thủ đô của?", "choices": ["Việt Nam", "Lào"], "answer": 0 }
        ]
    });

    // 1. Sync deck lần 1
    let res1 =
        DeckRepository::sync_deck(&mut conn, &sample_deck, Some("/path/deck1.sdeck")).unwrap();
    assert_eq!(res1.items_count, 3);
    assert!(res1.changed);

    // Sync lại không đổi -> changed: false
    let res2 =
        DeckRepository::sync_deck(&mut conn, &sample_deck, Some("/path/deck1.sdeck")).unwrap();
    assert!(!res2.changed);

    // 2. Query items với tag
    let search_fruit = DeckRepository::query_items(
        &conn,
        &QueryItemsParams {
            deck_id: Some("deck-1".to_string()),
            tag: Some("fruit".to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(search_fruit.items.len(), 2);
    assert_eq!(search_fruit.total, 2);

    // Query items với FTS
    let search_fts = DeckRepository::query_items(
        &conn,
        &QueryItemsParams {
            deck_id: Some("deck-1".to_string()),
            query: Some("thủ đô".to_string()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(search_fts.items.len(), 1);
    assert_eq!(
        search_fts.items[0].get("id").and_then(|v| v.as_str()),
        Some("item-3")
    );

    // 3. Tạo thẻ SRS cho item-1
    let now = 1_700_000_000_000i64;
    let card = SrsCard {
        deck_id: Some("deck-1".to_string()),
        item_id: Some("item-1".to_string()),
        direction: Some("en-vi".to_string()),
        state: "review".to_string(),
        step: 0,
        ease: 2.5,
        interval: 1,
        due: now + 86_400_000,
        reps: 1,
        lapses: 0,
        updated_at: Some(now),
        stability: None,
        difficulty: None,
        last_review: None,
    };

    SrsRepository::record_review(&mut conn, &card, 3, now, 1200, false).unwrap();
    let retrieved_card = SrsRepository::get_card(&conn, "deck-1", "item-1", "en-vi").unwrap();
    assert!(retrieved_card.is_some());

    // 4. Update deck loại bỏ item-1
    let updated_deck = json!({
        "id": "deck-1",
        "meta": {
            "id": "deck-1",
            "title": "Từ vựng tiếng Anh",
            "kind": "vocab"
        },
        "items": [
            { "id": "item-2", "type": "vocab", "term": "banana", "definition": "quả chuối", "tags": ["fruit"] },
            { "id": "item-3", "type": "single", "prompt": "Hà Nội là thủ đô của?", "choices": ["Việt Nam", "Lào"], "answer": 0 }
        ]
    });

    DeckRepository::sync_deck(&mut conn, &updated_deck, Some("/path/deck1.sdeck")).unwrap();

    let all_items = DeckRepository::get_items(&conn, "deck-1").unwrap();
    assert_eq!(all_items.len(), 2);
    let ids: Vec<&str> = all_items
        .iter()
        .filter_map(|i| i.get("id").and_then(|id| id.as_str()))
        .collect();
    assert!(!ids.contains(&"item-1"));

    // NHƯNG tiến độ SRS của item-1 vẫn được bảo toàn nguyên vẹn!
    let srs_preserved = SrsRepository::get_card(&conn, "deck-1", "item-1", "en-vi").unwrap();
    assert!(srs_preserved.is_some());
    assert_eq!(srs_preserved.unwrap().state, "review");
}

#[test]
fn test_match_repository() {
    let conn = open_in_memory().expect("Khởi tạo database");

    assert!(MatchRepository::get_record(&conn, "deck-1")
        .unwrap()
        .is_none());

    // Lưu kỷ lục lần 1: 15000 ms
    let saved1 = MatchRepository::save_record(&conn, "deck-1", 15000, 8, Some(1000)).unwrap();
    assert!(saved1);

    let rec1 = MatchRepository::get_record(&conn, "deck-1")
        .unwrap()
        .unwrap();
    assert_eq!(rec1.best_time_ms, 15000);
    assert_eq!(rec1.pairs_count, 8);

    // Kỷ lục kém hơn (20000 ms) không được ghi đè
    let saved2 = MatchRepository::save_record(&conn, "deck-1", 20000, 8, Some(2000)).unwrap();
    assert!(!saved2);

    let rec2 = MatchRepository::get_record(&conn, "deck-1")
        .unwrap()
        .unwrap();
    assert_eq!(rec2.best_time_ms, 15000);

    // Kỷ lục tốt hơn (12000 ms) được ghi đè
    let saved3 = MatchRepository::save_record(&conn, "deck-1", 12000, 8, Some(3000)).unwrap();
    assert!(saved3);

    let rec3 = MatchRepository::get_record(&conn, "deck-1")
        .unwrap()
        .unwrap();
    assert_eq!(rec3.best_time_ms, 12000);
}

#[test]
fn test_deck_repository_delete_deck_cascades_and_clears_progress() {
    let mut conn = open_in_memory().expect("Khởi tạo database in-memory");

    let sample_deck = json!({
        "id": "deck-del-1",
        "meta": {
            "id": "deck-del-1",
            "title": "Bộ thẻ cần xoá",
            "kind": "vocab"
        },
        "items": [
            { "id": "item-1", "type": "vocab", "term": "hello", "definition": "xin chào" }
        ]
    });

    DeckRepository::sync_deck(&mut conn, &sample_deck, Some("/path/deck-del-1.sdeck")).unwrap();

    let now = 1_700_000_000_000i64;
    let card = SrsCard {
        deck_id: Some("deck-del-1".to_string()),
        item_id: Some("item-1".to_string()),
        direction: Some("fwd".to_string()),
        state: "review".to_string(),
        step: 0,
        ease: 2.5,
        interval: 1,
        due: now + 86_400_000,
        reps: 1,
        lapses: 0,
        updated_at: Some(now),
        stability: None,
        difficulty: None,
        last_review: None,
    };
    SrsRepository::record_review(&mut conn, &card, 3, now, 1000, false).unwrap();

    assert!(DeckRepository::get_deck(&conn, "deck-del-1").unwrap().is_some());
    assert_eq!(DeckRepository::get_items(&conn, "deck-del-1").unwrap().len(), 1);
    assert!(SrsRepository::get_card(&conn, "deck-del-1", "item-1", "fwd").unwrap().is_some());

    // Xoá bộ thẻ
    DeckRepository::delete_deck(&mut conn, "deck-del-1").unwrap();

    // Xác nhận đã xoá sạch bộ thẻ và tiến trình
    assert!(DeckRepository::get_deck(&conn, "deck-del-1").unwrap().is_none());
    assert_eq!(DeckRepository::get_items(&conn, "deck-del-1").unwrap().len(), 0);
    assert!(SrsRepository::get_card(&conn, "deck-del-1", "item-1", "fwd").unwrap().is_none());
}

