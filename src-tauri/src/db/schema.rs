// src-tauri/src/db/schema.rs — Khởi tạo cấu trúc bảng SQLite
use crate::error::AppResult;
use rusqlite::Connection;

pub fn create_schema(_conn: &Connection) -> AppResult<()> {
    // Sẽ port chi tiết ở Giai đoạn 2
    Ok(())
}
