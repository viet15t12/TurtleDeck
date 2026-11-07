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

    #[error("Không tìm thấy thư mục: {0}")]
    FolderNotFound(String),

    #[error("Không tìm thấy bộ thẻ: {0}")]
    DeckNotFound(String),

    #[error("Tên thư mục đã tồn tại trong cùng thư mục cha: {0}")]
    FolderNameConflict(String),

    #[error("Không thể di chuyển thư mục vào chính nó hoặc thư mục con cháu: {0}")]
    FolderCycle(String),

    #[error("Đích liên kết không hợp lệ (không thể liên kết vào thư mục gốc): {0}")]
    InvalidLinkTarget(String),

    #[error("Bộ thẻ đã có mặt trong thư mục này: {0}")]
    AlreadyInFolder(String),

    #[error("Không thể xoá liên kết đối với vị trí chính của bộ thẻ: {0}")]
    CannotUnlinkPrimary(String),

    #[error("Tính năng chưa được hỗ trợ trong phiên bản hiện tại: {0}")]
    NotImplemented(String),

    #[error("Lỗi ứng dụng: {0}")]
    Custom(String),
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::FolderNotFound(_) => "FolderNotFound",
            AppError::DeckNotFound(_) => "DeckNotFound",
            AppError::FolderNameConflict(_) => "FolderNameConflict",
            AppError::FolderCycle(_) => "FolderCycle",
            AppError::InvalidLinkTarget(_) => "InvalidLinkTarget",
            AppError::AlreadyInFolder(_) => "AlreadyInFolder",
            AppError::CannotUnlinkPrimary(_) => "CannotUnlinkPrimary",
            AppError::InvalidPath(_) => "InvalidPath",
            AppError::NotFound(_) => "NotFound",
            AppError::NotImplemented(_) => "NotImplemented",
            AppError::Io(_) => "IoError",
            AppError::Database(_) => "DatabaseError",
            AppError::Json(_) => "JsonError",
            AppError::Zip(_) => "ZipError",
            AppError::Custom(_) => "CustomError",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppErrorResponse", 3)?;
        state.serialize_field("ok", &false)?;
        state.serialize_field("code", &self.code())?;
        state.serialize_field("error", &self.to_string())?;
        state.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
