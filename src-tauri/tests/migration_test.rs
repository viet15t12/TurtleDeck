// src-tauri/tests/migration_test.rs — Test Migration từ progress.json sang SQLite
use std::fs;
use turtle_deck_lib::db::migration::migrate_legacy_progress;
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::srs::SrsRepository;

#[test]
fn test_migrate_legacy_progress_format_and_idempotence() {
    let tmp_dir = std::env::temp_dir().join(format!(
        "turtle-deck-mig-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&tmp_dir).unwrap();
    let progress_file = tmp_dir.join("progress.json");

    let legacy_json = r#"{
      "version": 1,
      "cards": {
        "deck-eng:item-01:en-vi": {
          "state": "review",
          "due": 1715000000000,
          "interval": 4,
          "ease": 2.6,
          "reps": 3,
          "lapses": 0,
          "lastReviewed": 1714654400000
        },
        "deck-eng:item-01:vi-en": {
          "state": "learning",
          "due": 1715000600000,
          "interval": 0,
          "ease": 2.5,
          "reps": 1,
          "lapses": 0,
          "lastReviewed": 1715000000000
        },
        "deck-quiz:q1:fwd": {
          "state": "review",
          "due": 1716000000000,
          "interval": 15,
          "ease": 2.4,
          "reps": 5,
          "lapses": 1,
          "lastReviewed": 1714704000000
        }
      },
      "log": [
        { "t": 1714654400000, "card": "deck-eng:item-01:en-vi", "rating": "good", "ms": 1200 },
        { "t": 1715000000000, "card": "deck-eng:item-01:vi-en", "rating": "again", "ms": 3500 },
        { "t": 1714704000000, "card": "deck-quiz:q1:fwd", "rating": "easy", "ms": 800 }
      ],
      "meta": {
        "deck-eng:item-01": {
          "starred": true,
          "note": "Từ này hay quên phần giới từ"
        },
        "deck-quiz:q1": {
          "starred": false,
          "note": "Đọc kỹ câu hỏi phủ định"
        }
      }
    }"#;

    fs::write(&progress_file, legacy_json).unwrap();

    let mut conn = open_in_memory().unwrap();

    // 1. Chạy migration
    let res = migrate_legacy_progress(&mut conn, &progress_file);
    assert!(res.migrated);
    assert_eq!(res.cards_count, 3);
    assert_eq!(res.logs_count, 3);
    assert_eq!(res.meta_count, 2);

    // 2. Kiểm tra dữ liệu nạp vào SQLite
    let c1 = SrsRepository::get_card(&conn, "deck-eng", "item-01", "en-vi")
        .unwrap()
        .unwrap();
    assert_eq!(c1.state, "review");
    assert_eq!(c1.interval, 4);
    assert_eq!(c1.ease, 2.6);

    let c2 = SrsRepository::get_card(&conn, "deck-eng", "item-01", "vi-en")
        .unwrap()
        .unwrap();
    assert_eq!(c2.state, "learning");

    let c3 = SrsRepository::get_card(&conn, "deck-quiz", "q1", "fwd")
        .unwrap()
        .unwrap();
    assert_eq!(c3.lapses, 1);

    // Kiểm tra review_logs
    let logs_eng = SrsRepository::get_review_logs(&conn, Some("deck-eng"), 10).unwrap();
    assert_eq!(logs_eng.len(), 2);
    assert_eq!(logs_eng[0].elapsed_ms, 3500); // Mới nhất lên đầu
    assert_eq!(logs_eng[1].elapsed_ms, 1200);

    // Kiểm tra item_meta
    let meta1 = SrsRepository::get_meta(&conn, "deck-eng", "item-01")
        .unwrap()
        .unwrap();
    assert!(meta1.starred);
    assert_eq!(meta1.note, "Từ này hay quên phần giới từ");

    let meta2 = SrsRepository::get_meta(&conn, "deck-quiz", "q1")
        .unwrap()
        .unwrap();
    assert!(!meta2.starred);
    assert_eq!(meta2.note, "Đọc kỹ câu hỏi phủ định");

    // 3. File ban đầu phải được đổi tên thành progress.json.migrated
    assert!(!progress_file.exists());
    let migrated_file = progress_file.with_extension("json.migrated");
    assert!(migrated_file.exists());

    // 4. Chạy lại lần 2 không gây lỗi (idempotent)
    let res2 = migrate_legacy_progress(&mut conn, &progress_file);
    assert!(!res2.migrated);

    let _ = fs::remove_dir_all(&tmp_dir);
}
