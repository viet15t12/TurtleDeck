// src-tauri/src/db/migration_folders.rs — Di chuyển cấu trúc từ dạng phẳng sang dạng cây phân cấp (tree)
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationFolderResult {
    pub ok: bool,
    pub folders_created: usize,
    pub locations_created: usize,
    pub error: Option<String>,
}

fn extract_deck_id_from_sdeck(path: &Path) -> Option<String> {
    let file = fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut deck_file = archive.by_name("deck.json").ok()?;
    let mut content = String::new();
    deck_file.read_to_string(&mut content).ok()?;

    let val: serde_json::Value = serde_json::from_str(&content).ok()?;
    val.get("meta")
        .and_then(|m| m.get("id"))
        .and_then(|id| id.as_str())
        .map(|s| s.to_string())
}

pub fn migrate_to_folders(conn: &mut Connection, library_dir: &Path) -> MigrationFolderResult {
    if !library_dir.exists() {
        return MigrationFolderResult {
            ok: true,
            folders_created: 0,
            locations_created: 0,
            error: None,
        };
    }

    let mut folders_created = 0;
    let mut locations_created = 0;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let res: AppResult<()> = (|| {
        let tx = conn.transaction()?;
        let mut folder_map: HashMap<String, String> = HashMap::new();

        // 1. Quét đệ quy thư mục
        #[allow(clippy::too_many_arguments)]
        fn scan_dirs(
            tx: &rusqlite::Transaction,
            current_dir: &Path,
            root_dir: &Path,
            parent_id: Option<&str>,
            depth: i64,
            now: i64,
            folder_map: &mut HashMap<String, String>,
            folders_created: &mut usize,
        ) -> AppResult<()> {
            if depth > 9 {
                return Ok(());
            }

            let entries = match fs::read_dir(current_dir) {
                Ok(e) => e,
                Err(_) => return Ok(()),
            };

            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with('.') {
                    continue;
                }

                let full_path = entry.path();
                if full_path.is_dir() {
                    let rel_path = match full_path.strip_prefix(root_dir) {
                        Ok(p) => p.to_string_lossy().replace('\\', "/"),
                        Err(_) => continue,
                    };

                    let existing_id: Option<String> = tx
                        .query_row(
                            "SELECT id FROM folders WHERE path = ?1",
                            params![rel_path],
                            |row| row.get(0),
                        )
                        .ok();

                    let folder_id = if let Some(id) = existing_id {
                        id
                    } else {
                        let id = Uuid::new_v4().to_string();
                        tx.execute(
                            "INSERT INTO folders (id, name, parent_id, path, depth, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                            params![id, file_name, parent_id, rel_path, depth, now, now],
                        )?;
                        *folders_created += 1;
                        id
                    };

                    folder_map.insert(rel_path.clone(), folder_id.clone());
                    scan_dirs(
                        tx,
                        &full_path,
                        root_dir,
                        Some(&folder_id),
                        depth + 1,
                        now,
                        folder_map,
                        folders_created,
                    )?;
                }
            }

            Ok(())
        }

        scan_dirs(
            &tx,
            library_dir,
            library_dir,
            None,
            0,
            now,
            &mut folder_map,
            &mut folders_created,
        )?;

        // 2. Quét các file .sdeck và gắn vị trí deck_locations
        #[allow(clippy::too_many_arguments)]
        fn scan_files(
            tx: &rusqlite::Transaction,
            current_dir: &Path,
            root_dir: &Path,
            folder_id: Option<&str>,
            depth: i64,
            now: i64,
            folder_map: &HashMap<String, String>,
            locations_created: &mut usize,
        ) -> AppResult<()> {
            if depth > 9 {
                return Ok(());
            }

            let entries = match fs::read_dir(current_dir) {
                Ok(e) => e,
                Err(_) => return Ok(()),
            };

            for entry in entries.flatten() {
                let file_name = entry.file_name().to_string_lossy().to_string();
                if file_name.starts_with('.') {
                    continue;
                }

                let full_path = entry.path();
                if full_path.is_dir() {
                    let rel_path = match full_path.strip_prefix(root_dir) {
                        Ok(p) => p.to_string_lossy().replace('\\', "/"),
                        Err(_) => continue,
                    };
                    let sub_folder_id = folder_map.get(&rel_path).map(|s| s.as_str());
                    scan_files(
                        tx,
                        &full_path,
                        root_dir,
                        sub_folder_id,
                        depth + 1,
                        now,
                        folder_map,
                        locations_created,
                    )?;
                } else if full_path.is_file() || full_path.is_symlink() {
                    let lower = file_name.to_lowercase();
                    if !lower.ends_with(".sdeck")
                        || lower.ends_with(".bak")
                        || lower.ends_with(".tmp")
                    {
                        continue;
                    }

                    let is_link = if full_path.is_symlink() { 1 } else { 0 };
                    let link_target = if is_link == 1 {
                        fs::read_link(&full_path)
                            .ok()
                            .map(|p| p.to_string_lossy().to_string())
                    } else {
                        None
                    };

                    let file_path_str = full_path.to_string_lossy().to_string();

                    // Tra cứu deck_id: trước tiên qua giải nén deck.json, sau đó qua bảng decks
                    let mut deck_id = extract_deck_id_from_sdeck(&full_path);
                    if deck_id.is_none() {
                        deck_id = tx
                            .query_row(
                                "SELECT id FROM decks WHERE file_path = ?1",
                                params![file_path_str],
                                |row| row.get(0),
                            )
                            .ok();
                    }

                    if let Some(d_id) = deck_id {
                        // Kiểm tra xem vị trí đã có chưa
                        let existing_loc: Option<String> = if let Some(fid) = folder_id {
                            tx.query_row(
                                "SELECT id FROM deck_locations WHERE deck_id = ?1 AND folder_id = ?2",
                                params![d_id, fid],
                                |row| row.get(0),
                            )
                            .ok()
                        } else {
                            tx.query_row(
                                "SELECT id FROM deck_locations WHERE deck_id = ?1 AND folder_id IS NULL",
                                params![d_id],
                                |row| row.get(0),
                            )
                            .ok()
                        };

                        if existing_loc.is_none() {
                            let loc_id = Uuid::new_v4().to_string();
                            tx.execute(
                                "INSERT INTO deck_locations (id, deck_id, folder_id, file_path, is_link, link_target, created_at)
                                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                                params![loc_id, d_id, folder_id, file_path_str, is_link, link_target, now],
                            )?;
                            *locations_created += 1;
                        }
                    }
                }
            }

            Ok(())
        }

        scan_files(
            &tx,
            library_dir,
            library_dir,
            None,
            0,
            now,
            &folder_map,
            &mut locations_created,
        )?;

        tx.commit()?;
        Ok(())
    })();

    match res {
        Ok(()) => MigrationFolderResult {
            ok: true,
            folders_created,
            locations_created,
            error: None,
        },
        Err(e) => MigrationFolderResult {
            ok: false,
            folders_created: 0,
            locations_created: 0,
            error: Some(e.to_string()),
        },
    }
}
