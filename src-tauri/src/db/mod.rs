// src-tauri/src/db/mod.rs — Module kết nối và quản lý cơ sở dữ liệu SQLite
pub mod migration;
pub mod repositories;
pub mod schema;

use rusqlite::Connection;
use crate::error::AppResult;

pub fn init_db(conn: &Connection) -> AppResult<()> {
    // PRAGMA tương thích hoàn toàn với bản Electron
    conn.execute_batch(
        "PRAGMA journal_mode=WAL;
         PRAGMA synchronous=NORMAL;
         PRAGMA foreign_keys=ON;
         PRAGMA temp_store=MEMORY;
         PRAGMA cache_size=-32000;
         PRAGMA busy_timeout=5000;"
    )?;
    Ok(())
}
