// src/views/components/dragdrop.js — Xử lý kéo thả (drag & drop) deck vào folder
import { h } from '../dom.js';

let isGlobalDragging = false;
let globalDragEndTime = 0;

export function isCurrentlyDragging() {
  return isGlobalDragging || (Date.now() - globalDragEndTime < 250);
}

export function makeDeckDraggable(deckElement, deckId) {
  deckElement.setAttribute('draggable', 'true');
  deckElement.addEventListener('dragstart', (e) => {
    // Không kéo card nếu bắt đầu kéo từ nút hoặc menu tương tác bên trong
    if (e.target.closest('button, select, input, a, .menu-wrap, .ux-popover')) {
      e.preventDefault();
      return;
    }
    isGlobalDragging = true;
    e.dataTransfer.setData('application/turtle-deck-id', deckId);
    e.dataTransfer.setData('text/plain', deckId);
    e.dataTransfer.effectAllowed = 'copyMove';
    deckElement.classList.add('is-dragging');
  });

  deckElement.addEventListener('dragend', () => {
    isGlobalDragging = false;
    globalDragEndTime = Date.now();
    deckElement.classList.remove('is-dragging');
  });
}

export function promptDropAction({ deckTitle, folderName, onChoose, onCancel }) {
  const backdrop = h('div', {
    class: 'modal-backdrop',
    onclick: (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
        onCancel?.();
      }
    },
  });

  const desc = folderName
    ? `Chọn thao tác cho bộ thẻ "${deckTitle}" vào thư mục "${folderName}":`
    : `Chọn thao tác cho bộ thẻ "${deckTitle}" vào Thư mục gốc:`;

  const moveBtn = h('button', {
    type: 'button',
    class: 'ux-btn primary',
    style: 'flex: 1; padding: 10px;',
    onclick: () => {
      backdrop.remove();
      onChoose?.('move');
    },
  }, '📦 Di chuyển');

  const linkBtn = h('button', {
    type: 'button',
    class: 'ux-btn',
    style: 'flex: 1; padding: 10px;',
    onclick: () => {
      backdrop.remove();
      onChoose?.('link');
    },
  }, '🔗 Tạo liên kết (Link)');

  const cancelBtn = h('button', {
    type: 'button',
    class: 'ux-btn ghost',
    onclick: () => {
      backdrop.remove();
      onCancel?.();
    },
  }, 'Huỷ');

  const modalBox = h('div', { class: 'modal-dialog', style: 'max-width: 420px;' },
    h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;' },
      h('h2', { style: 'margin: 0; font-size: 1.15rem;' }, 'Di chuyển hay Tạo liên kết?'),
      h('button', {
        type: 'button',
        class: 'ux-icon-btn',
        title: 'Đóng',
        onclick: () => { backdrop.remove(); onCancel?.(); },
      }, '✕')),
    h('p', { class: 'muted', style: 'margin: 0 0 18px; font-size: 14px; line-height: 1.5;' }, desc),
    h('div', { style: 'display: flex; gap: 10px; margin-bottom: 12px;' }, moveBtn, linkBtn),
    h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 16px;' },
      cancelBtn
    )
  );

  backdrop.append(modalBox);
  document.body.append(backdrop);
}
