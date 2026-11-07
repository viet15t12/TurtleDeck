// src-tauri/src/db/schema.rs — Khởi tạo cấu trúc bảng SQLite và FTS5
use crate::error::AppResult;
use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

pub const CURRENT_SCHEMA_VERSION: i32 = 2;

const FOLDERS_AND_LOCATIONS_DDL: &str = "
CREATE TABLE IF NOT EXISTS folders (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT NULL REFERENCES folders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_parent_name
  ON folders (COALESCE(parent_id, ''), name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS ix_folders_parent ON folders (parent_id, sort_order);

CREATE TABLE IF NOT EXISTS deck_locations (
  id         TEXT PRIMARY KEY,
  deck_id    TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  folder_id  TEXT NULL REFERENCES folders(id) ON DELETE CASCADE,
  is_link    INTEGER NOT NULL DEFAULT 0 CHECK (is_link IN (0, 1)),
  created_at INTEGER NOT NULL,
  CHECK (is_link = 0 OR folder_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_deck_primary
  ON deck_locations (deck_id) WHERE is_link = 0;

CREATE UNIQUE INDEX IF NOT EXISTS ux_deck_folder
  ON deck_locations (deck_id, folder_id) WHERE folder_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_locations_folder ON deck_locations (folder_id);
";

pub fn create_schema(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;

    if version < 1 {
        conn.execute_batch(
            "
            -- Bảng bộ thẻ đã biết
            CREATE TABLE IF NOT EXISTS decks (
              id TEXT PRIMARY KEY,
              file_path TEXT UNIQUE,
              title TEXT NOT NULL,
              kind TEXT NOT NULL CHECK(kind IN ('qa', 'quiz', 'vocab')),
              lang TEXT DEFAULT 'vi',
              description TEXT,
              version INTEGER DEFAULT 1,
              deck_hash TEXT,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL
            );

            -- Bảng câu hỏi (Cache nội dung phục vụ tìm kiếm & thống kê chéo)
            CREATE TABLE IF NOT EXISTS items (
              id TEXT NOT NULL,
              deck_id TEXT NOT NULL,
              type TEXT NOT NULL,
              topic TEXT,
              tags_json TEXT,
              content_json TEXT NOT NULL,
              search_text TEXT,
              starred INTEGER DEFAULT 0,
              created_at INTEGER NOT NULL,
              PRIMARY KEY (deck_id, id),
              FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_items_topic ON items(deck_id, topic);
            CREATE INDEX IF NOT EXISTS idx_items_starred ON items(deck_id, starred);

            -- Bảng trạng thái SRS cho từng thẻ học
            CREATE TABLE IF NOT EXISTS srs_cards (
              deck_id TEXT NOT NULL,
              item_id TEXT NOT NULL,
              direction TEXT NOT NULL DEFAULT 'fwd',
              state TEXT NOT NULL CHECK(state IN ('new', 'learning', 'review', 'relearning')),
              step INTEGER DEFAULT 0,
              ease REAL DEFAULT 2.5,
              interval INTEGER DEFAULT 0,
              due INTEGER NOT NULL DEFAULT 0,
              reps INTEGER DEFAULT 0,
              lapses INTEGER DEFAULT 0,
              updated_at INTEGER NOT NULL,
              stability REAL DEFAULT 0.0,
              difficulty REAL DEFAULT 5.0,
              last_review INTEGER DEFAULT 0,
              PRIMARY KEY (deck_id, item_id, direction)
            );

            CREATE INDEX IF NOT EXISTS idx_srs_due ON srs_cards(deck_id, state, due);
            CREATE INDEX IF NOT EXISTS idx_srs_deck_item ON srs_cards(deck_id, item_id);

            -- Bảng nhật ký ôn tập (Append-only log)
            CREATE TABLE IF NOT EXISTS review_logs (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              deck_id TEXT NOT NULL,
              item_id TEXT NOT NULL,
              direction TEXT NOT NULL DEFAULT 'fwd',
              rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 4),
              review_time INTEGER NOT NULL,
              elapsed_ms INTEGER DEFAULT 0,
              is_new INTEGER DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_review_logs_deck_time ON review_logs(deck_id, review_time);
            CREATE INDEX IF NOT EXISTS idx_review_logs_item ON review_logs(deck_id, item_id);

            -- Bảng ghi chú và đánh dấu sao của từng mục (item_meta)
            CREATE TABLE IF NOT EXISTS item_meta (
              deck_id TEXT NOT NULL,
              item_id TEXT NOT NULL,
              starred INTEGER DEFAULT 0,
              note TEXT DEFAULT '',
              updated_at INTEGER NOT NULL,
              PRIMARY KEY (deck_id, item_id)
            );

            -- Bảng kỷ lục chế độ Match
            CREATE TABLE IF NOT EXISTS match_records (
              deck_id TEXT PRIMARY KEY,
              best_time_ms INTEGER NOT NULL,
              achieved_at INTEGER NOT NULL,
              pairs_count INTEGER NOT NULL
            );

            -- Bảng tìm kiếm toàn văn FTS5 cho câu hỏi / từ vựng
            CREATE VIRTUAL TABLE IF NOT EXISTS items_fts USING fts5(
              deck_id UNINDEXED,
              item_id UNINDEXED,
              search_text,
              tokenize = 'unicode61 remove_diacritics 2'
            );

            -- Triggers tự động duy trì chỉ mục FTS5 khi bảng items thay đổi
            CREATE TRIGGER IF NOT EXISTS trg_items_ai AFTER INSERT ON items BEGIN
              INSERT INTO items_fts(deck_id, item_id, search_text)
              VALUES (new.deck_id, new.id, new.search_text);
            END;

            CREATE TRIGGER IF NOT EXISTS trg_items_ad AFTER DELETE ON items BEGIN
              DELETE FROM items_fts WHERE deck_id = old.deck_id AND item_id = old.id;
            END;

            CREATE TRIGGER IF NOT EXISTS trg_items_au AFTER UPDATE ON items BEGIN
              DELETE FROM items_fts WHERE deck_id = old.deck_id AND item_id = old.id;
              INSERT INTO items_fts(deck_id, item_id, search_text)
              VALUES (new.deck_id, new.id, new.search_text);
            END;
            ",
        )?;

        conn.execute_batch(FOLDERS_AND_LOCATIONS_DDL)?;
        conn.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
        return Ok(());
    }

    // Kiểm tra và nâng cấp từ schema v1 (hoặc DB cũ chưa có sort_order trên folders) lên v2
    let folder_cols: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(folders)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let needs_v2_rebuild = version < 2
        || folder_cols.is_empty()
        || !folder_cols.contains(&"sort_order".to_string())
        || folder_cols.contains(&"path".to_string());

    if needs_v2_rebuild {
        migrate_v1_to_v2(conn)?;
    } else {
        conn.execute_batch(FOLDERS_AND_LOCATIONS_DDL)?;
    }

    // Đảm bảo các cột FSRS luôn tồn tại trong srs_cards (kể cả với database cũ)
    let srs_cols: Vec<String> = {
        let mut stmt = conn.prepare("PRAGMA table_info(srs_cards)")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(1))?;
        rows.filter_map(|r| r.ok()).collect()
    };
    if !srs_cols.is_empty() {
        if !srs_cols.contains(&"stability".to_string()) {
            let _ = conn.execute(
                "ALTER TABLE srs_cards ADD COLUMN stability REAL DEFAULT 0.0",
                [],
            );
        }
        if !srs_cols.contains(&"difficulty".to_string()) {
            let _ = conn.execute(
                "ALTER TABLE srs_cards ADD COLUMN difficulty REAL DEFAULT 5.0",
                [],
            );
        }
        if !srs_cols.contains(&"last_review".to_string()) {
            let _ = conn.execute(
                "ALTER TABLE srs_cards ADD COLUMN last_review INTEGER DEFAULT 0",
                [],
            );
        }
    }

    Ok(())
}

pub fn migrate_v1_to_v2(conn: &Connection) -> AppResult<()> {
    conn.execute_batch("BEGIN IMMEDIATE;")?;
    let res: AppResult<()> = (|| {
        let has_folders: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='folders'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);

        let has_locations: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='deck_locations'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);

        #[derive(Clone)]
        struct OldFolder {
            id: String,
            parent_id: Option<String>,
            name: String,
            created_at: i64,
            updated_at: i64,
        }

        #[derive(Clone)]
        struct OldLoc {
            id: String,
            deck_id: String,
            folder_id: Option<String>,
            is_link: i64,
            created_at: i64,
        }

        let mut old_folders = Vec::new();
        if has_folders {
            let mut stmt = conn.prepare(
                "SELECT id, parent_id, name, created_at, updated_at FROM folders ORDER BY created_at ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(OldFolder {
                    id: row.get(0)?,
                    parent_id: row.get(1)?,
                    name: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })?;
            for r in rows.flatten() {
                old_folders.push(r);
            }
        }

        let mut old_locs = Vec::new();
        if has_locations {
            let mut stmt = conn.prepare(
                "SELECT id, deck_id, folder_id, COALESCE(is_link, 0), created_at FROM deck_locations ORDER BY is_link ASC, created_at ASC",
            )?;
            let rows = stmt.query_map([], |row| {
                Ok(OldLoc {
                    id: row.get(0)?,
                    deck_id: row.get(1)?,
                    folder_id: row.get(2)?,
                    is_link: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })?;
            for r in rows.flatten() {
                old_locs.push(r);
            }
        }

        conn.execute_batch(
            "DROP TABLE IF EXISTS deck_locations;
             DROP TABLE IF EXISTS folders;",
        )?;
        conn.execute_batch(FOLDERS_AND_LOCATIONS_DDL)?;

        // Chèn lại folders theo thứ tự cha -> con
        let mut inserted_folders = HashSet::new();
        let mut sibling_counts: HashMap<Option<String>, i64> = HashMap::new();
        let mut sibling_names: HashSet<(String, String)> = HashSet::new();
        let mut remaining = old_folders;

        loop {
            let mut progress = false;
            let mut next_remaining = Vec::new();

            for f in remaining {
                let trim_name = f.name.trim().to_string();
                if trim_name.is_empty() || f.parent_id.as_deref() == Some(f.id.as_str()) {
                    continue;
                }
                let parent_ready = match f.parent_id {
                    None => true,
                    Some(ref pid) => inserted_folders.contains(pid),
                };
                if parent_ready {
                    let parent_key = f.parent_id.clone().unwrap_or_default();
                    let name_key = (parent_key, trim_name.to_lowercase());
                    if sibling_names.contains(&name_key) {
                        continue;
                    }
                    let order = sibling_counts.entry(f.parent_id.clone()).or_insert(0);
                    conn.execute(
                        "INSERT INTO folders (id, parent_id, name, sort_order, created_at, updated_at)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                        params![f.id, f.parent_id, trim_name, *order, f.created_at, f.updated_at],
                    )?;
                    *order += 1;
                    sibling_names.insert(name_key);
                    inserted_folders.insert(f.id);
                    progress = true;
                } else {
                    next_remaining.push(f);
                }
            }

            if !progress || next_remaining.is_empty() {
                break;
            }
            remaining = next_remaining;
        }

        // Lấy tập hợp deck_id hợp lệ từ bảng decks (nếu bảng decks tồn tại)
        let has_decks: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM sqlite_master WHERE type='table' AND name='decks'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(false);
        let valid_decks: HashSet<String> = if has_decks {
            let mut stmt = conn.prepare("SELECT id FROM decks")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            rows.filter_map(|r| r.ok()).collect()
        } else {
            HashSet::new()
        };

        let mut primary_decks = HashSet::new();
        let mut deck_folder_pairs = HashSet::new();

        for loc in old_locs {
            if !valid_decks.contains(&loc.deck_id) {
                continue;
            }
            let fid = loc
                .folder_id
                .filter(|id| !id.trim().is_empty() && inserted_folders.contains(id));
            let is_link = if loc.is_link != 0 { 1 } else { 0 };

            if is_link == 1 && fid.is_none() {
                continue;
            }
            if is_link == 0 {
                if primary_decks.contains(&loc.deck_id) {
                    continue;
                }
            }
            if let Some(ref f) = fid {
                if deck_folder_pairs.contains(&(loc.deck_id.clone(), f.clone())) {
                    continue;
                }
                deck_folder_pairs.insert((loc.deck_id.clone(), f.clone()));
            }
            if is_link == 0 {
                primary_decks.insert(loc.deck_id.clone());
            }

            conn.execute(
                "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![loc.id, loc.deck_id, fid, is_link, loc.created_at],
            )?;
        }

        // Mỗi deck chưa có vị trí chính được gán folder_id = NULL
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        for deck_id in valid_decks {
            if !primary_decks.contains(&deck_id) {
                let loc_id = Uuid::new_v4().to_string();
                conn.execute(
                    "INSERT INTO deck_locations (id, deck_id, folder_id, is_link, created_at)
                     VALUES (?1, ?2, NULL, 0, ?3)",
                    params![loc_id, deck_id, now],
                )?;
            }
        }

        conn.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
        Ok(())
    })();

    match res {
        Ok(()) => {
            conn.execute_batch("COMMIT;")?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK;");
            Err(e)
        }
    }
}
