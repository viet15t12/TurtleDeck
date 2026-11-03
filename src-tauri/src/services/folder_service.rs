// src-tauri/src/services/folder_service.rs — Quản lý cây thư mục và đồng bộ với hệ thống tệp
use crate::db::repositories::folder::{Folder, FolderRepository};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::fs;
use std::path::Path;

pub fn validate_folder_name(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed.len() > 255 {
        return false;
    }
    if trimmed == "." || trimmed == ".." {
        return false;
    }
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    if trimmed.contains(&invalid_chars[..]) {
        return false;
    }
    true
}

pub fn create_folder(
    conn: &Connection,
    library_dir: Option<&Path>,
    name: &str,
    parent_id: Option<&str>,
) -> AppResult<Folder> {
    if !validate_folder_name(name) {
        return Err(AppError::Custom(
            "Tên thư mục không hợp lệ hoặc chứa ký tự đặc biệt (/ \\ : * ? \" < > |).".into(),
        ));
    }

    let folder = FolderRepository::create_folder(conn, name, parent_id)?;

    if let Some(lib_dir) = library_dir {
        let disk_path = lib_dir.join(&folder.path);
        let _ = fs::create_dir_all(disk_path);
    }

    Ok(folder)
}

pub fn rename_folder(
    conn: &mut Connection,
    library_dir: Option<&Path>,
    id: &str,
    new_name: &str,
) -> AppResult<()> {
    if !validate_folder_name(new_name) {
        return Err(AppError::Custom(
            "Tên thư mục mới không hợp lệ hoặc chứa ký tự đặc biệt.".into(),
        ));
    }

    let old_folder = FolderRepository::get_folder_by_id(conn, id)?
        .ok_or_else(|| AppError::Custom("Thư mục không tồn tại.".into()))?;

    FolderRepository::rename_folder(conn, id, new_name)?;

    if let Some(lib_dir) = library_dir {
        if let Ok(Some(new_folder)) = FolderRepository::get_folder_by_id(conn, id) {
            let old_disk_path = lib_dir.join(&old_folder.path);
            let new_disk_path = lib_dir.join(&new_folder.path);
            if old_disk_path.exists() {
                let _ = fs::rename(old_disk_path, new_disk_path);
            }
        }
    }

    Ok(())
}

pub fn move_folder(
    conn: &mut Connection,
    library_dir: Option<&Path>,
    id: &str,
    new_parent_id: Option<&str>,
) -> AppResult<()> {
    let old_folder = FolderRepository::get_folder_by_id(conn, id)?
        .ok_or_else(|| AppError::Custom("Thư mục không tồn tại.".into()))?;

    FolderRepository::move_folder(conn, id, new_parent_id)?;

    if let Some(lib_dir) = library_dir {
        if let Ok(Some(new_folder)) = FolderRepository::get_folder_by_id(conn, id) {
            let old_disk_path = lib_dir.join(&old_folder.path);
            let new_disk_path = lib_dir.join(&new_folder.path);
            if old_disk_path.exists() {
                if let Some(parent) = new_disk_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::rename(old_disk_path, new_disk_path);
            }
        }
    }

    Ok(())
}

pub fn delete_folder(conn: &mut Connection, library_dir: Option<&Path>, id: &str) -> AppResult<()> {
    let old_folder = FolderRepository::get_folder_by_id(conn, id)?;

    FolderRepository::delete_folder(conn, id)?;

    if let Some(lib_dir) = library_dir {
        if let Some(folder) = old_folder {
            let disk_path = lib_dir.join(&folder.path);
            if disk_path.exists() {
                let _ = fs::remove_dir_all(disk_path);
            }
        }
    }

    Ok(())
}

pub fn get_folder_tree(conn: &Connection) -> AppResult<Vec<Folder>> {
    FolderRepository::get_folder_tree(conn)
}
