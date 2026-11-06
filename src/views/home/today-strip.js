// src/views/home/today-strip.js — Dải thống kê nhanh ngày học phong cách Apple Bento Dashboard

import { h } from '../dom.js';

export function renderTodayStrip(todayStats) {
  const { totalDueToday, totalNewLeftToday, reviewedToday } = todayStats;

  return h(
    'section',
    { class: 'today-section' },
    h('div', { class: 'section-label' }, 'Tổng quan hôm nay'),
    h(
      'div',
      { class: 'today-strip' },
      // Thẻ 1: Cần ôn tập
      h(
        'div',
        { class: `today-card ${totalDueToday > 0 ? 'is-due' : 'is-clear'}` },
        h(
          'div',
          { class: 'today-card-header' },
          h('span', { class: 'today-card-icon icon-due' }, '🔥'),
          h('span', { class: 'today-card-label' }, 'Cần ôn ngay')
        ),
        h('div', { class: `today-card-value ${totalDueToday > 0 ? 'accent-due' : ''}` }, String(totalDueToday)),
        h('div', { class: 'today-card-sub' }, totalDueToday > 0 ? 'Thẻ đến hạn & đang học' : 'Tuyệt vời, không có thẻ tồn')
      ),
      // Thẻ 2: Thẻ mới
      h(
        'div',
        { class: 'today-card is-new' },
        h(
          'div',
          { class: 'today-card-header' },
          h('span', { class: 'today-card-icon icon-new' }, '⚡'),
          h('span', { class: 'today-card-label' }, 'Thẻ mới sẵn sàng')
        ),
        h('div', { class: 'today-card-value accent-new' }, String(totalNewLeftToday)),
        h('div', { class: 'today-card-sub' }, 'Hạn mức thẻ mới trong ngày')
      ),
      // Thẻ 3: Đã ôn hôm nay
      h(
        'div',
        { class: 'today-card is-reviewed' },
        h(
          'div',
          { class: 'today-card-header' },
          h('span', { class: 'today-card-icon icon-ok' }, '✓'),
          h('span', { class: 'today-card-label' }, 'Đã ôn hôm nay')
        ),
        h('div', { class: 'today-card-value accent-ok' }, String(reviewedToday)),
        h('div', { class: 'today-card-sub' }, reviewedToday > 0 ? 'Lượt ôn tập đã hoàn thành' : 'Chưa có lượt ôn nào')
      )
    )
  );
}
