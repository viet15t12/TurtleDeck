// src/views/session/progress-bar.js — Dựng thanh tiến độ chia đoạn theo từng câu hỏi

import { h } from '../dom.js';

export function renderSegmentedProgressBar(session, total) {
  const segs = [];
  for (let i = 0; i < total; i++) {
    let cls = 'session-seg';
    if (session.slotResults.has(i)) {
      cls += session.slotResults.get(i) ? ' seg-ok' : ' seg-wrong';
    }
    if (i === session.index) {
      cls += ' seg-current';
    }
    segs.push(h('div', { class: cls, title: `Câu ${i + 1}` }));
  }
  return h(
    'div',
    {
      class: 'session-seg-bar',
      role: 'progressbar',
      'aria-valuenow': session.index + 1,
      'aria-valuemax': total,
    },
    ...segs
  );
}

