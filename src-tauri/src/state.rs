// src-tauri/src/state.rs — Trạng thái ứng dụng dùng chung giữa các command
use crate::error::{AppError, AppResult};
use crate::paths::AppPaths;
use crate::services::library_service::LibraryCacheEntry;
use crate::services::package_store::PackageStore;
use crate::services::settings_service::load_settings;
use crate::services::watcher::AppWatcher;
use rusqlite::Connection;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex, RwLock};

pub struct AppState {
    pub paths: AppPaths,
    pub db: Mutex<Option<Connection>>,
    pub package_store: Arc<PackageStore>,
    pub library_cache: RwLock<HashMap<PathBuf, LibraryCacheEntry>>,
    pub watcher: Mutex<Option<Arc<AppWatcher>>>,
    pub renderer_ready: AtomicBool,
    pub pending_external_files: Mutex<Vec<PathBuf>>,
    pub remote_service: tokio::sync::Mutex<crate::services::remote_server::RemoteService>,
}

impl AppState {
    pub fn new(paths: AppPaths) -> Self {
        Self {
            paths,
            db: Mutex::new(None),
            package_store: Arc::new(PackageStore::new()),
            library_cache: RwLock::new(HashMap::new()),
            watcher: Mutex::new(None),
            renderer_ready: AtomicBool::new(false),
            pending_external_files: Mutex::new(Vec::new()),
            remote_service: tokio::sync::Mutex::new(crate::services::remote_server::RemoteService::new()),
        }
    }

    pub fn with_db<F, R>(&self, f: F) -> AppResult<R>
    where
        F: FnOnce(&Connection) -> AppResult<R>,
    {
        let guard = self
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("Khóa database bị lỗi: {e}")))?;
        let conn = guard
            .as_ref()
            .ok_or_else(|| AppError::Custom("Database chưa được khởi tạo.".into()))?;
        f(conn)
    }

    pub fn with_db_mut<F, R>(&self, f: F) -> AppResult<R>
    where
        F: FnOnce(&mut Connection) -> AppResult<R>,
    {
        let mut guard = self
            .db
            .lock()
            .map_err(|e| AppError::Custom(format!("Khóa database bị lỗi: {e}")))?;
        let conn = guard
            .as_mut()
            .ok_or_else(|| AppError::Custom("Database chưa được khởi tạo.".into()))?;
        f(conn)
    }

    pub fn get_active_library_dir(&self) -> PathBuf {
        let settings = load_settings(&self.paths.settings_file);
        if let Some(dir_str) = settings.get("libraryDir").and_then(|v| v.as_str()) {
            let p = PathBuf::from(dir_str);
            if p.is_absolute() {
                return p;
            }
        }
        self.paths.default_library_dir.clone()
    }
}
