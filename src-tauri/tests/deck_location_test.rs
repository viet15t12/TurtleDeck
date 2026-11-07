// src-tauri/tests/deck_location_test.rs — Kiểm thử vị trí bộ thẻ, liên kết, delete_folder, Watcher và phản mục tiêu không chạm đĩa
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::deck::DeckRepository;
use turtle_deck_lib::db::repositories::deck_location::DeckLocationRepository;
use turtle_deck_lib::services::watcher::{
    handle_watcher_file_added_or_changed, handle_watcher_file_removed,
};
use turtle_deck_lib::services::{deck_location_service, folder_service};

fn snapshot_dir_files(dir: &Path) -> BTreeMap<String, (u64, String)> {
    let mut map = BTreeMap::new();
    fn walk(cur: &Path, root: &Path, map: &mut BTreeMap<String, (u64, String)>) {
        if let Ok(entries) = fs::read_dir(cur) {
            for entry in entries.flatten() {
                let p = entry.path();
                let rel = p
                    .strip_prefix(root)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                if p.is_dir() {
                    map.insert(format!("DIR:{rel}"), (0, String::new()));
                    walk(&p, root, map);
                } else if p.is_file() {
                    let bytes = fs::read(&p).unwrap();
                    let hash = format!("{:x}", Sha256::digest(&bytes));
                    map.insert(rel, (bytes.len() as u64, hash));
                }
            }
        }
    }
    walk(dir, dir, &mut map);
    map
}

