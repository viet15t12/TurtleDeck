# Kế hoạch triển khai: Nâng cấp định dạng gói thẻ `.sdeck` lên Version 2

> **Tài liệu đặc tả kỹ thuật & kế hoạch thi công (Technical Spec & Implementation Plan)**
> **Mục tiêu:** Chuyển đổi định dạng tệp lưu trữ `.sdeck` sang Version 2: tách biệt siêu dữ liệu (`deck.json`), cơ sở dữ liệu bộ câu hỏi SQLite (`questions.db`) theo mô hình **1 bảng cha - nhiều bảng con cho từng type** (với `multi` hỗ trợ tag mảng JSON, `vocab` tương thích cấu trúc Anki), tệp lời giải/đáp án (`solutions.json`) và thư mục ảnh (`img/`), đồng thời **đảm bảo 100% tương thích ngược (Backward Compatibility)**: nếu không khai báo `version` (hoặc `version = 1`) thì tự động vận hành theo định dạng Version 1 hiện tại.

---

## 1. Tổng quan & So sánh kiến trúc (V1 vs V2)

### 1.1. So sánh cấu trúc tệp ZIP `.sdeck`

| Thành phần | Version 1 (Hiện tại) | Version 2 (Mới) | Ghi chú |
|---|---|---|---|
| **`deck.json`** | Chứa cả `meta` lẫn mảng `items` (câu hỏi + đáp án + lời giải) | Chỉ chứa `meta` (id, title, version=2, config, file manifest) | Nhẹ, đọc nhanh thông tin tổng quan mà không cần parse toàn bộ câu hỏi. |
| **`questions.db`** | *Không có* | **SQLite database quan hệ (Parent-Child)**: 1 bảng cha `items` + các bảng con theo từng `type` (`item_cards`, `item_singles`, `item_multis`, `item_fills`, `item_commands`, `item_vocabs`) | Tối ưu hóa truy vấn chuyên biệt cho từng loại câu hỏi, chuẩn hóa dữ liệu, tương thích Anki Notes. |
| **`solutions.json`** | Nằm gộp trong `items` của `deck.json` | **JSON riêng biệt** map `question_id -> { answer, explanation, ... }` | Tách biệt lời giải để hỗ trợ chế độ thi chống lộ đề, tải đáp án theo phiên học. |
| **`img/`** | Thư mục chứa tài nguyên ảnh | Thư mục chứa tài nguyên ảnh | Giữ nguyên cơ chế phục vụ qua `asset://`. |
| **Nhận diện Version** | Mặc định là `1` nếu không có trường `version` hoặc `formatVersion` | Khai báo `version: 2` (hoặc `formatVersion: 2`) trong `deck.json` | Đảm bảo tương thích ngược tuyệt đối. |

### 1.2. Sơ đồ cấu trúc tệp bên trong `.sdeck` v2

```text
my-deck.sdeck (ZIP Archive)
├── deck.json            # [Bắt buộc] formatVersion: 2, meta info, manifest
├── questions.db         # [Bắt buộc ở v2] SQLite: 1 bảng cha (items) + 6 bảng con theo type
├── solutions.json       # [Tùy chọn/Bắt buộc ở v2] Map: question_id -> lời giải & đáp án
└── img/                 # [Tùy chọn] Thư mục ảnh phục vụ qua asset://
    ├── diagram1.png
    └── photo2.jpg
```

---

## 2. Đặc tả CSDL SQLite (`questions.db`) — Mô hình 1 Bảng cha & Nhiều bảng con

Mô hình thiết kế chuẩn hóa quan hệ (Relational Model):
- **Bảng cha (`items`)**: Quản lý thuộc tính chung của mọi thẻ (id, type, topic, tags_json, image, order_index, created_at, updated_at).
- **Các bảng con theo `type`**: Mỗi loại câu hỏi có bảng riêng, khóa chính trỏ về `items(id)` với `ON DELETE CASCADE`.

