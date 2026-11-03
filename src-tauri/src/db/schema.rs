// src-tauri/src/db/schema.rs — Khởi tạo cấu trúc bảng SQLite và FTS5
use crate::error::AppResult;
use rusqlite::Connection;

pub const CURRENT_SCHEMA_VERSION: i32 = 1;

pub fn create_schema(conn: &Connection) -> AppResult<()> {
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

            -- Bảng thư mục (cấu trúc cây phân cấp tối đa 10 cấp)
            CREATE TABLE IF NOT EXISTS folders (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              parent_id TEXT,
              path TEXT NOT NULL UNIQUE,
              depth INTEGER NOT NULL DEFAULT 0,
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
            CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);

            -- Bảng vị trí deck (hỗ trợ nhiều vị trí cho cùng 1 deck - symlink)
            CREATE TABLE IF NOT EXISTS deck_locations (
              id TEXT PRIMARY KEY,
              deck_id TEXT NOT NULL,
              folder_id TEXT,
              file_path TEXT NOT NULL,
              is_link INTEGER DEFAULT 0,
              link_target TEXT,
              created_at INTEGER NOT NULL,
              UNIQUE(deck_id, folder_id),
              FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_deck_locations_deck ON deck_locations(deck_id);
            CREATE INDEX IF NOT EXISTS idx_deck_locations_folder ON deck_locations(folder_id);
            ",
        )?;

        conn.pragma_update(None, "user_version", CURRENT_SCHEMA_VERSION)?;
    }

    // Đảm bảo bảng folders và deck_locations luôn tồn tại kể cả khi database đã ở version >= 1
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          parent_id TEXT,
          path TEXT NOT NULL UNIQUE,
          depth INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);
        CREATE INDEX IF NOT EXISTS idx_folders_path ON folders(path);

        CREATE TABLE IF NOT EXISTS deck_locations (
          id TEXT PRIMARY KEY,
          deck_id TEXT NOT NULL,
          folder_id TEXT,
          file_path TEXT NOT NULL,
          is_link INTEGER DEFAULT 0,
          link_target TEXT,
          created_at INTEGER NOT NULL,
          UNIQUE(deck_id, folder_id),
          FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_deck_locations_deck ON deck_locations(deck_id);
        CREATE INDEX IF NOT EXISTS idx_deck_locations_folder ON deck_locations(folder_id);
        ",
    )?;

    Ok(())
}
