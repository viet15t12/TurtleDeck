// src/views/home/transfer-actions.js — Xử lý nhập file .sdeck và sao lưu/khôi phục toàn bộ hệ thống

import { notify } from '../notify.js';

export function createTransferActions(ctx) {
  const { ui, refresh, actions } = ctx;

  async function handleImportSdeck() {
    try {
      const targetId = ui.selectedFolderId === 'all' ? null : ui.selectedFolderId;
      const res = await window.api?.importSdeck?.(targetId);
      if (res?.canceled) return;
      if (!res?.ok) {
        alert('Lỗi nhập bộ thẻ: ' + (res?.error || 'Lỗi không xác định'));
        return;
      }
      notify(`Đã nhập thành công ${res.importedCount} bộ thẻ vào hệ thống lưu trữ độc lập của ứng dụng!`, 'success');
      await refresh.folders();
      actions.reloadLibrary?.();
    } catch (err) {
      alert('Không thể nhập file bộ thẻ: ' + (err?.message || err));
    }
  }

  async function handleFullBackup() {
    try {
      const res = await window.api?.createFullBackup?.();
      if (res?.canceled) return;
      if (!res?.ok) {
        alert('Lỗi khi sao lưu toàn bộ hệ thống: ' + (res?.error || 'Lỗi'));
        return;
      }
      alert(
        `Sao lưu toàn bộ hoàn tất thành công!\n\n- File sao lưu: ${res.name || res.filePath}\n- Số bộ thẻ: ${res.decksCount}\n- Số thư mục: ${res.foldersCount}\n\nBạn có thể cất file này ra USB hoặc ổ đĩa ngoài để nạp lại sau khi cài lại hệ điều hành.`
      );
    } catch (err) {
      alert('Không thể tạo file sao lưu: ' + (err?.message || err));
    }
  }

  async function handleFullRestore() {
    if (
      !window.confirm(
        'Khôi phục toàn bộ hệ thống sẽ giải nén tất cả bộ thẻ và cấu trúc thư mục từ file sao lưu vào ứng dụng.\n\nBạn có muốn tiếp tục chọn file .turtlebackup để khôi phục?'
      )
    ) {
      return;
    }
    try {
      const res = await window.api?.restoreFullBackup?.();
      if (res?.canceled) return;
      if (!res?.ok) {
        alert('Lỗi khôi phục từ bản sao lưu: ' + (res?.error || 'Lỗi'));
        return;
      }
      alert(
        `Khôi phục toàn bộ hệ thống thành công!\n\n- Đã nạp lại ${res.decksCount} bộ thẻ\n- Đã tái tạo ${res.foldersCount} thư mục\n\nỨng dụng sẽ tự động làm mới giao diện.`
      );
      await refresh.folders();
      actions.reloadLibrary?.();
    } catch (err) {
      alert('Không thể khôi phục bản sao lưu: ' + (err?.message || err));
    }
  }

  return {
    handleImportSdeck,
    handleFullBackup,
    handleFullRestore,
  };
}

