// src/views/settings/sections/reset-progress.js — Mục cài đặt Đặt lại tiến trình học tập (SRS)

import { h } from '../../dom.js';

export function createResetProgressSection({ progress, entries, actions }) {
  const cardsMap = progress?.cards || {};
  const totalTrackedCards = Object.keys(cardsMap).length;
  const totalLogReviews = Array.isArray(progress?.log) ? progress.log.length : 0;
  let selectedResetTarget = 'all';

  const deckChoices = [{ id: 'all', title: 'Tất cả bộ thẻ', count: totalTrackedCards }];

  const loadedEntries = (entries || []).filter(e => e.status === 'ok' && e.deck?.meta?.id);
  loadedEntries.forEach(entry => {
    const dId = entry.deck.meta.id;
    const prefix = `${dId}:`;
    const count = Object.keys(cardsMap).filter(k => k.startsWith(prefix)).length;
    deckChoices.push({
      id: dId,
      title: entry.deck.meta.title || dId,
      count,
    });
  });

  const resetTargetSelect = h(
    'select',
    {
      class: 'ux-select',
      style: 'max-width: 380px; width: 100%;',
      onchange: ev => {
        selectedResetTarget = ev.target.value;
      },
    },
    deckChoices.map(c => h('option', { value: c.id }, `${c.title} (${c.count} thẻ có tiến trình)`))
  );

  function handleResetProgress() {
    const chosen = deckChoices.find(c => c.id === selectedResetTarget) || deckChoices[0];
    const isAll = selectedResetTarget === 'all';
    const message = isAll
      ? `Bạn có chắc chắn muốn đặt lại tiến trình học của TẤT CẢ bộ thẻ?\n\n- ${totalTrackedCards} thẻ đang theo dõi sẽ đưa về trạng thái "Mới".\n- ${totalLogReviews} lượt ôn tập trong lịch sử sẽ bị xoá.\n\nNội dung các file bộ thẻ (.sdeck) sẽ KHÔNG bị thay đổi.`
      : `Bạn có chắc chắn muốn đặt lại tiến trình học của bộ thẻ "${chosen.title}"?\n\n- ${chosen.count} thẻ của bộ thẻ này sẽ đưa về trạng thái "Mới".\n- Lịch sử ôn tập của bộ thẻ này sẽ bị xoá.\n\nNội dung file bộ thẻ (.sdeck) sẽ KHÔNG bị thay đổi.`;

    if (window.confirm(message)) {
      actions.resetProgress(selectedResetTarget);
    }
  }

  const element = h(
    'section',
    { class: 'panel settings-panel', style: 'margin-top: 24px;' },
    h('h2', null, 'Đặt lại tiến trình học tập (SRS)'),
    h(
      'p',
      { class: 'muted settings-help', style: 'margin-bottom: 18px;' },
      'Đặt lại tiến trình sẽ đưa các câu hỏi về trạng thái "Mới" ban đầu để bạn bắt đầu học lại từ đầu, không ảnh hưởng đến nội dung câu hỏi trong file .sdeck.'
    ),
    h(
      'div',
      { style: 'display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 20px;' },
      h(
        'div',
        {
          class: 'card',
          style:
            'flex: 1; min-width: 160px; padding: 14px 18px; background: var(--c-surface-2); border-radius: var(--radius-md); border: 1px solid var(--c-border);',
        },
        h('div', { class: 'eyebrow', style: 'font-size: 11px; margin-bottom: 4px;' }, 'THẺ ĐÃ HỌC CÓ TIẾN TRÌNH'),
        h('div', { style: 'font-size: 24px; font-weight: 700; color: var(--c-primary);' }, `${totalTrackedCards} thẻ`)
      ),
      h(
        'div',
        {
          class: 'card',
          style:
            'flex: 1; min-width: 160px; padding: 14px 18px; background: var(--c-surface-2); border-radius: var(--radius-md); border: 1px solid var(--c-border);',
        },
        h('div', { class: 'eyebrow', style: 'font-size: 11px; margin-bottom: 4px;' }, 'TỔNG LƯỢT ÔN TẬP ĐÃ LƯU'),
        h('div', { style: 'font-size: 24px; font-weight: 700; color: var(--c-text);' }, `${totalLogReviews} lượt`)
      )
    ),
    h(
      'div',
      { class: 'form-group', style: 'margin-bottom: 14px;' },
      h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, 'Chọn bộ thẻ muốn đặt lại'),
      h(
        'div',
        { style: 'display: flex; gap: 12px; align-items: center; flex-wrap: wrap;' },
        resetTargetSelect,
        h(
          'button',
          {
            type: 'button',
            class: 'ux-btn danger',
            onclick: handleResetProgress,
          },
          '🗑 Đặt lại tiến trình'
        )
      )
    ),
    h(
      'p',
      { class: 'muted', style: 'font-size: 12px; margin: 0;' },
      '💡 Mẹo: Bạn có thể chọn đặt lại cho một bộ thẻ riêng lẻ hoặc toàn bộ hệ thống. Thao tác cần xác nhận và không thể hoàn tác.'
    )
  );

  return {
    element,
  };
}

