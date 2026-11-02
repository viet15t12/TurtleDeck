// src/views/modals/newdeck.js — Hộp thoại tạo bộ thẻ mới (chọn 1 trong 3 loại: Thẻ, Đề thi, Từ vựng).
import { h } from '../dom.js';
import { KINDS } from '../../core/deckkinds.js';

export function renderNewDeckModal(onCreate, onCancel, preselectedKind) {
  let title = '';
  let kind = (typeof preselectedKind === 'string' && KINDS[preselectedKind]?.available) ? preselectedKind : 'quiz';
  let description = '';
  let lang = 'vi';
  let errorText = '';

  const kindGridHost = h('div', { class: 'ux-kind-grid' });
  const errEl = h('div', { class: 'ux-field-msg error', hidden: true });
  const descCountEl = h('span', { class: 'muted', style: 'font-size: 12px;' }, '0/200');

  const titleInput = h('input', {
    type: 'text',
    class: 'ux-input',
    value: title,
    placeholder: 'Ví dụ: Giải tích 1, Lệnh Linux cơ bản…',
    oninput: ev => {
      title = ev.target.value;
      if (title.trim()) {
        errorText = '';
        errEl.hidden = true;
      }
    },
    onkeydown: ev => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submit();
      }
    },
  });

  function renderKindCards() {
    kindGridHost.replaceChildren(
      ...['qa', 'quiz', 'vocab'].map(k => {
        const info = KINDS[k];
        const disabled = !info.available;
        const active = kind === k;
        return h('button', {
          type: 'button',
          class: `ux-kind-card ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`,
          'data-kind': k,
          disabled,
          onclick: () => {
            if (disabled) return;
            kind = k;
            renderKindCards();
            titleInput.focus();
          },
        },
          h('div', { class: 'ux-kind-card-head' },
            h('span', { class: 'ux-kind-icon' }, info.icon),
            info.comingSoon ? h('span', { class: 'ux-kind-soon' }, info.comingSoon) : null),
          h('div', { class: 'ux-kind-title' }, info.label),
          h('div', { class: 'ux-kind-desc' }, info.description));
      })
    );
  }

  function submit() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      errorText = 'Vui lòng nhập tên bộ thẻ.';
      errEl.textContent = errorText;
      errEl.hidden = false;
      titleInput.focus();
      return;
    }
    onCreate({
      title: cleanTitle,
      kind,
      description: description.trim().slice(0, 200),
      lang: lang.trim() || 'vi',
    });
  }

  renderKindCards();
  queueMicrotask(() => titleInput.focus());

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog', style: 'max-width: 620px; width: 94vw;' },
      h('h2', null, 'Bộ thẻ mới'),
      h('p', { class: 'muted', style: 'margin-top: -6px; margin-bottom: 16px;' },
        'Chọn loại bộ thẻ phù hợp với nội dung bạn muốn học, sau đó đặt tên để bắt đầu soạn.'),
      h('div', { class: 'form-group', style: 'margin-bottom: 14px;' },
        h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, '1. Chọn loại bộ thẻ'),
        kindGridHost),
      h('div', { class: 'form-group', style: 'margin-bottom: 14px;' },
        h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, '2. Tên bộ thẻ'),
        titleInput,
        errEl),
      h('div', { class: 'form-group', style: 'margin-bottom: 14px;' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' },
          h('label', { style: 'font-weight: 600; font-size: 13px;' }, 'Mô tả ngắn (tuỳ chọn)'),
          descCountEl),
        h('textarea', {
          class: 'ux-textarea',
          rows: '2',
          maxLength: 200,
          placeholder: 'Mô tả ngắn gọn nội dung bộ thẻ (tối đa 200 ký tự)…',
          oninput: ev => {
            description = ev.target.value.slice(0, 200);
            descCountEl.textContent = `${description.length}/200`;
          },
        })),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 20px; gap: 8px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: submit,
        }, 'Tạo & Mở trình soạn'))));

  return modal;
}

