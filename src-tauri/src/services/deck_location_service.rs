// src-tauri/src/services/deck_location_service.rs — Quản lý vị trí bộ thẻ và liên kết ảo trong SQLite
use crate::db::repositories::deck_location::{DeckLocation, DeckLocationRepository};
use crate::error::AppResult;
use rusqlite::Connection;
use std::path::Path;

pub fn move_deck(
    conn: &Connection,
    _library_dir: Option<&Path>,
    deck_id: &str,
    new_folder_id: Option<&str>,
) -> AppResult<DeckLocation> {
    DeckLocationRepository::move_deck(conn, deck_id, new_folder_id)
}

pub fn link_deck(
    conn: &Connection,
    _library_dir: Option<&Path>,
    deck_id: &str,
    target_folder_id: Option<&str>,
) -> AppResult<DeckLocation> {
    DeckLocationRepository::link_deck(conn, deck_id, target_folder_id)
}

pub fn unlink_deck(conn: &Connection, location_id: &str, _delete_file: bool) -> AppResult<()> {
    DeckLocationRepository::unlink_deck(conn, location_id)
}

pub fn get_locations(conn: &Connection, deck_id: Option<&str>) -> AppResult<Vec<DeckLocation>> {
    if let Some(did) = deck_id {
        DeckLocationRepository::get_locations_by_deck(conn, did)
    } else {
        DeckLocationRepository::get_all_locations(conn)
    }
}
