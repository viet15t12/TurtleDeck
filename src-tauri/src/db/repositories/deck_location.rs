// src-tauri/src/db/repositories/deck_location.rs — Quản lý vị trí chính và liên kết ảo của bộ thẻ trong SQLite
use crate::db::repositories::folder::{normalize_folder_id, with_immediate_tx, FolderRepository};
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
    pub is_link: bool,
    pub created_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub struct DeckLocationRepository;

impl DeckLocationRepository {
    pub fn get_location_by_id(conn: &Connection, id: &str) -> AppResult<Option<DeckLocation>> {
        let mut stmt = conn.prepare(
            "SELECT l.id, l.deck_id, l.folder_id, l.is_link, l.created_at, d.file_path
             FROM deck_locations l
             LEFT JOIN decks d ON d.id = l.deck_id
             WHERE l.id = ?1",
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let is_link_int: i64 = row.get(3)?;
            Ok(Some(DeckLocation {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                folder_id: row.get(2)?,
                is_link: is_link_int != 0,
                created_at: row.get(4)?,
                file_path: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_primary_location(
        conn: &Connection,
        deck_id: &str,
    ) -> AppResult<Option<DeckLocation>> {
        let mut stmt = conn.prepare(
            "SELECT l.id, l.deck_id, l.folder_id, l.is_link, l.created_at, d.file_path
             FROM deck_locations l
             LEFT JOIN decks d ON d.id = l.deck_id
             WHERE l.deck_id = ?1 AND l.is_link = 0
             LIMIT 1",
        )?;

        let mut rows = stmt.query(params![deck_id])?;
        if let Some(row) = rows.next()? {
            let is_link_int: i64 = row.get(3)?;
            Ok(Some(DeckLocation {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                folder_id: row.get(2)?,
                is_link: is_link_int != 0,
                created_at: row.get(4)?,
                file_path: row.get(5)?,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_locations_by_deck(conn: &Connection, deck_id: &str) -> AppResult<Vec<DeckLocation>> {
        let mut stmt = conn.prepare(
            "SELECT l.id, l.deck_id, l.folder_id, l.is_link, l.created_at, d.file_path
             FROM deck_locations l
             LEFT JOIN decks d ON d.id = l.deck_id
             WHERE l.deck_id = ?1
             ORDER BY l.is_link ASC, l.created_at ASC",
        )?;

        let rows = stmt.query_map(params![deck_id], |row| {
            let is_link_int: i64 = row.get(3)?;
            Ok(DeckLocation {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                folder_id: row.get(2)?,
                is_link: is_link_int != 0,
                created_at: row.get(4)?,
                file_path: row.get(5)?,
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
        let norm_folder = normalize_folder_id(folder_id);
        let mut result = Vec::new();
        if let Some(fid) = norm_folder {
            let mut stmt = conn.prepare(
                "SELECT l.id, l.deck_id, l.folder_id, l.is_link, l.created_at, d.file_path
                 FROM deck_locations l
                 LEFT JOIN decks d ON d.id = l.deck_id
                 WHERE l.folder_id = ?1
                 ORDER BY l.is_link ASC, l.created_at ASC",
            )?;
            let rows = stmt.query_map(params![fid], |row| {
                let is_link_int: i64 = row.get(3)?;
                Ok(DeckLocation {
                    id: row.get(0)?,
                    deck_id: row.get(1)?,
                    folder_id: row.get(2)?,
                    is_link: is_link_int != 0,
                    created_at: row.get(4)?,
                    file_path: row.get(5)?,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT l.id, l.deck_id, l.folder_id, l.is_link, l.created_at, d.file_path
                 FROM deck_locations l
                 LEFT JOIN decks d ON d.id = l.deck_id
                 WHERE l.folder_id IS NULL
                 ORDER BY l.is_link ASC, l.created_at ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                let is_link_int: i64 = row.get(3)?;
                Ok(DeckLocation {
                    id: row.get(0)?,
                    deck_id: row.get(1)?,
                    folder_id: row.get(2)?,
                    is_link: is_link_int != 0,
                    created_at: row.get(4)?,
                    file_path: row.get(5)?,
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
            "SELECT l.id, l.deck_id, l.folder_id, l.is_link, l.created_at, d.file_path
             FROM deck_locations l
             LEFT JOIN decks d ON d.id = l.deck_id
             ORDER BY l.is_link ASC, l.created_at ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            let is_link_int: i64 = row.get(3)?;
            Ok(DeckLocation {
                id: row.get(0)?,
                deck_id: row.get(1)?,
                folder_id: row.get(2)?,
                is_link: is_link_int != 0,
                created_at: row.get(4)?,
                file_path: row.get(5)?,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn deck_exists(conn: &Connection, deck_id: &str) -> AppResult<bool> {
        let exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM decks WHERE id = ?1)",
                params![deck_id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        Ok(exists)
    }

    pub fn move_deck(
        conn: &Connection,
        deck_id: &str,
        new_folder_id: Option<&str>,
    ) -> AppResult<DeckLocation> {
        let norm_folder = normalize_folder_id(new_folder_id);

        with_immediate_tx(conn, || {
            if let Some(ref fid) = norm_folder {
                if !FolderRepository::exists(conn, fid)? {
                    return Err(AppError::FolderNotFound(fid.clone()));
                }
            }

            if !Self::deck_exists(conn, deck_id)? {
                return Err(AppError::DeckNotFound(deck_id.to_string()));
            }

            // Nếu đích không phải gốc và bộ thẻ đang có liên kết tại đó -> xóa liên kết đó trước
            if let Some(ref fid) = norm_folder {
                conn.execute(
                    "DELETE FROM deck_locations WHERE deck_id = ?1 AND folder_id = ?2 AND is_link = 1",
                    params![deck_id, fid],
                )?;
            }

            let updated = conn.execute(
                "UPDATE deck_locations SET folder_id = ?1 WHERE deck_id = ?2 AND is_link = 0",
                params![norm_folder, deck_id],
            )?;

            if updated == 0 {
                let id = Uuid::new_v4().to_string();
                let now = now_millis();
                conn.execute(
                    "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
                     VALUES (?1, ?2, ?3, 0, ?4)",
                    params![id, deck_id, norm_folder, now],
                )?;
            }

            Self::get_primary_location(conn, deck_id)?
                .ok_or_else(|| AppError::DeckNotFound(deck_id.to_string()))
        })
    }

    pub fn link_deck(
        conn: &Connection,
        deck_id: &str,
        target_folder_id: Option<&str>,
    ) -> AppResult<DeckLocation> {
        let norm_folder = normalize_folder_id(target_folder_id);
        let fid = norm_folder.ok_or_else(|| {
            AppError::InvalidLinkTarget("Liên kết không được trỏ về thư mục gốc.".into())
        })?;

        with_immediate_tx(conn, || {
            if !FolderRepository::exists(conn, &fid)? {
                return Err(AppError::FolderNotFound(fid.clone()));
            }

            if !Self::deck_exists(conn, deck_id)? {
                return Err(AppError::DeckNotFound(deck_id.to_string()));
            }

            let already_in_folder: bool = conn
                .query_row(
                    "SELECT EXISTS(
                       SELECT 1 FROM deck_locations
                       WHERE deck_id = ?1 AND folder_id = ?2
                     )",
                    params![deck_id, fid],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if already_in_folder {
                return Err(AppError::AlreadyInFolder(fid));
            }

            let id = Uuid::new_v4().to_string();
            let now = now_millis();

            conn.execute(
                "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
                 VALUES (?1, ?2, ?3, 1, ?4)",
                params![id, deck_id, fid, now],
            )
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(err, _)
                    if err.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    AppError::AlreadyInFolder(fid.clone())
                }
                other => AppError::Database(other),
            })?;

            Self::get_location_by_id(conn, &id)?.ok_or_else(|| AppError::NotFound(id))
        })
    }

    pub fn unlink_deck(conn: &Connection, location_id: &str) -> AppResult<()> {
        with_immediate_tx(conn, || {
            let loc = Self::get_location_by_id(conn, location_id)?
                .ok_or_else(|| AppError::NotFound(location_id.to_string()))?;

            if !loc.is_link {
                return Err(AppError::CannotUnlinkPrimary(location_id.to_string()));
            }

            conn.execute(
                "DELETE FROM deck_locations WHERE id = ?1 AND is_link = 1",
                params![location_id],
            )?;
            Ok(())
        })
    }

    /// Hàm tương thích cho các lời gọi thiết lập vị trí hoặc liên kết.
    pub fn add_location(
        conn: &Connection,
        deck_id: &str,
        folder_id: Option<&str>,
        _file_path: &str,
        is_link: bool,
        _link_target: Option<&str>,
    ) -> AppResult<DeckLocation> {
        if is_link {
            Self::link_deck(conn, deck_id, folder_id)
        } else {
            Self::move_deck(conn, deck_id, folder_id)
        }
    }

    pub fn remove_location(conn: &Connection, location_id: &str) -> AppResult<()> {
        Self::unlink_deck(conn, location_id)
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