```
                    ┌────────────────────────┐
                    │      items (Cha)       │
                    │────────────────────────│
                    │ id (PK)                │
                    │ type                   │
                    │ topic                  │
                    │ tags_json              │
                    │ image, answer_image    │
                    │ order_index, timestamps│
                    └───────────┬────────────┘
         ┌──────────────┬───────┴───────┬──────────────┬──────────────┐
         ▼              ▼               ▼              ▼              ▼
┌────────────────┐┌───────────┐┌────────────────┐┌───────────┐┌────────────────┐
│  item_cards    ││item_single││  item_multis   ││item_fills ││  item_vocabs   │
│ (Thẻ ghi nhớ)  ││(1 đáp án) ││ (Nhiều đáp án) ││ (Điền từ) ││(Tương thích    │
│                ││           ││                ││           ││  Anki Note)    │
└────────────────┘└───────────┘└────────────────┘└───────────┘└────────────────┘
```

### 2.1. Mã DDL khởi tạo Schema SQLite (`questions.db`)

```sql
-- ============================================================================
-- 1. BẢNG CHA: Lưu thông tin chung của tất cả mục câu hỏi / thẻ
-- ============================================================================
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('single', 'multi', 'fill', 'command', 'card', 'vocab')),
    topic TEXT,
    tags_json TEXT DEFAULT '[]',         -- Mảng JSON: ["tag1", "tag2", "tag3"]
    image TEXT,                          -- Đường dẫn ảnh tương đối: img/photo.png
    answer_image TEXT,                   -- Đường dẫn ảnh đi kèm đáp án
    order_index INTEGER DEFAULT 0,       -- Thứ tự sắp xếp hiển thị
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_topic ON items(topic);
CREATE INDEX IF NOT EXISTS idx_items_order ON items(order_index);

-- ============================================================================
-- 2. CÁC BẢNG CON THEO TỪNG LOẠI (CHILD TABLES BY TYPE)
-- ============================================================================

-- 2.1. Bảng thẻ ghi nhớ Flashcard thông thường (type = 'card')
CREATE TABLE IF NOT EXISTS item_cards (
    item_id TEXT PRIMARY KEY,
    front TEXT NOT NULL,                 -- Mặt trước (Câu hỏi / Thuật ngữ)
    back TEXT NOT NULL,                  -- Mặt sau (Câu trả lời / Định nghĩa)
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 2.2. Bảng trắc nghiệm 1 đáp án (type = 'single')
CREATE TABLE IF NOT EXISTS item_singles (
    item_id TEXT PRIMARY KEY,
    question TEXT NOT NULL,              -- Nội dung câu hỏi (hỗ trợ Markdown & LaTeX)
    choices_json TEXT NOT NULL,          -- Danh sách lựa chọn JSON: ["A", "B", "C", "D"] hoặc [{"text": "...", "image": "..."}]
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 2.3. Bảng trắc nghiệm nhiều đáp án (type = 'multi')
-- Hỗ trợ tags và choices dạng JSON mảng: ["tag1", "tag2"]
CREATE TABLE IF NOT EXISTS item_multis (
    item_id TEXT PRIMARY KEY,
    question TEXT NOT NULL,              -- Nội dung câu hỏi
    choices_json TEXT NOT NULL,          -- Danh sách lựa chọn JSON mảng: ["Lựa chọn 1", "Lựa chọn 2", ...]
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 2.4. Bảng câu hỏi điền từ (type = 'fill')
CREATE TABLE IF NOT EXISTS item_fills (
    item_id TEXT PRIMARY KEY,
    question TEXT NOT NULL,              -- Câu hỏi có chỗ trống, vd: "Nước sôi ở [___] độ C"
    match_mode TEXT DEFAULT 'normalized' CHECK(match_mode IN ('exact', 'normalized', 'regex', 'number', 'latex')),
    tolerance REAL DEFAULT 0.0,          -- Dung sai nếu so khớp dạng số
    answer_display TEXT,                 -- Hiển thị đáp án mẫu (vd công thức LaTeX $100^\circ C$)
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 2.5. Bảng câu hỏi lệnh dòng lệnh CLI (type = 'command')
CREATE TABLE IF NOT EXISTS item_commands (
    item_id TEXT PRIMARY KEY,
    question TEXT NOT NULL,              -- Đề bài yêu cầu câu lệnh
    match_mode TEXT DEFAULT 'exact' CHECK(match_mode IN ('exact', 'normalized', 'regex')),
    answer_display TEXT,                 -- Hiển thị lệnh mẫu
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 2.6. Bảng từ vựng tương thích hoàn toàn với Anki Note (type = 'vocab')
-- Cấu trúc các trường tương ứng chuẩn Anki Vocabulary Note Type (Fields & GUID)
CREATE TABLE IF NOT EXISTS item_vocabs (
    item_id TEXT PRIMARY KEY,
    term TEXT NOT NULL,                  -- Anki: Front / Expression / Word (Từ vựng)
    definition TEXT NOT NULL,            -- Anki: Back / Meaning (Nghĩa)
    phonetic TEXT,                       -- Anki: Reading / Furigana / IPA (Phiên âm: /həˈləʊ/)
    pos TEXT,                            -- Anki: PartOfSpeech (Từ loại: n, v, adj, adv...)
    example TEXT,                        -- Anki: Example Sentence (Câu ví dụ minh họa)
    example_meaning TEXT,                -- Anki: Example Translation (Nghĩa của câu ví dụ)
    audio TEXT,                          -- Anki: Audio Sound ([sound:audio.mp3] hoặc đường dẫn file audio)
    forms_json TEXT DEFAULT '[]',        -- Mảng JSON: Biến thể của từ ["walked", "walking"]
    synonyms_json TEXT DEFAULT '[]',     -- Mảng JSON: Từ đồng nghĩa ["hi", "greetings"]
    antonyms_json TEXT DEFAULT '[]',     -- Mảng JSON: Từ trái nghĩa ["bye", "farewell"]
    anki_guid TEXT,                      -- Mã GUID 10 ký tự tương thích đồng bộ Anki (Anki Note GUID)
    anki_note_id INTEGER,                -- ID Note tương ứng trong Anki SQLite (.anki2 / .apkg)
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
    -- Trường single & multi
    COALESCE(s.question, m.question, f.question, cmd.question) AS question,
    COALESCE(s.choices_json, m.choices_json) AS choices_json,
    -- Trường fill & command
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
```

