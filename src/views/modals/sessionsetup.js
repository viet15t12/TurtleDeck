// src/views/modals/sessionsetup.js — Hộp thoại thiết lập phiên học (số câu, thứ tự câu, chiều học vocab).
import { h } from '../dom.js';
import { kindOf } from '../../core/deckkinds.js';

export function renderSessionModal(entry, onStart, onCancel, options = {}) {
  const items = entry.deck.items || [];
  const kind = kindOf(entry.deck);
  const isVocab = kind === 'vocab';

  let selectedCount = items.length;
  let shuffleOrder = false;
  let selectedMode = options.defaultMode || (isVocab ? 'flashcards' : 'custom');
  let direction = options.direction || 'both'; // 'both' | 'fwd' | 'rev'

  const countOptions = [
    { value: items.length, label: `Tất cả (${items.length} ${isVocab ? 'từ' : 'câu'})` },
  ];
  if (items.length > 5) countOptions.push({ value: 5, label: `5 ${isVocab ? 'từ' : 'câu'}` });
  if (items.length > 10) countOptions.push({ value: 10, label: `10 ${isVocab ? 'từ' : 'câu'}` });
  if (items.length > 20) countOptions.push({ value: 20, label: `20 ${isVocab ? 'từ' : 'câu'}` });

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
    checked: false,
    onchange: () => { shuffleOrder = true; },
  });

  let directionGroup = null;
  if (isVocab) {
    const dirBothRadio = h('input', {
      type: 'radio',
      name: 'direction',
      value: 'both',
      checked: direction === 'both',
      onchange: () => { direction = 'both'; },
    });
    const dirFwdRadio = h('input', {
      type: 'radio',
      name: 'direction',
      value: 'fwd',
      checked: direction === 'fwd',
      onchange: () => { direction = 'fwd'; },
    });
    const dirRevRadio = h('input', {
      type: 'radio',
      name: 'direction',
      value: 'rev',
      checked: direction === 'rev',
      onchange: () => { direction = 'rev'; },
    });

    directionGroup = h('div', { class: 'form-group' },
      h('label', null, 'Chiều học từ vựng:'),
      h('div', { class: 'radio-group', style: 'display: flex; flex-direction: column; gap: 6px;' },
        h('label', { class: 'radio-label' }, dirBothRadio, 'Cả hai chiều (EN ⇄ VI — xen kẽ hai hướng)'),
        h('label', { class: 'radio-label' }, dirFwdRadio, 'Xuôi: Thuật ngữ → Định nghĩa (EN → VI)'),
        h('label', { class: 'radio-label' }, dirRevRadio, 'Ngược: Định nghĩa → Thuật ngữ (VI → EN)')));
  }

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog' },
      h('h2', null, 'Bắt đầu phiên học'),
      h('p', { class: 'muted', style: 'margin-top: -8px; margin-bottom: 16px;' }, entry.deck.meta.title),
      h('div', { class: 'form-group' },
        h('label', null, 'Số lượng mục:'),
        selectEl),
      isVocab ? directionGroup : null,
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
          onclick: () => onStart({
            mode: selectedMode,
            count: selectedCount,
            shuffle: shuffleOrder,
            direction: isVocab ? direction : undefined,
          }),
        }, 'Bắt đầu học'))));

  return modal;
}
