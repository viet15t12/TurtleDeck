// src-tauri/src/db/migration_folders.rs — Nhập cấu trúc thư mục vật lý cũ sang cây thư mục ảo SQLite (chỉ đọc đĩa)
use crate::error::AppResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
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

fn extract_deck_meta_from_sdeck(path: &Path) -> Option<(String, String, String)> {
    let file = fs::File::open(path).ok()?;
    let mut archive = zip::ZipArchive::new(file).ok()?;
    let mut deck_file = archive.by_name("deck.json").ok()?;
    let mut content = String::new();
    deck_file.read_to_string(&mut content).ok()?;

    let val: serde_json::Value = serde_json::from_str(&content).ok()?;
    let meta = val.get("meta")?;
    let id = meta.get("id").and_then(|v| v.as_str())?.to_string();
    let title = meta
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Bộ thẻ")
        .to_string();
    let kind_raw = meta
        .get("kind")
        .and_then(|v| v.as_str())
        .unwrap_or("quiz");
    let kind = match kind_raw {
        "qa" | "quiz" | "vocab" => kind_raw.to_string(),
        _ => "quiz".to_string(),
    };
    Some((id, title, kind))
}

/// Chạy migration một lần duy nhất cho mỗi cơ sở dữ liệu khi khởi động ứng dụng.
pub fn migrate_to_folders_once(conn: &mut Connection, library_dir: &Path) -> MigrationFolderResult {
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           applied_at INTEGER NOT NULL
         );",
    );

    let already_applied: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = 'virtual_folders_v2')",
            [],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if already_applied {
        return MigrationFolderResult {
            ok: true,
            folders_created: 0,
            locations_created: 0,
            error: None,
        };
    }

    let res = migrate_to_folders(conn, library_dir);
    if res.ok {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let _ = conn.execute(
            "INSERT OR IGNORE INTO schema_migrations (name, applied_at) VALUES ('virtual_folders_v2', ?1)",
            params![now],
        );
    }
    res
}

