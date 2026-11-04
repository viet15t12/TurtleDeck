// src-tauri/tests/draft_and_backup_test.rs — Kiểm thử DraftService và BackupService (Gate 4)
use serde_json::json;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::deck::DeckRepository;
use turtle_deck_lib::db::repositories::deck_location::DeckLocationRepository;
use turtle_deck_lib::db::repositories::folder::FolderRepository;
use turtle_deck_lib::paths::AppPaths;
use turtle_deck_lib::services::backup_service::{
    create_backup, create_full_backup, is_valid_backup_name, list_backups,
    prune_temporary_db_backups, restore_backup, restore_full_backup,
};
use turtle_deck_lib::services::draft_service::{
    delete_draft, list_drafts, load_draft, sanitize_draft_id, save_draft,
};
use turtle_deck_lib::services::package_store::{write_package, OpenPackage};
use turtle_deck_lib::state::AppState;

fn setup_test_env(prefix: &str) -> (PathBuf, AppState) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let tmp = std::env::temp_dir().join(format!("turtle-test-{prefix}-{now}"));
    let paths = AppPaths {
        user_data_dir: tmp.clone(),
        db_file: tmp.join("studyapp.db"),
        settings_file: tmp.join("settings.json"),
        progress_file: tmp.join("progress.json"),
        default_library_dir: tmp.join("library"),
        drafts_dir: tmp.join("drafts"),
        backups_dir: tmp.join("backups"),
    };
    fs::create_dir_all(&paths.default_library_dir).unwrap();
    fs::create_dir_all(&paths.drafts_dir).unwrap();
    fs::create_dir_all(&paths.backups_dir).unwrap();

    let state = AppState::new(paths);
    let conn = open_in_memory().unwrap();
    *state.db.lock().unwrap() = Some(conn);

    (tmp, state)
}

#[test]
fn test_draft_service_save_list_load_delete() {
    let (tmp_dir, state) = setup_test_env("draft");

    // 1. Kiểm tra sanitize_draft_id
    assert_eq!(sanitize_draft_id("my-deck-1"), "my-deck-1");
    assert_eq!(sanitize_draft_id("deck/../hack"), "deck_.._hack");
    assert_eq!(sanitize_draft_id(""), "draft");

    // 2. Mở một bộ thẻ giả lập trong PackageStore
    let orig_file = tmp_dir.join("library").join("orig.sdeck");
    fs::write(&orig_file, b"orig_content").unwrap();

    let deck_key = state.package_store.new_key();
    state.package_store.set(
        deck_key.clone(),
        OpenPackage {
            file: Some(orig_file.clone()),
            assets: HashMap::new(),
            source_dir: None,
        },
    );

    let deck_data = json!({
        "meta": { "id": "deck-draft-1", "title": "Bản nháp toán 12", "kind": "qa" },
        "items": [
            { "id": "q1", "type": "card", "front": "1 + 1", "back": "2" }
        ]
    });
    let deck_text = serde_json::to_string(&deck_data).unwrap();

    // 3. Lưu bản nháp
    let save_res = save_draft(
        &state.paths.drafts_dir,
        &state.package_store,
        "deck-draft-1",
        &deck_key,
        &deck_text,
    )
    .unwrap();
    assert_eq!(save_res.get("ok").and_then(|v| v.as_bool()), Some(true));
    let draft_id = save_res
        .get("draftId")
        .and_then(|v| v.as_str())
        .unwrap()
        .to_string();

    // 4. Liệt kê bản nháp: origChanged phải là false
    let drafts = list_drafts(&state.paths.drafts_dir).unwrap();
    assert_eq!(drafts.len(), 1);
    assert_eq!(
        drafts[0].get("title").and_then(|v| v.as_str()),
        Some("Bản nháp toán 12")
    );
    assert_eq!(
        drafts[0].get("origChanged").and_then(|v| v.as_bool()),
        Some(false)
    );

    // 5. Thay đổi mtime của orig_file để kiểm tra phát hiện thay đổi
    std::thread::sleep(std::time::Duration::from_millis(15));
    fs::write(&orig_file, b"updated_content").unwrap();
    let drafts_after = list_drafts(&state.paths.drafts_dir).unwrap();
    assert_eq!(
        drafts_after[0].get("origChanged").and_then(|v| v.as_bool()),
        Some(true)
    );

    // 6. Nạp lại bản nháp: load_draft
    let load_res = load_draft(&state.paths.drafts_dir, &draft_id, &state).unwrap();
    assert_eq!(load_res.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        load_res.get("origFile").and_then(|v| v.as_str()),
        Some(orig_file.to_string_lossy().as_ref())
    );

    // 7. Xoá bản nháp
    let del_res = delete_draft(&state.paths.drafts_dir, "deck-draft-1").unwrap();
    assert_eq!(del_res.get("ok").and_then(|v| v.as_bool()), Some(true));
    let drafts_empty = list_drafts(&state.paths.drafts_dir).unwrap();
    assert_eq!(drafts_empty.len(), 0);

    let _ = fs::remove_dir_all(&tmp_dir);
}

