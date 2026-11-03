// src/views/session/feedback/note.js — Render ô ghi chú cá nhân dạng thu gọn kèm hỗ trợ Markdown/LaTeX

import { h } from '../../dom.js';
import { richEl } from '../answer-chips.js';

export function renderFeedbackNote(ctx) {
  const { getCurrentMeta, saveNote, rich } = ctx;
  const metaItem = getCurrentMeta();

  return h(
    'details',
    {
      class: 'feedback-note-collapse',
      style:
        'margin-top: 8px; border: 1px dashed var(--c-border); border-radius: var(--radius-sm); padding: 8px 12px;',
    },
    h(
      'summary',
      { style: 'cursor: pointer; font-size: 13px; font-weight: 600; color: var(--c-text-muted);' },
      metaItem.note ? '📝 Ghi chú cá nhân (đã có)' : '📝 Thêm ghi chú cá nhân (Markdown / LaTeX)...'
    ),
    h(
      'div',
      { style: 'margin-top: 8px;' },
      h('textarea', {
        class: 'ux-input',
        style: 'width: 100%; min-height: 60px; font-size: 13px; resize: vertical;',
        placeholder: 'Ghi chú cho riêng bạn (Markdown/LaTeX, tối đa 2000 ký tự)...',
        maxlength: 2000,
        value: metaItem.note || '',
        onblur: ev => saveNote(ev.target.value),
      }),
      metaItem.note
        ? h(
            'div',
            {
              style:
                'margin-top: 6px; padding: 6px 10px; background: var(--c-surface-2); border-radius: 4px; font-size: 13px;',
            },
            richEl('div', null, rich.html(metaItem.note))
          )
        : null
    )
  );
}
