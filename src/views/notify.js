// src/views/notify.js — Hệ thống thông báo góc trên màn hình (toast notices).
import { h } from './dom.js';

let noticesContainer = null;

function getNoticesContainer() {
  if (!noticesContainer || !noticesContainer.isConnected) {
    noticesContainer = document.querySelector('#notices');
  }
  return noticesContainer;
}

export function notify(text, level = 'info', timeout = level === 'error' ? 0 : 6000) {
  const container = getNoticesContainer();
  const box = h('div', { class: `notice ${level}`, role: level === 'error' ? 'alert' : 'status' },
    h('span', { class: 'notice-text' }, text),
    h('button', { class: 'notice-close', title: 'Đóng', onclick: () => box.remove() }, '✕'));

  if (container) {
    container.append(box);
  } else {
    document.body.append(box);
  }

  if (timeout > 0) {
    setTimeout(() => box.remove(), timeout);
  }
  return box;
}

