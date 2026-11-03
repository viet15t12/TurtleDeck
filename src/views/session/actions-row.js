// src/views/session/actions-row.js — Render hàng nút hành động và hướng dẫn phím tắt dưới câu hỏi

import { h } from '../dom.js';
import { RATING, previewIntervalLabel } from '../../core/srs.js';

export function renderActionsRow(ctx, q) {
  const { session, render, submitCurrent, nextQuestion, currentCardState, learnSteps } = ctx;
  const isLast = session.index === session.questions.length - 1;

  let actionsRow = null;
  let shortcutFooter = null;

  if (!session.submitted) {
    if (q.kind === 'card') {
      if (!session.cardFlipped) {
        actionsRow = h(
          'div',
          { class: 'session-actions session-actions-center' },
          h(
            'button',
            {
              type: 'button',
              class: 'ux-btn primary flashcard-reveal-btn',
              onclick: () => {
                session.cardFlipped = true;
                render();
              },
            },
            'Hiện đáp án (Space)'
          )
        );
        shortcutFooter = h('div', { class: 'session-key-hints' }, 'Phím tắt: Space / Enter để hiện đáp án · Esc để thoát');
      } else {
        const cardState = currentCardState(q);
        const now = Date.now();
        const makeRateBtn = (rating, keyHint, label, cls) => {
          const nextLabel = previewIntervalLabel(cardState, rating, now, { learnSteps });
          return h(
            'button',
            {
              type: 'button',
              class: `ux-btn srs-rate-btn ${cls}`,
              onclick: () => submitCurrent(rating),
            },
            h('span', { class: 'srs-rate-time' }, nextLabel),
            h('span', { class: 'srs-rate-title' }, `${keyHint} · ${label}`)
          );
        };

        actionsRow = h(
          'div',
          { class: 'session-actions card-eval-buttons' },
          makeRateBtn(RATING.AGAIN, '1', 'Quên', 'rate-again'),
          makeRateBtn(RATING.HARD, '2', 'Khó', 'rate-hard'),
          makeRateBtn(RATING.GOOD, '3', 'Tốt', 'rate-good'),
          makeRateBtn(RATING.EASY, '4', 'Dễ', 'rate-easy')
        );
        shortcutFooter = h('div', { class: 'session-key-hints' }, 'Phím tắt: 1 Quên · 2 Khó · 3 Tốt (hoặc Space) · 4 Dễ · Esc Thoát');
      }
    } else {
      const canSubmit =
        q.kind === 'multi'
          ? session.userAnswer && session.userAnswer.length > 0
          : q.kind === 'single'
            ? session.userAnswer !== null
            : (session.userAnswer || '').trim().length > 0;

      actionsRow = h(
        'div',
        { class: 'session-actions' },
        h(
          'button',
          {
            type: 'button',
            class: 'ux-btn primary',
            disabled: !canSubmit,
            onclick: () => submitCurrent(),
          },
          'Nộp bài (Enter)'
        )
      );
      shortcutFooter = h(
        'div',
        { class: 'session-key-hints' },
        q.kind === 'single' || q.kind === 'multi'
          ? 'Phím tắt: 1–9 chọn đáp án · Enter nộp bài · Esc thoát'
          : 'Phím tắt: Enter nộp bài · Esc thoát'
      );
    }
  } else {
    actionsRow = h(
      'div',
      { class: 'session-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn primary',
          onclick: nextQuestion,
        },
        isLast ? 'Xem kết quả (Enter) →' : 'Tiếp tục (Enter) →'
      )
    );
    shortcutFooter = h('div', { class: 'session-key-hints' }, 'Phím tắt: Enter tiếp tục · Esc thoát');
  }

  return { actionsRow, shortcutFooter };
}
