// src-tauri/src/paths.rs — Quản lý đường dẫn dữ liệu người dùng tương thích 100% bản Electron
use std::path::PathBuf;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone)]
pub struct AppPaths {
    pub user_data_dir: PathBuf,
    pub progress_file: PathBuf,
    pub settings_file: PathBuf,
    pub backups_dir: PathBuf,
    pub drafts_dir: PathBuf,
    pub db_file: PathBuf,
    pub default_library_dir: PathBuf,
}

impl AppPaths {
    pub fn new() -> AppResult<Self> {
        let config_dir = dirs::config_dir().ok_or_else(|| {
            AppError::Custom("Không thể xác định thư mục cấu hình hệ thống".to_string())
        })?;
        let home_dir = dirs::home_dir().ok_or_else(|| {
            AppError::Custom("Không thể xác định thư mục người dùng".to_string())
        })?;

        // Dùng đúng thư mục "Turtle Deck" của bản Electron để giữ nguyên dữ liệu
        let user_data_dir = config_dir.join("Turtle Deck");
        let progress_file = user_data_dir.join("progress.json");
        let settings_file = user_data_dir.join("settings.json");
        let backups_dir = user_data_dir.join("backups");
        let drafts_dir = user_data_dir.join("drafts");
        let db_file = user_data_dir.join("studyapp.db");
        let default_library_dir = home_dir.join("StudyDecks");

        Ok(Self {
            user_data_dir,
            progress_file,
            settings_file,
            backups_dir,
            drafts_dir,
            db_file,
            default_library_dir,
        })
    }

    pub fn ensure_dirs(&self) -> std::io::Result<()> {
        std::fs::create_dir_all(&self.user_data_dir)?;
        std::fs::create_dir_all(&self.backups_dir)?;
        std::fs::create_dir_all(&self.drafts_dir)?;
        std::fs::create_dir_all(&self.default_library_dir)?;
        Ok(())
    }
}
