// src-tauri/src/services/sdeck_v2/schema.rs — Khởi tạo và định nghĩa schema SQLite cho questions.db
// Trách nhiệm duy nhất: Quản lý DDL schema, các bảng quan hệ cha-con, chỉ mục và view v_deck_items.

use crate::error::{AppError, AppResult};
use rusqlite::Connection;

pub const DDL_SCHEMA: &str = r#"
    PRAGMA foreign_keys = ON;

    -- ============================================================================
    -- 1. BẢNG CHA: Lưu thông tin chung của tất cả mục câu hỏi / thẻ
    -- ============================================================================
    CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('single', 'multi', 'fill', 'command', 'card', 'vocab')),
        topic TEXT,
        tags_json TEXT DEFAULT '[]',
        image TEXT,
        answer_image TEXT,
        order_index INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
    CREATE INDEX IF NOT EXISTS idx_items_topic ON items(topic);
    CREATE INDEX IF NOT EXISTS idx_items_order ON items(order_index);

    -- ============================================================================
    -- 2. CÁC BẢNG CON THEO TỪNG LOẠI (CHILD TABLES BY TYPE)
    -- ============================================================================

    -- 2.1. Bảng thẻ ghi nhớ Flashcard (type = 'card')
    CREATE TABLE IF NOT EXISTS item_cards (
        item_id TEXT PRIMARY KEY,
        front TEXT NOT NULL,
        back TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    -- 2.2. Bảng trắc nghiệm 1 đáp án (type = 'single')
    CREATE TABLE IF NOT EXISTS item_singles (
        item_id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        choices_json TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    -- 2.3. Bảng trắc nghiệm nhiều đáp án (type = 'multi')
    CREATE TABLE IF NOT EXISTS item_multis (
        item_id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        choices_json TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    -- 2.4. Bảng câu hỏi điền từ (type = 'fill')
    CREATE TABLE IF NOT EXISTS item_fills (
        item_id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        match_mode TEXT DEFAULT 'normalized' CHECK(match_mode IN ('exact', 'normalized', 'regex', 'number', 'latex')),
        tolerance REAL DEFAULT 0.0,
        answer_display TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    -- 2.5. Bảng câu hỏi lệnh dòng lệnh CLI (type = 'command')
    CREATE TABLE IF NOT EXISTS item_commands (
        item_id TEXT PRIMARY KEY,
        question TEXT NOT NULL,
        match_mode TEXT DEFAULT 'exact' CHECK(match_mode IN ('exact', 'normalized', 'regex')),
        answer_display TEXT,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    -- 2.6. Bảng từ vựng tương thích cấu trúc Anki Note (type = 'vocab')
    CREATE TABLE IF NOT EXISTS item_vocabs (
        item_id TEXT PRIMARY KEY,
        term TEXT NOT NULL,
        definition TEXT NOT NULL,
        phonetic TEXT,
        pos TEXT,
        example TEXT,
        example_meaning TEXT,
        audio TEXT,
        forms_json TEXT DEFAULT '[]',
        synonyms_json TEXT DEFAULT '[]',
        antonyms_json TEXT DEFAULT '[]',
        anki_guid TEXT,
        anki_note_id INTEGER,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_item_vocabs_term ON item_vocabs(term);
    CREATE INDEX IF NOT EXISTS idx_item_vocabs_anki_guid ON item_vocabs(anki_guid);

    -- ============================================================================
    -- 3. SQL VIEW HỢP NHẤT: Truy vấn nhanh tất cả loại câu hỏi trong 1 lần SELECT
    -- ============================================================================
    CREATE VIEW IF NOT EXISTS v_deck_items AS
    SELECT 
        i.id,
        i.type,
        i.topic,
        i.tags_json,
        i.image,
        i.answer_image,
        i.order_index,
        i.created_at,
        i.updated_at,
        -- Trường card
        c.front,
        c.back,
        -- Trường single, multi, fill, command
        COALESCE(s.question, m.question, f.question, cmd.question) AS question,
        COALESCE(s.choices_json, m.choices_json) AS choices_json,
        COALESCE(f.match_mode, cmd.match_mode) AS match_mode,
        f.tolerance,
        COALESCE(f.answer_display, cmd.answer_display) AS answer_display,
        -- Trường vocab (chuẩn Anki)
        v.term,
        v.definition,
        v.phonetic,
        v.pos,
        v.example,
        v.example_meaning,
        v.audio,
        v.forms_json,
        v.synonyms_json,
        v.antonyms_json,
        v.anki_guid,
        v.anki_note_id
    FROM items i
    LEFT JOIN item_cards c ON i.id = c.item_id
    LEFT JOIN item_singles s ON i.id = s.item_id
    LEFT JOIN item_multis m ON i.id = m.item_id
    LEFT JOIN item_fills f ON i.id = f.item_id
    LEFT JOIN item_commands cmd ON i.id = cmd.item_id
    LEFT JOIN item_vocabs v ON i.id = v.item_id;
"#;

/// Khởi tạo SQLite schema quan hệ (1 bảng cha + 6 bảng con + 1 view hợp nhất)
pub fn init_deck_db(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(DDL_SCHEMA)
        .map_err(|e| AppError::Custom(format!("Lỗi tạo schema quan hệ questions.db: {e}")))?;
    Ok(())
}
