# Kế hoạch triển khai: Sao lưu & Khôi phục qua GitHub / GitLab (Pure Rust: `lzma-rust2` + `gix` + SSH)

> **Mục tiêu trọng tâm:** Xây dựng hệ thống sao lưu, tối ưu lưu trữ và tải về (backup / restore / sync) thông qua GitHub hoặc GitLab hoàn toàn bằng **Rust thuần (Pure Rust)**, sử dụng **`lzma-rust2`** (thuật toán LZMA/LZMA2) để đạt tỷ lệ nén tối đa và **`gix` (gitoxide) kết hợp SSH** để hoạt động độc lập trên cả **Windows và Linux mà không cần cài đặt sẵn `git` CLI**.

---

## 1. Mục tiêu & Giải pháp công nghệ

| Bài toán | Giải pháp kỹ thuật | Lý do chọn |
|---|---|---|
| **Máy Windows không có sẵn `git.exe`** | **`gix` (`gitoxide`)** — Thư viện Git thuần Rust | Không phụ thuộc vào `git` CLI bên ngoài, không cần cài Git for Windows; không phụ thuộc C (`libgit2`/`libssh2`) nên tránh lỗi build MSVC/cross-compile. |
| **Đẩy / kéo dữ liệu lên Git Server qua SSH** | **`gix-transport` / `gix-protocol` + Pure Rust SSH (`russh` / `ssh-key`)** (kèm fallback OpenSSH hệ thống) | Cho phép xác thực khóa SSH (`Ed25519` / `RSA`) trực tiếp tới `git@github.com` và `git@gitlab.com` trên cổng 22, chạy `git-upload-pack` (tải về) và `git-receive-pack` (đẩy lên) ngay trong tiến trình Rust. |
| **Tối ưu dung lượng lưu trữ & băng thông mạng** | **`lzma-rust2`** — Thuật toán nén **LZMA / LZMA2** thuần Rust | Nén dữ liệu JSON/văn bản câu hỏi hiệu quả hơn Deflate từ **35% – 60%**, tốc độ giải nén rất nhanh, 100% Rust an toàn bộ nhớ, hỗ trợ đa luồng. |
| **Tránh phình dung lượng Git repo sau nhiều lần backup** | **Tách gói theo đơn vị thay đổi (Chunked State + CAS Blobs)** | Chỉ bộ thẻ nào thay đổi (`deck_hash` đổi) mới phải nén lại `.lzma2` và tạo Git blob mới; ảnh/media lưu theo mã băm `SHA-256` không bao giờ trùng lặp. |

---

## 2. Kiến trúc tổng thể

