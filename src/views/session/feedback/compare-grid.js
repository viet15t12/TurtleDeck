// src/views/session/feedback/compare-grid.js — Render bảng so sánh hai cột "Bạn trả lời" và "Đáp án đúng"

import { h } from '../../dom.js';
import { buildAcceptedAnswerChips } from '../answer-chips.js';

export function renderCompareGrid(ctx, q) {
  const { session, rich } = ctx;
  if (q.kind !== 'fill' && q.kind !== 'command' && q.kind !== 'listen') {
    return null;
  }

  const g = session.grade || { ok: false, near: false };
  const userText = String(session.userAnswer || '').trim() || '(để trống)';
  const userChipCls = g.ok ? (g.near ? 'near-chip' : 'correct-chip') : 'wrong-chip';
  const acceptedChips = buildAcceptedAnswerChips(q, rich);

  return h(
    'div',
    { class: 'feedback-compare-grid' },
    h(
      'div',
      { class: 'feedback-compare-col' },
      h('div', { class: 'feedback-col-label' }, 'Bạn trả lời'),
      h(
        'div',
        { class: 'answer-chips-wrap' },
        h('span', { class: `answer-chip ${userChipCls} ${q.kind === 'command' ? 'font-mono' : ''}` }, userText)
      )
    ),
    h(
      'div',
      { class: 'feedback-compare-col' },
      h('div', { class: 'feedback-col-label' }, 'Đáp án đúng'),
      h('div', { class: 'answer-chips-wrap' }, ...acceptedChips)
    )
  );
}

