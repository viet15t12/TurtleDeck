// src-tauri/src/main.rs — Entry point thực thi cho Turtle Deck desktop
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    turtle_deck_lib::run();
}
