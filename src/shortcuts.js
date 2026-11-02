// src/shortcuts.js — Bảng phím tắt tập trung theo màn hình và thứ tự ưu tiên (ES module).
// Theo study-app.md mục 7.2 và yêu cầu Giai đoạn 6.

import { h } from './views/dom.js';

let activeScope = 'home'; // 'home' | 'deck' | 'session' | 'result' | 'stats' | 'settings' | 'editor'
let currentHandlers = {};

export function setShortcutScope(scope, handlers = {}) {
  activeScope = scope;
  currentHandlers = handlers || {};
}

export function isInputFocused() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

// Bảng tóm tắt phím tắt cho modal "?"
export function renderShortcutsModal(onClose) {
  const sections = [
    {
      title: 'Phím tắt chung',
      items: [
        { key: 'Ctrl + O', desc: 'Mở file bộ thẻ (.sdeck)' },
        { key: 'Esc', desc: 'Đóng hộp thoại / đóng phóng to ảnh / thoát phiên' },
        { key: '?', desc: 'Mở bảng phím tắt này' },
      ],
    },
    {
      title: 'Trong phiên học (Session)',
      items: [
        { key: 'Space', desc: 'Hiện đáp án thẻ Flashcard / Chuyển câu tiếp theo' },
        { key: 'Enter', desc: 'Nộp đáp án / Tiếp tục' },
        { key: '1, 2, 3, 4', desc: 'Đánh giá thẻ Flashcard (Quên, Khó, Tốt, Dễ)' },
        { key: 'S (hoặc Alt+S)', desc: 'Bật / tắt gắn sao mục hiện tại' },
        { key: 'R', desc: 'Nghe lại phát âm từ vựng (chế độ Nghe / Vocab)' },
        { key: 'Esc', desc: 'Thoát phiên học (có hỏi xác nhận nếu đã làm)' },
      ],
    },
    {
      title: 'Trong trình soạn (Editor)',
      items: [
        { key: 'Ctrl + S', desc: 'Lưu bộ thẻ (.sdeck)' },
        { key: 'Ctrl + Z / Ctrl + Y', desc: 'Hoàn tác / Làm lại' },
        { key: 'Ctrl + \\', desc: 'Mở trợ giúp ký hiệu toán & LaTeX' },
      ],
    },
  ];

  const modal = h('div', {
    class: 'modal-backdrop',
    onclick: ev => { if (ev.target === modal) onClose(); },
  },
    h('div', { class: 'modal-dialog', style: 'max-width: 620px;' },
      h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;' },
        h('h2', { style: 'margin: 0;' }, '⌨ Phím tắt hệ thống'),
        h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          style: 'font-size: 18px; padding: 2px 8px;',
          onclick: onClose,
        }, '✕')),
      h('div', { style: 'display: flex; flex-direction: column; gap: 18px; max-height: 70vh; overflow-y: auto; padding-right: 4px;' },
        ...sections.map(sec => h('div', null,
          h('div', { class: 'eyebrow', style: 'margin-bottom: 8px;' }, sec.title),
          h('div', { style: 'display: flex; flex-direction: column; gap: 6px;' },
            ...sec.items.map(it => h('div', {
              style: 'display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--c-surface-2); border-radius: var(--radius-sm); border: 1px solid var(--c-border); font-size: 13px;',
            },
              h('span', { style: 'color: var(--c-text);' }, it.desc),
              h('kbd', {
                style: 'background: var(--c-surface); border: 1px solid var(--c-border-strong); border-radius: 4px; padding: 2px 8px; font-family: var(--font-mono); font-size: 12px; font-weight: 600; box-shadow: 0 1px 2px rgb(0 0 0 / 8%);',
              }, it.key))))))),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 20px;' },
        h('button', { type: 'button', class: 'ux-btn primary', onclick: onClose }, 'Đóng (Esc)'))));

  return modal;
}

let isInitialized = false;
let globalActions = null;

export function initGlobalShortcuts(actions) {
  globalActions = actions;
  if (isInitialized) return;
  isInitialized = true;

  document.addEventListener('keydown', ev => {
    const isInput = isInputFocused();
    const isCtrl = ev.ctrlKey || ev.metaKey;
    const isAlt = ev.altKey;
    const key = ev.key;

    // 1. Phím Esc — Thứ tự ưu tiên:
    // a. Đóng lightbox phóng to ảnh
    // b. Đóng modal hoặc popover đang mở
    // c. Thoát phiên học
    if (key === 'Escape') {
      const lightbox = document.querySelector('.lightbox-backdrop');
      if (lightbox) {
        ev.preventDefault();
        lightbox.remove();
        return;
      }

      const openPopover = document.querySelector('.menu:not([hidden]), .ux-popover[data-dropdown]:not([hidden])');
      if (openPopover) {
        ev.preventDefault();
        openPopover.hidden = true;
        return;
      }

      if (globalActions?.closeModal && globalActions.hasModal?.()) {
        ev.preventDefault();
        globalActions.closeModal();
        return;
      }

      if (currentHandlers.onEscape) {
        ev.preventDefault();
        currentHandlers.onEscape();
        return;
      }
      return;
    }

    // 2. Ctrl + O: Mở file bộ thẻ (mọi màn trừ khi đang có modal)
    if (isCtrl && (key === 'o' || key === 'O')) {
      if (!globalActions?.hasModal?.()) {
        ev.preventDefault();
        if (currentHandlers.onOpenFiles) {
          currentHandlers.onOpenFiles();
        } else if (globalActions?.openFiles) {
          globalActions.openFiles();
        }
      }
      return;
    }

    // 3. Phím "?" (Shift + /): Mở bảng phím tắt
    if (key === '?' && !isInput && !isCtrl && !isAlt) {
      ev.preventDefault();
      if (globalActions?.showShortcuts) {
        globalActions.showShortcuts();
      }
      return;
    }

    // 4. Phím S (hoặc Alt+S khi đang gõ): Gắn sao
    if ((key === 's' || key === 'S') && ((!isInput && !isCtrl && !isAlt) || isAlt)) {
      if (currentHandlers.onToggleStar) {
        ev.preventDefault();
        currentHandlers.onToggleStar();
        return;
      }
    }

    // Phím không có modifier KHÔNG kích hoạt khi đang ở input/textarea/contenteditable
    if (isInput && !isCtrl && !isAlt) {
      return;
    }

    // Chuyển tiếp cho handler riêng của màn hình hiện tại
    if (currentHandlers.onKeyDown) {
      currentHandlers.onKeyDown(ev);
    }
  });
}

