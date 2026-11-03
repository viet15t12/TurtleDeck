// src/views/settings/sections/backup.js — Mục cài đặt Sao lưu và Xuất/Nhập dữ liệu tiến trình

import { h } from '../../dom.js';
import { notify } from '../../notify.js';

export function createBackupSection({ actions, onReloadProgress }) {
  const backupsContainer = h('div', { class: 'backup-list-box' });
  let backupList = [];

  function renderBackupsList() {
    if (!backupList.length) {
      backupsContainer.replaceChildren(
        h(
          'div',
          { class: 'muted', style: 'padding: 12px; font-size: 13px;' },
          'Chưa có bản sao lưu tự động nào. Bản sao lưu hàng ngày sẽ tự động được tạo khi bạn mở ứng dụng.'
        )
      );
      return;
    }

    backupsContainer.replaceChildren(
      h(
        'div',
        { style: 'display: flex; flex-direction: column; gap: 8px;' },
        ...backupList.map(b => {
          const sizeKb = Math.max(1, Math.round(b.size / 1024));
          const dateStr = new Date(b.mtime).toLocaleString('vi-VN');
          return h(
            'div',
            {
              style:
                'display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--c-surface-2); border-radius: var(--radius-sm); border: 1px solid var(--c-border); font-size: 13px;',
            },
            h(
              'div',
              null,
              h('div', { style: 'font-weight: 600; font-family: var(--font-mono); font-size: 12px;' }, b.name),
              h('div', { class: 'muted', style: 'font-size: 11px; margin-top: 2px;' }, `${dateStr} · ${sizeKb} KB`)
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'ux-btn sm',
                onclick: async () => {
                  if (
                    window.confirm(
                      `Khôi phục dữ liệu tiến trình từ bản sao lưu "${b.name}"?\n\nDữ liệu hiện tại sẽ được tự động sao lưu dự phòng trước khi thay thế.`
                    )
                  ) {
                    const r = await window.api.restoreBackup(b.name);
                    if (r?.ok) {
                      notify(`Đã khôi phục tiến trình từ "${b.name}".`, 'success');
                      if (onReloadProgress) onReloadProgress(r.progress);
                    } else {
                      notify('Không thể khôi phục bản sao lưu: ' + (r?.error || 'Lỗi'), 'error');
                    }
                  }
                },
              },
              '↺ Khôi phục'
            )
          );
        })
      )
    );
  }

  async function loadBackups() {
    const list = await window.api.listBackups?.();
    backupList = Array.isArray(list) ? list : [];
    renderBackupsList();
  }

  loadBackups();

  const element = h(
    'section',
    { class: 'panel settings-panel', style: 'margin-top: 24px;' },
    h('h2', null, 'Sao lưu & Xuất / Nhập tiến trình học tập'),
    h(
      'p',
      { class: 'muted settings-help', style: 'margin-bottom: 16px;' },
      'Hệ thống tự động sao lưu dữ liệu tiến trình hàng ngày và lưu trữ 7 bản gần nhất. Bạn cũng có thể xuất file tiến trình ra JSON để chuyển đổi thiết bị hoặc nhập file đã lưu.'
    ),
    h(
      'div',
      { class: 'toolbar', style: 'margin-bottom: 18px; flex-wrap: wrap; gap: 10px;' },
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn primary sm',
          onclick: async () => {
            const r = await window.api.createFullBackup?.();
            if (r?.canceled) return;
            if (r?.ok) {
              notify(
                `Đã sao lưu toàn bộ hệ thống: ${r.name || r.filePath} (${r.decksCount} bộ thẻ, ${r.foldersCount} thư mục)`,
                'success'
              );
              loadBackups();
            } else {
              notify('Không tạo được sao lưu toàn bộ: ' + (r?.error || 'Lỗi'), 'error');
            }
          },
        },
        '💾 Sao lưu toàn bộ hệ thống (.turtlebackup)…'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn sm',
          onclick: async () => {
            if (
              !window.confirm(
                'Khôi phục toàn bộ hệ thống sẽ giải nén tất cả bộ thẻ và cấu trúc thư mục từ file sao lưu vào ứng dụng.\n\nBạn có muốn tiếp tục chọn file .turtlebackup?'
              )
            ) {
              return;
            }
            const r = await window.api.restoreFullBackup?.();
            if (r?.canceled) return;
            if (r?.ok) {
              notify(`Đã khôi phục thành công ${r.decksCount} bộ thẻ và ${r.foldersCount} thư mục!`, 'success');
              if (actions.reloadLibrary) actions.reloadLibrary();
              else actions.home?.();
            } else {
              notify('Lỗi khôi phục toàn bộ: ' + (r?.error || 'Lỗi'), 'error');
            }
          },
        },
        '↺ Khôi phục từ file sao lưu toàn bộ…'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn sm',
          onclick: async () => {
            const r = await window.api.createBackup?.();
            if (r?.ok) {
              notify(`Đã tạo bản sao lưu tiến độ: ${r.name}`, 'success');
              loadBackups();
            } else {
              notify('Không tạo được sao lưu: ' + (r?.error || 'Lỗi'), 'error');
            }
          },
        },
        'Sao lưu tiến độ nhanh'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn sm',
          onclick: async () => {
            const r = await window.api.exportProgress?.();
            if (r?.ok) notify(`Đã xuất dữ liệu tiến trình thành công: ${r.path}`, 'success');
            else if (!r?.canceled) notify('Không xuất được tiến trình: ' + (r?.error || 'Lỗi'), 'error');
          },
        },
        '📤 Xuất tiến độ…'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn sm',
          onclick: async () => {
            const r = await window.api.pickImportProgress?.();
            if (!r || !r.ok) {
              if (r?.error) notify(r.error, 'error');
              return;
            }
            const { preview, importedProgress } = r;
            const mode = window.confirm(
              `Đã đọc file tiến độ hợp lệ:\n- ${preview.cardsCount} thẻ\n- ${preview.logCount} lượt ôn tập trong lịch sử\n\nBấm [OK] để GỘP với tiến độ hiện tại (giữ lượt học cao hơn, an toàn cho dữ liệu local).\nBấm [Cancel / Huỷ] nếu muốn THAY THẾ toàn bộ.`
            )
              ? 'merge'
              : window.confirm('Bạn có chắc chắn muốn THAY THẾ TOÀN BỘ tiến độ hiện tại bằng dữ liệu trong file này?')
                ? 'replace'
                : null;

            if (!mode) return;

            const res = await window.api.applyImportProgress?.({ importedProgress, mode });
            if (res?.ok) {
              notify('Nhập tiến độ học tập thành công!', 'success');
              if (onReloadProgress) onReloadProgress(res.progress);
            } else {
              notify('Lỗi nhập tiến độ: ' + (res?.error || 'Lỗi'), 'error');
            }
          },
        },
        '📥 Nhập tiến độ…'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn ghost sm',
          onclick: () => window.api.openBackupsFolder?.(),
        },
        '📂 Mở thư mục sao lưu'
      )
    ),
    h('div', { class: 'form-group' }, h('label', null, 'Bản sao lưu gần đây:'), backupsContainer)
  );

  return {
    element,
    loadBackups,
  };
}

