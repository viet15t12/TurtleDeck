// src-tauri/tests/folder_service_test.rs — Kiểm thử FolderService, FolderRepository, bất biến DB, chu trình và cây sâu
use rusqlite::params;
use serde_json::json;
use std::fs;
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::deck::DeckRepository;
use turtle_deck_lib::db::repositories::deck_location::DeckLocationRepository;
use turtle_deck_lib::db::repositories::folder::FolderRepository;
use turtle_deck_lib::error::AppError;
use turtle_deck_lib::services::{deck_location_service, folder_service};

#[test]
fn test_folder_service_create_rename_move_reorder_delete() {
    let tmp_dir = std::env::temp_dir().join(format!(
        "turtle-deck-folder-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&tmp_dir).unwrap();

    let conn = open_in_memory().unwrap();

    // 1. Tạo thư mục cấp gốc (không tạo thư mục vật lý trên đĩa)
    let res_root = folder_service::create_folder(&conn, Some(&tmp_dir), "LPIC", None).unwrap();
    assert_eq!(res_root.name, "LPIC");
    assert_eq!(res_root.depth, 0);
    assert_eq!(res_root.path, "LPIC");
    assert!(!tmp_dir.join("LPIC").exists());

    // 2. Tạo thư mục con
    let res_sub =
        folder_service::create_folder(&conn, Some(&tmp_dir), "101", Some(&res_root.id)).unwrap();
    assert_eq!(res_sub.name, "101");
    assert_eq!(res_sub.depth, 1);
    assert_eq!(res_sub.path, "LPIC/101");
    assert!(!tmp_dir.join("LPIC/101").exists());

    // Tạo thư mục cấp 2
    let res_sub2 =
        folder_service::create_folder(&conn, Some(&tmp_dir), "Topic 1", Some(&res_sub.id)).unwrap();
    assert_eq!(res_sub2.depth, 2);
    assert_eq!(res_sub2.path, "LPIC/101/Topic 1");

    // 3. Đổi tên thư mục cha '101' -> '101-v5'
    folder_service::rename_folder(&conn, Some(&tmp_dir), &res_sub.id, "101-v5").unwrap();

    let updated_sub = FolderRepository::get_folder_by_id(&conn, &res_sub.id)
        .unwrap()
        .unwrap();
    assert_eq!(updated_sub.name, "101-v5");
    assert_eq!(updated_sub.path, "LPIC/101-v5");

    // Kiểm tra đường dẫn ảo thư mục con cháu tự động cập nhật
    let updated_sub2 = FolderRepository::get_folder_by_id(&conn, &res_sub2.id)
        .unwrap()
        .unwrap();
    assert_eq!(updated_sub2.path, "LPIC/101-v5/Topic 1");

    // 4. Di chuyển thư mục 'Topic 1' lên thẳng cấp gốc
    folder_service::move_folder(&conn, Some(&tmp_dir), &res_sub2.id, None).unwrap();

    let moved_topic = FolderRepository::get_folder_by_id(&conn, &res_sub2.id)
        .unwrap()
        .unwrap();
    assert_eq!(moved_topic.depth, 0);
    assert_eq!(moved_topic.parent_id, None);
    assert_eq!(moved_topic.path, "Topic 1");

    // 5. Sắp xếp lại thứ tự các thư mục ở cấp gốc (reorder_folders)
    folder_service::reorder_folders(
        &conn,
        None,
        &[res_sub2.id.clone(), res_root.id.clone()],
    )
    .unwrap();
    let tree = folder_service::get_folder_tree(&conn).unwrap();
    assert_eq!(tree.len(), 2);
    assert_eq!(tree[0].id, res_sub2.id);
    assert_eq!(tree[1].id, res_root.id);

    // 6. Xoá thư mục gốc
    folder_service::delete_folder(&conn, Some(&tmp_dir), &res_root.id).unwrap();
    assert!(FolderRepository::get_folder_by_id(&conn, &res_root.id)
        .unwrap()
        .is_none());
    assert!(FolderRepository::get_folder_by_id(&conn, &res_sub.id)
        .unwrap()
        .is_none());

    let _ = fs::remove_dir_all(&tmp_dir);
}

#[test]
fn test_db_invariants_and_constraints() {
    let mut conn = open_in_memory().unwrap();

    // 1. Tên trùng ở gốc (không phân biệt hoa thường) -> FolderNameConflict
    let root_a = folder_service::create_folder(&conn, None, "NgoaiNgu", None).unwrap();
    let dup_root = folder_service::create_folder(&conn, None, "ngoaingu", None);
    assert!(matches!(dup_root, Err(AppError::FolderNameConflict(_))));
    assert_eq!(dup_root.unwrap_err().code(), "FolderNameConflict");

    // Kiểm tra mức SQL trực tiếp cho ux_folders_parent_name ở gốc
    let sql_dup_root = conn.execute(
        "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at)
         VALUES ('f-dup-root', NULL, 'NGOAINGU', 0, 1, 1)",
        [],
    );
    assert!(sql_dup_root.is_err());

    // 2. Tên trùng trong cùng thư mục con (không phân biệt hoa thường) -> FolderNameConflict
    let _sub1 =
        folder_service::create_folder(&conn, None, "TiengNhat", Some(&root_a.id)).unwrap();
    let dup_sub = folder_service::create_folder(&conn, None, "tiengnhat", Some(&root_a.id));
    assert!(matches!(dup_sub, Err(AppError::FolderNameConflict(_))));

    // 3. Tên rỗng hoặc chỉ khoảng trắng bị từ chối bởi CHECK (length(trim(name)) > 0)
    let sql_empty_name = conn.execute(
        "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at)
         VALUES ('f-empty', NULL, '   ', 0, 1, 1)",
        [],
    );
    assert!(sql_empty_name.is_err());

    // 4. Tự làm cha chính mình bị từ chối bởi CHECK (parent_id IS NULL OR parent_id <> id)
    let sql_self_parent = conn.execute(
        "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at)
         VALUES ('f-self', 'f-self', 'SelfFolder', 0, 1, 1)",
        [],
    );
    assert!(sql_self_parent.is_err());

    // Tạo một bộ thẻ mẫu
    let deck = json!({
        "meta": { "id": "deck-inv-1", "title": "Deck Invariant", "kind": "qa" },
        "items": []
    });
    DeckRepository::sync_deck(&mut conn, &deck, Some("/tmp/inv1.sdeck")).unwrap();

    // Bất biến 1: sync_deck đã tự động tạo đúng 1 vị trí chính ở gốc
    let locs = DeckLocationRepository::get_locations_by_deck(&conn, "deck-inv-1").unwrap();
    assert_eq!(locs.len(), 1);
    assert!(!locs[0].is_link);
    assert!(locs[0].folder_id.is_none());

    // 5. Thử chèn vị trí chính thứ hai (ux_deck_primary) -> bị từ chối
    let sql_second_primary = conn.execute(
        "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
         VALUES ('loc-p2', 'deck-inv-1', ?1, 0, 1)",
        params![root_a.id],
    );
    assert!(sql_second_primary.is_err());

    // 6. Thử tạo liên kết về gốc -> InvalidLinkTarget (service) và CHECK constraint (SQL)
    let link_root = deck_location_service::link_deck(&conn, None, "deck-inv-1", None);
    assert!(matches!(link_root, Err(AppError::InvalidLinkTarget(_))));
    assert_eq!(link_root.unwrap_err().code(), "InvalidLinkTarget");

    let sql_link_root = conn.execute(
        "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
         VALUES ('loc-l-root', 'deck-inv-1', NULL, 1, 1)",
        [],
    );
    assert!(sql_link_root.is_err());

    // 7. Một bộ thẻ không xuất hiện 2 lần trong cùng thư mục (ux_deck_folder & AlreadyInFolder)
    deck_location_service::link_deck(&conn, None, "deck-inv-1", Some(&root_a.id)).unwrap();
    let dup_link = deck_location_service::link_deck(&conn, None, "deck-inv-1", Some(&root_a.id));
    assert!(matches!(dup_link, Err(AppError::AlreadyInFolder(_))));
    assert_eq!(dup_link.unwrap_err().code(), "AlreadyInFolder");

    let sql_dup_folder = conn.execute(
        "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
         VALUES ('loc-dup-f', 'deck-inv-1', ?1, 1, 1)",
        params![root_a.id],
    );
    assert!(sql_dup_folder.is_err());

    // 8. Không cho unlink vị trí chính -> CannotUnlinkPrimary
    let primary_loc = DeckLocationRepository::get_primary_location(&conn, "deck-inv-1")
        .unwrap()
        .unwrap();
    let unlink_primary = deck_location_service::unlink_deck(&conn, &primary_loc.id, false);
    assert!(matches!(unlink_primary, Err(AppError::CannotUnlinkPrimary(_))));
    assert_eq!(unlink_primary.unwrap_err().code(), "CannotUnlinkPrimary");
}

#[test]
fn test_folder_cycle_prevention() {
    let conn = open_in_memory().unwrap();

    let f_a = folder_service::create_folder(&conn, None, "A", None).unwrap();
    let f_b = folder_service::create_folder(&conn, None, "B", Some(&f_a.id)).unwrap();
    let f_c = folder_service::create_folder(&conn, None, "C", Some(&f_b.id)).unwrap();

    // Di chuyển A vào chính A -> FolderCycle
    let self_move = folder_service::move_folder(&conn, None, &f_a.id, Some(&f_a.id));
    assert!(matches!(self_move, Err(AppError::FolderCycle(_))));
    assert_eq!(self_move.unwrap_err().code(), "FolderCycle");

    // Di chuyển A vào con trực tiếp B -> FolderCycle
    let child_move = folder_service::move_folder(&conn, None, &f_a.id, Some(&f_b.id));
    assert!(matches!(child_move, Err(AppError::FolderCycle(_))));

    // Di chuyển A vào cháu C -> FolderCycle
    let desc_move = folder_service::move_folder(&conn, None, &f_a.id, Some(&f_c.id));
    assert!(matches!(desc_move, Err(AppError::FolderCycle(_))));
}

#[test]
fn test_deep_tree_thousands_of_levels() {
    let mut conn = open_in_memory().unwrap();

    // Tạo chuỗi 1200 cấp thư mục liên tiếp
    let depth_count = 1200;
    let mut folder_ids = Vec::with_capacity(depth_count);
    {
        let tx = conn.transaction().unwrap();
        let mut parent_id: Option<String> = None;
        for i in 0..depth_count {
            let id = format!("f-deep-{i}");
            let name = format!("L{i}");
            tx.execute(
                "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 0, 1, 1)",
                params![id, parent_id, name],
            )
            .unwrap();
            parent_id = Some(id.clone());
            folder_ids.push(id);
        }
        tx.commit().unwrap();
    }

    let root_id = &folder_ids[0];
    let deepest_id = &folder_ids[depth_count - 1];

    // 1. Kiểm tra subtree(root) trả đủ 1200 nút
    let subtree = FolderRepository::get_subtree_ids(&conn, root_id).unwrap();
    assert_eq!(subtree.len(), depth_count);

    // 2. Kiểm tra chống chu trình ở cấp 1200 -> FolderCycle
    let cycle_err = folder_service::move_folder(&conn, None, root_id, Some(deepest_id));
    assert!(matches!(cycle_err, Err(AppError::FolderCycle(_))));

    // 3. Đặt 1 bộ thẻ có vị trí chính ở cấp sâu nhất (1199)
    let deck = json!({
        "meta": { "id": "deck-deep", "title": "Deep Deck", "kind": "qa" },
        "items": []
    });
    DeckRepository::sync_deck(&mut conn, &deck, Some("/tmp/deep.sdeck")).unwrap();
    deck_location_service::move_deck(&conn, None, "deck-deep", Some(deepest_id)).unwrap();

    // 4. Kiểm tra get_folder_tree không tràn ngăn xếp với 1200 cấp
    let tree = folder_service::get_folder_tree(&conn).unwrap();
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].id, *root_id);

    // 5. Xóa nhánh từ gốc -> bộ thẻ ở cấp 1199 trở về gốc (folder_id = NULL), không mất bộ thẻ
    let affected = folder_service::delete_folder(&conn, None, root_id).unwrap();
    assert_eq!(affected, vec!["deck-deep".to_string()]);

    let loc_after = DeckLocationRepository::get_primary_location(&conn, "deck-deep")
        .unwrap()
        .unwrap();
    assert!(loc_after.folder_id.is_none());
    assert!(DeckRepository::get_deck(&conn, "deck-deep").unwrap().is_some());
}