---

## 3. Đặc tả `deck.json` & `solutions.json`

### 3.1. Cấu trúc `deck.json` (Version 2)
```json
{
  "meta": {
    "id": "english-ielts-v2",
    "title": "Bộ từ vựng IELTS Advanced (Anki Compatible)",
    "kind": "vocab",
    "lang": "en",
    "format": "studydeck",
    "version": 2,
    "formatVersion": 2,
    "description": "Bộ từ vựng tương thích cấu trúc Anki, kèm bảng trắc nghiệm",
    "files": {
      "db": "questions.db",
      "solutions": "solutions.json"
    },
    "stats": {
      "totalItems": 150,
      "vocabCount": 120,
      "quizCount": 30
    },
    "created": 1730000000000,
    "updated": 1730800000000
  }
}
```

> **Quy tắc tương thích ngược:**
> Nếu `version` hoặc `formatVersion` không khai báo hoặc `<= 1`, ứng dụng tự động xử lý theo luồng **Version 1** (đọc trường `items: [...]` trực tiếp từ `deck.json`).

---

### 3.2. Cấu trúc `solutions.json`

Lời giải và đáp án đúng được phân chia theo từng loại type:
```json
{
  "version": 1,
  "solutions": {
    "q_multi_linux": {
      "answer": [0, 2],
      "answerDisplay": "Lựa chọn A và C",
      "explanation": "Cả tùy chọn -a và -l đều cần thiết để hiển thị file ẩn chi tiết."
    },
    "fill_physics_1": {
      "answer": ["100", "100.0", "100 độ"],
      "explanation": "Nước tinh khiết sôi ở 100 độ C ở áp suất khí quyển tiêu chuẩn."
    },
    "vocab_ubiquitous": {
      "explanation": "Từ bắt nguồn từ tiếng Latin 'ubique' có nghĩa là 'khắp mọi nơi'.",
      "explanationImage": "img/notes/ubiquitous_etymology.png"
    }
  }
}
```

