// src-tauri/src/db/migration.rs — Migration các phiên bản schema SQLite
use rusqlite::Connection;
use crate::error::AppResult;

pub fn run_migrations(_conn: &Connection) -> AppResult<()> {
    // Sẽ port chi tiết ở Giai đoạn 2
    Ok(())
}
