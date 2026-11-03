// src-tauri/tests/folder_migration_test.rs — Test migrate_to_folders từ cấu trúc thư mục trên đĩa
use serde_json::json;
use std::fs;
use std::io::Write;
use std::path::Path;
use turtle_deck_lib::db::migration_folders::migrate_to_folders;
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::deck::DeckRepository;
use turtle_deck_lib::db::repositories::deck_location::DeckLocationRepository;
use turtle_deck_lib::db::repositories::folder::FolderRepository;
use turtle_deck_lib::db::repositories::srs::{SrsCard, SrsRepository};

fn create_mock_sdeck(path: &Path, deck_json: &serde_json::Value) {
    let file = fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("deck.json", options).unwrap();
    let text = serde_json::to_string(deck_json).unwrap();
    zip.write_all(text.as_bytes()).unwrap();
    zip.finish().unwrap();
}

#[test]
fn test_folder_migration_from_disk_and_srs_preservation() {
    let tmp_dir = std::env::temp_dir().join(format!(
        "turtle-deck-migf-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let lib_dir = tmp_dir.join("library");
    fs::create_dir_all(lib_dir.join("LPIC/101")).unwrap();
    fs::create_dir_all(lib_dir.join("Languages/Japanese")).unwrap();

    let root_deck = json!({
        "meta": { "id": "deck-root", "title": "Root General Deck" },
        "items": [{ "id": "item-r1", "type": "vocab", "term": "root", "definition": "goc" }]
    });
    let lpic_deck = json!({
        "meta": { "id": "deck-lpic", "title": "LPIC 101 Exam" },
        "items": [{ "id": "item-l1", "type": "single", "prompt": "Command for listing files?", "choices": ["ls", "cd"], "answer": 0 }]
    });
    let jap_deck = json!({
        "meta": { "id": "deck-jap", "title": "N5 Vocab" },
        "items": [{ "id": "item-j1", "type": "vocab", "term": "neko", "definition": "con meo" }]
    });

    let root_file = lib_dir.join("root-deck.sdeck");
    let lpic_file = lib_dir.join("LPIC/101/lpic101.sdeck");
    let jap_file = lib_dir.join("Languages/Japanese/n5.sdeck");

    create_mock_sdeck(&root_file, &root_deck);
    create_mock_sdeck(&lpic_file, &lpic_deck);
    create_mock_sdeck(&jap_file, &jap_deck);

    let mut conn = open_in_memory().unwrap();

    // 1. Đồng bộ decks
    DeckRepository::sync_deck(&mut conn, &root_deck, Some(&root_file.to_string_lossy())).unwrap();
    DeckRepository::sync_deck(&mut conn, &lpic_deck, Some(&lpic_file.to_string_lossy())).unwrap();
    DeckRepository::sync_deck(&mut conn, &jap_deck, Some(&jap_file.to_string_lossy())).unwrap();

    // 2. Ghi tiến độ SRS
    let now = 1_700_000_000_000i64;
    let card_lpic = SrsCard {
        deck_id: Some("deck-lpic".to_string()),
        item_id: Some("item-l1".to_string()),
        direction: Some("fwd".to_string()),
        state: "learning".to_string(),
        step: 1,
        ease: 2.5,
        interval: 1,
        due: now + 600_000,
        reps: 1,
        lapses: 0,
        updated_at: Some(now),
    };
    SrsRepository::record_review(&mut conn, &card_lpic, 3, now, 2500, true).unwrap();

    // 3. Thực thi migrate_to_folders
    let res = migrate_to_folders(&mut conn, &lib_dir);
    assert!(res.ok);
    assert!(res.folders_created >= 3); // LPIC, 101, Languages, Japanese
    assert_eq!(res.locations_created, 3); // 3 bộ thẻ

    // 4. Kiểm tra cấu trúc folders trong DB
    let f_lpic = FolderRepository::get_folder_by_path(&conn, "LPIC")
        .unwrap()
        .unwrap();
    assert_eq!(f_lpic.depth, 0);

    let f_101 = FolderRepository::get_folder_by_path(&conn, "LPIC/101")
        .unwrap()
        .unwrap();
    assert_eq!(f_101.depth, 1);
    assert_eq!(f_101.parent_id.as_deref(), Some(&f_lpic.id[..]));

    // 5. Kiểm tra vị trí deck_locations
    let loc_lpic = DeckLocationRepository::get_locations_by_deck(&conn, "deck-lpic").unwrap();
    assert_eq!(loc_lpic.len(), 1);
    assert_eq!(loc_lpic[0].folder_id.as_deref(), Some(&f_101.id[..]));

    let loc_root = DeckLocationRepository::get_locations_by_deck(&conn, "deck-root").unwrap();
    assert_eq!(loc_root.len(), 1);
    assert!(loc_root[0].folder_id.is_none());

    // 6. Kiểm tra tiến độ SRS vẫn nguyên vẹn
    let card_check = SrsRepository::get_card(&conn, "deck-lpic", "item-l1", "fwd")
        .unwrap()
        .unwrap();
    assert_eq!(card_check.state, "learning");
    assert_eq!(card_check.step, 1);

    let _ = fs::remove_dir_all(&tmp_dir);
}
