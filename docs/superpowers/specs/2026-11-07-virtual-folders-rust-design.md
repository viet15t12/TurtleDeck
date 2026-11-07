# Thiết kế Quản lý Cây Thư mục Ảo (Virtual Folders) bằng Rust

**Ngày:** 2026-11-07
**Phạm vi:** Quản lý cây thư mục và vị trí bộ thẻ hoàn toàn trong SQLite (Rust backend), file `.sdeck` nằm yên trên đĩa.

---

## 1. Bối cảnh và lý do

Thiết kế cũ gắn cây thư mục với thao tác tệp vật lý (`fs::rename`, `symlink`, `fs::remove_dir_all`), gây ra:

- Xung đột với `AppWatcher`: di chuyển file sinh sự kiện xóa/thêm giả, UI báo trùng `meta.id` hoặc `missing`.
- Lỗi với bộ thẻ nằm ngoài `StudyDecks` hoặc dùng đường dẫn tương đối, và lỗi quyền/khác ổ đĩa.
- Đổi tên/di chuyển thư mục làm đứt đường dẫn trong `decks`, `deck_locations`, `package_store`.

**Quyết định:** dùng thư mục ảo thuần SQLite. Mọi thao tác thư mục và gán bộ thẻ chỉ là cập nhật quan hệ trong DB (tức thời, nằm trong một transaction), không chạm file `.sdeck`.

---

## 2. Mục tiêu, Phi mục tiêu, Phản mục tiêu

**Mục tiêu**
- Cây thư mục phân cấp **không giới hạn độ sâu**, lưu trong bảng `folders`.
- Mỗi bộ thẻ có đúng **một vị trí chính**, và có thể có nhiều **liên kết** tới thư mục khác.
- Chuyển bộ thẻ (`move_deck`), tạo/xóa liên kết (`link_deck`, `unlink_deck`) chỉ ghi DB.
- Xóa thư mục: bộ thẻ có vị trí chính trong nhánh bị xóa trở về **Thư mục gốc**; liên kết trong nhánh bị xóa; file vật lý không bị ảnh hưởng.
- Frontend dùng **một nguồn dữ liệu duy nhất** cho cả danh sách lẫn số đếm.

**Phi mục tiêu**
- Không tạo/đổi tên/xóa thư mục vật lý trên ổ cứng theo thao tác trên cây ảo.
- Không đồng bộ ngược cấu trúc ảo ra hệ thống tệp.

**Phản mục tiêu**
- Không làm mất hoặc hỏng file `.sdeck` trong bất kỳ thao tác thư mục nào. Kiểm chứng bằng test (mục 8).

---

## 3. Phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| 1. Đồng bộ 1-1 với filesystem (cũ) | Cây khớp với đĩa | Xung đột Watcher, lỗi quyền/khác ổ đĩa, gãy path đang mở |
| 2. Thư mục ảo thuần DB (**chọn**) | Tức thời, an toàn cho file gốc, hoạt động với mọi vị trí lưu trữ | Cây không phản ánh cấu trúc đĩa; cần migration cho dữ liệu cũ |

---

## 4. Mô hình dữ liệu

### 4.1. Thuật ngữ (dùng thống nhất toàn tài liệu và code)

- **Thư mục gốc (root):** nút ảo, đại diện bởi `NULL`, không có hàng trong `folders`.
- **Vị trí chính (primary location):** hàng `deck_locations` có `is_link = 0`. Mỗi bộ thẻ có **đúng một**.
- **Liên kết (link):** hàng `deck_locations` có `is_link = 1`. Bộ thẻ có thể có 0..n liên kết, mỗi liên kết trỏ tới một thư mục thật (không phải gốc).

### 4.2. Schema

