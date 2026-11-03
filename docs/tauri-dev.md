# Hướng dẫn Phát triển Turtle Deck với Tauri v2

Tài liệu hướng dẫn thiết lập môi trường, cấu trúc dự án và quy trình phát triển cho phiên bản desktop Turtle Deck chạy trên Tauri v2.

---

## 1. Yêu cầu môi trường

- **Node.js**: $\ge$ 20 (`node -v`)
- **Rust toolchain**: $\ge$ 1.80 (`rustc --version`, `cargo --version`)
- **Tauri CLI**: `@tauri-apps/cli` v2

### Thư viện hệ thống (Linux / Fedora):
```bash
sudo dnf install webkit2gtk4.1-devel libappindicator-gtk3-devel librsvg2-devel
```

### Thư viện hệ thống (Ubuntu / Debian):
```bash
sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
```

---

## 2. Cấu trúc thư mục

```
src-tauri/
├── Cargo.toml                  # Khai báo crate & dependencies Rust
├── tauri.conf.json             # Cấu hình cửa sổ, CSP, bundle, icon
├── build.rs                    # Tauri build script
├── capabilities/
│   └── default.json            # Cấu hình quyền truy cập (capabilities)
├── icons/                      # Bộ icon đa kích thước
└── src/
    ├── main.rs                 # Entry point ứng dụng
    ├── lib.rs                  # Đăng ký commands, plugins, state
    ├── state.rs                # AppState dùng chung
    ├── error.rs                # AppError chuẩn hoá tiếng Việt & serialize lỗi
    ├── paths.rs                # Đường dẫn dữ liệu tương thích Electron
    ├── commands/               # Các IPC commands (deck, srs, stats, folder...)
    ├── db/                     # SQLite rusqlite, schema, migration
    └── services/               # Package store (.sdeck zip), watcher, asset protocol

src/platform/
├── channels.js                 # Ánh xạ kênh IPC và đánh dấu kênh trả mảng
├── tauri-api.js                # Lớp bọc window.api dùng trong Webview
└── electron-shim.js            # Shim khi chạy trên Electron
```

---

## 3. Lệnh chạy và phát triển

| Mục đích | Lệnh |
|---|---|
| Chạy dev bản Tauri | `npm run tauri:dev` |
| Build release bản Tauri | `npm run tauri:build` |
| Chạy bản Electron cũ | `npm start` |
| Đóng gói bản Electron cũ | `npm run dist` |
| Kiểm tra kiểu TypeScript | `npm run typecheck` |
| Chạy bộ kiểm thử JS | `npm test` |
| Chạy bộ kiểm thử Rust | `cd src-tauri && cargo test` |
| Kiểm tra mã nguồn Rust | `cd src-tauri && cargo clippy` |
| Định dạng mã nguồn Rust | `cd src-tauri && cargo fmt --check` |

---

## 4. Nguyên tắc lập trình

1. **Không sửa đổi giao diện gốc**: Toàn bộ UI tại `src/views/*`, `src/styles/*`, `src/core/*` được giữ nguyên để chia sẻ 100% giữa Electron và Tauri.
2. **Chuẩn hóa lỗi**: Mọi command trả về `Result<T, AppError>`. Khi có lỗi, hệ thống serialize về `{ ok: false, error: "..." }`. Đối với các kênh trả về mảng, nếu có lỗi sẽ trả về `[]` để tránh làm crash giao diện renderer.
3. **Bảo mật đường dẫn**: Mọi đường dẫn nhận từ webview phải được chuẩn hoá và kiểm tra nằm trong thư mục cho phép (chống path traversal).
4. **Không dùng `unwrap()`/`expect()`** trong luồng xử lý chính của Rust.
