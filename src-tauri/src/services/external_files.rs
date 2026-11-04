// src-tauri/src/services/external_files.rs — Quản lý mở file ngoài (.sdeck từ CLI/file manager) và đồng bộ trạng thái renderer
use crate::state::AppState;
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use tauri::Emitter;

/// Trích xuất danh sách đường dẫn file `.sdeck` từ các tham số dòng lệnh `args`.
/// Bỏ qua các flag bắt đầu bằng `-`.
/// Tự động gắn thư mục gốc `base_dir` nếu là đường dẫn tương đối và chuẩn hoá canonical path.
pub fn extract_sdeck_files(args: &[String], base_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut result = Vec::new();

    for arg in args {
        let trimmed = arg.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') {
            continue;
        }

        let path = PathBuf::from(trimmed);
        let is_sdeck = path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("sdeck"))
            .unwrap_or(false);

        if !is_sdeck {
            continue;
        }

        let resolved = if path.is_relative() {
            if let Some(base) = base_dir {
                base.join(&path)
            } else {
                path
            }
        } else {
            path
        };

        let final_path = resolved.canonicalize().unwrap_or(resolved);
        if !result.contains(&final_path) {
            result.push(final_path);
        }
    }

    result
}

/// Tiếp nhận danh sách file ngoài: nếu renderer đã sẵn sàng thì phát sự kiện ngay,
/// ngược lại lưu vào hàng đợi `pending_external_files` chờ renderer thông báo sẵn sàng.
pub fn handle_external_files(app: &tauri::AppHandle, state: &AppState, files: Vec<PathBuf>) {
    if files.is_empty() {
        return;
    }

    if state.renderer_ready.load(Ordering::SeqCst) {
        for file in files {
            let path_str = file.to_string_lossy().to_string();
            let payload = serde_json::json!({
                "path": path_str,
                "filePaths": [path_str]
            });
            let _ = app.emit("deck:openExternal", payload);
        }
    } else if let Ok(mut pending) = state.pending_external_files.lock() {
        for file in files {
            if !pending.contains(&file) {
                pending.push(file);
            }
        }
    }
}

/// Khi renderer gọi `app_ready`, đánh dấu renderer đã sẵn sàng và gửi toàn bộ các file đang chờ.
pub fn flush_pending_external_files(app: &tauri::AppHandle, state: &AppState) {
    state.renderer_ready.store(true, Ordering::SeqCst);

    let files = if let Ok(mut pending) = state.pending_external_files.lock() {
        std::mem::take(&mut *pending)
    } else {
        Vec::new()
    };

    for file in files {
        let path_str = file.to_string_lossy().to_string();
        let payload = serde_json::json!({
            "path": path_str,
            "filePaths": [path_str]
        });
        let _ = app.emit("deck:openExternal", payload);
    }
}
