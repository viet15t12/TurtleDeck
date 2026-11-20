// src/views/modals/deckinfo.js — Hộp thoại thông tin bộ thẻ chuẩn Apple macOS Sheet:
// - Bố cục cân đối full-width, không còn bị co cụm về góc trái
// - Thẻ chọn loại bộ thẻ dạng Apple Bento Radio Card (có icon plate và vòng tích xanh)
// - Ô nhập liệu rộng thoáng, textarea tự căn chỉnh
// - Header & Footer chuẩn hệ thống macOS

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
  const descCountEl = h('span', {
    class: 'ux-count-pill',
    style: 'font-size: 11px; color: var(--c-text-tertiary); background: var(--c-surface-3); padding: 2px 8px; border-radius: 9999px; font-weight: 500;',
  }, `${description.length}/200`);

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
            h('span', { class: 'ux-kind-icon-plate' }, info.icon),
            h('span', { class: 'ux-kind-radio' }, active ? '✓' : '')
          ),
          h('div', { class: 'ux-kind-title' }, info.label),
          h('div', { class: 'ux-kind-desc' }, info.description)
        );
      })
    );

    const mismatched = mismatchedItems(deck, kind);
    if (mismatched.length > 0) {
      mismatchHost.replaceChildren(
        h('div', {
          class: 'ux-mismatch-banner',
          style: 'margin-top: 10px; padding: 10px 14px; border-radius: 10px; background: var(--c-warn-soft); border: 1px solid color-mix(in srgb, var(--c-warn) 40%, transparent); display: flex; gap: 10px; align-items: flex-start;',
        },
          h('span', { style: 'font-weight: 700; color: var(--c-warn);' }, '⚠'),
          h('div', null,
            h('div', { style: 'font-weight: 600; font-size: 13px; color: var(--c-warn);' }, formatMismatchWarning(deck, kind)),
            h('div', { style: 'font-size: 12px; margin-top: 2px; color: var(--c-text-muted);' },
              `Có ${mismatched.length} mục lệch loại với "${kindLabel(kind)}". Các mục này không bị xoá hay tự chuyển đổi.`)))
      );
    } else {
      mismatchHost.replaceChildren();
    }
  }

  renderKindCardsAndWarning();

  function submit() {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      kind,
      description: description.trim().slice(0, 200),
      lang: Array.isArray(lang) ? lang : (lang.trim() || 'vi'),
    });
  }

  const modal = h('div', {
    class: 'modal-backdrop',
    onclick: ev => { if (ev.target === modal) onCancel(); },
  },
    h('div', { class: 'modal-dialog', style: 'max-width: 620px; width: 94vw;' },
      h('div', { class: 'modal-head' },
        h('div', { style: 'display: flex; align-items: center; gap: 10px;' },
          h('span', { class: 'modal-icon' }, 'ℹ'),
          h('h2', { class: 'modal-title' }, 'Thông tin bộ thẻ')
        ),
        h('button', {
          type: 'button',
          class: 'ux-btn ghost sm modal-close-btn',
          onclick: onCancel,
          title: 'Đóng (Esc)',
        }, '✕')
      ),
      h('div', { style: 'display: flex; flex-direction: column; gap: 16px;' },
        h('div', { class: 'form-group', style: 'margin: 0;' },
          h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px; color: var(--c-text);' }, 'Tên bộ thẻ'),
          h('input', {
            type: 'text',
            class: 'ux-input',
            style: 'width: 100%; box-sizing: border-box; height: 38px;',
            value: title,
            placeholder: 'Nhập tên bộ thẻ…',
            oninput: ev => { title = ev.target.value; },
            onkeydown: ev => {
              if (ev.key === 'Enter') {
                ev.preventDefault();
                submit();
              }
            },
          })
        ),
        h('div', { class: 'form-group', style: 'margin: 0;' },
          h('label', { style: 'display: block; font-weight: 600; margin-bottom: 8px; font-size: 13px; color: var(--c-text);' }, 'Loại bộ thẻ'),
          kindGridHost,
          mismatchHost
        ),
        h('div', { class: 'form-group', style: 'margin: 0;' },
          h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' },
            h('label', { style: 'font-weight: 600; font-size: 13px; color: var(--c-text);' }, 'Mô tả bộ thẻ'),
            descCountEl
          ),
          h('textarea', {
            class: 'ux-textarea',
            style: 'width: 100%; box-sizing: border-box; min-height: 85px; resize: none; line-height: 1.5;',
            rows: '3',
            maxLength: 200,
            placeholder: 'Nhập mô tả tóm tắt nội dung học (tối đa 200 ký tự)…',
            value: description,
            oninput: ev => {
              description = ev.target.value.slice(0, 200);
              descCountEl.textContent = `${description.length}/200`;
            },
          })
        )
      ),
      h('div', { class: 'modal-footer' },
        h('button', {
          type: 'button',
          class: 'ux-btn ghost',
          style: 'padding: 8px 18px; border-radius: 9999px; font-weight: 500;',
          onclick: onCancel,
        }, 'Huỷ'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          style: 'font-weight: 600; padding: 8px 22px; border-radius: 9999px; box-shadow: 0 2px 8px rgba(0, 113, 227, 0.3);',
          onclick: submit,
        }, 'Lưu thông tin')
      )
    )
  );

  return modal;
}