#[test]
fn test_all_folder_and_deck_location_ops_never_touch_disk() {
    let tmp = std::env::temp_dir().join(format!(
        "turtle-deck-nodisk-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&tmp).unwrap();

    let deck_id = "test-deck-nodisk";
    let deck_file = tmp.join("toan-1.sdeck");
    let content = b"sdeck-binary-payload-unchanged";
    fs::write(&deck_file, content).unwrap();

    let before_snapshot = snapshot_dir_files(&tmp);

    let mut conn = open_in_memory().unwrap();
    let sample_deck = serde_json::json!({
        "meta": { "id": deck_id, "title": "Toán 1", "kind": "qa" },
        "items": []
    });
    DeckRepository::sync_deck(&mut conn, &sample_deck, Some(&deck_file.to_string_lossy())).unwrap();

    // Thực hiện toàn bộ thao tác thư mục và vị trí bộ thẻ
    let f1 = folder_service::create_folder(&conn, Some(&tmp), "ToanHoc", None).unwrap();
    let f2 = folder_service::create_folder(&conn, Some(&tmp), "HinhHoc", Some(&f1.id)).unwrap();
    let f3 = folder_service::create_folder(&conn, Some(&tmp), "OnThi", None).unwrap();

    deck_location_service::move_deck(&conn, Some(&tmp), deck_id, Some(&f2.id)).unwrap();
    let link_loc =
        deck_location_service::link_deck(&conn, Some(&tmp), deck_id, Some(&f3.id)).unwrap();
    folder_service::rename_folder(&conn, Some(&tmp), &f1.id, "ToanHocCaoCap").unwrap();
    folder_service::move_folder(&conn, Some(&tmp), &f2.id, None).unwrap();
    deck_location_service::unlink_deck(&conn, &link_loc.id, true).unwrap();
    folder_service::delete_folder(&conn, Some(&tmp), &f2.id).unwrap();

    let after_snapshot = snapshot_dir_files(&tmp);
    assert_eq!(
        before_snapshot, after_snapshot,
        "Phản mục tiêu: không thao tác thư mục nào được ghi/xóa/đổi tên file trên đĩa"
    );
    assert!(deck_file.exists());

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn test_move_deck_when_target_folder_has_link_collapses_to_single_primary_row() {
    let mut conn = open_in_memory().unwrap();
    let folder = folder_service::create_folder(&conn, None, "HoaHoc", None).unwrap();

    let deck_id = "test-deck-conflict";
    let sample_deck = serde_json::json!({
        "meta": { "id": deck_id, "title": "Hóa học", "kind": "qa" },
        "items": []
    });
    DeckRepository::sync_deck(&mut conn, &sample_deck, Some("/tmp/hoahoc.sdeck")).unwrap();

    // Tạo liên kết trong thư mục HoaHoc khi vị trí chính đang ở gốc
    deck_location_service::link_deck(&conn, None, deck_id, Some(&folder.id)).unwrap();
    assert_eq!(
        DeckLocationRepository::get_locations_by_deck(&conn, deck_id)
            .unwrap()
            .len(),
        2
    );

    // Di chuyển vị trí chính vào HoaHoc -> liên kết cũ trong HoaHoc tự động bị xóa, chỉ còn 1 hàng chính
    let moved = deck_location_service::move_deck(&conn, None, deck_id, Some(&folder.id)).unwrap();
    assert!(!moved.is_link);
    assert_eq!(moved.folder_id.as_deref(), Some(folder.id.as_str()));

    let locs = DeckLocationRepository::get_locations_by_deck(&conn, deck_id).unwrap();
    assert_eq!(locs.len(), 1);
    assert!(!locs[0].is_link);
    assert_eq!(locs[0].folder_id.as_deref(), Some(folder.id.as_str()));
}

#[test]
fn test_delete_folder_moves_primary_to_root_and_removes_links_without_losing_decks() {
    let mut conn = open_in_memory().unwrap();

    let parent = folder_service::create_folder(&conn, None, "Parent", None).unwrap();
    let child = folder_service::create_folder(&conn, None, "Child", Some(&parent.id)).unwrap();
    let other = folder_service::create_folder(&conn, None, "Other", None).unwrap();

    let deck1 = serde_json::json!({
        "meta": { "id": "deck-1", "title": "Deck 1", "kind": "qa" },
        "items": []
    });
    let deck2 = serde_json::json!({
        "meta": { "id": "deck-2", "title": "Deck 2", "kind": "qa" },
        "items": []
    });
    DeckRepository::sync_deck(&mut conn, &deck1, Some("/tmp/d1.sdeck")).unwrap();
    DeckRepository::sync_deck(&mut conn, &deck2, Some("/tmp/d2.sdeck")).unwrap();

    // deck-1 có vị trí chính trong Child và liên kết trong Other
    deck_location_service::move_deck(&conn, None, "deck-1", Some(&child.id)).unwrap();
    deck_location_service::link_deck(&conn, None, "deck-1", Some(&other.id)).unwrap();

    // deck-2 có vị trí chính trong Other và liên kết trong Child
    deck_location_service::move_deck(&conn, None, "deck-2", Some(&other.id)).unwrap();
    deck_location_service::link_deck(&conn, None, "deck-2", Some(&child.id)).unwrap();

    // Xoá nhánh Parent (chứa Child)
    let affected = folder_service::delete_folder(&conn, None, &parent.id).unwrap();
    assert_eq!(affected, vec!["deck-1".to_string(), "deck-2".to_string()]);

    // Kiểm tra deck-1: vị trí chính về gốc (NULL), liên kết ở Other vẫn còn, bộ thẻ vẫn còn trong decks
    let d1_locs = DeckLocationRepository::get_locations_by_deck(&conn, "deck-1").unwrap();
    assert_eq!(d1_locs.len(), 2);
    let d1_primary = d1_locs.iter().find(|l| !l.is_link).unwrap();
    assert!(d1_primary.folder_id.is_none());
    let d1_link = d1_locs.iter().find(|l| l.is_link).unwrap();
    assert_eq!(d1_link.folder_id.as_deref(), Some(other.id.as_str()));
    assert!(DeckRepository::get_deck(&conn, "deck-1").unwrap().is_some());

    // Kiểm tra deck-2: liên kết trong Child đã bị xoá, vị trí chính ở Other giữ nguyên
    let d2_locs = DeckLocationRepository::get_locations_by_deck(&conn, "deck-2").unwrap();
    assert_eq!(d2_locs.len(), 1);
    assert!(!d2_locs[0].is_link);
    assert_eq!(d2_locs[0].folder_id.as_deref(), Some(other.id.as_str()));
    assert!(DeckRepository::get_deck(&conn, "deck-2").unwrap().is_some());
}

#[test]
fn test_watcher_simulation_no_orphan_locations_and_preserve_on_rediscover() {
    let mut conn = open_in_memory().unwrap();
    let f_study = folder_service::create_folder(&conn, None, "Study", None).unwrap();

    let deck = serde_json::json!({
        "meta": { "id": "deck-watch-1", "title": "Watch Deck", "kind": "vocab" },
        "items": [{ "id": "i1", "type": "vocab", "term": "a", "definition": "b" }]
    });

    // 1. Mô phỏng Watcher phát hiện file mới
    let path1 = Path::new("/tmp/watch1.sdeck");
    handle_watcher_file_added_or_changed(&mut conn, path1, &deck).unwrap();

    let locs = DeckLocationRepository::get_locations_by_deck(&conn, "deck-watch-1").unwrap();
    assert_eq!(locs.len(), 1);
    assert!(!locs[0].is_link);
    assert!(locs[0].folder_id.is_none());

    // 2. Gán bộ thẻ vào thư mục ảo Study
    deck_location_service::move_deck(&conn, None, "deck-watch-1", Some(&f_study.id)).unwrap();

    // 3. File được tìm thấy lại ở đường dẫn mới nhưng cùng meta.id -> cập nhật file_path, giữ nguyên deck_locations
    let path2 = Path::new("/tmp/watch1-renamed.sdeck");
    handle_watcher_file_added_or_changed(&mut conn, path2, &deck).unwrap();

    let deck_row = DeckRepository::get_deck(&conn, "deck-watch-1")
        .unwrap()
        .unwrap();
    assert_eq!(
        deck_row.get("filePath").and_then(|v| v.as_str()),
        Some("/tmp/watch1-renamed.sdeck")
    );
    let locs_after_rename =
        DeckLocationRepository::get_locations_by_deck(&conn, "deck-watch-1").unwrap();
    assert_eq!(locs_after_rename.len(), 1);
    assert_eq!(
        locs_after_rename[0].folder_id.as_deref(),
        Some(f_study.id.as_str())
    );

    // 4. Mô phỏng Watcher phát hiện file bị xóa khỏi đĩa -> xóa hẳn decks, cascade xóa deck_locations (không còn hàng mồ côi)
    let removed_id = handle_watcher_file_removed(&mut conn, path2).unwrap();
    assert_eq!(removed_id.as_deref(), Some("deck-watch-1"));
    assert!(DeckRepository::get_deck(&conn, "deck-watch-1")
        .unwrap()
        .is_none());
    let orphan_locs = DeckLocationRepository::get_all_locations(&conn).unwrap();
    assert!(orphan_locs.is_empty());
}
