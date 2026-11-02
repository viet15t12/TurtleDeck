// src/views/modals/deckinfo.js — Hộp thoại thông tin bộ thẻ (tên, loại, mô tả, cảnh báo lệch mục).
import { h } from '../dom.js';
import { KINDS, kindOf, kindLabel, mismatchedItems, formatMismatchWarning } from '../../core/deckkinds.js';

export function renderDeckInfoModal(deck, onSave, onCancel) {
  const meta = deck?.meta || {};
  let title = meta.title || '';
  let description = meta.description || '';
  let lang = meta.lang || 'vi';
  let kind = kindOf(deck);

  const kindGridHost = h('div', { class: 'ux-kind-grid' });
  const mismatchHost = h('div');
  const descCountEl = h('span', { class: 'muted', style: 'font-size: 12px;' }, `${description.length}/200`);

  function renderKindCardsAndWarning() {
    kindGridHost.replaceChildren(
      ...['qa', 'quiz', 'vocab'].map(k => {
        const info = KINDS[k];
        const disabled = !info.available && kindOf(deck) !== k;
        const active = kind === k;
        return h('button', {
          type: 'button',
          class: `ux-kind-card ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`,
          'data-kind': k,
          disabled,
          onclick: () => {
            if (disabled) return;
            kind = k;
            renderKindCardsAndWarning();
          },
        },
          h('div', { class: 'ux-kind-card-head' },
            h('span', { class: 'ux-kind-icon' }, info.icon),
            info.comingSoon ? h('span', { class: 'ux-kind-soon' }, info.comingSoon) : null),
          h('div', { class: 'ux-kind-title' }, info.label),
          h('div', { class: 'ux-kind-desc' }, info.description));
      })
    );

    const mismatched = mismatchedItems(deck, kind);
    if (mismatched.length > 0) {
      mismatchHost.replaceChildren(
        h('div', { class: 'ux-mismatch-banner', style: 'margin-top: 8px;' },
          h('span', { style: 'font-weight: 700;' }, '⚠'),
          h('div', null,
            h('div', { style: 'font-weight: 600;' }, formatMismatchWarning(deck, kind)),
            h('div', { style: 'font-size: 12px; margin-top: 2px;' },
              `Có ${mismatched.length} mục lệch loại với "${kindLabel(kind)}". Các mục này không bị xoá hay tự chuyển đổi.`)))
      );
    } else {
      mismatchHost.replaceChildren();
    }
  }

  renderKindCardsAndWarning();

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog', style: 'max-width: 600px; width: 94vw;' },
      h('h2', null, 'Thông tin bộ thẻ'),
      h('div', { style: 'display: flex; flex-direction: column; gap: 14px; margin: 14px 0 20px;' },
        h('div', { class: 'form-group' },
          h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, 'Tên bộ thẻ'),
          h('input', {
            type: 'text',
            class: 'ux-input',
            value: title,
            oninput: ev => { title = ev.target.value; },
          })),
        h('div', { class: 'form-group' },
          h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, 'Loại bộ thẻ'),
          kindGridHost,
          mismatchHost),
        h('div', { class: 'form-group' },
          h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' },
            h('label', { style: 'font-weight: 600; font-size: 13px;' }, 'Mô tả (tuỳ chọn, tối đa 200 ký tự)'),
            descCountEl),
          h('textarea', {
            class: 'ux-textarea',
            rows: '2',
            maxLength: 200,
            value: description,
            oninput: ev => {
              description = ev.target.value.slice(0, 200);
              descCountEl.textContent = `${description.length}/200`;
            },
          }))),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; gap: 8px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: () => {
            if (!title.trim()) return;
            onSave({
              title: title.trim(),
              kind,
              description: description.trim().slice(0, 200),
              lang: lang.trim() || 'vi',
            });
          },
        }, 'Lưu thông tin'))));

  return modal;
}