#[test]
fn test_backup_service_daily_and_manual_retention() {
    let (tmp_dir, state) = setup_test_env("backup");

    // 1. Kiểm tra whitelist tên backup (Issue 11)
    assert!(is_valid_backup_name("progress-2026-11-04.json"));
    assert!(is_valid_backup_name(
        "progress-2026-11-04-manual-1730700000.json"
    ));
    assert!(!is_valid_backup_name(".."));
    assert!(!is_valid_backup_name("custom-name.json"));
    assert!(!is_valid_backup_name("progress-.json"));
    assert!(!is_valid_backup_name("progress-hack/evil.json"));

    // 2. Kiểm tra dọn dẹp sao lưu tạm thời (Issue 6)
    for i in 1..=8 {
        let ts = 1000 + i;
        fs::write(
            state.paths.backups_dir.join(format!("pre-import-{ts}.db")),
            b"db",
        )
        .unwrap();
        fs::write(
            state.paths.backups_dir.join(format!("pre-restore-{ts}.db")),
            b"db",
        )
        .unwrap();
    }
    prune_temporary_db_backups(&state.paths.backups_dir, 3).unwrap();

    let remaining: Vec<String> = fs::read_dir(&state.paths.backups_dir)
        .unwrap()
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    let pre_imports: Vec<_> = remaining
        .iter()
        .filter(|s| s.starts_with("pre-import-"))
        .collect();
    let pre_restores: Vec<_> = remaining
        .iter()
        .filter(|s| s.starts_with("pre-restore-"))
        .collect();
    assert_eq!(pre_imports.len(), 3);
    assert_eq!(pre_restores.len(), 3);

    // 3. Tạo bản sao lưu thủ công (create_backup)
    let backup_res = create_backup(&state.paths.backups_dir, &state).unwrap();
    assert_eq!(backup_res.get("ok").and_then(|v| v.as_bool()), Some(true));
    let backup_name = backup_res
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap()
        .to_string();

    // 4. Liệt kê bản sao lưu (list_backups)
    let backups = list_backups(&state.paths.backups_dir).unwrap();
    assert!(!backups.is_empty());
    assert!(backups
        .iter()
        .any(|b| b.get("name").and_then(|v| v.as_str()) == Some(&backup_name)));

    // 5. Khôi phục từ bản sao lưu (restore_backup)
    let restore_res = restore_backup(&state.paths.backups_dir, &backup_name, &state).unwrap();
    assert_eq!(restore_res.get("ok").and_then(|v| v.as_bool()), Some(true));

    // Khôi phục file không hợp lệ phải bị từ chối
    let bad_restore = restore_backup(&state.paths.backups_dir, "bad-file.json", &state).unwrap();
    assert_eq!(bad_restore.get("ok").and_then(|v| v.as_bool()), Some(false));

    let _ = fs::remove_dir_all(&tmp_dir);
}

