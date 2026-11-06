// src-tauri/src/services/sdeck_v2/mod.rs — Module dịch vụ định dạng gói thẻ .sdeck Version 2
// Trách nhiệm duy nhất: Điều phối và công khai các chức năng schema, solutions, db_writer, db_reader, package_v2.

pub mod db_reader;
pub mod db_writer;
pub mod package_v2;
pub mod schema;
pub mod solutions;

pub use db_reader::read_questions_db_bytes;
pub use db_writer::{build_questions_db_bytes, DECK_DB_ENTRY};
pub use package_v2::{build_v2_package, is_v2_deck, unpack_v2_package, LIMITS_DB, LIMITS_SOLUTIONS};
pub use schema::{init_deck_db, DDL_SCHEMA};
pub use solutions::{
    merge_v2_to_unified_items, split_v1_items_to_v2, SolutionItem, SolutionsFile, SOLUTIONS_ENTRY,
};

