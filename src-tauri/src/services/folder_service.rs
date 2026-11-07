// src-tauri/src/services/folder_service.rs — Quản lý cây thư mục ảo trong SQLite (không chạm hệ thống tệp)
use crate::db::repositories::folder::{Folder, FolderRepository};
use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::Path;

pub fn validate_folder_name(name: &str) -> bool {
    let trimmed = name.trim();
    !trimmed.is_empty() && trimmed.len() <= 255 && trimmed != "." && trimmed != ".."
}

pub fn create_folder(
    conn: &Connection,
    _library_dir: Option<&Path>,
    name: &str,
    parent_id: Option<&str>,
) -> AppResult<Folder> {
    if !validate_folder_name(name) {
        return Err(AppError::Custom("Tên thư mục không hợp lệ.".into()));
    }
    FolderRepository::create_folder(conn, name, parent_id)
}

pub fn rename_folder(
    conn: &Connection,
    _library_dir: Option<&Path>,
    id: &str,
    new_name: &str,
) -> AppResult<Folder> {
    if !validate_folder_name(new_name) {
        return Err(AppError::Custom("Tên thư mục mới không hợp lệ.".into()));
    }
    FolderRepository::rename_folder(conn, id, new_name)
}

pub fn move_folder(
    conn: &Connection,
    _library_dir: Option<&Path>,
    id: &str,
    new_parent_id: Option<&str>,
) -> AppResult<Folder> {
    FolderRepository::move_folder(conn, id, new_parent_id)
}

pub fn delete_folder(
    conn: &Connection,
    _library_dir: Option<&Path>,
    id: &str,
) -> AppResult<Vec<String>> {
    FolderRepository::delete_folder(conn, id)
}

pub fn reorder_folders(
    conn: &Connection,
    parent_id: Option<&str>,
    ordered_ids: &[String],
) -> AppResult<()> {
    FolderRepository::reorder_folders(conn, parent_id, ordered_ids)
}

pub fn get_folder_tree(conn: &Connection) -> AppResult<Vec<Folder>> {
    FolderRepository::get_folder_tree(conn)
}