```sql
PRAGMA foreign_keys = ON;  -- bắt buộc đặt cho MỖI kết nối khi mở

CREATE TABLE folders (
  id         TEXT PRIMARY KEY,
  parent_id  TEXT NULL REFERENCES folders(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (parent_id IS NULL OR parent_id <> id)
);

-- Tên duy nhất trong cùng một cha, không phân biệt hoa thường.
-- COALESCE vì UNIQUE của SQLite coi mọi NULL là khác nhau (thư mục ở gốc).
CREATE UNIQUE INDEX ux_folders_parent_name
  ON folders (COALESCE(parent_id, ''), name COLLATE NOCASE);

CREATE INDEX ix_folders_parent ON folders (parent_id, sort_order);

CREATE TABLE deck_locations (
  id         TEXT PRIMARY KEY,
  deck_id    TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  folder_id  TEXT NULL REFERENCES folders(id) ON DELETE CASCADE,
  is_link    INTEGER NOT NULL DEFAULT 0 CHECK (is_link IN (0, 1)),
  created_at INTEGER NOT NULL,
  -- Liên kết không được trỏ về gốc
  CHECK (is_link = 0 OR folder_id IS NOT NULL)
);

-- Mỗi bộ thẻ có đúng một vị trí chính
CREATE UNIQUE INDEX ux_deck_primary
  ON deck_locations (deck_id) WHERE is_link = 0;

-- Một bộ thẻ không xuất hiện hai lần trong cùng một thư mục
-- (chặn cả "chính + liên kết" và "liên kết + liên kết" trùng thư mục)
CREATE UNIQUE INDEX ux_deck_folder
  ON deck_locations (deck_id, folder_id) WHERE folder_id IS NOT NULL;

CREATE INDEX ix_locations_folder ON deck_locations (folder_id);
```

### 4.3. Bất biến (invariants)

1. Mỗi bộ thẻ trong `decks` có đúng một hàng `is_link = 0` (`folder_id = NULL` nghĩa là ở gốc). Hàng này được tạo cùng lúc với bộ thẻ, trong cùng transaction.
2. Cây thư mục không có chu trình.
3. Trong một thư mục, tên là duy nhất (không phân biệt hoa thường).
4. Một bộ thẻ xuất hiện tối đa một lần trong mỗi thư mục.
5. Không thao tác thư mục nào ghi/xóa/đổi tên file trên đĩa.

---

## 5. Rust Backend (`src-tauri/`)

Mọi thao tác chạy trong một transaction `BEGIN IMMEDIATE`; lỗi thì rollback toàn bộ.

### 5.1. Chuẩn hóa định danh thư mục

`normalize_folder_id(s) -> Option<String>`: `""`, `"all"`, `"root"` (và `None`) → `None` (gốc); còn lại giữ nguyên. Hàm này áp dụng ở **mọi** điểm vào nhận `folder_id` từ frontend.

### 5.2. `folder_service.rs` / `repositories/folder.rs`

Truy vấn dùng chung để lấy cây con (kể cả chính nó):

```sql
WITH RECURSIVE subtree(id) AS (
  SELECT id FROM folders WHERE id = ?1
  UNION ALL
  SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
)
SELECT id FROM subtree;
```

- **`create_folder(parent_id, name)`**
  - Chuẩn hóa `parent_id`; nếu không phải gốc thì phải tồn tại.
  - Chuẩn hóa tên (trim, không rỗng); vi phạm unique → lỗi `FolderNameConflict`.
  - `sort_order` = max trong cùng cha + 1.
- **`rename_folder(id, name)`**
  - Thư mục tồn tại; tên mới không trùng trong cùng cha (trừ chính nó).
- **`move_folder(id, new_parent_id)`**
  - Chuẩn hóa `new_parent_id`; nếu không phải gốc thì phải tồn tại.
  - **Chống chu trình:** `new_parent_id` không được nằm trong `subtree(id)` (bao gồm chính `id`). Vi phạm → `FolderCycle`.
  - Nếu `new_parent_id` bằng cha hiện tại → không làm gì (no-op).
  - Tên không trùng trong cha mới → `FolderNameConflict`.
  - Chỉ cập nhật `parent_id` và `sort_order`; không có giới hạn độ sâu.
- **`delete_folder(id)`** (một transaction, theo đúng thứ tự):
  1. Lấy `subtree(id)`.
  2. `UPDATE deck_locations SET folder_id = NULL WHERE is_link = 0 AND folder_id IN subtree` (đưa vị trí chính về gốc, **phải làm trước** bước 4 vì `ON DELETE CASCADE` sẽ xóa luôn các hàng này).
  3. `DELETE FROM deck_locations WHERE is_link = 1 AND folder_id IN subtree`.
  4. `DELETE FROM folders WHERE id = ?` (cascade xóa các thư mục con).
  - Trả về danh sách `deck_id` bị ảnh hưởng để frontend cập nhật.
