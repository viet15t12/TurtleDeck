// src/views/session/question/flashcard.js — Dựng thẻ lật flashcard mặt trước/mặt sau

import { h } from '../../dom.js';
import { assetUrl } from '../../../core/richtext.js';
import { speak } from '../../../tts.js';
import { richEl } from '../answer-chips.js';

export function renderFlashcardQuestion(ctx, q) {
  const { session, render, entry, settings, rich } = ctx;
  const frontImgUrl = q.image ? assetUrl(q.image, entry.deckKey) : null;
  const backImgUrl = q.answerImage ? assetUrl(q.answerImage, entry.deckKey) : null;

  return h(
    'div',
    { class: 'flashcard-wrap' },
    h(
      'div',
      {
        class: `flashcard ${session.cardFlipped ? 'flipped' : ''}`,
        onclick: () => {
          if (!session.cardFlipped && !session.submitted) {
            session.cardFlipped = true;
            render();
          }
        },
      },
      h(
        'div',
        { class: 'card-face card-front' },
        h(
          'div',
          { style: 'display: flex; justify-content: space-between; align-items: center; width: 100%;' },
          h('span', { class: 'card-badge' }, 'Mặt trước'),
          q.rawItem?.term
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'ux-btn ghost sm',
                  style: 'padding: 0 6px; height: 22px;',
                  title: 'Phát âm (Web Speech TTS)',
                  onclick: ev => {
                    ev.stopPropagation();
                    speak(q.rawItem.term, settings?.ttsLang || 'en-US');
                  },
                },
                '🔊 Phát âm'
              )
            : null
        ),
        richEl('div', { class: 'card-content' }, rich.html(q.front)),
        frontImgUrl
          ? h('img', { class: 'rich-img card-img', src: frontImgUrl, alt: 'Hình ảnh mặt trước' })
          : null
      ),
      session.cardFlipped
        ? h(
            'div',
            { class: 'card-face card-back' },
            h('span', { class: 'card-badge card-badge-back' }, 'Mặt sau · Đáp án'),
            richEl('div', { class: 'card-content' }, rich.html(q.back)),
            backImgUrl
              ? h('img', { class: 'rich-img card-img', src: backImgUrl, alt: 'Hình ảnh mặt sau' })
              : null
          )
        : null
    )
  );
}