```
┌──────────────────────────────────────── Giao diện (UI) ────────────────────────────────────────┐
│  Mục Cài đặt "Sao lưu Đám mây (Git SSH)" & Menu "Sao lưu / Khôi phục" tại Trang chủ            │
│   • Cấu hình Remote URL (git@github.com:user/repo.git | git@gitlab.com:user/repo.git)          │
│   • Quản lý SSH Key: [Tạo khóa SSH tự động] / [Chọn file khóa có sẵn] / [Sao chép Public Key]  │
│   • Hành động: [Đẩy bản sao lưu (Push)] · [Tải về & Khôi phục (Pull/Restore)] · [Lịch sử]     │
└───────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                │ Tauri IPC (invoke)
┌───────────────────────────────────────────────▼────────────────────────────────────────────────┐
│  src-tauri/src/services/                                                                       │
│                                                                                                │
│  1. archive_lzma.rs (`lzma-rust2`)                                                             │
│     • Nén / giải nén luồng dữ liệu bằng LZMA2 (Dict 8–16 MiB, Preset 6)                        │
│     • Tách siêu dữ liệu SQLite, danh sách câu hỏi (`deck.json`) và kho ảnh CAS (`blobs/sha256`)│
│                                                                                                │
│  2. git_ssh_sync.rs (`gix` + `russh` / `ssh-key`)                                              │
│     • Quản lý kho Git nội bộ tại `<app_data_dir>/git-backup-repo/`                             │
│     • Tạo Tree / Commit trực tiếp vào Object Database (ODB) của `gix`                          │
│     • Đóng gói Packfile (`gix-pack`) & truyền qua kênh SSH (`git-receive-pack` / `upload-pack`)│
│                                                                                                │
│  3. ssh_key_service.rs (`ssh-key` + `ed25519-dalek`)                                           │
│     • Sinh cặp khóa Ed25519 chuẩn OpenSSH ngay trong app, kiểm tra kết nối SSH tới Server      │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Thiết kế lưu trữ & nén với `lzma-rust2`

### 3.1. Vấn đề của cách đóng gói `.turtlebackup` (v1) hiện tại
Hiện tại `backup_service.rs` đang gom tất cả các file `.sdeck` (vốn đã là file ZIP Deflate) cùng `database_dump.json` vào một file ZIP lớn:
- Nếu đẩy 1 file `.turtlebackup` nguyên khối lên Git: mỗi lần học thêm 1 thẻ, toàn bộ file nhị phân десятки MB bị thay đổi → Git phải lưu lại cả cục mới, làm kho GitHub/GitLab phình to rất nhanh.
- Thuật toán `Deflate` trong `zip` có tỷ lệ nén thấp đối với dữ liệu JSON lặp lại cấu trúc (`items`, `srs_cards`, `review_logs`).

### 3.2. Cấu trúc kho lưu trữ mới (Git Repository & Local Backup v2)
Thư mục đồng bộ Git (`<app_data_dir>/git-backup-repo/`) và định dạng sao lưu v2 được tổ chức theo cấu trúc **Incremental + LZMA2 + Content-Addressable**:

```text
git-backup-repo/
├── manifest.json                    # Metadata: formatVersion=2, appVersion, syncedAt, thống kê & bảng băm
├── state/
│   ├── database.json.lzma2          # Bảng folders, decks, deck_locations, srs_cards, item_meta, match_records
│   ├── review_logs.json.lzma2       # Bảng review_logs (tách riêng vì dữ liệu lớn và chỉ nối thêm)
│   └── settings.json.lzma2          # Cài đặt ứng dụng
├── decks/
│   ├── <deck_id_1>.deck.lzma2       # Nội dung JSON câu hỏi của từng bộ thẻ (nén bằng lzma-rust2)
│   └── <deck_id_2>.deck.lzma2       # Chỉ ghi lại khi deck_hash thay đổi!
└── blobs/
    ├── 3a/
    │   └── 3a7bd3e2360a...f9.bin    # File ảnh/media gốc đặt tên theo SHA-256 (không nén lại vì PNG/JPG/WebP đã nén)
