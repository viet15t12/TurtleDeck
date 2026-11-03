// src/views/session/feedback/actions-bar.js — Thanh hành động gắn sao mục và nút "Tôi chấm lại là đúng"

import { h } from '../../dom.js';

export function renderFeedbackActionsBar(ctx) {
  const { session, getCurrentMeta, toggleStar, handleOverride } = ctx;
  const g = session.grade || { ok: false, near: false };
  const metaItem = getCurrentMeta();
  const isOverridden = Boolean(g.overridden);
  const canOverride = (!g.ok || g.near) && !isOverridden;

  const starBtn = h(
    'button',
    {
      type: 'button',
      class: `star-btn ${metaItem.starred ? 'starred' : ''}`,
      title: metaItem.starred ? 'Bỏ gắn sao (phím S hoặc Alt+S khi gõ)' : 'Gắn sao mục này (phím S hoặc Alt+S khi gõ)',
      onclick: toggleStar,
    },
    metaItem.starred ? '★ Đã gắn sao' : '☆ Gắn sao'
  );

  const overrideBtn = canOverride
    ? h(
        'button',
        {
          type: 'button',
          class: 'ux-btn sm',
          style: 'margin-left: auto;',
          title: 'Chấm lại câu này là Đúng và cập nhật lịch ôn tập',
          onclick: handleOverride,
        },
        '✓ Tôi chấm lại là đúng'
      )
    : isOverridden
      ? h('span', { class: 'chip ok-text', style: 'margin-left: auto; font-size: 12px;' }, '✓ Đã chấm lại thành Đúng')
      : null;

  return h(
    'div',
    {
      style:
        'display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding: 6px 0; border-top: 1px solid var(--c-border);',
    },
    starBtn,
    overrideBtn
  );
}
