// src/views/modals/sessionsetup.js — Hộp thoại thiết lập phiên học (số câu, thứ tự câu).
import { h } from '../dom.js';

export function renderSessionModal(entry, onStart, onCancel) {
  const items = entry.deck.items || [];
  let selectedCount = items.length;
  let shuffleOrder = false;

  const countOptions = [
    { value: items.length, label: `Tất cả (${items.length} câu)` },
  ];
  if (items.length > 5) countOptions.push({ value: 5, label: '5 câu' });
  if (items.length > 10) countOptions.push({ value: 10, label: '10 câu' });
  if (items.length > 20) countOptions.push({ value: 20, label: '20 câu' });

  const selectEl = h('select', {
    class: 'ux-select',
    style: 'width: 100%;',
    onchange: ev => { selectedCount = Number(ev.target.value); },
  }, countOptions.map(opt => h('option', { value: opt.value }, opt.label)));

  const fileOrderRadio = h('input', {
    type: 'radio',
    name: 'order',
    value: 'file',
    checked: true,
    onchange: () => { shuffleOrder = false; },
  });

  const randomOrderRadio = h('input', {
    type: 'radio',
    name: 'order',
    value: 'random',
    onchange: () => { shuffleOrder = true; },
  });

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog' },
      h('h2', null, 'Bắt đầu phiên luyện tập'),
      h('p', { class: 'muted', style: 'margin-top: -8px; margin-bottom: 16px;' }, entry.deck.meta.title),
      h('div', { class: 'form-group' },
        h('label', null, 'Số lượng mục:'),
        selectEl),
      h('div', { class: 'form-group' },
        h('label', null, 'Thứ tự hiển thị:'),
        h('div', { class: 'radio-group' },
          h('label', { class: 'radio-label' }, fileOrderRadio, 'Theo thứ tự bộ thẻ'),
          h('label', { class: 'radio-label' }, randomOrderRadio, 'Ngẫu nhiên'))),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 24px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: () => onStart({ mode: 'custom', count: selectedCount, shuffle: shuffleOrder }),
        }, 'Bắt đầu học'))));

  return modal;
}