```

### 3.3. Quy trình nén bằng `lzma-rust2`
1. **Đối với dữ liệu JSON (`database`, `review_logs`, `<deck_id>.deck`):**
   - Chuẩn hóa JSON theo thứ tự khóa cố định (deterministic serialization) trước khi nén.
   - Đưa qua `lzma_rust2::Lzma2Writer` (hoặc `XzWriter` của `lzma-rust2`) với cấu hình:
     - Thuật toán: **LZMA2**
     - Dictionary size: **8 MiB** (cho file bộ thẻ lẻ) và **16 MiB** (cho `review_logs` / full backup).
   - Lưu lại mã băm `deck_hash` (SHA-256 của nội dung gốc) trong `manifest.json`. Ở lần sao lưu tiếp theo, nếu `deck_hash` của bộ thẻ không đổi → **bỏ qua không nén lại**, giữ nguyên file `.deck.lzma2` để Git tái sử dụng 100% blob cũ.
2. **Đối với file `.turtlebackup` v2 (Xuất ra file đơn lẻ lưu ổ cứng/USB):**
   - Gom toàn bộ cấu trúc trên thành một luồng TAR/Solid Pack duy nhất và nén bằng `lzma-rust2` (`LZMA2`), giúp giảm dung lượng file sao lưu từ **40% – 70%** so với bản v1.
   - Khi khôi phục (`restore_full_backup`): kiểm tra magic bytes đầu file — nếu là `PK\x03\x04` (ZIP v1 cũ) thì giải nén bằng `zip`, nếu là header LZMA2/XZ v2 thì giải nén bằng `lzma-rust2` (tương thích ngược tuyệt đối).

---

## 4. Thiết kế đồng bộ Git thuần Rust với `gix` & SSH

### 4.1. Giải quyết triệt để vấn đề Windows không có `git`
Không gọi `std::process::Command::new("git")`. Toàn bộ vòng đời Git được thực thi qua các crate của **`gitoxide` (`gix`)** kết hợp kênh truyền **SSH thuần Rust**:

1. **Khởi tạo / Mở kho lưu trữ cục bộ (`gix::init` / `gix::open`):**
   - Tự động khởi tạo repo Git tại `<app_data_dir>/git-backup-repo` nếu chưa tồn tại.
2. **Tạo Commit bằng `gix` (Local Commit):**
   - Sau khi `archive_lzma` cập nhật các file `.lzma2`, `manifest.json` và `blobs/`:
   - Dùng `gix` ghi các file mới vào Object Database (`ODB` — tạo `Blob` và `Tree` tương ứng).
   - Nếu `Tree` mới trùng mã băm với `Tree` của commit `HEAD` hiện tại (không có gì thay đổi) → thông báo *"Dữ liệu đã ở trạng thái mới nhất"* và không tạo commit thừa.
   - Nếu có thay đổi → tạo `Commit` mới với thông điệp tự động: `backup(turtle-deck): YYYY-MM-DD HH:mm:ss (N decks, M cards)`.
3. **Truyền dữ liệu qua SSH (`Push` & `Fetch/Clone`) tới GitHub / GitLab:**
   - **Phân tích URL SSH:** Hỗ trợ cả dạng SCP (`git@github.com:user/repo.git`, `git@gitlab.com:group/repo.git`) và dạng URL chuẩn (`ssh://git@gitlab.example.com:2222/user/repo.git`).
   - **Thiết lập kết nối SSH (Pure Rust):**
     - Sử dụng `russh` + `ssh-key` đọc khóa riêng tư (ví dụ `<app_data_dir>/ssh/id_ed25519` hoặc file người dùng chọn).
     - Kết nối TCP tới máy chủ Git (cổng 22 hoặc cổng tùy chỉnh), xác thực khóa công khai với tài khoản `git`.
     - Kiểm tra `known_hosts` (lưu fingerprint của `github.com` và `gitlab.com`, hỗ trợ TOFU - Trust On First Use cho GitLab tự host).
   - **Khi Tải về / Khôi phục (`Fetch` / `Clone`):**
     - Mở kênh SSH thực thi lệnh từ xa: `git-upload-pack '<repo_path>'`.
     - Nối luồng đọc/ghi của kênh SSH vào `gix-protocol` / `gix-pack` để nhận packfile từ GitHub/GitLab, giải nén vào `ODB` cục bộ và checkout các file `.lzma2` + `blobs/`.
   - **Khi Đẩy bản sao lưu lên (`Push`):**
     - Mở kênh SSH thực thi lệnh từ xa: `git-receive-pack '<repo_path>'`.
     - Đọc danh sách tham chiếu hiện tại của server (`refs/heads/main`), dùng `gix-pack` đóng gói các object (`Commit`, `Tree`, `Blob`) còn thiếu thành luồng Packfile và gửi qua kênh SSH để cập nhật nhánh đích.

### 4.2. Quản lý Khóa SSH tích hợp sẵn (Không cần mở Terminal)
Để người dùng trên Windows và Linux không phải tự gõ `ssh-keygen` trong terminal:
- **Tạo khóa SSH 1 chạm:**
  - Sinh cặp khóa `Ed25519` bằng crate `ssh-key` (`ed25519-dalek`).
  - Lưu khóa riêng tư tại `<app_data_dir>/ssh/turtledeck_ed25519` (trên Linux đặt quyền `0600`).
  - Hiển thị khóa công khai (`ssh-ed25519 AAAAC3Nza... turtle-deck-backup`) trên giao diện cùng nút **"Sao chép Public Key"**.
- **Hỗ trợ khóa có sẵn:** Cho phép chọn file khóa bất kỳ từ máy tính (hỗ trợ cả khóa có passphrase).
- **Kiểm tra kết nối (Test SSH):** Nút kiểm tra xác thực thử với GitHub/GitLab và báo trạng thái rõ ràng bằng tiếng Việt (ví dụ: *"✓ Kết nối SSH thành công tới GitHub! Bạn có thể bắt đầu sao lưu"* hoặc *"✗ Chưa thêm Public Key vào tài khoản GitHub/GitLab"*).

---

## 5. Luồng hoạt động chi tiết (User Workflows)

### Luồng 1: Thiết lập lần đầu (Trên máy chính)
1. Người dùng vào **Cài đặt → Sao lưu Git (GitHub / GitLab)**.
2. Nhấn **"Tạo khóa SSH mới"** → Nhấn **"Sao chép Public Key"** → Dán vào mục *Deploy Keys* (bật *Allow write access*) của một kho lưu trữ riêng tư (Private Repo) trên GitHub hoặc GitLab.
3. Dán địa chỉ SSH của repo (ví dụ: `git@github.com:viet15t12/turtle-backup.git`) vào ô **Địa chỉ kho Git (SSH URL)**.
4. Nhấn **"Kiểm tra kết nối"** → Thành công → Lưu cấu hình.

