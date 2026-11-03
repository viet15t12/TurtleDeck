// src/views/home/empty-state.js — Render giao diện khi thư mục hoặc kết quả lọc rỗng

import { h } from '../dom.js';

export function renderEmptyFolder(ctx, qNorm) {
  const { actions, folderAction, folderStore, transfer, ui } = ctx;

  return h(
    'div',
    { class: 'empty', style: 'padding: 40px 20px; text-align: center;' },
    h('div', { style: 'font-size: 38px; margin-bottom: 8px;' }, '📁'),
    h(
      'p',
      { style: 'font-weight: 600; margin: 0 0 6px;' },
      qNorm
        ? 'Không tìm thấy thư mục hoặc bộ thẻ nào khớp với từ khoá.'
        : 'Thư mục này hiện chưa có nội dung.'
    ),
    h(
      'p',
      { class: 'muted', style: 'margin: 0 0 16px; font-size: 13px;' },
      qNorm
        ? 'Thử xoá từ khoá tìm kiếm hoặc chọn thư mục khác.'
        : 'Bạn có thể tạo thư mục con mới hoặc tạo/nhập bộ thẻ vào vị trí này.'
    ),
    h(
      'div',
      { style: 'display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;' },
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn sm primary',
          onclick: () => actions.openNewDeckModal(),
        },
        '+ Tạo bộ thẻ'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn sm',
          onclick: () => {
            const parentId = ui.selectedFolderId === 'all' ? null : ui.selectedFolderId;
            folderAction('create', folderStore.findFolder(parentId));
          },
        },
        '+ Tạo thư mục con'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn sm',
          onclick: transfer.handleImportSdeck,
        },
        '📥 Nhập file .sdeck vào đây'
      )
    )
  );
}

