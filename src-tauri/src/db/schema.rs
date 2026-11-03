// src-tauri/src/db/schema.rs — Khởi tạo cấu trúc bảng SQLite
use rusqlite::Connection;
use crate::error::AppResult;

pub fn create_schema(_conn: &Connection) -> AppResult<()> {
    // Sẽ port chi tiết ở Giai đoạn 2
    Ok(())
}
