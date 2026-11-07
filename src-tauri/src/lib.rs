// src-tauri/src/lib.rs — Khởi tạo ứng dụng Tauri và đăng ký các command / plugin
pub mod commands;
pub mod db;
pub mod error;
pub mod paths;
pub mod services;
pub mod srs;
pub mod state;

use paths::AppPaths;
use state::AppState;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let paths = match AppPaths::new() {
        Ok(p) => {
            let _ = p.ensure_dirs();
            p
        }
        Err(e) => {
            eprintln!("Lỗi khởi tạo đường dẫn ứng dụng: {e}");
            return;
        }
    };

    let app_state = match db::open_or_create(&paths.db_file) {
        Ok(mut conn) => {
            // Chạy migration tự động nếu có progress.json cũ từ Electron
            let _ = db::migration::migrate_legacy_progress(&mut conn, &paths.user_data_dir);
            // Chạy migration cây thư mục vật lý cũ một lần duy nhất
            let _ = db::migration_folders::migrate_to_folders_once(
                &mut conn,
                &paths.default_library_dir,
            );
            AppState {
                paths,
                db: std::sync::Mutex::new(Some(conn)),
                package_store: Arc::new(services::package_store::PackageStore::new()),
                library_cache: std::sync::RwLock::new(std::collections::HashMap::new()),
                watcher: std::sync::Mutex::new(None),
                renderer_ready: std::sync::atomic::AtomicBool::new(false),
                pending_external_files: std::sync::Mutex::new(Vec::new()),
                remote_service: tokio::sync::Mutex::new(services::remote_server::RemoteService::new()),
            }
        }
        Err(e) => {
            eprintln!("Lỗi kết nối cơ sở dữ liệu SQLite: {e}");
            AppState::new(paths)
        }
    };

    let mut builder = tauri::Builder::default();

    // Plugin ghi log trong môi trường debug
    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    // Đăng ký custom URI scheme protocol asset:// phục vụ hình ảnh gói thẻ
    let pkg_store_for_asset = Arc::clone(&app_state.package_store);
    builder = builder.register_uri_scheme_protocol("asset", move |_app, req| {
        services::asset_protocol::handle_asset_request(&pkg_store_for_asset, &req)
    });

    // Các plugin chính
    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            // Khi mở instance thứ hai (nhấp đúp file .sdeck), kích hoạt lại cửa sổ chính
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let base_dir = std::path::Path::new(&cwd);
            let files = services::external_files::extract_sdeck_files(&args, Some(base_dir));
            let state = app.state::<AppState>();
            services::external_files::handle_external_files(app, &state, files);
        }))
        .manage(app_state)
        .setup(|app| {
            let state = app.state::<AppState>();
            let watcher = services::watcher::AppWatcher::new(
                app.handle().clone(),
                Arc::clone(&state.package_store),
            );
            let lib_dir = state.get_active_library_dir();
            watcher.watch_path(&lib_dir);
            if let Ok(mut lock) = state.watcher.lock() {
                *lock = Some(watcher);
            }

            // Xử lý tham số mở file ngoài lúc khởi động ứng dụng từ dòng lệnh (argv)
            let raw_args: Vec<String> = std::env::args().skip(1).collect();
            let cwd = std::env::current_dir().ok();
            let files = services::external_files::extract_sdeck_files(&raw_args, cwd.as_deref());
            services::external_files::handle_external_files(app.handle(), &state, files);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Deck commands
            commands::deck::deck_open,
            commands::deck::deck_import,
            commands::deck::deck_save,
            commands::deck::deck_import_sdeck,
            commands::deck::deck_close,
            commands::deck::deck_delete,
            commands::deck::deck_duplicate,
            commands::deck::deck_export_copy,
            commands::deck::deck_show_in_folder,
            commands::deck::deck_new,
            commands::deck::deck_query_items,
            // Asset commands
            commands::asset::asset_add,
            commands::asset::asset_add_bytes,
            commands::asset::asset_list,
            commands::asset::asset_remove,
            // Progress commands
            commands::progress::progress_load,
            commands::progress::progress_save,
            commands::progress::progress_export,
            commands::progress::progress_pick_import,
            commands::progress::progress_apply_import,
            // Settings commands
            commands::settings::settings_load,
            commands::settings::settings_save,
            // Import commands
            commands::import::import_pick_file,
            commands::import::import_preview,
            commands::import::import_commit,
            // Library commands
            commands::library::library_get_dir,
            commands::library::library_pick_dir,
            commands::library::library_set_dir,
            commands::library::library_scan,
            // Draft commands
            commands::draft::draft_save,
            commands::draft::draft_delete,
            commands::draft::draft_list,
            commands::draft::draft_load,
            // Backup commands
            commands::backup::backup_create,
            commands::backup::backup_create_full,
            commands::backup::backup_restore_full,
            commands::backup::backup_list,
            commands::backup::backup_restore,
            commands::backup::backup_open_folder,
            // Folder & Deck location commands
            commands::folder::folder_create,
            commands::folder::folder_rename,
            commands::folder::folder_move,
            commands::folder::folder_delete,
            commands::folder::folder_reorder,
            commands::folder::folder_get_tree,
            commands::folder::deck_move,
            commands::folder::deck_link,
            commands::folder::deck_unlink,
            commands::folder::deck_get_locations,
            // SRS commands
            commands::srs::srs_plan_session,
            commands::srs::srs_grade_answer,
            commands::srs::srs_get_deck_summary,
            commands::srs::srs_get_due_items,
            commands::srs::srs_record_review,
            commands::srs::srs_get_card,
            commands::srs::meta_get,
            commands::srs::meta_set_starred,
            commands::srs::meta_set_note,
            // Stats commands
            commands::stats::stats_get_deck_report,
            commands::stats::stats_get_overall_streak,
            // Remote Controller commands
            commands::remote::remote_start,
            commands::remote::remote_stop,
            commands::remote::remote_status,
            commands::remote::remote_broadcast_state,
            commands::remote::remote_set_pin,
            // Lifecycle commands
            commands::lifecycle::app_ready,
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("Lỗi khi khởi chạy ứng dụng Turtle Deck (Tauri)");
}
