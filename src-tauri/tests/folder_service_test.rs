// src-tauri/tests/folder_service_test.rs — Unit tests cho FolderService và FolderRepository
use std::fs;
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::folder::FolderRepository;
use turtle_deck_lib::services::folder_service;

#[test]
fn test_folder_service_create_rename_move_delete() {
    let tmp_dir = std::env::temp_dir().join(format!(
        "turtle-deck-folder-test-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&tmp_dir).unwrap();

    let mut conn = open_in_memory().unwrap();

    // 1. Tạo thư mục cấp gốc
    let res_root = folder_service::create_folder(&conn, Some(&tmp_dir), "LPIC", None).unwrap();
    assert_eq!(res_root.name, "LPIC");
    assert_eq!(res_root.depth, 0);
    assert_eq!(res_root.path, "LPIC");
    assert!(tmp_dir.join("LPIC").is_dir());

    // 2. Tạo thư mục con
    let res_sub =
        folder_service::create_folder(&conn, Some(&tmp_dir), "101", Some(&res_root.id)).unwrap();
    assert_eq!(res_sub.name, "101");
    assert_eq!(res_sub.depth, 1);
    assert_eq!(res_sub.path, "LPIC/101");
    assert!(tmp_dir.join("LPIC/101").is_dir());

    // Tạo thư mục cấp 2
    let res_sub2 =
        folder_service::create_folder(&conn, Some(&tmp_dir), "Topic 1", Some(&res_sub.id)).unwrap();
    assert_eq!(res_sub2.depth, 2);
    assert_eq!(res_sub2.path, "LPIC/101/Topic 1");
    assert!(tmp_dir.join("LPIC/101/Topic 1").is_dir());

    // 3. Đổi tên thư mục cha '101' -> '101-v5'
    folder_service::rename_folder(&mut conn, Some(&tmp_dir), &res_sub.id, "101-v5").unwrap();

    let updated_sub = FolderRepository::get_folder_by_id(&conn, &res_sub.id)
        .unwrap()
        .unwrap();
    assert_eq!(updated_sub.name, "101-v5");
    assert_eq!(updated_sub.path, "LPIC/101-v5");
    assert!(tmp_dir.join("LPIC/101-v5").is_dir());

    // Kiểm tra đường dẫn thư mục con cháu tự động cập nhật
    let updated_sub2 = FolderRepository::get_folder_by_id(&conn, &res_sub2.id)
        .unwrap()
        .unwrap();
    assert_eq!(updated_sub2.path, "LPIC/101-v5/Topic 1");

    // 4. Di chuyển thư mục 'Topic 1' lên thẳng cấp gốc
    folder_service::move_folder(&mut conn, Some(&tmp_dir), &res_sub2.id, None).unwrap();

    let moved_topic = FolderRepository::get_folder_by_id(&conn, &res_sub2.id)
        .unwrap()
        .unwrap();
    assert_eq!(moved_topic.depth, 0);
    assert_eq!(moved_topic.parent_id, None);
    assert_eq!(moved_topic.path, "Topic 1");

    // 5. Cây thư mục get_folder_tree
    let tree = folder_service::get_folder_tree(&conn).unwrap();
    assert_eq!(tree.len(), 2); // 'LPIC' và 'Topic 1' ở root
    let lpic_node = tree.iter().find(|n| n.name == "LPIC").unwrap();
    assert_eq!(lpic_node.children.as_ref().unwrap().len(), 1);
    assert_eq!(lpic_node.children.as_ref().unwrap()[0].name, "101-v5");

    // 6. Xoá thư mục gốc
    folder_service::delete_folder(&mut conn, Some(&tmp_dir), &res_root.id).unwrap();
    assert!(FolderRepository::get_folder_by_id(&conn, &res_root.id)
        .unwrap()
        .is_none());
    // Con cháu '101-v5' cũng bị xoá cascade
    assert!(FolderRepository::get_folder_by_id(&conn, &res_sub.id)
        .unwrap()
        .is_none());

    let _ = fs::remove_dir_all(&tmp_dir);
}

#[test]
fn test_folder_service_validate_depth() {
    let mut conn = open_in_memory().unwrap();

    // Tạo chuỗi 10 cấp thư mục (cấp 0 đến cấp 9)
    let mut parent_id: Option<String> = None;
    for i in 0..10 {
        let name = format!("Level-{i}");
        let res = folder_service::create_folder(&conn, None, &name, parent_id.as_deref()).unwrap();
        assert_eq!(res.depth, i);
        parent_id = Some(res.id);
    }

    // Cố gắng tạo cấp thứ 11 (depth = 10) phải bị chặn
    let err11 =
        folder_service::create_folder(&conn, None, "Level-10-TooDeep", parent_id.as_deref());
    assert!(err11.is_err());
    let err_msg = err11.unwrap_err().to_string();
    assert!(err_msg.contains("10 cấp"));

    // Thử di chuyển khiến độ sâu vượt quá 9
    let root2 = folder_service::create_folder(&conn, None, "Branch-B", None).unwrap();
    let sub_b1 = folder_service::create_folder(&conn, None, "B-Sub1", Some(&root2.id)).unwrap();
    let _sub_b2 = folder_service::create_folder(&conn, None, "B-Sub2", Some(&sub_b1.id)).unwrap();

    let deep_folder = FolderRepository::get_folder_by_path(
        &conn,
        "Level-0/Level-1/Level-2/Level-3/Level-4/Level-5/Level-6/Level-7/Level-8",
    )
    .unwrap()
    .unwrap();

    let move_err = folder_service::move_folder(&mut conn, None, &root2.id, Some(&deep_folder.id));
    assert!(move_err.is_err());
    assert!(move_err.unwrap_err().to_string().contains("10 cấp"));
}
