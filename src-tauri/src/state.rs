// src-tauri/src/state.rs — Trạng thái ứng dụng dùng chung giữa các command
use std::sync::Mutex;
use rusqlite::Connection;
use crate::paths::AppPaths;

pub struct AppState {
    pub paths: AppPaths,
    pub db: Mutex<Option<Connection>>,
}

impl AppState {
    pub fn new(paths: AppPaths) -> Self {
        Self {
            paths,
            db: Mutex::new(None),
        }
    }
}
