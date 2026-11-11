// src-tauri/src/db/repositories/folder.rs — Quản lý cấu trúc cây thư mục ảo trong SQLite
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub sort_order: i64,
    pub path: String,
    pub depth: i64,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<Folder>>,
}

/// Chuẩn hóa định danh thư mục: `""`, `"all"`, `"root"` (và `None`) -> `None` (Thư mục gốc).
pub fn normalize_folder_id(s: Option<&str>) -> Option<String> {
    match s {
        None => None,
        Some(raw) => {
            let trimmed = raw.trim();
            if trimmed.is_empty()
                || trimmed.eq_ignore_ascii_case("all")
                || trimmed.eq_ignore_ascii_case("root")
            {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
    }
}

/// Thực thi closure trong một transaction `BEGIN IMMEDIATE` (hoặc `SAVEPOINT` nếu đã ở trong transaction).
pub fn with_immediate_tx<T, F>(conn: &Connection, f: F) -> AppResult<T>
where
    F: FnOnce() -> AppResult<T>,
{
    if conn.is_autocommit() {
        conn.execute_batch("BEGIN IMMEDIATE;")?;
        match f() {
            Ok(val) => {
                conn.execute_batch("COMMIT;")?;
                Ok(val)
            }
            Err(err) => {
                let _ = conn.execute_batch("ROLLBACK;");
                Err(err)
            }
        }
    } else {
        conn.execute_batch("SAVEPOINT sp_virtual_folder;")?;
        match f() {
            Ok(val) => {
                conn.execute_batch("RELEASE SAVEPOINT sp_virtual_folder;")?;
                Ok(val)
            }
            Err(err) => {
                let _ = conn.execute_batch(
                    "ROLLBACK TO SAVEPOINT sp_virtual_folder; RELEASE SAVEPOINT sp_virtual_folder;",
                );
                Err(err)
            }
        }
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub struct FolderRepository;

impl FolderRepository {
    pub fn exists(conn: &Connection, id: &str) -> AppResult<bool> {
        let found: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM folders WHERE id = ?1)",
                params![id],
                |row| row.get(0),
            )
            .unwrap_or(false);
        Ok(found)
    }

    /// Truy vấn dùng chung để lấy cây con (kể cả chính nó).
    pub fn get_subtree_ids(conn: &Connection, id: &str) -> AppResult<Vec<String>> {
        let mut stmt = conn.prepare(
            "WITH RECURSIVE subtree(id) AS (
               SELECT id FROM folders WHERE id = ?1
               UNION ALL
               SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
             )
             SELECT id FROM subtree",
        )?;
        let rows = stmt.query_map(params![id], |row| row.get::<_, String>(0))?;
        let mut ids = Vec::new();
        for r in rows {
            ids.push(r?);
        }
        Ok(ids)
    }

    fn compute_path_and_depth(conn: &Connection, id: &str) -> AppResult<(String, i64)> {
        let mut stmt = conn.prepare(
            "WITH RECURSIVE ancestors(id, parent_id, name, lvl) AS (
               SELECT id, parent_id, name, 0 FROM folders WHERE id = ?1
               UNION ALL
               SELECT f.id, f.parent_id, f.name, a.lvl + 1
               FROM folders f JOIN ancestors a ON f.id = a.parent_id
             )
             SELECT name FROM ancestors ORDER BY lvl DESC",
        )?;
        let names: Vec<String> = stmt
            .query_map(params![id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        if names.is_empty() {
            Ok((String::new(), 0))
        } else {
            let depth = (names.len() - 1) as i64;
            let path = names.join("/");
            Ok((path, depth))
        }
    }

    pub fn get_folder_by_id(conn: &Connection, id: &str) -> AppResult<Option<Folder>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, sort_order, created_at, updated_at
             FROM folders
             WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let folder_id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let parent_id: Option<String> = row.get(2)?;
            let sort_order: i64 = row.get(3)?;
            let created_at: i64 = row.get(4)?;
            let updated_at: i64 = row.get(5)?;
            drop(rows);
            drop(stmt);

            let (path, depth) = Self::compute_path_and_depth(conn, &folder_id)?;
            Ok(Some(Folder {
                id: folder_id,
                name,
                parent_id,
                sort_order,
                path,
                depth,
                created_at,
                updated_at,
                children: None,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_folder_by_path(conn: &Connection, path: &str) -> AppResult<Option<Folder>> {
        let segments: Vec<&str> = path
            .split('/')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if segments.is_empty() {
            return Ok(None);
        }

        let mut current_parent: Option<String> = None;
        let mut current_id: Option<String> = None;

        for seg in segments {
            let next_id: Option<String> = conn
                .query_row(
                    "SELECT id FROM folders
                     WHERE COALESCE(parent_id, '') = COALESCE(?1, '')
                       AND name = ?2 COLLATE NOCASE
                     LIMIT 1",
                    params![current_parent, seg],
                    |row| row.get(0),
                )
                .ok();
            match next_id {
                Some(id) => {
                    current_parent = Some(id.clone());
                    current_id = Some(id);
                }
                None => return Ok(None),
            }
        }

        if let Some(id) = current_id {
            Self::get_folder_by_id(conn, &id)
        } else {
            Ok(None)
        }
    }

    pub fn get_children(conn: &Connection, parent_id: Option<&str>) -> AppResult<Vec<Folder>> {
        let norm_parent = normalize_folder_id(parent_id);
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, sort_order, created_at, updated_at
             FROM folders
             WHERE COALESCE(parent_id, '') = COALESCE(?1, '')
             ORDER BY sort_order ASC, name COLLATE NOCASE ASC",
        )?;

        let raw_rows: Vec<(String, String, Option<String>, i64, i64, i64)> = stmt
            .query_map(params![norm_parent], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);

        let mut result = Vec::with_capacity(raw_rows.len());
        for (id, name, pid, sort_order, created_at, updated_at) in raw_rows {
            let (path, depth) = Self::compute_path_and_depth(conn, &id)?;
            result.push(Folder {
                id,
                name,
                parent_id: pid,
                sort_order,
                path,
                depth,
                created_at,
                updated_at,
                children: None,
            });
        }
        Ok(result)
    }

    pub fn create_folder(
        conn: &Connection,
        name: &str,
        parent_id: Option<&str>,
    ) -> AppResult<Folder> {
        let clean_name = name.trim();
        if clean_name.is_empty() {
            return Err(AppError::Custom("Tên thư mục không được để trống.".into()));
        }

        let norm_parent = normalize_folder_id(parent_id);

        with_immediate_tx(conn, || {
            if let Some(ref pid) = norm_parent {
                if !Self::exists(conn, pid)? {
                    return Err(AppError::FolderNotFound(pid.clone()));
                }
            }

            let conflict: bool = conn
                .query_row(
                    "SELECT EXISTS(
                       SELECT 1 FROM folders
                       WHERE COALESCE(parent_id, '') = COALESCE(?1, '')
                         AND name = ?2 COLLATE NOCASE
                     )",
                    params![norm_parent, clean_name],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if conflict {
                return Err(AppError::FolderNameConflict(clean_name.to_string()));
            }

            let sort_order: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) + 1
                     FROM folders
                     WHERE COALESCE(parent_id, '') = COALESCE(?1, '')",
                    params![norm_parent],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            let now = now_millis();
            let id = Uuid::new_v4().to_string();

            conn.execute(
                "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![id, norm_parent, clean_name, sort_order, now, now],
            )
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(err, _)
                    if err.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    AppError::FolderNameConflict(clean_name.to_string())
                }
                other => AppError::Database(other),
            })?;

            let (path, depth) = Self::compute_path_and_depth(conn, &id)?;

            Ok(Folder {
                id,
                name: clean_name.to_string(),
                parent_id: norm_parent,
                sort_order,
                path,
                depth,
                created_at: now,
                updated_at: now,
                children: None,
            })
        })
    }

    pub fn rename_folder(conn: &Connection, id: &str, new_name: &str) -> AppResult<Folder> {
        let clean_name = new_name.trim();
        if clean_name.is_empty() {
            return Err(AppError::Custom("Tên thư mục không được để trống.".into()));
        }

        with_immediate_tx(conn, || {
            let folder = Self::get_folder_by_id(conn, id)?
                .ok_or_else(|| AppError::FolderNotFound(id.to_string()))?;

            let conflict: bool = conn
                .query_row(
                    "SELECT EXISTS(
                       SELECT 1 FROM folders
                       WHERE COALESCE(parent_id, '') = COALESCE(?1, '')
                         AND name = ?2 COLLATE NOCASE
                         AND id <> ?3
                     )",
                    params![folder.parent_id, clean_name, id],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if conflict {
                return Err(AppError::FolderNameConflict(clean_name.to_string()));
            }

            let now = now_millis();
            conn.execute(
                "UPDATE folders SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![clean_name, now, id],
            )
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(err, _)
                    if err.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    AppError::FolderNameConflict(clean_name.to_string())
                }
                other => AppError::Database(other),
            })?;

            Self::get_folder_by_id(conn, id)?
                .ok_or_else(|| AppError::FolderNotFound(id.to_string()))
        })
    }

    pub fn move_folder(
        conn: &Connection,
        id: &str,
        new_parent_id: Option<&str>,
    ) -> AppResult<Folder> {
        let norm_parent = normalize_folder_id(new_parent_id);

        with_immediate_tx(conn, || {
            let folder = Self::get_folder_by_id(conn, id)?
                .ok_or_else(|| AppError::FolderNotFound(id.to_string()))?;

            if let Some(ref pid) = norm_parent {
                if pid == id {
                    return Err(AppError::FolderCycle(id.to_string()));
                }
                if !Self::exists(conn, pid)? {
                    return Err(AppError::FolderNotFound(pid.clone()));
                }
                // Chống chu trình: new_parent_id không được nằm trong subtree(id)
                let in_subtree: bool = conn
                    .query_row(
                        "WITH RECURSIVE subtree(id) AS (
                           SELECT id FROM folders WHERE id = ?1
                           UNION ALL
                           SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
                         )
                         SELECT EXISTS(SELECT 1 FROM subtree WHERE id = ?2)",
                        params![id, pid],
                        |row| row.get(0),
                    )
                    .unwrap_or(false);
                if in_subtree {
                    return Err(AppError::FolderCycle(id.to_string()));
                }
            }

            // Nếu new_parent_id bằng cha hiện tại -> no-op
            if folder.parent_id == norm_parent {
                return Ok(folder);
            }

            // Kiểm tra trùng tên trong cha mới
            let conflict: bool = conn
                .query_row(
                    "SELECT EXISTS(
                       SELECT 1 FROM folders
                       WHERE COALESCE(parent_id, '') = COALESCE(?1, '')
                         AND name = ?2 COLLATE NOCASE
                         AND id <> ?3
                     )",
                    params![norm_parent, folder.name, id],
                    |row| row.get(0),
                )
                .unwrap_or(false);
            if conflict {
                return Err(AppError::FolderNameConflict(folder.name));
            }

            let sort_order: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(sort_order), -1) + 1
                     FROM folders
                     WHERE COALESCE(parent_id, '') = COALESCE(?1, '')",
                    params![norm_parent],
                    |row| row.get(0),
                )
                .unwrap_or(0);

            let now = now_millis();
            conn.execute(
                "UPDATE folders SET parent_id = ?1, sort_order = ?2, updated_at = ?3 WHERE id = ?4",
                params![norm_parent, sort_order, now, id],
            )
            .map_err(|e| match e {
                rusqlite::Error::SqliteFailure(err, _)
                    if err.code == rusqlite::ErrorCode::ConstraintViolation =>
                {
                    AppError::FolderNameConflict(folder.name)
                }
                other => AppError::Database(other),
            })?;

            Self::get_folder_by_id(conn, id)?
                .ok_or_else(|| AppError::FolderNotFound(id.to_string()))
        })
    }

    /// Xóa thư mục và cây con trong 1 transaction theo đúng thứ tự:
    /// 1. Lấy `subtree(id)`.
    /// 2. Đưa vị trí chính (`is_link = 0`) trong subtree về gốc (`folder_id = NULL`).
    /// 3. Xóa các liên kết (`is_link = 1`) trong subtree.
    /// 4. Xóa `folders WHERE id = ?` (cascade xóa các thư mục con).
    ///
    /// Trả về danh sách `deck_id` bị ảnh hưởng.
    pub fn delete_folder(conn: &Connection, id: &str) -> AppResult<Vec<String>> {
        with_immediate_tx(conn, || {
            if !Self::exists(conn, id)? {
                return Err(AppError::FolderNotFound(id.to_string()));
            }

            // 1. Lấy danh sách deck_id bị ảnh hưởng trong subtree(id)
            let affected_deck_ids: Vec<String> = {
                let mut stmt = conn.prepare(
                    "WITH RECURSIVE subtree(id) AS (
                       SELECT id FROM folders WHERE id = ?1
                       UNION ALL
                       SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
                     )
                     SELECT DISTINCT deck_id
                     FROM deck_locations
                     WHERE folder_id IN (SELECT id FROM subtree)
                     ORDER BY deck_id ASC",
                )?;
                let rows = stmt.query_map(params![id], |row| row.get::<_, String>(0))?;
                rows.collect::<Result<Vec<_>, _>>()?
            };

            // 2. Đưa vị trí chính trong nhánh bị xóa về gốc (phải làm trước bước 4)
            conn.execute(
                "WITH RECURSIVE subtree(id) AS (
                   SELECT id FROM folders WHERE id = ?1
                   UNION ALL
                   SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
                 )
                 UPDATE deck_locations
                 SET folder_id = NULL
                 WHERE is_link = 0 AND folder_id IN (SELECT id FROM subtree)",
                params![id],
            )?;

            // 3. Xóa các liên kết trong nhánh bị xóa
            conn.execute(
                "WITH RECURSIVE subtree(id) AS (
                   SELECT id FROM folders WHERE id = ?1
                   UNION ALL
                   SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
                 )
                 DELETE FROM deck_locations
                 WHERE is_link = 1 AND folder_id IN (SELECT id FROM subtree)",
                params![id],
            )?;

            // 4. Xóa thư mục từ lá lên gốc để tránh giới hạn SQLITE_MAX_TRIGGER_DEPTH (1000)
            // của ON DELETE CASCADE khi cây sâu hàng nghìn cấp
            let subtree_ids = Self::get_subtree_ids(conn, id)?;
            {
                let mut del_stmt = conn.prepare("DELETE FROM folders WHERE id = ?1")?;
                for sub_id in subtree_ids.iter().rev() {
                    del_stmt.execute(params![sub_id])?;
                }
            }

            Ok(affected_deck_ids)
        })
    }

    /// Cập nhật `sort_order` cho các thư mục cùng cha; `ordered_ids` phải đúng bằng tập con trực tiếp hiện có.
    pub fn reorder_folders(
        conn: &Connection,
        parent_id: Option<&str>,
        ordered_ids: &[String],
    ) -> AppResult<()> {
        let norm_parent = normalize_folder_id(parent_id);

        with_immediate_tx(conn, || {
            if let Some(ref pid) = norm_parent {
                if !Self::exists(conn, pid)? {
                    return Err(AppError::FolderNotFound(pid.clone()));
                }
            }

            let existing_ids: Vec<String> = {
                let mut stmt = conn.prepare(
                    "SELECT id FROM folders WHERE COALESCE(parent_id, '') = COALESCE(?1, '')",
                )?;
                let rows = stmt.query_map(params![norm_parent], |row| row.get::<_, String>(0))?;
                rows.collect::<Result<Vec<_>, _>>()?
            };

            if ordered_ids.len() != existing_ids.len() {
                return Err(AppError::Custom(
                    "Danh sách thư mục sắp xếp không khớp số lượng tập con trực tiếp.".into(),
                ));
            }

            let existing_set: HashSet<&str> = existing_ids.iter().map(|s| s.as_str()).collect();
            let ordered_set: HashSet<&str> = ordered_ids.iter().map(|s| s.as_str()).collect();
            if existing_set != ordered_set || ordered_set.len() != ordered_ids.len() {
                return Err(AppError::Custom(
                    "Danh sách thư mục sắp xếp phải đúng bằng tập con trực tiếp hiện có.".into(),
                ));
            }

            let now = now_millis();
            let mut stmt =
                conn.prepare("UPDATE folders SET sort_order = ?1, updated_at = ?2 WHERE id = ?3")?;
            for (idx, fid) in ordered_ids.iter().enumerate() {
                stmt.execute(params![idx as i64, now, fid])?;
            }

            Ok(())
        })
    }

    pub fn get_folder_tree(conn: &Connection) -> AppResult<Vec<Folder>> {
        let all = Self::get_all_folders(conn)?;
        let mut children_map: HashMap<String, Vec<Folder>> = HashMap::new();
        let mut roots: Vec<Folder> = Vec::new();

        // Duyệt ngược từ độ sâu lớn nhất về 0 để lắp ráp cây không đệ quy call stack (hỗ trợ hàng nghìn cấp)
        for mut folder in all.into_iter().rev() {
            if let Some(mut ch) = children_map.remove(&folder.id) {
                ch.reverse();
                folder.children = Some(ch);
            } else {
                folder.children = Some(Vec::new());
            }

            if let Some(ref pid) = folder.parent_id {
                children_map.entry(pid.clone()).or_default().push(folder);
            } else {
                roots.push(folder);
            }
        }

        roots.reverse();
        Ok(roots)
    }

    pub fn get_all_folders(conn: &Connection) -> AppResult<Vec<Folder>> {
        let mut stmt = conn.prepare(
            "WITH RECURSIVE folder_tree(id, name, parent_id, sort_order, created_at, updated_at, path, depth) AS (
               SELECT id, name, parent_id, sort_order, created_at, updated_at, name AS path, 0 AS depth
               FROM folders
               WHERE parent_id IS NULL
               UNION ALL
               SELECT f.id, f.name, f.parent_id, f.sort_order, f.created_at, f.updated_at,
                      ft.path || '/' || f.name AS path, ft.depth + 1 AS depth
               FROM folders f
               JOIN folder_tree ft ON f.parent_id = ft.id
             )
             SELECT id, name, parent_id, sort_order, path, depth, created_at, updated_at
             FROM folder_tree
             ORDER BY depth ASC, sort_order ASC, name COLLATE NOCASE ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                sort_order: row.get(3)?,
                path: row.get(4)?,
                depth: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                children: None,
            })
        })?;

        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }
}
