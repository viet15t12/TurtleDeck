// src-tauri/tests/lifecycle_and_packaging_test.rs — Kiểm thử trích xuất argv mở file ngoài và vòng đời ứng dụng
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use turtle_deck_lib::paths::AppPaths;
use turtle_deck_lib::services::external_files::extract_sdeck_files;
use turtle_deck_lib::state::AppState;

fn make_temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "turtle-deck-{name}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn test_extract_sdeck_files_from_args_filtering_and_resolution() {
    let tmp = make_temp_dir("lifecycle-args");
    let base_dir = &tmp;

    // Tạo các file giả lập
    let deck1 = base_dir.join("toan.sdeck");
    let deck2 = base_dir.join("van.SDECK");
    let not_deck = base_dir.join("notes.txt");
    fs::write(&deck1, b"PK01").unwrap();
    fs::write(&deck2, b"PK02").unwrap();
    fs::write(&not_deck, b"test").unwrap();

    let raw_args = vec![
        "--debug".to_string(),
        "-v".to_string(),
        "notes.txt".to_string(),
        "toan.sdeck".to_string(),
        "toan.sdeck".to_string(), // trùng lặp
        deck2.to_str().unwrap().to_string(),
        "--port=8080".to_string(),
        "".to_string(),
    ];

    let extracted = extract_sdeck_files(&raw_args, Some(base_dir));

    assert_eq!(extracted.len(), 2, "Chỉ giữ lại 2 file .sdeck hợp lệ");
    assert!(
        extracted.iter().any(|p| p.ends_with("toan.sdeck")),
        "Phải chứa toan.sdeck"
    );
    assert!(
        extracted
            .iter()
            .any(|p| p.ends_with("van.SDECK") || p.ends_with("van.sdeck")),
        "Phải nhận diện cả phần mở rộng viết hoa .SDECK"
    );

    let _ = fs::remove_dir_all(&tmp);
}

#[test]
fn test_external_files_lifecycle_queue_and_flush() {
    let tmp = make_temp_dir("lifecycle-queue");
    let paths = AppPaths {
        user_data_dir: tmp.clone(),
        db_file: tmp.join("test.db"),
        settings_file: tmp.join("settings.json"),
        progress_file: tmp.join("progress.json"),
        backups_dir: tmp.join("backups"),
        drafts_dir: tmp.join("drafts"),
        default_library_dir: tmp.join("StudyDecks"),
    };

    let state = AppState::new(paths);

    // Ban đầu renderer chưa sẵn sàng
    assert!(!state.renderer_ready.load(Ordering::SeqCst));
    assert!(state.pending_external_files.lock().unwrap().is_empty());

    // Thêm các file vào hàng đợi khi renderer chưa sẵn sàng
    let file1 = PathBuf::from("/tmp/deck1.sdeck");
    let file2 = PathBuf::from("/tmp/deck2.sdeck");
    {
        let mut pending = state.pending_external_files.lock().unwrap();
        pending.push(file1.clone());
        pending.push(file2.clone());
    }

    assert_eq!(state.pending_external_files.lock().unwrap().len(), 2);

    // Giả lập renderer gọi app_ready (dọn sạch hàng đợi và đổi cờ ready)
    state.renderer_ready.store(true, Ordering::SeqCst);
    let drained: Vec<PathBuf> = {
        let mut pending = state.pending_external_files.lock().unwrap();
        std::mem::take(&mut *pending)
    };

    assert!(state.renderer_ready.load(Ordering::SeqCst));
    assert_eq!(drained.len(), 2);
    assert!(state.pending_external_files.lock().unwrap().is_empty());

    let _ = fs::remove_dir_all(&tmp);
}