---

## 4. Mã nguồn chi tiết các module cần triển khai

### 4.1. `src-tauri/src/services/sdeck_v2.rs` (Cập nhật Schema Quan hệ)

```rust
// src-tauri/src/services/sdeck_v2.rs — Xử lý CSDL SQLite quan hệ và Solutions trong gói .sdeck Version 2
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

pub const DECK_DB_ENTRY: &str = "questions.db";
pub const SOLUTIONS_ENTRY: &str = "solutions.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SolutionItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer: Option<Value>,
    #[serde(rename = "answerDisplay", skip_serializing_if = "Option::is_none")]
    pub answer_display: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(rename = "explanationImage", skip_serializing_if = "Option::is_none")]
    pub explanation_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SolutionsFile {
    pub version: u32,
    pub solutions: HashMap<String, SolutionItem>,
}

/// Khởi tạo SQLite schema quan hệ (1 bảng cha + 6 bảng con + 1 view hợp nhất)
pub fn init_deck_db(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "
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

        CREATE TABLE IF NOT EXISTS item_cards (
            item_id TEXT PRIMARY KEY,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS item_singles (
            item_id TEXT PRIMARY KEY,
            question TEXT NOT NULL,
            choices_json TEXT NOT NULL,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS item_multis (
            item_id TEXT PRIMARY KEY,
            question TEXT NOT NULL,
            choices_json TEXT NOT NULL,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS item_fills (
            item_id TEXT PRIMARY KEY,
            question TEXT NOT NULL,
            match_mode TEXT DEFAULT 'normalized',
            tolerance REAL DEFAULT 0.0,
            answer_display TEXT,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS item_commands (
            item_id TEXT PRIMARY KEY,
            question TEXT NOT NULL,
            match_mode TEXT DEFAULT 'exact',
            answer_display TEXT,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

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

        CREATE VIEW IF NOT EXISTS v_deck_items AS
        SELECT 
            i.id, i.type, i.topic, i.tags_json, i.image, i.answer_image, i.order_index, i.created_at, i.updated_at,
            c.front, c.back,
            COALESCE(s.question, m.question, f.question, cmd.question) AS question,
            COALESCE(s.choices_json, m.choices_json) AS choices_json,
            COALESCE(f.match_mode, cmd.match_mode) AS match_mode,
            f.tolerance,
            COALESCE(f.answer_display, cmd.answer_display) AS answer_display,
            v.term, v.definition, v.phonetic, v.pos, v.example, v.example_meaning, v.audio,
            v.forms_json, v.synonyms_json, v.antonyms_json, v.anki_guid, v.anki_note_id
        FROM items i
        LEFT JOIN item_cards c ON i.id = c.item_id
        LEFT JOIN item_singles s ON i.id = s.item_id
        LEFT JOIN item_multis m ON i.id = m.item_id
        LEFT JOIN item_fills f ON i.id = f.item_id
        LEFT JOIN item_commands cmd ON i.id = cmd.item_id
        LEFT JOIN item_vocabs v ON i.id = v.item_id;
        ",
    )
    .map_err(|e| AppError::Custom(format!("Lỗi tạo schema quan hệ questions.db: {e}")))?;
    Ok(())
}

/// Tách items v1 thành danh sách câu hỏi sạch (lưu CSDL) và solutions.json (đáp án & lời giải)
pub fn split_v1_items_to_v2(items: &[Value]) -> (Vec<Value>, SolutionsFile) {
    let mut clean_items = Vec::with_capacity(items.len());
    let mut solutions_map = HashMap::new();

    for it in items {
        let mut clean_it = it.clone();
        let item_id = it.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let answer = clean_it.as_object_mut().and_then(|m| m.remove("answer"));
        let answer_display = clean_it.as_object_mut().and_then(|m| m.remove("answerDisplay"))
            .and_then(|v| v.as_str().map(|s| s.to_string()));
        let explanation = clean_it.as_object_mut().and_then(|m| m.remove("explanation"))
            .and_then(|v| v.as_str().map(|s| s.to_string()));
        let explanation_image = clean_it.as_object_mut().and_then(|m| m.remove("explanationImage"))
            .and_then(|v| v.as_str().map(|s| s.to_string()));

        if !item_id.is_empty() && (answer.is_some() || explanation.is_some() || answer_display.is_some()) {
            solutions_map.insert(
                item_id,
                SolutionItem {
                    answer,
                    answer_display,
                    explanation,
                    explanation_image,
                },
            );
        }

        clean_items.push(clean_it);
    }

    (clean_items, SolutionsFile { version: 1, solutions: solutions_map })
}

/// Lưu danh sách items vào mô hình 1 bảng cha - nhiều bảng con trong CSDL SQLite nhị phân
pub fn build_questions_db_bytes(items: &[Value]) -> AppResult<Vec<u8>> {
    let conn = Connection::open_in_memory()
        .map_err(|e| AppError::Custom(format!("Không thể mở SQLite in-memory: {e}")))?;
    init_deck_db(&conn)?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    for (index, it) in items.iter().enumerate() {
        let id = it.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let item_type = it.get("type").and_then(|v| v.as_str()).unwrap_or("card");
        let topic = it.get("topic").and_then(|v| v.as_str());
        let image = it.get("image").and_then(|v| v.as_str());
        let answer_image = it.get("answerImage").and_then(|v| v.as_str());
        
        // Tags JSON đảm bảo định dạng mảng: ["tag1", "tag2"]
        let tags_json = match it.get("tags") {
            Some(Value::Array(arr)) => serde_json::to_string(arr).unwrap_or_else(|_| "[]".into()),
            _ => "[]".to_string(),
        };

        // 1. Chèn vào bảng cha items
        conn.execute(
            "INSERT INTO items (id, type, topic, tags_json, image, answer_image, order_index, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![id, item_type, topic, tags_json, image, answer_image, index as i32, now, now],
        ).map_err(|e| AppError::Custom(format!("Lỗi chèn bảng cha items '{id}': {e}")))?;

        // 2. Chèn vào bảng con tương ứng
        match item_type {
            "card" => {
                let front = it.get("front").and_then(|v| v.as_str()).unwrap_or("");
                let back = it.get("back").and_then(|v| v.as_str()).unwrap_or("");
                conn.execute(
                    "INSERT INTO item_cards (item_id, front, back) VALUES (?1, ?2, ?3)",
                    params![id, front, back],
                ).map_err(|e| AppError::Custom(format!("Lỗi chèn item_cards: {e}")))?;
            }
            "single" => {
                let question = it.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let choices_json = it.get("choices").map(|c| c.to_string()).unwrap_or_else(|| "[]".into());
                conn.execute(
                    "INSERT INTO item_singles (item_id, question, choices_json) VALUES (?1, ?2, ?3)",
                    params![id, question, choices_json],
                ).map_err(|e| AppError::Custom(format!("Lỗi chèn item_singles: {e}")))?;
            }
            "multi" => {
                let question = it.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let choices_json = it.get("choices").map(|c| c.to_string()).unwrap_or_else(|| "[]".into());
                conn.execute(
                    "INSERT INTO item_multis (item_id, question, choices_json) VALUES (?1, ?2, ?3)",
                    params![id, question, choices_json],
                ).map_err(|e| AppError::Custom(format!("Lỗi chèn item_multis: {e}")))?;
            }
            "fill" => {
                let question = it.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let match_mode = it.get("match").and_then(|v| v.as_str()).unwrap_or("normalized");
                let tolerance = it.get("tolerance").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let answer_display = it.get("answerDisplay").and_then(|v| v.as_str());
                conn.execute(
                    "INSERT INTO item_fills (item_id, question, match_mode, tolerance, answer_display)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![id, question, match_mode, tolerance, answer_display],
                ).map_err(|e| AppError::Custom(format!("Lỗi chèn item_fills: {e}")))?;
            }
            "command" => {
                let question = it.get("question").and_then(|v| v.as_str()).unwrap_or("");
                let match_mode = it.get("match").and_then(|v| v.as_str()).unwrap_or("exact");
                let answer_display = it.get("answerDisplay").and_then(|v| v.as_str());
                conn.execute(
                    "INSERT INTO item_commands (item_id, question, match_mode, answer_display)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![id, question, match_mode, answer_display],
                ).map_err(|e| AppError::Custom(format!("Lỗi chèn item_commands: {e}")))?;
            }
            "vocab" => {
                let term = it.get("term").and_then(|v| v.as_str()).unwrap_or("");
                let definition = it.get("definition").and_then(|v| v.as_str()).unwrap_or("");
                let phonetic = it.get("phonetic").and_then(|v| v.as_str());
                let pos = it.get("pos").and_then(|v| v.as_str());
                let example = it.get("example").and_then(|v| v.as_str());
                let example_meaning = it.get("exampleMeaning").and_then(|v| v.as_str());
                let audio = it.get("audio").and_then(|v| v.as_str());
                let forms_json = it.get("forms").map(|c| c.to_string()).unwrap_or_else(|| "[]".into());
                let synonyms_json = it.get("synonyms").map(|c| c.to_string()).unwrap_or_else(|| "[]".into());
                let antonyms_json = it.get("antonyms").map(|c| c.to_string()).unwrap_or_else(|| "[]".into());
                let anki_guid = it.get("ankiGuid").and_then(|v| v.as_str());
                let anki_note_id = it.get("ankiNoteId").and_then(|v| v.as_i64());

                conn.execute(
                    "INSERT INTO item_vocabs (item_id, term, definition, phonetic, pos, example, example_meaning, audio, forms_json, synonyms_json, antonyms_json, anki_guid, anki_note_id)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    params![id, term, definition, phonetic, pos, example, example_meaning, audio, forms_json, synonyms_json, antonyms_json, anki_guid, anki_note_id],
                ).map_err(|e| AppError::Custom(format!("Lỗi chèn item_vocabs: {e}")))?;
            }
            _ => {}
        }
    }

    // Sao lưu CSDL in-memory ra byte buffer
    let temp_path = std::env::temp_dir().join(format!("build_db_{}.db", uuid::Uuid::new_v4()));
    conn.backup(rusqlite::DatabaseName::Main, &temp_path, None)
        .map_err(|e| AppError::Custom(format!("Lỗi backup SQLite ra temp: {e}")))?;

    let bytes = std::fs::read(&temp_path)
        .map_err(|e| AppError::Custom(format!("Lỗi đọc SQLite temp: {e}")))?;
    let _ = std::fs::remove_file(&temp_path);

    Ok(bytes)
}

/// Đọc toàn bộ danh sách items từ VIEW `v_deck_items` trong `questions.db`
pub fn read_questions_db_bytes(bytes: &[u8]) -> AppResult<Vec<Value>> {
    let temp_path = std::env::temp_dir().join(format!("read_db_{}.db", uuid::Uuid::new_v4()));
    std::fs::write(&temp_path, bytes)
        .map_err(|e| AppError::Custom(format!("Không thể ghi SQLite temp: {e}")))?;

    let conn = Connection::open(&temp_path)
        .map_err(|e| AppError::Custom(format!("Không thể mở SQLite temp: {e}")))?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                id, type, topic, tags_json, image, answer_image, order_index,
                front, back, question, choices_json, match_mode, tolerance, answer_display,
                term, definition, phonetic, pos, example, example_meaning, audio,
                forms_json, synonyms_json, antonyms_json, anki_guid, anki_note_id
             FROM v_deck_items
             ORDER BY order_index ASC",
        )
        .map_err(|e| AppError::Custom(format!("Lỗi truy vấn v_deck_items: {e}")))?;

    let mut rows = stmt
        .query([])
        .map_err(|e| AppError::Custom(format!("Lỗi query v_deck_items: {e}")))?;

    let mut items = Vec::new();

    while let Some(row) = rows.next().map_err(|e| AppError::Custom(e.to_string()))? {
        let id: String = row.get(0)?;
        let item_type: String = row.get(1)?;
        let topic: Option<String> = row.get(2)?;
        let tags_json_str: Option<String> = row.get(3)?;
        let image: Option<String> = row.get(4)?;
        let answer_image: Option<String> = row.get(5)?;

        let mut item_obj = serde_json::Map::new();
        item_obj.insert("id".into(), json!(id));
        item_obj.insert("type".into(), json!(item_type));
        if let Some(t) = topic { item_obj.insert("topic".into(), json!(t)); }
        if let Some(img) = image { item_obj.insert("image".into(), json!(img)); }
        if let Some(ai) = answer_image { item_obj.insert("answerImage".into(), json!(ai)); }

        // Parse tags
        if let Some(tj) = tags_json_str {
            if let Ok(tags_val) = serde_json::from_str::<Value>(&tj) {
                item_obj.insert("tags".into(), tags_val);
            }
        }

        match item_type.as_str() {
            "card" => {
                let front: Option<String> = row.get(7)?;
                let back: Option<String> = row.get(8)?;
                item_obj.insert("front".into(), json!(front.unwrap_or_default()));
                item_obj.insert("back".into(), json!(back.unwrap_or_default()));
            }
            "single" | "multi" => {
                let question: Option<String> = row.get(9)?;
                let choices_json_str: Option<String> = row.get(10)?;
                item_obj.insert("question".into(), json!(question.unwrap_or_default()));
                if let Some(cj) = choices_json_str {
                    if let Ok(c_val) = serde_json::from_str::<Value>(&cj) {
                        item_obj.insert("choices".into(), c_val);
                    }
                }
            }
            "fill" => {
                let question: Option<String> = row.get(9)?;
                let match_mode: Option<String> = row.get(11)?;
                let tolerance: Option<f64> = row.get(12)?;
                let answer_display: Option<String> = row.get(13)?;
                item_obj.insert("question".into(), json!(question.unwrap_or_default()));
                if let Some(mm) = match_mode { item_obj.insert("match".into(), json!(mm)); }
                if let Some(tol) = tolerance { item_obj.insert("tolerance".into(), json!(tol)); }
                if let Some(ad) = answer_display { item_obj.insert("answerDisplay".into(), json!(ad)); }
            }
            "command" => {
                let question: Option<String> = row.get(9)?;
                let match_mode: Option<String> = row.get(11)?;
                let answer_display: Option<String> = row.get(13)?;
                item_obj.insert("question".into(), json!(question.unwrap_or_default()));
                if let Some(mm) = match_mode { item_obj.insert("match".into(), json!(mm)); }
                if let Some(ad) = answer_display { item_obj.insert("answerDisplay".into(), json!(ad)); }
            }
            "vocab" => {
                let term: Option<String> = row.get(14)?;
                let definition: Option<String> = row.get(15)?;
                let phonetic: Option<String> = row.get(16)?;
                let pos: Option<String> = row.get(17)?;
                let example: Option<String> = row.get(18)?;
                let example_meaning: Option<String> = row.get(19)?;
                let audio: Option<String> = row.get(20)?;
                let forms_json: Option<String> = row.get(21)?;
                let synonyms_json: Option<String> = row.get(22)?;
                let antonyms_json: Option<String> = row.get(23)?;
                let anki_guid: Option<String> = row.get(24)?;
                let anki_note_id: Option<i64> = row.get(25)?;

                item_obj.insert("term".into(), json!(term.unwrap_or_default()));
                item_obj.insert("definition".into(), json!(definition.unwrap_or_default()));
                if let Some(p) = phonetic { item_obj.insert("phonetic".into(), json!(p)); }
                if let Some(ps) = pos { item_obj.insert("pos".into(), json!(ps)); }
                if let Some(ex) = example { item_obj.insert("example".into(), json!(ex)); }
                if let Some(em) = example_meaning { item_obj.insert("exampleMeaning".into(), json!(em)); }
                if let Some(a) = audio { item_obj.insert("audio".into(), json!(a)); }
                if let Some(fj) = forms_json {
                    if let Ok(v) = serde_json::from_str::<Value>(&fj) { item_obj.insert("forms".into(), v); }
                }
                if let Some(sj) = synonyms_json {
                    if let Ok(v) = serde_json::from_str::<Value>(&sj) { item_obj.insert("synonyms".into(), v); }
                }
                if let Some(aj) = antonyms_json {
                    if let Ok(v) = serde_json::from_str::<Value>(&aj) { item_obj.insert("antonyms".into(), v); }
                }
                if let Some(g) = anki_guid { item_obj.insert("ankiGuid".into(), json!(g)); }
                if let Some(nid) = anki_note_id { item_obj.insert("ankiNoteId".into(), json!(nid)); }
            }
            _ => {}
        }

        items.push(Value::Object(item_obj));
    }

    drop(rows);
    drop(stmt);
    drop(conn);
    let _ = std::fs::remove_file(&temp_path);

    Ok(items)
}

/// Ghép nối câu hỏi (từ SQLite) và lời giải (từ solutions.json)
pub fn merge_v2_to_unified_items(
    db_items: Vec<Value>,
    solutions: &SolutionsFile,
) -> Vec<Value> {
    db_items
        .into_iter()
        .map(|mut it| {
            if let Some(id) = it.get("id").and_then(|v| v.as_str()) {
                if let Some(sol) = solutions.solutions.get(id) {
                    if let Some(obj) = it.as_object_mut() {
                        if let Some(ans) = &sol.answer {
                            obj.insert("answer".to_string(), ans.clone());
                        }
                        if let Some(ad) = &sol.answer_display {
                            obj.insert("answerDisplay".to_string(), json!(ad));
                        }
                        if let Some(exp) = &sol.explanation {
                            obj.insert("explanation".to_string(), json!(exp));
                        }
                        if let Some(img) = &sol.explanation_image {
                            obj.insert("explanationImage".to_string(), json!(img));
                        }
                    }
                }
            }
            it
        })
        .collect()
}
```

