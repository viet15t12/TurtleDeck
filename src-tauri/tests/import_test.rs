// src-tauri/tests/import_test.rs — Unit tests cho ImportService (Gate 4)
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use turtle_deck_lib::services::import_service::{
    commit_import, normalize_term, parse_delimited_rows, preview_import, stable_vocab_id,
};
use turtle_deck_lib::services::package_store::{OpenPackage, PackageStore};

fn setup_import_env() -> (PathBuf, PackageStore) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let tmp = std::env::temp_dir().join(format!("turtle-import-test-{now}"));
    fs::create_dir_all(&tmp).unwrap();
    let store = PackageStore::new();
    (tmp, store)
}

#[test]
fn test_import_token_security_and_preview() {
    let (tmp_dir, store) = setup_import_env();
    let secret_file = tmp_dir.join("secret.csv");
    fs::write(&secret_file, "term,definition\ncat,mèo").unwrap();

    // 1. Gửi trực tiếp đường dẫn không có token -> phải bị từ chối (Issue 2)
    let arbitrary_res = preview_import(
        &store,
        None,
        Some(secret_file.to_str().unwrap()),
        None,
        None,
        None,
    )
    .unwrap();
    assert_eq!(
        arbitrary_res.get("ok").and_then(|v| v.as_bool()),
        Some(false),
        "Arbitrary filePath without token must be rejected"
    );
    assert!(arbitrary_res
        .get("error")
        .and_then(|v| v.as_str())
        .unwrap()
        .contains("Đường dẫn chưa được cấp phép"));

    // 2. Token không hợp lệ hoặc đã hết hạn -> phải bị từ chối
    let bad_token_res = preview_import(
        &store,
        Some("expired-or-fake-token"),
        None,
        None,
        None,
        None,
    )
    .unwrap();
    assert_eq!(
        bad_token_res.get("ok").and_then(|v| v.as_bool()),
        Some(false)
    );
    assert!(bad_token_res
        .get("error")
        .and_then(|v| v.as_str())
        .unwrap()
        .contains("Token tệp nhập không hợp lệ"));

    // 3. Cấp token hợp lệ qua set_temp_import -> được chấp nhận
    let token = store.new_key();
    store.set_temp_import(token.clone(), secret_file.clone());
    let valid_res = preview_import(&store, Some(&token), None, None, None, None).unwrap();
    assert_eq!(
        valid_res.get("ok").and_then(|v| v.as_bool()),
        Some(true),
        "Valid token must be allowed"
    );
    let items = valid_res.get("items").and_then(|v| v.as_array()).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].get("term").and_then(|v| v.as_str()), Some("cat"));
    assert_eq!(
        items[0].get("definition").and_then(|v| v.as_str()),
        Some("mèo")
    );

    let _ = fs::remove_dir_all(&tmp_dir);
}

#[test]
fn test_import_csv_tsv_parser_and_assets() {
    let (tmp_dir, store) = setup_import_env();

    // 1. Kiểm tra chuẩn hoá từ vựng và stableVocabId
    assert_eq!(normalize_term("  Hello   World  "), "hello world");
    let id1 = stable_vocab_id("apple");
    let id2 = stable_vocab_id("  Apple  ");
    assert_eq!(id1, id2);
    assert!(id1.starts_with("w-"));

    // 2. Kiểm tra parser phân cách với nháy kép và xuống dòng
    let csv_content = "term,definition,example\n\"complex\",\"nghĩa có \"\"nháy\"\" và , phẩy\",\"Dòng 1\nDòng 2\"\n\"dog\",\"chó\",\"\"\n\"Dog\",\"chó trùng\",\"\"";
    let rows = parse_delimited_rows(csv_content, ',');
    assert_eq!(rows.len(), 4);
    assert_eq!(rows[1][1], "nghĩa có \"nháy\" và , phẩy");

    // 3. Tạo thư mục ảnh và file nhập
    let img_dir = tmp_dir.join("img");
    fs::create_dir_all(&img_dir).unwrap();
    let sample_png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
    fs::write(img_dir.join("cat.png"), sample_png).unwrap();

    let tsv_file = tmp_dir.join("vocab.tsv");
    let tsv_content = "term\tdefinition\timage\ncat\tcon mèo\timg/cat.png";
    fs::write(&tsv_file, tsv_content).unwrap();

    let token = store.new_key();
    store.set_temp_import(token.clone(), tsv_file.clone());

    let preview_res = preview_import(&store, Some(&token), None, None, Some("tsv"), None).unwrap();
    assert_eq!(preview_res.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        preview_res.get("assetCount").and_then(|v| v.as_u64()),
        Some(1)
    );
    let import_id = preview_res
        .get("importId")
        .and_then(|v| v.as_str())
        .unwrap()
        .to_string();

    // 4. Kiểm tra commit_import chuyển asset vào OpenPackage
    let deck_key = store.new_key();
    store.set(
        deck_key.clone(),
        OpenPackage {
            file: None,
            assets: HashMap::new(),
            source_dir: None,
        },
    );

    let commit_res = commit_import(&store, Some(&deck_key), Some(&import_id), None).unwrap();
    assert_eq!(commit_res.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert_eq!(
        commit_res.get("assetCount").and_then(|v| v.as_u64()),
        Some(1)
    );

    let pkg = store.get(&deck_key).unwrap();
    assert!(pkg.assets.contains_key("img/cat.png"));

    let _ = fs::remove_dir_all(&tmp_dir);
}

#[test]
fn test_temp_import_ttl_pruning() {
    let store = PackageStore::new();
    let now = 10_000_000u64;

    store.set_temp_import_at("token1".to_string(), PathBuf::from("/path/1"), now);
    // Tạo token2 quá hạn 40 phút trước (2_400_000 ms)
    let past_time = now - (40 * 60 * 1000);
    store.set_temp_import_at("token2".to_string(), PathBuf::from("/path/2"), past_time);

    assert_eq!(
        store.get_temp_import("token1"),
        Some(PathBuf::from("/path/1"))
    );
    assert_eq!(
        store.get_temp_import("token2"),
        Some(PathBuf::from("/path/2"))
    );

    // Dọn dẹp với TTL 30 phút
    store.prune_temp_imports(30 * 60 * 1000, now);

    assert_eq!(
        store.get_temp_import("token1"),
        Some(PathBuf::from("/path/1")),
        "Fresh token must be retained"
    );
    assert_eq!(
        store.get_temp_import("token2"),
        None,
        "Expired token must be pruned"
    );
}
