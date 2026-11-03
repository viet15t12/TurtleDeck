// src-tauri/src/services/deck_location_service.rs — Quản lý vị trí bộ thẻ và liên kết (symlink)
use crate::db::repositories::deck_location::{DeckLocation, DeckLocationRepository};
use crate::db::repositories::folder::FolderRepository;
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};

pub fn move_deck(
    conn: &Connection,
    library_dir: Option<&Path>,
    deck_id: &str,
    new_folder_id: Option<&str>,
) -> AppResult<()> {
    let locations = DeckLocationRepository::get_locations_by_deck(conn, deck_id)?;
    let mut loc = locations.iter().find(|l| !l.is_link).cloned();
    if loc.is_none() && !locations.is_empty() {
        loc = Some(locations[0].clone());
    }

    if loc.is_none() {
        // Thử tìm trong bảng decks
        let deck_file_path: Option<String> = conn
            .query_row(
                "SELECT file_path FROM decks WHERE id = ?1",
                rusqlite::params![deck_id],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        if let Some(fp) = deck_file_path {
            loc = Some(DeckLocationRepository::add_location(
                conn, deck_id, None, &fp, false, None,
            )?);
        }
    }

    let location = loc.ok_or_else(|| {
        AppError::Custom("Không tìm thấy vị trí của bộ thẻ trong hệ thống.".into())
    })?;

    if location.folder_id.as_deref() == new_folder_id {
        return Ok(());
    }

    let source_path = PathBuf::from(&location.file_path);
    let root_dir = if let Some(lib_dir) = library_dir {
        lib_dir.to_path_buf()
    } else if let Some(parent) = source_path.parent() {
        parent.to_path_buf()
    } else {
        PathBuf::from(".")
    };

    let target_dir = if let Some(fid) = new_folder_id {
        let folder = FolderRepository::get_folder_by_id(conn, fid)?
            .ok_or_else(|| AppError::Custom("Thư mục đích không tồn tại.".into()))?;
        root_dir.join(&folder.path)
    } else {
        root_dir
    };

    let file_name = source_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("{deck_id}.sdeck"));

    let target_path = target_dir.join(&file_name);

    if source_path.exists() && source_path != target_path {
        fs::create_dir_all(&target_dir)?;
        fs::rename(&source_path, &target_path)?;
    }

    let target_path_str = target_path.to_string_lossy().to_string();
    DeckLocationRepository::move_location(
        conn,
        &location.id,
        new_folder_id,
        Some(&target_path_str),
    )?;

    // Cập nhật lại đường dẫn trong bảng decks
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let _ = conn.execute(
        "UPDATE decks SET file_path = ?1, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![target_path_str, now, deck_id],
    );

    Ok(())
}

pub fn link_deck(
    conn: &Connection,
    library_dir: Option<&Path>,
    deck_id: &str,
    target_folder_id: Option<&str>,
) -> AppResult<()> {
    let locations = DeckLocationRepository::get_locations_by_deck(conn, deck_id)?;
    let loc = locations
        .iter()
        .find(|l| !l.is_link)
        .or_else(|| locations.first())
        .ok_or_else(|| {
            AppError::Custom("Không tìm thấy vị trí gốc của bộ thẻ để tạo liên kết.".into())
        })?;

    let source_path = PathBuf::from(&loc.file_path);
    let root_dir = if let Some(lib_dir) = library_dir {
        lib_dir.to_path_buf()
    } else if let Some(parent) = source_path.parent() {
        parent.to_path_buf()
    } else {
        PathBuf::from(".")
    };

    let target_dir = if let Some(fid) = target_folder_id {
        let folder = FolderRepository::get_folder_by_id(conn, fid)?
            .ok_or_else(|| AppError::Custom("Thư mục đích không tồn tại.".into()))?;
        root_dir.join(&folder.path)
    } else {
        root_dir
    };

    let file_name = source_path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| format!("{deck_id}.sdeck"));

    let target_path = target_dir.join(&file_name);

    if target_path == source_path {
        return Err(AppError::Custom(
            "Không thể tạo liên kết tại cùng vị trí với tệp gốc.".into(),
        ));
    }

    fs::create_dir_all(&target_dir)?;

    #[cfg(unix)]
    {
        if target_path.exists() || target_path.is_symlink() {
            let _ = fs::remove_file(&target_path);
        }
        std::os::unix::fs::symlink(&source_path, &target_path)?;
    }

    #[cfg(windows)]
    {
        if target_path.exists() {
            let _ = fs::remove_file(&target_path);
        }
        std::os::windows::fs::symlink_file(&source_path, &target_path)?;
    }

    let target_path_str = target_path.to_string_lossy().to_string();
    DeckLocationRepository::add_location(
        conn,
        deck_id,
        target_folder_id,
        &target_path_str,
        true,
        Some(&loc.file_path),
    )?;

    Ok(())
}

pub fn unlink_deck(conn: &Connection, location_id: &str, delete_file: bool) -> AppResult<()> {
    let loc = DeckLocationRepository::get_location_by_id(conn, location_id)?
        .ok_or_else(|| AppError::Custom("Không tìm thấy vị trí bộ thẻ.".into()))?;

    if delete_file {
        let path = PathBuf::from(&loc.file_path);
        if path.exists() || path.is_symlink() {
            let _ = fs::remove_file(path);
        }
    }

    DeckLocationRepository::remove_location(conn, location_id)?;
    Ok(())
}

pub fn get_locations(conn: &Connection, deck_id: Option<&str>) -> AppResult<Vec<DeckLocation>> {
    if let Some(did) = deck_id {
        DeckLocationRepository::get_locations_by_deck(conn, did)
    } else {
        DeckLocationRepository::get_all_locations(conn)
    }
}
