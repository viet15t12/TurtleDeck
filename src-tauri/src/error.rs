// src-tauri/src/error.rs — Định nghĩa lỗi chuẩn hóa tiếng Việt cho Turtle Deck
use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Lỗi I/O hệ thống: {0}")]
    Io(#[from] std::io::Error),

    #[error("Lỗi cơ sở dữ liệu SQLite: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Lỗi xử lý dữ liệu JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Lỗi nén/giải nén zip: {0}")]
    Zip(#[from] zip::result::ZipError),

    #[error("Đường dẫn không hợp lệ hoặc nằm ngoài phạm vi cho phép: {0}")]
    InvalidPath(String),

    #[error("Không tìm thấy bộ thẻ hoặc tệp: {0}")]
    NotFound(String),

    #[error("Tính năng chưa được hỗ trợ trong phiên bản hiện tại: {0}")]
    NotImplemented(String),

    #[error("Lỗi ứng dụng: {0}")]
    Custom(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppErrorResponse", 2)?;
        state.serialize_field("ok", &false)?;
        state.serialize_field("error", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
