// src/views/session/feedback/vocab-extra.js — Khối thông tin mở rộng từ vựng (phát âm, từ loại, ví dụ)

import { h } from '../../dom.js';
import { assetUrl } from '../../../core/richtext.js';
import { speak } from '../../../tts.js';
import { richEl } from '../answer-chips.js';

export function renderVocabExtra(ctx, q) {
  const { entry, settings, rich } = ctx;
  if (!q.rawItem || (q.kind !== 'listen' && !q.rawItem.term)) {
    return null;
  }

  const it = q.rawItem;
  const itImg = it.image ? assetUrl(it.image, entry.deckKey) : null;

  return h(
    'div',
    {
      class: 'vocab-feedback-extra',
      style:
        'margin-top: 14px; padding: 12px 16px; background: var(--c-surface-2); border-radius: var(--radius-md); border-left: 3px solid var(--c-primary);',
    },
    it.term
      ? h(
          'div',
          { style: 'display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px;' },
          h('span', null, it.term),
          it.pos ? h('span', { class: 'muted', style: 'font-weight: normal; font-size: 13px;' }, `(${it.pos})`) : null,
          it.phonetic ? h('span', { style: 'color: var(--c-primary); font-size: 13px;' }, `/${it.phonetic}/`) : null,
          h(
            'button',
            {
              type: 'button',
              class: 'ux-btn ghost sm',
              style: 'padding: 0 6px; height: 22px;',
              title: 'Phát âm (Web Speech TTS)',
              onclick: () => speak(it.term, settings?.ttsLang || 'en-US'),
            },
            '🔊'
          )
        )
      : null,
    it.definition
      ? h('div', { style: 'margin-top: 6px; font-size: 14px;' }, richEl('span', null, rich.inline(it.definition)))
      : null,
    it.example
      ? h(
          'div',
          { class: 'muted', style: 'margin-top: 6px; font-style: italic; font-size: 13px;' },
          richEl('span', null, rich.inline(it.example))
        )
      : null,
    itImg ? h('img', { class: 'rich-img', src: itImg, alt: 'Ảnh minh hoạ', style: 'max-height: 120px; margin-top: 8px;' }) : null
  );
}