#[test]
fn test_full_backup_roundtrip_with_folders_and_sdeck() {
    let (tmp_dir, state) = setup_test_env("fullbackup");
    let lib_dir = state.paths.default_library_dir.clone();

    // 1. Tạo thư mục trong DB và trên đĩa: ToanHoc -> DaiSo
    let (_folder_math_id, folder_algebra_id) = state
        .with_db(|conn| {
            let math = FolderRepository::create_folder(conn, "ToanHoc", None).unwrap();
            let algebra = FolderRepository::create_folder(conn, "DaiSo", Some(&math.id)).unwrap();
            Ok((math.id, algebra.id))
        })
        .unwrap();

    let algebra_disk_dir = lib_dir.join("ToanHoc").join("DaiSo");
    fs::create_dir_all(&algebra_disk_dir).unwrap();

    // 2. Tạo một file bộ thẻ mẫu trong DaiSo
    let sample_deck = json!({
        "meta": { "id": "deck-algebra-1", "title": "Đại số 10", "kind": "qa" },
        "items": [
            { "id": "item-1", "type": "card", "front": "Phương trình bậc 2", "back": "ax^2 + bx + c = 0" }
        ]
    });
    let sdeck_built = write_package(
        &serde_json::to_string(&sample_deck).unwrap(),
        &HashMap::new(),
        false,
    )
    .unwrap();
    let sdeck_path = algebra_disk_dir.join("dai-so-10.sdeck");
    fs::write(&sdeck_path, &sdeck_built.bytes).unwrap();

    // Đăng ký deck vào SQLite
    state
        .with_db_mut(|conn| {
            DeckRepository::sync_deck(conn, &sample_deck, Some(&sdeck_path.to_string_lossy()))
                .unwrap();
            DeckLocationRepository::add_location(
                conn,
                "deck-algebra-1",
                Some(&folder_algebra_id),
                &sdeck_path.to_string_lossy(),
                false,
                None,
            )
            .unwrap();
            Ok(())
        })
        .unwrap();

    // 3. Thực hiện create_full_backup
    let full_res = create_full_backup(
        &state.paths.backups_dir,
        &lib_dir,
        &state.paths.settings_file,
        None,
        &state,
    )
    .unwrap();
    assert_eq!(full_res.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(full_res.get("decksCount").and_then(|v| v.as_u64()), Some(1));
    assert_eq!(
        full_res.get("foldersCount").and_then(|v| v.as_u64()),
        Some(2)
    );
    let backup_file = full_res
        .get("filePath")
        .and_then(|v| v.as_str())
        .unwrap()
        .to_string();

    // 4. Giả lập xoá sạch thư viện và khởi tạo DB mới (như cài mới app)
    fs::remove_dir_all(&lib_dir).unwrap();
    fs::create_dir_all(&lib_dir).unwrap();
    let fresh_conn = open_in_memory().unwrap();
    *state.db.lock().unwrap() = Some(fresh_conn);

    let empty_tree = state
        .with_db(|conn| FolderRepository::get_folder_tree(conn))
        .unwrap();
    assert_eq!(empty_tree.len(), 0);

    // 5. Thực hiện restore_full_backup
    let restore_res = restore_full_backup(
        &PathBuf::from(&backup_file),
        &lib_dir,
        &state.paths.settings_file,
        &state,
    )
    .unwrap();
    assert_eq!(restore_res.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        restore_res.get("decksCount").and_then(|v| v.as_u64()),
        Some(1)
    );
    assert_eq!(
        restore_res.get("foldersCount").and_then(|v| v.as_u64()),
        Some(2)
    );

    // 6. Kiểm tra cấu trúc thư mục được phục hồi trong SQLite
    let tree = state
        .with_db(|conn| FolderRepository::get_folder_tree(conn))
        .unwrap();
    assert_eq!(tree.len(), 1);
    assert_eq!(tree[0].name, "ToanHoc");
    let children = tree[0].children.as_ref().unwrap();
    assert_eq!(children.len(), 1);
    assert_eq!(children[0].name, "DaiSo");

    // Kiểm tra file .sdeck đã được giải nén ra đĩa đúng vị trí phân cấp
    let restored_file = lib_dir
        .join("ToanHoc")
        .join("DaiSo")
        .join("dai-so-10.sdeck");
    assert!(restored_file.is_file());
    assert!(fs::metadata(&restored_file).unwrap().len() > 0);

    let _ = fs::remove_dir_all(&tmp_dir);
}