---

## 5. Kế hoạch kiểm thử & Đảm bảo chất lượng (Test Plan)

1. **Kiểm thử Schema 1 bảng cha - 6 bảng con**:
   - Thêm bản ghi vào `items` và các bảng con tương ứng (`item_cards`, `item_singles`, `item_multis`, `item_fills`, `item_commands`, `item_vocabs`).
   - Kiểm tra ràng buộc khóa ngoại `FOREIGN KEY` và `ON DELETE CASCADE`.
2. **Kiểm thử tính tương thích Anki của `item_vocabs`**:
   - Lưu trữ đầy đủ `term`, `definition`, `phonetic`, `pos`, `example`, `audio`, `anki_guid`, `anki_note_id`.
   - Đảm bảo trích xuất dữ liệu không thất thoát bất kỳ trường nào khi chuyển đổi sang định dạng Anki `.apkg`.
3. **Kiểm thử định dạng `multi` với tags JSON**:
   - Đảm bảo trường `tags_json` lưu mảng chuẩn `["tag1", "tag2"]` và `choices_json` lưu mảng lựa chọn.
4. **Kiểm thử tương thích ngược Version 1**:
   - Đọc các gói `.sdeck` cũ không có trường `version` (hoặc `version = 1`). Không có bất kỳ lỗi nào xảy ra.