pub fn migrate_to_folders(conn: &mut Connection, library_dir: &Path) -> MigrationFolderResult {
    let mut folders_created = 0;
    let mut locations_created = 0;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    let res: AppResult<()> = (|| {
        let tx = conn.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)?;

        if library_dir.exists() {
            let mut folder_map: HashMap<String, String> = HashMap::new();
            let mut visited_dirs: HashSet<std::path::PathBuf> = HashSet::new();

            // 1. Quét đệ quy các thư mục vật lý (chỉ đọc, không chạm file)
            #[allow(clippy::too_many_arguments)]
            fn scan_dirs(
                tx: &rusqlite::Transaction,
                current_dir: &Path,
                root_dir: &Path,
                parent_id: Option<&str>,
                now: i64,
                folder_map: &mut HashMap<String, String>,
                visited_dirs: &mut HashSet<std::path::PathBuf>,
                folders_created: &mut usize,
            ) -> AppResult<()> {
                if let Ok(canon) = fs::canonicalize(current_dir) {
                    if !visited_dirs.insert(canon) {
                        return Ok(());
                    }
                }

                let entries = match fs::read_dir(current_dir) {
                    Ok(e) => e,
                    Err(_) => return Ok(()),
                };

                let mut dir_entries = Vec::new();
                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.starts_with('.') {
                        continue;
                    }
                    let full_path = entry.path();
                    // Không đi vào thư mục là symlink để tránh vòng lặp vô hạn
                    if let Ok(sym) = fs::symlink_metadata(&full_path) {
                        if sym.file_type().is_symlink() {
                            continue;
                        }
                        if sym.is_dir() {
                            dir_entries.push((file_name, full_path));
                        }
                    }
                }

                dir_entries.sort_by_key(|(name, _)| name.to_lowercase());

                for (file_name, full_path) in dir_entries {
                    let rel_path = match full_path.strip_prefix(root_dir) {
                        Ok(p) => p.to_string_lossy().replace('\\', "/"),
                        Err(_) => continue,
                    };

                    let clean_name = file_name.trim();
                    if clean_name.is_empty() {
                        continue;
                    }

                    let existing_id: Option<String> = tx
                        .query_row(
                            "SELECT id FROM folders
                             WHERE COALESCE(parent_id, '') = COALESCE(?1, '')
                               AND name = ?2 COLLATE NOCASE
                             LIMIT 1",
                            params![parent_id, clean_name],
                            |row| row.get(0),
                        )
                        .ok();

                    let folder_id = if let Some(id) = existing_id {
                        id
                    } else {
                        let id = Uuid::new_v4().to_string();
                        let sort_order: i64 = tx
                            .query_row(
                                "SELECT COALESCE(MAX(sort_order), -1) + 1
                                 FROM folders
                                 WHERE COALESCE(parent_id, '') = COALESCE(?1, '')",
                                params![parent_id],
                                |row| row.get(0),
                            )
                            .unwrap_or(0);

                        tx.execute(
                            "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                            params![id, parent_id, clean_name, sort_order, now, now],
                        )?;
                        *folders_created += 1;
                        id
                    };

                    folder_map.insert(rel_path, folder_id.clone());
                    scan_dirs(
                        tx,
                        &full_path,
                        root_dir,
                        Some(&folder_id),
                        now,
                        folder_map,
                        visited_dirs,
                        folders_created,
                    )?;
                }

                Ok(())
            }

            scan_dirs(
                &tx,
                library_dir,
                library_dir,
                None,
                now,
                &mut folder_map,
                &mut visited_dirs,
                &mut folders_created,
            )?;

            // Thu thập danh sách file .sdeck (phân tách file thật và symlink)
            struct FoundFile {
                full_path: std::path::PathBuf,
                folder_id: Option<String>,
                is_symlink: bool,
            }

            fn collect_files(
                current_dir: &Path,
                root_dir: &Path,
                folder_id: Option<&str>,
                folder_map: &HashMap<String, String>,
                out: &mut Vec<FoundFile>,
            ) {
                let entries = match fs::read_dir(current_dir) {
                    Ok(e) => e,
                    Err(_) => return,
                };

                for entry in entries.flatten() {
                    let file_name = entry.file_name().to_string_lossy().to_string();
                    if file_name.starts_with('.') {
                        continue;
                    }
                    let full_path = entry.path();
                    let sym_meta = match fs::symlink_metadata(&full_path) {
                        Ok(m) => m,
                        Err(_) => continue,
                    };
                    let is_symlink = sym_meta.file_type().is_symlink();

                    if sym_meta.is_dir() && !is_symlink {
                        let rel_path = match full_path.strip_prefix(root_dir) {
                            Ok(p) => p.to_string_lossy().replace('\\', "/"),
                            Err(_) => continue,
                        };
                        let sub_folder_id = folder_map.get(&rel_path).map(|s| s.as_str());
                        collect_files(&full_path, root_dir, sub_folder_id, folder_map, out);
                    } else if sym_meta.is_file() || is_symlink {
                        let lower = file_name.to_lowercase();
                        if !lower.ends_with(".sdeck")
                            || lower.ends_with(".bak")
                            || lower.ends_with(".tmp")
                        {
                            continue;
                        }
                        out.push(FoundFile {
                            full_path,
                            folder_id: folder_id.map(|s| s.to_string()),
                            is_symlink,
                        });
                    }
                }
            }

            let mut found_files = Vec::new();
            collect_files(library_dir, library_dir, None, &folder_map, &mut found_files);

            // 2a. Xử lý các file .sdeck vật lý thật -> Vị trí chính (is_link = 0)
            for item in found_files.iter().filter(|f| !f.is_symlink) {
                let file_path_str = item.full_path.to_string_lossy().to_string();
                let meta_opt = extract_deck_meta_from_sdeck(&item.full_path);

                let deck_id = if let Some((ref id, ref title, ref kind)) = meta_opt {
                    // Đảm bảo bộ thẻ có mặt trong bảng decks
                    tx.execute(
                        "INSERT INTO decks (id, file_path, title, kind, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                         ON CONFLICT(id) DO UPDATE SET
                           file_path = COALESCE(decks.file_path, excluded.file_path)",
                        params![id, file_path_str, title, kind, now, now],
                    )?;
                    Some(id.clone())
                } else {
                    tx.query_row(
                        "SELECT id FROM decks WHERE file_path = ?1 LIMIT 1",
                        params![file_path_str],
                        |row| row.get(0),
                    )
                    .ok()
                };

                if let Some(d_id) = deck_id {
                    // Nếu trong thư mục đích đã có liên kết của cùng deck_id thì xóa trước
                    if let Some(ref fid) = item.folder_id {
                        tx.execute(
                            "DELETE FROM deck_locations WHERE deck_id = ?1 AND folder_id = ?2 AND is_link = 1",
                            params![d_id, fid],
                        )?;
                    }

                    let existing_primary: Option<(String, Option<String>)> = tx
                        .query_row(
                            "SELECT id, folder_id FROM deck_locations WHERE deck_id = ?1 AND is_link = 0 LIMIT 1",
                            params![d_id],
                            |row| Ok((row.get(0)?, row.get(1)?)),
                        )
                        .ok();

                    match existing_primary {
                        Some((loc_id, cur_fid)) => {
                            if cur_fid != item.folder_id {
                                tx.execute(
                                    "UPDATE deck_locations SET folder_id = ?1 WHERE id = ?2",
                                    params![item.folder_id, loc_id],
                                )?;
                            }
                            locations_created += 1;
                        }
                        None => {
                            let loc_id = Uuid::new_v4().to_string();
                            tx.execute(
                                "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
                                 VALUES (?1, ?2, ?3, 0, ?4)",
                                params![loc_id, d_id, item.folder_id, now],
                            )?;
                            locations_created += 1;
                        }
                    }
                }
            }

            // 2b. Xử lý các symlink cũ -> Liên kết (is_link = 1)
            for item in found_files.iter().filter(|f| f.is_symlink) {
                let fid = match item.folder_id {
                    Some(ref f) => f.clone(),
                    None => {
                        log::warn!(
                            "Bỏ qua symlink ở thư mục gốc khi migration: {:?}",
                            item.full_path
                        );
                        continue;
                    }
                };

                // Kiểm tra symlink có hợp lệ không
                if !item.full_path.exists() {
                    log::warn!("Bỏ qua symlink hỏng khi migration: {:?}", item.full_path);
                    continue;
                }

                let mut deck_id = extract_deck_meta_from_sdeck(&item.full_path).map(|(id, _, _)| id);
                if deck_id.is_none() {
                    if let Ok(canon) = fs::canonicalize(&item.full_path) {
                        let canon_str = canon.to_string_lossy().to_string();
                        deck_id = tx
                            .query_row(
                                "SELECT id FROM decks WHERE file_path = ?1 LIMIT 1",
                                params![canon_str],
                                |row| row.get(0),
                            )
                            .ok();
                    }
                }

                let d_id = match deck_id {
                    Some(id) => id,
                    None => {
                        log::warn!(
                            "Bỏ qua symlink không nhận diện được bộ thẻ: {:?}",
                            item.full_path
                        );
                        continue;
                    }
                };

                let deck_known: bool = tx
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM decks WHERE id = ?1)",
                        params![d_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(false);
                if !deck_known {
                    log::warn!(
                        "Bỏ qua symlink trỏ tới bộ thẻ chưa biết ({d_id}): {:?}",
                        item.full_path
                    );
                    continue;
                }

                let already_in_folder: bool = tx
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM deck_locations WHERE deck_id = ?1 AND folder_id = ?2)",
                        params![d_id, fid],
                        |row| row.get(0),
                    )
                    .unwrap_or(false);

                if !already_in_folder {
                    let loc_id = Uuid::new_v4().to_string();
                    tx.execute(
                        "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
                         VALUES (?1, ?2, ?3, 1, ?4)",
                        params![loc_id, d_id, fid, now],
                    )?;
                    locations_created += 1;
                }
            }
        }

        // 3. Đảm bảo mọi bộ thẻ trong `decks` đều có đúng 1 vị trí chính (folder_id = NULL nếu chưa có)
        let orphan_decks: Vec<String> = {
            let mut stmt = tx.prepare(
                "SELECT d.id FROM decks d
                 WHERE NOT EXISTS (
                   SELECT 1 FROM deck_locations l WHERE l.deck_id = d.id AND l.is_link = 0
                 )",
            )?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            rows.collect::<Result<Vec<_>, _>>()?
        };

        for d_id in orphan_decks {
            let loc_id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
                 VALUES (?1, ?2, NULL, 0, ?3)",
                params![loc_id, d_id, now],
            )?;
            locations_created += 1;
        }

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
