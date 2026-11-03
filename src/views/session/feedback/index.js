// src/views/session/feedback/index.js — Ghép toàn bộ các thành phần của khối phản hồi feedback

import { h } from '../../dom.js';
import { assetUrl } from '../../../core/richtext.js';
import { richEl } from '../answer-chips.js';
import { renderFeedbackBanner } from './banner.js';
import { renderCompareGrid } from './compare-grid.js';
import { renderVocabExtra } from './vocab-extra.js';
import { renderFeedbackActionsBar } from './actions-bar.js';
import { renderFeedbackNote } from './note.js';

export function renderFeedback(ctx, q) {
  const { session, entry, rich } = ctx;
  if (!session.submitted) return null;

  const answerImgUrl = q.answerImage && q.kind !== 'card' ? assetUrl(q.answerImage, entry.deckKey) : null;

  return h(
    'div',
    { class: 'feedback-section' },
    renderFeedbackBanner(session, q),
    renderCompareGrid(ctx, q),
    renderVocabExtra(ctx, q),
    renderFeedbackActionsBar(ctx),
    renderFeedbackNote(ctx),
    answerImgUrl
      ? h('div', { class: 'answer-img-wrap' }, h('img', { class: 'rich-img', src: answerImgUrl, alt: 'Hình ảnh đáp án' }))
      : null,
    q.explanation
      ? h(
          'div',
          { class: 'explanation-box' },
          h('h4', null, 'Giải thích'),
          richEl('div', { class: 'explanation-body' }, rich.html(q.explanation))
        )
      : null
  );
}

