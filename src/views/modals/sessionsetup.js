// src/views/modals/sessionsetup.js — Hộp thoại thiết lập phiên học (số câu, thứ tự câu, chủ đề, thời gian thi, chiều học vocab).
import { h } from '../dom.js';
import { kindOf } from '../../core/deckkinds.js';
import { extractTopics } from '../../core/filters.js';

export function renderSessionModal(entry, onStart, onCancel, options = {}) {
  const items = entry.deck.items || [];
  const kind = kindOf(entry.deck);
  const isVocab = kind === 'vocab';
  const selectedMode = options.defaultMode || (isVocab ? 'flashcards' : 'custom');
  const isExam = selectedMode === 'exam';

  let selectedCount = items.length;
  let shuffleOrder = isExam;
  let direction = options.direction || 'both'; // 'both' | 'fwd' | 'rev'
  let selectedTopic = 'all';
  let selectedDuration = 30; // 30 phút mặc định cho Exam

  const topics = extractTopics(items);

  const countOptions = [
    { value: items.length, label: `Tất cả (${items.length} ${isVocab ? 'từ' : 'câu'})` },
  ];
  if (items.length > 5) countOptions.push({ value: 5, label: `5 ${isVocab ? 'từ' : 'câu'}` });
  if (items.length > 10) countOptions.push({ value: 10, label: `10 ${isVocab ? 'từ' : 'câu'}` });
  if (items.length > 20) countOptions.push({ value: 20, label: `20 ${isVocab ? 'từ' : 'câu'}` });
  if (items.length > 40) countOptions.push({ value: 40, label: `40 ${isVocab ? 'từ' : 'câu'}` });

  const selectCountEl = h('select', {
    class: 'ux-select',
    style: 'width: 100%;',
    onchange: ev => { selectedCount = Number(ev.target.value); },
  }, countOptions.map(opt => h('option', { value: opt.value }, opt.label)));

  let topicGroup = null;
  if (topics.length > 0) {
    const topicSelect = h('select', {
      class: 'ux-select',
      style: 'width: 100%;',
      onchange: ev => { selectedTopic = ev.target.value; },
    },
      h('option', { value: 'all' }, 'Tất cả chủ đề'),
      ...topics.map(t => h('option', { value: t }, t))
    );

    topicGroup = h('div', { class: 'form-group' },
      h('label', null, 'Chủ đề:'),
      topicSelect
    );
  }

  let durationGroup = null;
  if (isExam) {
    const durationOptions = [
      { value: 15, label: '15 phút' },
      { value: 30, label: '30 phút (tiêu chuẩn)' },
      { value: 45, label: '45 phút' },
      { value: 60, label: '60 phút' },
      { value: 90, label: '90 phút' },
    ];
    const durationSelect = h('select', {
      class: 'ux-select',
      style: 'width: 100%;',
      onchange: ev => { selectedDuration = Number(ev.target.value); },
    }, durationOptions.map(opt => h('option', { value: opt.value, selected: opt.value === 30 }, opt.label)));

    durationGroup = h('div', { class: 'form-group' },
      h('label', null, 'Thời gian làm bài:'),
      durationSelect
    );
  }

  const fileOrderRadio = h('input', {
    type: 'radio',
    name: 'order',
    value: 'file',
    checked: !shuffleOrder,
    onchange: () => { shuffleOrder = false; },
  });

  const randomOrderRadio = h('input', {
    type: 'radio',
    name: 'order',
    value: 'random',
    checked: shuffleOrder,
    onchange: () => { shuffleOrder = true; },
  });

  let directionGroup = null;
  if (isVocab && !isExam) {
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

  const modalTitle = isExam ? 'Thiết lập bài thi thử' : 'Bắt đầu phiên học';
  const startBtnText = isExam ? 'Bắt đầu thi' : 'Bắt đầu học';

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog' },
      h('h2', null, modalTitle),
      h('p', { class: 'muted', style: 'margin-top: -8px; margin-bottom: 16px;' }, entry.deck.meta.title),
      topicGroup,
      h('div', { class: 'form-group' },
        h('label', null, 'Số lượng mục:'),
        selectCountEl),
      durationGroup,
      isVocab ? directionGroup : null,
      !isExam ? h('div', { class: 'form-group' },
        h('label', null, 'Thứ tự hiển thị:'),
        h('div', { class: 'radio-group' },
          h('label', { class: 'radio-label' }, fileOrderRadio, 'Theo thứ tự bộ thẻ'),
          h('label', { class: 'radio-label' }, randomOrderRadio, 'Ngẫu nhiên'))) : null,
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 24px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: () => onStart({
            mode: selectedMode,
            count: selectedCount,
            shuffle: shuffleOrder,
            topic: selectedTopic,
            durationMinutes: selectedDuration,
            direction: isVocab ? direction : undefined,
          }),
        }, startBtnText))));

  return modal;
}
