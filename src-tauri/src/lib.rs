// src-tauri/src/lib.rs — Khởi tạo ứng dụng Tauri và đăng ký các command / plugin
pub mod commands;
pub mod db;
pub mod error;
pub mod paths;
pub mod services;
pub mod state;

use paths::AppPaths;
use state::AppState;

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

    let app_state = AppState::new(paths);

    let mut builder = tauri::Builder::default();

    // Plugin ghi log trong môi trường debug
    if cfg!(debug_assertions) {
        builder = builder.plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );
    }

    // Các plugin chính
    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|_app, _args, _cwd| {
            // Sẽ xử lý sự kiện deck:openExternal ở Giai đoạn 5
        }))
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Deck commands
            commands::deck::deck_open,
            commands::deck::deck_import,
            commands::deck::deck_save,
            commands::deck::deck_import_sdeck,
            commands::deck::deck_close,
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
            commands::folder::folder_get_tree,
            commands::folder::deck_move,
            commands::folder::deck_link,
            commands::folder::deck_unlink,
            commands::folder::deck_get_locations,
            // SRS commands
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
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("Lỗi khi khởi chạy ứng dụng Turtle Deck (Tauri)");
}
