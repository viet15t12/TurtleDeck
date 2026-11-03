// src/views/home/today-strip.js — Dải thống kê nhanh ngày học (Đến hạn / Thẻ mới / Đã ôn)

import { h } from '../dom.js';

export function renderTodayStrip(todayStats) {
  const { totalDueToday, totalNewLeftToday, reviewedToday } = todayStats;

  return h(
    'section',
    { class: 'today-section' },
    h('div', { class: 'section-label' }, 'Hôm nay'),
    h(
      'div',
      { class: 'today-strip' },
      h(
        'div',
        { class: 'today-card' },
        h('div', { class: 'today-card-label' }, 'Đến hạn'),
        h('div', { class: `today-card-value ${totalDueToday > 0 ? 'accent-due' : ''}` }, String(totalDueToday))
      ),
      h(
        'div',
        { class: 'today-card' },
        h('div', { class: 'today-card-label' }, 'Thẻ mới còn lại'),
        h('div', { class: 'today-card-value accent-new' }, String(totalNewLeftToday))
      ),
      h(
        'div',
        { class: 'today-card' },
        h('div', { class: 'today-card-label' }, 'Đã ôn hôm nay'),
        h('div', { class: 'today-card-value accent-ok' }, String(reviewedToday))
      )
    )
  );
}

