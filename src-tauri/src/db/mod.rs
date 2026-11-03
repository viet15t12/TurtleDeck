// src-tauri/src/db/mod.rs — Module kết nối và quản lý cơ sở dữ liệu SQLite
pub mod migration;
pub mod migration_folders;
pub mod repositories;
pub mod schema;

use crate::error::AppResult;
use rusqlite::Connection;
use std::path::Path;

pub fn init_db(conn: &Connection) -> AppResult<()> {
    // PRAGMA tương thích hoàn toàn với bản Electron
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;
         PRAGMA temp_store=MEMORY;
         PRAGMA cache_size=-32000;
         PRAGMA busy_timeout=5000;",
    )?;
    Ok(())
}

pub fn open_or_create(db_path: &Path) -> AppResult<Connection> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(db_path)?;
    init_db(&conn)?;
    schema::create_schema(&conn)?;
    Ok(conn)
}

pub fn open_in_memory() -> AppResult<Connection> {
    let conn = Connection::open_in_memory()?;
    init_db(&conn)?;
    schema::create_schema(&conn)?;
    Ok(conn)
}
