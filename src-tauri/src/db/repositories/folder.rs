// src-tauri/src/db/repositories/folder.rs — Quản lý cấu trúc cây thư mục trong SQLite
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub parent_id: Option<String>,
    pub path: String,
    pub depth: i64,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<Folder>>,
}

pub struct FolderRepository;

impl FolderRepository {
    pub fn get_folder_by_id(conn: &Connection, id: &str) -> AppResult<Option<Folder>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, path, depth, created_at, updated_at
             FROM folders
             WHERE id = ?1",
        )?;

        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                path: row.get(3)?,
                depth: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                children: None,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_folder_by_path(conn: &Connection, path: &str) -> AppResult<Option<Folder>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, path, depth, created_at, updated_at
             FROM folders
             WHERE path = ?1",
        )?;

        let mut rows = stmt.query(params![path])?;
        if let Some(row) = rows.next()? {
            Ok(Some(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                path: row.get(3)?,
                depth: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                children: None,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn get_children(conn: &Connection, parent_id: Option<&str>) -> AppResult<Vec<Folder>> {
        let mut result = Vec::new();
        if let Some(pid) = parent_id {
            let mut stmt = conn.prepare(
                "SELECT id, name, parent_id, path, depth, created_at, updated_at
                 FROM folders
                 WHERE parent_id = ?1
                 ORDER BY name COLLATE NOCASE ASC",
            )?;
            let rows = stmt.query_map(params![pid], |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    parent_id: row.get(2)?,
                    path: row.get(3)?,
                    depth: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    children: None,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        } else {
            let mut stmt = conn.prepare(
                "SELECT id, name, parent_id, path, depth, created_at, updated_at
                 FROM folders
                 WHERE parent_id IS NULL
                 ORDER BY name COLLATE NOCASE ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(Folder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    parent_id: row.get(2)?,
                    path: row.get(3)?,
                    depth: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    children: None,
                })
            })?;
            for r in rows {
                result.push(r?);
            }
        }
        Ok(result)
    }

    pub fn validate_depth(conn: &Connection, parent_id: Option<&str>) -> AppResult<bool> {
        if let Some(pid) = parent_id {
            let parent = Self::get_folder_by_id(conn, pid)?;
            if let Some(p) = parent {
                Ok(p.depth < 9)
            } else {
                Ok(false)
            }
        } else {
            Ok(true)
        }
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

        let mut depth = 0;
        let mut folder_path = clean_name.to_string();

        if let Some(pid) = parent_id {
            let parent = Self::get_folder_by_id(conn, pid)?.ok_or_else(|| {
                AppError::Custom(format!("Thư mục cha có id \"{pid}\" không tồn tại."))
            })?;

            if parent.depth >= 9 {
                return Err(AppError::Custom(
                    "Đã đạt giới hạn tối đa 10 cấp thư mục.".into(),
                ));
            }

            depth = parent.depth + 1;
            folder_path = format!("{}/{clean_name}", parent.path);
        }

        if Self::get_folder_by_path(conn, &folder_path)?.is_some() {
            return Err(AppError::Custom(format!(
                "Thư mục với đường dẫn \"{folder_path}\" đã tồn tại."
            )));
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let id = Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO folders (id, name, parent_id, path, depth, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![id, clean_name, parent_id, folder_path, depth, now, now],
        )?;

        Ok(Folder {
            id,
            name: clean_name.to_string(),
            parent_id: parent_id.map(|s| s.to_string()),
            path: folder_path,
            depth,
            created_at: now,
            updated_at: now,
            children: None,
        })
    }

    pub fn rename_folder(conn: &mut Connection, id: &str, new_name: &str) -> AppResult<()> {
        let clean_name = new_name.trim();
        if clean_name.is_empty() {
            return Err(AppError::Custom("Tên thư mục không được để trống.".into()));
        }

        let folder = Self::get_folder_by_id(conn, id)?
            .ok_or_else(|| AppError::Custom(format!("Thư mục có id \"{id}\" không tồn tại.")))?;

        if folder.name == clean_name {
            return Ok(());
        }

        let mut new_path = clean_name.to_string();
        if let Some(ref pid) = folder.parent_id {
            if let Some(parent) = Self::get_folder_by_id(conn, pid)? {
                new_path = format!("{}/{clean_name}", parent.path);
            }
        }

        if let Some(existing) = Self::get_folder_by_path(conn, &new_path)? {
            if existing.id != id {
                return Err(AppError::Custom(format!(
                    "Thư mục với đường dẫn \"{new_path}\" đã tồn tại."
                )));
            }
        }

        let old_path = folder.path;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let tx = conn.transaction()?;

        tx.execute(
            "UPDATE folders SET name = ?1, path = ?2, updated_at = ?3 WHERE id = ?4",
            params![clean_name, new_path, now, id],
        )?;

        let old_prefix = format!("{old_path}/");
        let new_prefix = format!("{new_path}/");

        let mut stmt = tx.prepare("SELECT id, path FROM folders WHERE path LIKE ?1")?;
        let descendants: Vec<(String, String)> = stmt
            .query_map(params![format!("{old_prefix}%")], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut update_desc =
            tx.prepare("UPDATE folders SET path = ?1, updated_at = ?2 WHERE id = ?3")?;
        for (desc_id, desc_path) in descendants {
            let updated_desc_path = format!("{new_prefix}{}", &desc_path[old_prefix.len()..]);
            update_desc.execute(params![updated_desc_path, now, desc_id])?;
        }

        drop(update_desc);
        drop(stmt);
        tx.commit()?;
        Ok(())
    }

    pub fn move_folder(
        conn: &mut Connection,
        id: &str,
        new_parent_id: Option<&str>,
    ) -> AppResult<()> {
        let folder = Self::get_folder_by_id(conn, id)?
            .ok_or_else(|| AppError::Custom(format!("Thư mục có id \"{id}\" không tồn tại.")))?;

        if folder.parent_id.as_deref() == new_parent_id {
            return Ok(());
        }

        if let Some(pid) = new_parent_id {
            if pid == id {
                return Err(AppError::Custom(
                    "Không thể di chuyển thư mục vào chính nó.".into(),
                ));
            }
        }

        let (new_depth, new_path) = if let Some(pid) = new_parent_id {
            let new_parent = Self::get_folder_by_id(conn, pid)?.ok_or_else(|| {
                AppError::Custom(format!("Thư mục cha đích có id \"{pid}\" không tồn tại."))
            })?;

            let old_prefix = format!("{}/", folder.path);
            if new_parent.path == folder.path || new_parent.path.starts_with(&old_prefix) {
                return Err(AppError::Custom(
                    "Không thể di chuyển thư mục vào bên trong thư mục con cháu của nó.".into(),
                ));
            }

            (
                new_parent.depth + 1,
                format!("{}/{}", new_parent.path, folder.name),
            )
        } else {
            (0, folder.name.clone())
        };

        // Kiểm tra độ sâu tối đa <= 9 cho toàn bộ cây con cháu
        let old_prefix = format!("{}/", folder.path);
        let descendants: Vec<(String, String, i64)> = {
            let mut stmt =
                conn.prepare("SELECT id, path, depth FROM folders WHERE path LIKE ?1")?;
            let rows = stmt
                .query_map(params![format!("{old_prefix}%")], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            rows
        };

        let mut max_subtree_depth = folder.depth;
        for (_, _, d) in &descendants {
            if *d > max_subtree_depth {
                max_subtree_depth = *d;
            }
        }

        let subtree_height = max_subtree_depth - folder.depth;
        if new_depth + subtree_height > 9 {
            return Err(AppError::Custom(
                "Không thể di chuyển vì sẽ vượt quá giới hạn tối đa 10 cấp thư mục.".into(),
            ));
        }

        if let Some(existing) = Self::get_folder_by_path(conn, &new_path)? {
            if existing.id != id {
                return Err(AppError::Custom(format!(
                    "Thư mục với đường dẫn \"{new_path}\" đã tồn tại ở vị trí đích."
                )));
            }
        }

        let depth_diff = new_depth - folder.depth;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let tx = conn.transaction()?;

        tx.execute(
            "UPDATE folders SET parent_id = ?1, depth = ?2, path = ?3, updated_at = ?4 WHERE id = ?5",
            params![new_parent_id, new_depth, new_path, now, id],
        )?;

        let new_prefix = format!("{new_path}/");
        let mut update_desc = tx.prepare(
            "UPDATE folders SET path = ?1, depth = depth + ?2, updated_at = ?3 WHERE id = ?4",
        )?;

        for (desc_id, desc_path, _) in descendants {
            let updated_desc_path = format!("{new_prefix}{}", &desc_path[old_prefix.len()..]);
            update_desc.execute(params![updated_desc_path, depth_diff, now, desc_id])?;
        }

        drop(update_desc);
        tx.commit()?;
        Ok(())
    }

    pub fn delete_folder(conn: &mut Connection, id: &str) -> AppResult<()> {
        let folder = match Self::get_folder_by_id(conn, id)? {
            Some(f) => f,
            None => return Ok(()),
        };

        let old_prefix = format!("{}/", folder.path);
        let desc_ids: Vec<String> = {
            let mut stmt = conn.prepare("SELECT id FROM folders WHERE path LIKE ?1")?;
            let ids = stmt
                .query_map(params![format!("{old_prefix}%")], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            ids
        };

        let mut folder_ids_to_delete = vec![id.to_string()];
        folder_ids_to_delete.extend(desc_ids);

        let tx = conn.transaction()?;

        for f_id in folder_ids_to_delete {
            tx.execute(
                "DELETE FROM deck_locations WHERE folder_id = ?1",
                params![f_id],
            )?;
        }

        tx.execute("DELETE FROM folders WHERE id = ?1", params![id])?;

        tx.commit()?;
        Ok(())
    }

    pub fn get_folder_tree(conn: &Connection) -> AppResult<Vec<Folder>> {
        let all = Self::get_all_folders(conn)?;
        let mut map: HashMap<String, Folder> = HashMap::new();
        let mut roots: Vec<Folder> = Vec::new();

        for mut f in all {
            f.children = Some(Vec::new());
            map.insert(f.id.clone(), f);
        }

        let mut parent_to_children: HashMap<String, Vec<Folder>> = HashMap::new();
        let mut root_ids = Vec::new();

        for f in map.values() {
            if let Some(ref pid) = f.parent_id {
                parent_to_children
                    .entry(pid.clone())
                    .or_default()
                    .push(f.clone());
            } else {
                root_ids.push(f.id.clone());
            }
        }

        fn assemble_tree(folder: &mut Folder, parent_to_children: &HashMap<String, Vec<Folder>>) {
            if let Some(children) = parent_to_children.get(&folder.id) {
                let mut sorted_children = children.clone();
                sorted_children.sort_by_key(|a| a.name.to_lowercase());
                for child in &mut sorted_children {
                    assemble_tree(child, parent_to_children);
                }
                folder.children = Some(sorted_children);
            } else {
                folder.children = Some(Vec::new());
            }
        }

        for rid in root_ids {
            if let Some(mut root_f) = map.remove(&rid) {
                assemble_tree(&mut root_f, &parent_to_children);
                roots.push(root_f);
            }
        }

        roots.sort_by_key(|a| a.name.to_lowercase());
        Ok(roots)
    }

    pub fn get_all_folders(conn: &Connection) -> AppResult<Vec<Folder>> {
        let mut stmt = conn.prepare(
            "SELECT id, name, parent_id, path, depth, created_at, updated_at
             FROM folders
             ORDER BY depth ASC, name COLLATE NOCASE ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Folder {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                path: row.get(3)?,
                depth: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
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
