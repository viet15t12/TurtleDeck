use rusqlite::Connection;
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::srs::{SrsCard, SrsRepository};
use turtle_deck_lib::db::schema::create_schema;

#[test]
fn test_srs_schema_migration_and_fsrs_persistence() {
    let mut conn = open_in_memory().unwrap();

    let now = 1_700_000_000_000i64;
    let card = SrsCard {
        deck_id: Some("test_deck".to_string()),
        item_id: Some("item_fsrs".to_string()),
        direction: Some("fwd".to_string()),
        state: "review".to_string(),
        step: 0,
        ease: 2.5,
        interval: 12,
        due: now + 12 * 86_400_000,
        reps: 3,
        lapses: 1,
        updated_at: Some(now),
        stability: Some(11.85),
        difficulty: Some(6.2),
        last_review: Some(now),
    };

    // 1. Record review with FSRS fields
    SrsRepository::record_review(&mut conn, &card, 3, now, 1500, false).unwrap();

    // 2. Retrieve card
    let retrieved = SrsRepository::get_card(&conn, "test_deck", "item_fsrs", "fwd")
        .unwrap()
        .expect("Card must exist");

    assert_eq!(retrieved.state, "review");
    assert_eq!(retrieved.interval, 12);
    assert!((retrieved.stability.unwrap() - 11.85).abs() < 1e-4);
    assert!((retrieved.difficulty.unwrap() - 6.2).abs() < 1e-4);
    assert_eq!(retrieved.last_review, Some(now));

    // 3. Export progress data and check JSON contains FSRS fields
    let exported = SrsRepository::export_progress_data(&conn).unwrap();
    let card_json = exported
        .get("cards")
        .and_then(|c| c.get("test_deck:item_fsrs:fwd"))
        .expect("Exported card must exist");

    assert_eq!(card_json.get("stability").and_then(|s| s.as_f64()), Some(11.85));
    assert_eq!(card_json.get("difficulty").and_then(|d| d.as_f64()), Some(6.2));
    assert_eq!(card_json.get("lastReview").and_then(|l| l.as_i64()), Some(now));

    // 4. Clear and re-import
    let (c_count, _, _) = SrsRepository::import_progress_data(&mut conn, &exported, "replace").unwrap();
    assert_eq!(c_count, 1);

    let re_retrieved = SrsRepository::get_card(&conn, "test_deck", "item_fsrs", "fwd")
        .unwrap()
        .expect("Card must exist after import");
    assert!((re_retrieved.stability.unwrap() - 11.85).abs() < 1e-4);
    assert!((re_retrieved.difficulty.unwrap() - 6.2).abs() < 1e-4);
    assert_eq!(re_retrieved.last_review, Some(now));
}

#[test]
fn test_migration_from_v1_legacy_table_without_fsrs_columns() {
    let conn = Connection::open_in_memory().unwrap();

    // Giả lập bảng srs_cards phiên bản cũ chưa có stability, difficulty, last_review
    conn.execute_batch(
        "
        CREATE TABLE srs_cards (
          deck_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          direction TEXT NOT NULL DEFAULT 'fwd',
          state TEXT NOT NULL CHECK(state IN ('new', 'learning', 'review', 'relearning')),
          step INTEGER DEFAULT 0,
          ease REAL DEFAULT 2.5,
          interval INTEGER DEFAULT 0,
          due INTEGER NOT NULL DEFAULT 0,
          reps INTEGER DEFAULT 0,
          lapses INTEGER DEFAULT 0,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (deck_id, item_id, direction)
        );
        PRAGMA user_version = 1;
        ",
    ).unwrap();

    // Chạy create_schema để kích hoạt auto-migration
    create_schema(&conn).unwrap();

    // Kiểm tra các cột đã được tự động thêm
    let columns: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(srs_cards)").unwrap();
        let rows = stmt.query_map([], |row| row.get::<_, String>(1)).unwrap();
        rows.filter_map(|r| r.ok()).collect()
    };

    assert!(columns.contains(&"stability".to_string()));
    assert!(columns.contains(&"difficulty".to_string()));
    assert!(columns.contains(&"last_review".to_string()));
}
