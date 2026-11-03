// src/views/session/feedback/banner.js — Render banner trạng thái kết quả trả lời (Đúng / Sai / Gần đúng)

import { h } from '../../dom.js';
import { RATING } from '../../../core/srs.js';
import { RATING_VN_LABELS } from '../labels.js';

export function renderFeedbackBanner(session, q) {
  const g = session.grade || { ok: false, near: false };
  const waitText = session.nextIntervalText || '1 phút';

  let bannerClass = 'feedback-banner ';
  let icon = '';
  let title = '';

  if (q.kind === 'card' && g.rating) {
    if (g.rating === RATING.AGAIN) {
      bannerClass += 'feedback-wrong';
      icon = '↻';
      title = `Đã chọn: ${RATING_VN_LABELS[g.rating]} — Sẽ hỏi lại sau ~${waitText}`;
    } else {
      bannerClass += 'feedback-ok';
      icon = '✓';
      title = `Đã chọn: ${RATING_VN_LABELS[g.rating]} — Hỏi lại sau ${waitText}`;
    }
  } else if (g.ok && !g.near) {
    bannerClass += 'feedback-ok';
    icon = '✓';
    title = `Chính xác! — Hỏi lại sau ${waitText}`;
  } else if (g.ok && g.near) {
    bannerClass += 'feedback-near';
    icon = '≈';
    const standardAns = q.answerDisplay || (q.answers && q.answers[0]) || '';
    title = `Gần đúng — chú ý chính tả: ${standardAns} · Hỏi lại sau ${waitText}`;
  } else {
    bannerClass += 'feedback-wrong';
    icon = '✕';
    title = `Chưa chính xác — Sẽ hỏi lại sau ~${waitText}`;
  }

  return h(
    'div',
    { class: bannerClass },
    h('span', { class: 'feedback-icon' }, icon),
    h('span', { class: 'feedback-text' }, title)
  );
}
