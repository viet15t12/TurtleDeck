// src-tauri/src/services/watcher.rs — Theo dõi thay đổi của các file .sdeck trong thư viện bằng notify
use crate::db::repositories::deck::DeckRepository;
use crate::error::AppResult;
use crate::services::package_store::{read_package, PackageStore};
use crate::state::AppState;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

/// Đồng bộ DB khi Watcher phát hiện file .sdeck bị xóa khỏi đĩa:
/// Xóa hẳn hàng `decks` -> `deck_locations` và `items` bị cascade xóa theo (không còn hàng mồ côi).
pub fn handle_watcher_file_removed(conn: &mut Connection, path: &Path) -> AppResult<Option<String>> {
    let path_str = path.to_string_lossy().to_string();
    DeckRepository::remove_deck_by_file_path(conn, &path_str)
}

/// Đồng bộ DB khi Watcher phát hiện file .sdeck mới hoặc xuất hiện lại cùng `meta.id`:
/// - Bộ thẻ mới: tạo hàng `decks` và hàng vị trí chính (`folder_id = NULL`) trong cùng transaction.
/// - Bộ thẻ đã có cùng `meta.id`: cập nhật đường dẫn `file_path` của hàng `decks`, giữ nguyên `deck_locations`.
pub fn handle_watcher_file_added_or_changed(
    conn: &mut Connection,
    path: &Path,
    deck: &Value,
) -> AppResult<()> {
    let path_str = path.to_string_lossy().to_string();
    DeckRepository::sync_deck(conn, deck, Some(&path_str))?;
    Ok(())
}

pub struct AppWatcher {
    app: AppHandle,
    package_store: Arc<PackageStore>,
    watched_dirs: Mutex<HashSet<PathBuf>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    debounce_map: Mutex<HashMap<PathBuf, Instant>>,
}

impl AppWatcher {
    pub fn new(app: AppHandle, package_store: Arc<PackageStore>) -> Arc<Self> {
        let instance = Arc::new(Self {
            app,
            package_store,
            watched_dirs: Mutex::new(HashSet::new()),
            watcher: Mutex::new(None),
            debounce_map: Mutex::new(HashMap::new()),
        });

        let watcher_self = Arc::clone(&instance);
        let watcher_res = RecommendedWatcher::new(
            move |res: Result<Event, notify::Error>| {
                if let Ok(event) = res {
                    watcher_self.handle_event(event);
                }
            },
            Config::default(),
        );

        if let Ok(w) = watcher_res {
            if let Ok(mut lock) = instance.watcher.lock() {
                *lock = Some(w);
            }
        }

        instance
    }

    pub fn watch_path(&self, dir_path: &Path) {
        let canonical = fs::canonicalize(dir_path).unwrap_or_else(|_| dir_path.to_path_buf());
        let mut lock = match self.watched_dirs.lock() {
            Ok(l) => l,
            Err(_) => return,
        };

        if lock.contains(&canonical) {
            return;
        }

        if let Ok(mut watcher_lock) = self.watcher.lock() {
            if let Some(watcher) = watcher_lock.as_mut() {
                if watcher.watch(&canonical, RecursiveMode::Recursive).is_ok() {
                    lock.insert(canonical);
                }
            }
        }
    }

    fn handle_event(&self, event: Event) {
        for path in event.paths {
            let filename = match path.file_name().and_then(|n| n.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };

            if !filename.to_lowercase().ends_with(".sdeck")
                || filename.ends_with(".tmp")
                || filename.ends_with(".bak")
            {
                continue;
            }

            // Debounce 500ms
            let now = Instant::now();
            {
                let mut d_lock = match self.debounce_map.lock() {
                    Ok(l) => l,
                    Err(_) => continue,
                };
                if let Some(&last) = d_lock.get(&path) {
                    if now.duration_since(last) < Duration::from_millis(500) {
                        continue;
                    }
                }
                d_lock.insert(path.clone(), now);
            }

            let app_handle = self.app.clone();
            let pkg_store = Arc::clone(&self.package_store);
            let target_path = path.clone();
            let kind = event.kind;

            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(300)).await;

                if matches!(kind, EventKind::Remove(_)) || !target_path.exists() {
                    let mut removed_deck_id = None;
                    if let Some(state) = app_handle.try_state::<AppState>() {
                        if let Ok(did) = state.with_db_mut(|conn| {
                            handle_watcher_file_removed(conn, &target_path)
                        }) {
                            removed_deck_id = did;
                        }
                    }
                    let _ = app_handle.emit(
                        "deck:fileRemoved",
                        json!({
                            "path": target_path.to_string_lossy(),
                            "deckId": removed_deck_id,
                        }),
                    );
                    return;
                }

                let meta = match fs::metadata(&target_path) {
                    Ok(m) => m,
                    Err(_) => return,
                };

                let mtime_ms = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                if pkg_store.is_self_save(&target_path, mtime_ms) {
                    return;
                }

                let bytes = match fs::read(&target_path) {
                    Ok(b) => b,
                    Err(_) => return,
                };

                let pkg_res = match read_package(&bytes) {
                    Ok(p) => p,
                    Err(e) => {
                        let _ = app_handle.emit(
                            "deck:watchError",
                            json!({ "path": target_path.to_string_lossy(), "error": e.to_string() }),
                        );
                        return;
                    }
                };

                let deck: serde_json::Value = match serde_json::from_str(&pkg_res.deck_text) {
                    Ok(d) => d,
                    Err(e) => {
                        let _ = app_handle.emit(
                            "deck:watchError",
                            json!({ "path": target_path.to_string_lossy(), "error": format!("deck.json hỏng: {e}") }),
                        );
                        return;
                    }
                };

                if let Some(state) = app_handle.try_state::<AppState>() {
                    let _ = state.with_db_mut(|conn| {
                        handle_watcher_file_added_or_changed(conn, &target_path, &deck)
                    });
                }

                let total = deck
                    .get("items")
                    .and_then(|i| i.as_array())
                    .map(|a| a.len())
                    .unwrap_or(0);

                if let Some((opened_key, mut opened_pkg)) = pkg_store.find_by_file(&target_path) {
                    opened_pkg.assets = pkg_res.assets.clone();
                    pkg_store.set(opened_key.clone(), opened_pkg);

                    let _ = app_handle.emit(
                        "deck:changed",
                        json!({
                            "path": target_path.to_string_lossy(),
                            "deckKey": opened_key,
                            "deckText": pkg_res.deck_text,
                            "deck": deck,
                            "total": total,
                            "assetCount": pkg_res.assets.len(),
                        }),
                    );
                } else {
                    let _ = app_handle.emit(
                        "deck:fileAdded",
                        json!({
                            "path": target_path.to_string_lossy(),
                            "deck": deck,
                            "total": total,
                        }),
                    );
                }
            });
        }
    }

    pub fn close_all(&self) {
        if let Ok(mut watcher_lock) = self.watcher.lock() {
            *watcher_lock = None;
        }
        if let Ok(mut d_lock) = self.watched_dirs.lock() {
            d_lock.clear();
        }
        if let Ok(mut deb_lock) = self.debounce_map.lock() {
            deb_lock.clear();
        }
    }
}