### Luồng 2: Sao lưu lên GitHub / GitLab (Push Backup)
1. Người dùng nhấn **"☁️ Đẩy sao lưu lên Git"** (hoặc bật tự động sao lưu khi đóng ứng dụng).
2. Backend Rust thực hiện:
   - Xuất dữ liệu SQLite ra JSON và nén bằng `lzma-rust2` vào `state/*.lzma2`.
   - Kiểm tra từng bộ thẻ `.sdeck`: giải tách ảnh mới vào `blobs/<sha256>`, nếu nội dung câu hỏi thay đổi thì nén bằng `lzma-rust2` vào `decks/<id>.deck.lzma2`.
   - Ghi `manifest.json`.
   - Dùng `gix` tạo commit và đẩy packfile qua SSH lên nhánh `main` của GitHub/GitLab.
3. Giao diện hiển thị thông báo: *"Đã đồng bộ bản sao lưu lên Git thành công (N bộ thẻ, dung lượng đẩy lên: X KB)"*.

### Luồng 3: Tải về & Khôi phục trên máy mới (Pull & Restore)
1. Trên máy mới (kể cả máy Windows mới cài chưa có Git): nhập URL SSH và chọn/dán khóa SSH.
2. Nhấn **"📥 Tải về & Khôi phục từ Git"**.
3. Backend Rust thực hiện:
   - Tạo bản sao lưu an toàn cục bộ `pre-restore-<timestamp>.db` trước khi ghi đè.
   - Dùng `gix` + SSH kéo dữ liệu mới nhất từ nhánh `main` trên GitHub/GitLab về.
   - Dùng `lzma-rust2` giải nén `state/*.lzma2` và `decks/*.deck.lzma2`.
   - Tái tạo lại đầy đủ các file `.sdeck` (ghép `deck.json` đã giải nén với ảnh từ `blobs/<sha256>`) vào thư mục thư viện và khôi phục toàn bộ cơ sở dữ liệu SQLite (thư mục, tiến độ SRS, lịch sử ôn tập).
4. Giao diện tự động làm mới, hiển thị toàn bộ bộ thẻ và tiến độ học tập như trên máy cũ.

---

## 6. Danh sách Crates (Dependencies) cần thêm vào `src-tauri/Cargo.toml`

Tất cả các thư viện đều là **Pure Rust**, biên dịch tĩnh gọn nhẹ trên cả Linux và Windows:

```toml
# Nén LZMA / LZMA2 thuần Rust
lzma-rust2 = { version = "0.16", default-features = false, features = ["std", "encoder", "decoder", "optimization"] }

# Git thuần Rust (gitoxide)
gix = { version = "0.70", default-features = false, features = ["basic", "comfort"] }
gix-pack = "0.56"
gix-protocol = "0.47"
gix-transport = "0.44"

# SSH thuần Rust & Quản lý khóa SSH (không phụ thuộc C libssh2/OpenSSL)
russh = "0.49"
ssh-key = { version = "0.6", features = ["ed25519", "rsa", "encryption", "std"] }
```
*(Lưu ý: Phiên bản chính xác của các crate `gix-*` và `russh` sẽ được khóa đồng bộ theo `Cargo.lock` lúc thêm vào dự án).*

---

## 7. Phân chia giai đoạn thực hiện (Implementation Phases)

### Giai đoạn 1: Tích hợp `lzma-rust2` & Định dạng Sao lưu v2 (`1,5 ngày`)
- **Công việc:**
  - Thêm crate `lzma-rust2` vào `src-tauri/Cargo.toml`.
  - Tạo module `src-tauri/src/services/archive_lzma.rs`:
    - Hàm `compress_lzma2(data: &[u8]) -> AppResult<Vec<u8>>` và `decompress_lzma2(data: &[u8]) -> AppResult<Vec<u8>>`.
    - Hàm tách bộ thẻ `.sdeck` thành `<deck_id>.deck.lzma2` + kho ảnh khử trùng lặp `blobs/<sha256>`, và hàm ghép ngược lại thành `.sdeck`.
  - Nâng cấp `backup_service.rs` để hỗ trợ xuất/nhập `.turtlebackup` v2 bằng `lzma-rust2` (giữ đọc tương thích ngược bản v1).