- **`reorder_folders(parent_id, ordered_ids)`**: cập nhật `sort_order` cho các thư mục cùng cha; `ordered_ids` phải đúng bằng tập con trực tiếp hiện có.

### 5.3. `deck_location_service.rs`

- **`move_deck(deck_id, new_folder_id)`**
  1. Chuẩn hóa `new_folder_id`; nếu không phải gốc thì phải tồn tại → `FolderNotFound`.
  2. Nếu `new_folder_id` không phải gốc và bộ thẻ đang có **liên kết** tại đó: xóa liên kết đó trước (để không vi phạm `ux_deck_folder`).
  3. `UPDATE deck_locations SET folder_id = ?new WHERE deck_id = ? AND is_link = 0`.
  4. Không đụng tới đường dẫn file.
- **`link_deck(deck_id, target_folder_id)`**
  - `target_folder_id` phải là thư mục thật (không phải gốc) → nếu là gốc trả `InvalidLinkTarget`.
  - Nếu bộ thẻ đã có mặt trong thư mục đó (chính hoặc liên kết) → `AlreadyInFolder` (hoặc no-op, chọn một và nhất quán).
  - Thêm hàng `is_link = 1`. Không tạo OS symlink.
- **`unlink_deck(location_id)`**
  - Chỉ xóa hàng có `is_link = 1`. Nếu `is_link = 0` → `CannotUnlinkPrimary` (muốn bỏ vị trí chính thì dùng `move_deck` về gốc).
  - Không xóa file trên đĩa.

### 5.4. Đồng bộ với `AppWatcher` và vòng đời bộ thẻ

- **Bộ thẻ mới được phát hiện/nhập:** tạo hàng `decks` và hàng vị trí chính (`folder_id = NULL`) trong cùng transaction. Nếu có đích được chọn trước (ví dụ nhập vào thư mục đang mở) thì dùng đích đó.
- **File bị xóa khỏi đĩa:** hai trường hợp, chọn một và ghi vào code:
  - Xóa hàng `decks` → `deck_locations` bị cascade xóa theo (không còn hàng mồ côi).
  - Hoặc đánh dấu `missing` trên `decks` và giữ nguyên `deck_locations` để bộ thẻ trở lại đúng chỗ khi file xuất hiện lại.
- **File được tìm thấy lại cùng `meta.id`:** cập nhật đường dẫn của hàng `decks`; `deck_locations` giữ nguyên.
- Vì thao tác thư mục không còn đụng tới file, Watcher không còn sự kiện giả do di chuyển thư mục.

### 5.5. Lỗi trả về frontend

Dùng enum lỗi có mã ổn định: `FolderNotFound`, `DeckNotFound`, `FolderNameConflict`, `FolderCycle`, `InvalidLinkTarget`, `AlreadyInFolder`, `CannotUnlinkPrimary`. Frontend hiển thị theo mã, không so khớp chuỗi.

---

## 6. Frontend (`src/views/home/`)

### 6.1. Trạng thái

- `folderStore` là **singleton cấp module** trong `home/index.js`, không khởi tạo lại mỗi lần gọi `renderHome()`. Nó ổn định giữa các lần render, nhưng **mất khi tải lại ứng dụng** vì nguồn sự thật nằm ở SQLite.
- Nếu muốn nhớ thư mục đang chọn và trạng thái mở/đóng của cây giữa các phiên, lưu riêng vào `localStorage` (khóa `homeUi.selectedFolderId`, `homeUi.expandedFolderIds`). Đây là trạng thái giao diện, không phải dữ liệu thư mục.
- Dữ liệu dẫn xuất từ danh sách `deck_locations` do Rust trả về:
  - `locationsByDeckId`: `deck_id` → vị trí chính.
  - `linksByFolderId`: `folder_id` → danh sách liên kết.
  - `deckIdsByFolderId`: `folder_id` (hoặc gốc) → tập `deck_id` có mặt trong thư mục đó, **gồm cả vị trí chính và liên kết**.

### 6.2. Nguồn sự thật duy nhất cho lọc và đếm

`query.ts` và `workspace.js` cùng dùng `deckIdsByFolderId`:

- **Danh sách** bộ thẻ của thư mục đang chọn = `deckIdsByFolderId[selected]`.
- **`deckCount` trên `FolderCard`** = kích thước `deckIdsByFolderId[folderId]` (đếm trực tiếp trong thư mục đó, gồm liên kết, **không** đệ quy thư mục con). Nếu sau này cần đếm đệ quy thì tính trên tập hợp `deck_id` duy nhất của cả cây con để không đếm trùng.
- Chế độ "Tất cả" hiển thị mọi bộ thẻ, mỗi bộ thẻ một lần.
- Bộ thẻ là liên kết trong thư mục hiện tại có huy hiệu liên kết trên giao diện để phân biệt với vị trí chính.

### 6.3. Cập nhật sau thao tác

- Gọi lệnh Rust, **dùng kết quả trả về** để cập nhật store (không tự suy diễn trạng thái ở frontend). Có thể cập nhật lạc quan, nhưng phải hòa giải theo kết quả từ Rust và hoàn tác nếu có lỗi.
- Sau `delete_folder`, store gỡ thư mục và cây con, đồng thời chuyển các bộ thẻ bị ảnh hưởng về gốc theo danh sách trả về.
- Nếu thư mục đang chọn bị xóa, chuyển lựa chọn về "Tất cả".

---

## 7. Di chuyển dữ liệu từ hệ cũ (migration)

- Dùng `schema_version` (hoặc `PRAGMA user_version`); migration chạy một lần trong một transaction.
- Tạo/sửa bảng theo mục 4.2. Với dữ liệu sẵn có: mỗi deck chưa có vị trí chính được gán `folder_id = NULL`.
- **Nhập cấu trúc thư mục vật lý cũ (tùy chọn, chỉ đọc):** quét `StudyDecks`, mỗi thư mục con → một `folders` (giữ quan hệ cha–con), mỗi `.sdeck` → vị trí chính trong thư mục tương ứng. Symlink cũ trỏ tới bộ thẻ đã biết → liên kết (`is_link = 1`); symlink hỏng hoặc không nhận diện được → bỏ qua và ghi log.
- Migration **không** di chuyển, xóa hoặc sửa bất kỳ file/symlink nào trên đĩa.

---

## 8. Kiểm thử

- **Bất biến DB:** thử vi phạm từng ràng buộc (hai vị trí chính, trùng thư mục, liên kết về gốc, tên trùng ở gốc và ở thư mục con) và kiểm tra bị từ chối.
- **Chu trình:** `move_folder` vào chính nó và vào con cháu của nó → `FolderCycle`.
- **Cây sâu:** tạo chuỗi hàng nghìn cấp, kiểm tra `subtree`, `move_folder`, `delete_folder` vẫn đúng và không treo.
- **`delete_folder`:** vị trí chính trong nhánh về gốc, liên kết bị xóa, bộ thẻ vẫn còn trong `decks`; kiểm tra đúng thứ tự bước (không mất bộ thẻ do cascade).
- **`move_deck` vào thư mục đang có liên kết** của chính bộ thẻ đó: kết quả chỉ còn một hàng.
- **Không chạm đĩa (phản mục tiêu):** chạy toàn bộ thao tác thư mục trên thư mục tạm có file `.sdeck`, so sánh danh sách file, kích thước và băm trước/sau; hoặc bọc lớp truy cập tệp và khẳng định không có lệnh ghi/xóa/đổi tên nào được gọi.
- **Watcher:** mô phỏng xóa/thêm file, kiểm tra không sinh `deck_locations` mồ côi và không báo trùng `meta.id` do thao tác thư mục.
- **Frontend:** số đếm `FolderCard` luôn bằng độ dài danh sách hiển thị của thư mục đó (có cả liên kết).

---

## 9. Câu hỏi còn mở

- Khi file `.sdeck` bị xóa: xóa hẳn `decks` hay đánh dấu `missing` (mục 5.4)?
   xoá hẵn
- `link_deck` vào thư mục đã chứa bộ thẻ: báo lỗi hay no-op?
   báo lỗilỗi
- Có cần đếm đệ quy trên `FolderCard` không?
  có
- Có nhập cấu trúc thư mục vật lý cũ khi migration không (mục 7)?

có
