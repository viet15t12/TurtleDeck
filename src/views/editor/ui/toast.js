// src/views/editor/ui/toast.js — Hệ thống thông báo Toast góc dưới kèm nút hành động (§4, §5)
import { h } from '../../dom.js';

export function createToastManager(hostEl) {
  const toastHost = hostEl || h('div', { class: 'ux-toast-host' });
  let currentToastTimer = null;

  function showToast(message, { actionLabel, onAction, duration = 5000 } = {}) {
    if (currentToastTimer) {
      clearTimeout(currentToastTimer);
      currentToastTimer = null;
    }
    const toastEl = h('div', { class: 'ux-toast', role: 'status' },
      h('span', null, message),
      actionLabel ? h('button', {
        type: 'button',
        class: 'ux-toast-action',
        onclick: () => {
          toastEl.remove();
          if (onAction) onAction();
        },
      }, actionLabel) : null,
      h('button', {
        type: 'button',
        class: 'ux-toast-close',
        title: 'Đóng',
        onclick: () => toastEl.remove(),
      }, '✕'));

    toastHost.replaceChildren(toastEl);
    if (duration > 0) {
      currentToastTimer = setTimeout(() => toastEl.remove(), duration);
    }
  }

  return { toastHost, showToast };
}