- **Nghiệm thu (Gate 1):**
  - Unit test Rust nén và giải nén round-trip bằng `lzma-rust2` khớp 100% byte-for-byte.
  - Dung lượng bản sao lưu giảm rõ rệt so với bản v1; khôi phục thành công cả file `.turtlebackup` v1 và v2.

### Giai đoạn 2: Quản lý Khóa SSH & Kết nối SSH thuần Rust (`1,5 ngày`)
- **Công việc:**
  - Tạo module `src-tauri/src/services/ssh_service.rs`:
    - Sinh cặp khóa `Ed25519` chuẩn OpenSSH, đọc khóa riêng tư từ file, trích xuất Public Key để người dùng copy.
    - Thiết lập phiên kết nối SSH tới GitHub/GitLab qua cổng 22 (hoặc cổng tùy chỉnh), kiểm tra xác thực (`ssh_test_connection`).
  - Thêm các Tauri command trong `src-tauri/src/commands/backup.rs` (hoặc `git_sync.rs`): `git_ssh_keygen`, `git_ssh_get_pubkey`, `git_ssh_test`.
- **Nghiệm thu (Gate 2):**
  - Sinh được khóa hợp lệ, kết nối thử tới `git@github.com` và `git@gitlab.com` thành công trên máy không cần cài OpenSSH client hay Git.

### Giai đoạn 3: Đồng bộ Kho lưu trữ bằng `gix` qua SSH (`2 – 2,5 ngày`)
- **Công việc:**
  - Tạo module `src-tauri/src/services/git_sync_service.rs`:
    - Khởi tạo/mở kho Git cục bộ bằng `gix`.
    - Ghi snapshot đã nén `.lzma2` + `blobs/` vào `gix` ODB và tạo Commit.
    - Cài đặt luồng `Push` (đóng gói Packfile các object mới → gửi qua kênh SSH `git-receive-pack`) và luồng `Pull/Clone` (nhận Packfile từ `git-upload-pack` → giải nén vào ODB → khôi phục dữ liệu ứng dụng).
    - Xử lý trường hợp xung đột (khi đẩy lên mà remote có commit mới hơn): cho phép chọn *Tải bản trên Server về trước* hoặc *Ghi đè bản hiện tại lên Server (Force Push có xác nhận)*.
  - Thêm các Tauri command: `git_backup_push`, `git_backup_pull`, `git_backup_status`.
- **Nghiệm thu (Gate 3):**
  - Test tích hợp với một bare repository qua SSH: Push từ máy A → Clone/Restore sang thư mục trống (giả lập máy B) → toàn bộ bộ thẻ, ảnh, thư mục và tiến độ SRS khôi phục chính xác 100%.

### Giai đoạn 4: Giao diện Cài đặt & Menu Sao lưu Git (`1 ngày`)
- **Công việc:**
  - Mở rộng `src/views/settings/sections/backup.js` và `src/views/home/menus.js`:
    - Khung cấu hình **Đồng bộ GitHub / GitLab (SSH)**: ô nhập SSH URL, nhánh (mặc định `main`), nút Tạo/Chọn SSH Key, nút Copy Public Key, nút Kiểm tra kết nối.
    - Nút **"☁️ Sao lưu lên GitHub/GitLab"** và **"📥 Tải về từ GitHub/GitLab"** kèm thanh trạng thái tiến trình.
    - Tùy chọn bật/tắt *"Tự động đẩy bản sao lưu khi thoát ứng dụng"*.
- **Nghiệm thu (Gate 4):**
  - Thao tác mượt trên UI, thông báo lỗi/thành công rõ ràng bằng tiếng Việt, `npm run build` và `cargo test` xanh 100%.

---

## 8. Bảo mật & An toàn dữ liệu
1. **Không làm hỏng dữ liệu hiện có:** Trước mọi thao tác `Pull / Restore` từ GitHub/GitLab, hệ thống tự động tạo bản sao lưu cục bộ `pre-restore-<timestamp>.db` vào thư mục `backups/` để có thể hoàn tác bất kỳ lúc nào.
2. **Bảo vệ Khóa SSH:** Khóa riêng tư chỉ lưu trong thư mục dữ liệu riêng của ứng dụng (không bao giờ được đưa vào bên trong repo Git hay bản `.turtlebackup`).
3. **Kiểm tra toàn vẹn (Integrity Check):** Mọi file `.lzma2` và `blobs/<sha256>` khi tải từ Git về đều được đối chiếu mã băm `SHA-256` với `manifest.json` trước khi nạp vào SQLite.

