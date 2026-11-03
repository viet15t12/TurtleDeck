// src/platform/channels.js — Ánh xạ giữa các kênh IPC và command Tauri tương ứng
/**
 * Danh sách các kênh trả về mảng.
 * Nếu có lỗi hoặc chưa hỗ trợ, lớp tương thích sẽ trả [] thay vì ném lỗi để tránh crash renderer (theo Issue 12).
 */
export const ARRAY_CHANNELS = new Set([
  'deck:open',
  'asset:list',
  'library:scan',
  'draft:list',
  'backup:list',
  'srs:getDueItems',
  'folder:getTree',
  'deck:getLocations',
]);

/**
 * Bảng ánh xạ từ kênh IPC (Electron) sang tên command tương ứng trong Tauri Rust.
 */
export const CHANNEL_TO_COMMAND = {
  // Gói thẻ
  'deck:open': 'deck_open',
  'deck:import': 'deck_import',
  'deck:save': 'deck_save',
  'deck:importSdeck': 'deck_import_sdeck',
  'deck:close': 'deck_close',
  'deck:duplicate': 'deck_duplicate',
  'deck:exportCopy': 'deck_export_copy',
  'deck:showInFolder': 'deck_show_in_folder',
  'deck:new': 'deck_new',
  'deck:queryItems': 'deck_query_items',

  // Assets
  'asset:add': 'asset_add',
  'asset:addBytes': 'asset_add_bytes',
  'asset:list': 'asset_list',
  'asset:remove': 'asset_remove',

  // Tiến độ & Cài đặt
  'progress:load': 'progress_load',
  'progress:save': 'progress_save',
  'progress:export': 'progress_export',
  'progress:pickImport': 'progress_pick_import',
  'progress:applyImport': 'progress_apply_import',
  'settings:load': 'settings_load',
  'settings:save': 'settings_save',

  // Nhập dữ liệu
  'import:pickFile': 'import_pick_file',
  'import:preview': 'import_preview',
  'import:commit': 'import_commit',

  // Thư viện
  'library:getDir': 'library_get_dir',
  'library:pickDir': 'library_pick_dir',
  'library:setDir': 'library_set_dir',
  'library:scan': 'library_scan',

  // Bản nháp
  'draft:save': 'draft_save',
  'draft:delete': 'draft_delete',
  'draft:list': 'draft_list',
  'draft:load': 'draft_load',

  // Sao lưu
  'backup:create': 'backup_create',
  'backup:createFull': 'backup_create_full',
  'backup:restoreFull': 'backup_restore_full',
  'backup:list': 'backup_list',
  'backup:restore': 'backup_restore',
  'backup:openFolder': 'backup_open_folder',

  // Thư mục & Vị trí thẻ
  'folder:create': 'folder_create',
  'folder:rename': 'folder_rename',
  'folder:move': 'folder_move',
  'folder:delete': 'folder_delete',
  'folder:getTree': 'folder_get_tree',
  'deck:move': 'deck_move',
  'deck:link': 'deck_link',
  'deck:unlink': 'deck_unlink',
  'deck:getLocations': 'deck_get_locations',

  // SRS
  'srs:getDeckSummary': 'srs_get_deck_summary',
  'srs:getDueItems': 'srs_get_due_items',
  'srs:recordReview': 'srs_record_review',
  'srs:getCard': 'srs_get_card',

  // Thống kê
  'stats:getDeckReport': 'stats_get_deck_report',
  'stats:getOverallStreak': 'stats_get_overall_streak',

  // Meta (sao, ghi chú)
  'meta:get': 'meta_get',
  'meta:setStarred': 'meta_set_starred',
  'meta:setNote': 'meta_set_note',
};

/**
 * Chuyển tên kênh IPC thành tên command Tauri
 * @param {string} channel
 * @returns {string}
 */
export function getCommandName(channel) {
  if (CHANNEL_TO_COMMAND[channel]) {
    return CHANNEL_TO_COMMAND[channel];
  }
  return channel.replace(':', '_');
}

