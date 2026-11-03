// src-tauri/src/db/repositories/deck_location.rs — Quản lý vị trí lưu trữ và liên kết (symlink) của bộ thẻ
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckLocation {
    pub id: String,
    pub deck_id: String,
    pub folder_id: Option<String>,
    pub file_path: String,
    pub is_link: bool,
    pub link_target: Option<String>,
    pub created_at: i64,
}

pub struct DeckLocationRepository;

impl DeckLocationRepository {
    pub fn get_location_by_id(conn: &Connection, id: &str) -> AppResult<Option<DeckLocation>> {
        let mut stmt = conn.prepare(
            "SELECT id, deck_id, folder_id, file_path, is_link, link_target, created_at
             FROM deck_locations
             WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let is_link_int: i64 = row.get(4)?;
            Ok(Some(DeckLocation {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                folder_id: row.get(2)?,
                file_path: row.get(3)?,
                is_link: is_link_int != 0,
                link_target: row.get(5)?,
                created_at: row.get(6)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_location_by_path(
        conn: &Connection,
        file_path: &str,
    ) -> AppResult<Option<DeckLocation>> {
        let mut stmt = conn.prepare(
            "SELECT id, deck_id, folder_id, file_path, is_link, link_target, created_at
             FROM deck_locations
             WHERE file_path = ?1",
        )?;

        let mut rows = stmt.query(params![file_path])?;
        if let Some(row) = rows.next()? {
            let is_link_int: i64 = row.get(4)?;
            Ok(Some(DeckLocation {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                folder_id: row.get(2)?,
                file_path: row.get(3)?,
                is_link: is_link_int != 0,
                link_target: row.get(5)?,
                created_at: row.get(6)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_locations_by_deck(conn: &Connection, deck_id: &str) -> AppResult<Vec<DeckLocation>> {
        let mut stmt = conn.prepare(
            "SELECT id, deck_id, folder_id, file_path, is_link, link_target, created_at
             FROM deck_locations
             WHERE deck_id = ?1
             ORDER BY created_at ASC",
        )?;

        let rows = stmt.query_map(params![deck_id], |row| {
            let is_link_int: i64 = row.get(4)?;
            Ok(DeckLocation {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                folder_id: row.get(2)?,
                file_path: row.get(3)?,
                is_link: is_link_int != 0,
                link_target: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn get_locations_by_folder(
        conn: &Connection,
        folder_id: Option<&str>,
    ) -> AppResult<Vec<DeckLocation>> {
        let mut result = Vec::new();
        if let Some(fid) = folder_id {
            let mut stmt = conn.prepare(
                "SELECT id, deck_id, folder_id, file_path, is_link, link_target, created_at
                 FROM deck_locations
                 WHERE folder_id = ?1
                 ORDER BY created_at ASC",
            )?;
            let rows = stmt.query_map(params![fid], |row| {
                let is_link_int: i64 = row.get(4)?;
                Ok(DeckLocation {
                    id: row.get(0)?,
                    deck_id: row.get(1)?,
                    folder_id: row.get(2)?,
                    file_path: row.get(3)?,
                    is_link: is_link_int != 0,
                    link_target: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, deck_id, folder_id, file_path, is_link, link_target, created_at
                 FROM deck_locations
                 WHERE folder_id IS NULL
                 ORDER BY created_at ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                let is_link_int: i64 = row.get(4)?;
                Ok(DeckLocation {
                    id: row.get(0)?,
                    deck_id: row.get(1)?,
                    folder_id: row.get(2)?,
                    file_path: row.get(3)?,
                    is_link: is_link_int != 0,
                    link_target: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        }
        Ok(result)
    }

    pub fn get_all_locations(conn: &Connection) -> AppResult<Vec<DeckLocation>> {
        let mut stmt = conn.prepare(
            "SELECT id, deck_id, folder_id, file_path, is_link, link_target, created_at
             FROM deck_locations
             ORDER BY created_at ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            let is_link_int: i64 = row.get(4)?;
            Ok(DeckLocation {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                folder_id: row.get(2)?,
                file_path: row.get(3)?,
                is_link: is_link_int != 0,
                link_target: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn add_location(
        conn: &Connection,
        deck_id: &str,
        folder_id: Option<&str>,
        file_path: &str,
        is_link: bool,
        link_target: Option<&str>,
    ) -> AppResult<DeckLocation> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        if folder_id.is_none() {
            let existing_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM deck_locations WHERE deck_id = ?1 AND folder_id IS NULL LIMIT 1",
                    params![deck_id],
                    |row| row.get(0),
                )
                .ok();

            if let Some(id) = existing_id {
                conn.execute(
                    "UPDATE deck_locations
                     SET file_path = ?1, is_link = ?2, link_target = ?3
                     WHERE id = ?4",
                    params![file_path, if is_link { 1 } else { 0 }, link_target, id],
                )?;

                return Ok(DeckLocation {
                    id,
                    deck_id: deck_id.to_string(),
                    folder_id: None,
                    file_path: file_path.to_string(),
                    is_link,
                    link_target: link_target.map(|s| s.to_string()),
                    created_at: now,
                });
            }
        }

        let id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO deck_locations (id, deck_id, folder_id, file_path, is_link, link_target, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(deck_id, folder_id) DO UPDATE SET
               file_path = excluded.file_path,
               is_link = excluded.is_link,
               link_target = excluded.link_target",
            params![id, deck_id, folder_id, file_path, if is_link { 1 } else { 0 }, link_target, now],
        )?;

        Ok(DeckLocation {
            id,
            deck_id: deck_id.to_string(),
            folder_id: folder_id.map(|s| s.to_string()),
            file_path: file_path.to_string(),
            is_link,
            link_target: link_target.map(|s| s.to_string()),
            created_at: now,
        })
    }

    pub fn move_location(
        conn: &Connection,
        location_id: &str,
        new_folder_id: Option<&str>,
        new_file_path: Option<&str>,
    ) -> AppResult<()> {
        let loc = Self::get_location_by_id(conn, location_id)?.ok_or_else(|| {
            AppError::Custom(format!("Location có id \"{location_id}\" không tồn tại."))
        })?;

        let file_path = new_file_path.unwrap_or(&loc.file_path);

        conn.execute(
            "UPDATE deck_locations SET folder_id = ?1, file_path = ?2 WHERE id = ?3",
            params![new_folder_id, file_path, location_id],
        )?;

        Ok(())
    }

    pub fn remove_location(conn: &Connection, location_id: &str) -> AppResult<()> {
        conn.execute(
            "DELETE FROM deck_locations WHERE id = ?1",
            params![location_id],
        )?;
        Ok(())
    }

    pub fn delete_locations_by_deck(conn: &Connection, deck_id: &str) -> AppResult<()> {
        conn.execute(
            "DELETE FROM deck_locations WHERE deck_id = ?1",
            params![deck_id],
        )?;
        Ok(())
    }

    pub fn delete_locations_by_folder(conn: &Connection, folder_id: &str) -> AppResult<()> {
        conn.execute(
            "DELETE FROM deck_locations WHERE folder_id = ?1",
            params![folder_id],
        )?;
        Ok(())
    }
}
