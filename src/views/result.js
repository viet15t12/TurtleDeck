// src/views/result.js — Màn hình Kết quả phiên học (Result view, GĐ3B §6).
// Hiển thị vòng tròn điểm, thời gian, dự kiến lịch ôn tiếp theo, hành động và danh sách câu sai.
import { h } from './dom.js';
import { cardKey, DAY, MINUTE, RATING } from '../core/srs.js';
import { makeRich } from '../core/richtext.js';
import { attachImageHandlers } from './components/lightbox.js';
import { applyCardOverride } from '../core/progressio.js';

function richEl(tag, attrs, htmlContent) {
  const el = h(tag, attrs);
  el.innerHTML = htmlContent;
  return el;
}

export function formatDurationMs(totalMs) {
  const totalSec = Math.max(1, Math.round((totalMs || 0) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins === 0) return `${secs} giây`;
  return `${mins} phút ${secs} giây`;
}

export function formatNextIntervalText(card, now) {
  if (!card || !card.due) return '1 phút';
  const diffMs = Math.max(0, card.due - now);
  if (card.state === 'learning' || card.state === 'relearning') {
    const mins = Math.max(1, Math.round(diffMs / MINUTE));
    return `${mins} phút`;
  }
  const days = Math.max(1, card.interval || Math.round(diffMs / DAY));
  return `${days} ngày`;
}

export function computeNextDueSummary(deck, progress, now) {
  const deckId = deck?.meta?.id || 'deck';
  const cards = progress?.cards || {};
  const items = deck?.items || [];
  const scheduled = [];

  for (const it of items) {
    if (!it?.id) continue;
    const c = cards[cardKey(deckId, it.id, 'fwd')] || cards[it.id];
    if (c && c.state !== 'new' && Number.isFinite(c.due) && c.due > 0) {
      scheduled.push(c);
    }
  }

  if (!scheduled.length) {
    return 'Thẻ kế tiếp đến hạn: ngày mai (0 thẻ)';
  }

  let minBucketDays = Infinity;
  const bucketCounts = new Map();

  for (const c of scheduled) {
    const diffMs = c.due - now;
    const days = diffMs <= 0 ? 0 : Math.max(1, Math.ceil(diffMs / DAY));
    if (days < minBucketDays) minBucketDays = days;
    bucketCounts.set(days, (bucketCounts.get(days) || 0) + 1);
  }

  const count = bucketCounts.get(minBucketDays) || 1;
  if (minBucketDays === 0) {
    return `Thẻ kế tiếp đến hạn: hôm nay (${count} thẻ)`;
  }
  if (minBucketDays === 1) {
    return `Thẻ kế tiếp đến hạn: ngày mai (${count} thẻ)`;
  }
  return `Thẻ kế tiếp đến hạn: sau ${minBucketDays} ngày (${count} thẻ)`;
}

export function createScoreRingSvg(pct) {
  const size = 128;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, pct)) / 100) * c;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('class', 'result-ring-svg');

  const bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bgCircle.setAttribute('cx', String(size / 2));
  bgCircle.setAttribute('cy', String(size / 2));
  bgCircle.setAttribute('r', String(r));
  bgCircle.setAttribute('fill', 'none');
  bgCircle.setAttribute('stroke', 'var(--c-surface-3)');
  bgCircle.setAttribute('stroke-width', String(stroke));

  const fgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fgCircle.setAttribute('cx', String(size / 2));
  fgCircle.setAttribute('cy', String(size / 2));
  fgCircle.setAttribute('r', String(r));
  fgCircle.setAttribute('fill', 'none');
  fgCircle.setAttribute('stroke', pct >= 80 ? 'var(--c-ok)' : pct >= 50 ? 'var(--c-primary)' : 'var(--c-warn)');
  fgCircle.setAttribute('stroke-width', String(stroke));
  fgCircle.setAttribute('stroke-linecap', 'round');
  fgCircle.setAttribute('stroke-dasharray', String(c));
  fgCircle.setAttribute('stroke-dashoffset', String(offset));
  fgCircle.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);

  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  text.setAttribute('x', '50%');
  text.setAttribute('y', '52%');
  text.setAttribute('dominant-baseline', 'middle');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('class', 'result-ring-text');
  text.textContent = `${pct}%`;

  svg.append(bgCircle, fgCircle, text);
  return svg;
}

function itemTypeLabel(kind) {
  switch (kind) {
    case 'card': return 'Thẻ';
    case 'single': return 'Trắc nghiệm';
    case 'multi': return 'Nhiều đáp án';
    case 'fill': return 'Điền';
    case 'command': return 'Lệnh';
    case 'vocab': return 'Từ vựng';
    default: return 'Mục';
  }
}

function choiceText(c) {
  if (c == null) return '';
  if (typeof c === 'string') return c;
  return c.text || '';
}

function buildAcceptedAnswerChips(q, rich) {
  const chips = [];
  const seen = new Set();
  if (q.answerDisplay && String(q.answerDisplay).trim()) {
    chips.push(richEl('span', { class: 'answer-chip correct-chip' }, rich.inline(String(q.answerDisplay))));
    seen.add(String(q.answerDisplay).trim().toLowerCase());
  }
  const list = Array.isArray(q.answers) ? q.answers : (q.answer ? [q.answer] : []);
  for (const a of list) {
    const s = String(a).trim();
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    chips.push(richEl('span', { class: 'answer-chip' }, rich.inline(s)));
  }
  if (!chips.length) {
    chips.push(h('span', { class: 'answer-chip muted' }, '(không có đáp án mẫu)'));
  }
  return chips;
}

export function renderResult(root, { entry, config, history = [], progress, settings, isTrial }, actions) {
  const rich = makeRich(entry.deckKey);
  const total = history.length;
  const correct = history.filter(h => h.grade.ok && !h.grade.near).length;
  const near = history.filter(h => h.grade.ok && h.grade.near).length;
  const wrong = history.filter(h => !h.grade.ok).length;
  const pct = total ? Math.round(((correct + near) / total) * 100) : 100;
  const totalMs = history.reduce((acc, h) => acc + (h.ms || 0), 0);
  const wrongItems = history.filter(h => !h.grade.ok);
  const uniqueWrongIds = [...new Set(wrongItems.map(h => h.question.id))];
  const nextDueMsg = computeNextDueSummary(entry.deck, progress, Date.now());

  const trialBanner = isTrial
    ? h('div', { class: 'trial-banner' },
        h('span', { class: 'trial-badge' }, 'HỌC THỬ'),
        h('span', null, 'Phiên học thử từ Editor — kết quả và tiến độ không được ghi vào hệ thống.'))
    : null;

  root.replaceChildren(
    h('div', { class: 'session-container' },
      trialBanner,
      h('header', { class: 'page-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, 'KẾT QUẢ PHIÊN HỌC'),
          h('h1', null, entry.deck.meta.title))),

      h('div', { class: 'result-card panel' },
        h('div', { class: 'result-hero' },
          createScoreRingSvg(pct),
          h('div', { class: 'result-stats-grid' },
            h('div', { class: 'result-stat-box' },
              h('div', { class: 'result-stat-label' }, 'Đúng / Tổng'),
              h('div', { class: 'result-stat-value ok-text' }, `${correct + near} / ${total}`),
              near ? h('div', { class: 'muted', style: 'font-size: 12px;' }, `Trong đó gần đúng: ${near}`) : null),
            h('div', { class: 'result-stat-box' },
              h('div', { class: 'result-stat-label' }, 'Thời gian'),
              h('div', { class: 'result-stat-value' }, formatDurationMs(totalMs))),
            h('div', { class: 'result-stat-box' },
              h('div', { class: 'result-stat-label' }, 'Cần ôn lại'),
              h('div', { class: `result-stat-value ${uniqueWrongIds.length ? 'error-text' : ''}` }, `${uniqueWrongIds.length} mục`)))),

        h('div', { class: 'result-next-due-banner' },
          h('span', null, '📅 '),
          h('span', null, nextDueMsg)),

        pct === 100
          ? h('div', { class: 'success-banner' }, '🎉 Xuất sắc! Bạn đã hoàn thành chính xác toàn bộ câu hỏi.')
          : null,

        h('div', { class: 'result-actions toolbar' },
          uniqueWrongIds.length
            ? h('button', {
                type: 'button',
                class: 'ux-btn primary',
                onclick: () => actions.startSession(entry, { ...config, mode: 'custom', itemIds: uniqueWrongIds }),
              }, `↻ Học lại câu sai (${uniqueWrongIds.length})`)
            : null,
          h('button', {
            type: 'button',
            class: uniqueWrongIds.length ? 'ux-btn' : 'ux-btn primary',
            onclick: actions.home,
          }, 'Về trang chủ'),
          h('button', {
            type: 'button',
            class: 'ux-btn',
            onclick: () => actions.openDeckView(entry),
          }, 'Về bộ thẻ'),
          h('button', {
            type: 'button',
            class: 'ux-btn ghost',
            onclick: () => actions.startSession(entry, config),
          }, 'Học lại phiên này'))),

      wrongItems.length ? h('div', { class: 'wrong-list panel' },
        h('h2', null, `Danh sách câu sai — bấm để xem lại (${wrongItems.length})`),
        h('div', { class: 'wrong-items' }, wrongItems.map((item, idx) => {
          const q = item.question;
          const userStr = q.kind === 'single'
            ? choiceText(q.choices[item.userAnswer])
            : q.kind === 'multi'
              ? (item.userAnswer || []).map(i => choiceText(q.choices[i])).join(' · ') || '(để trống)'
              : q.kind === 'card'
                ? 'Chưa nhớ'
                : String(item.userAnswer || '(để trống)');

          const acceptedChips = (q.kind === 'fill' || q.kind === 'command')
            ? buildAcceptedAnswerChips(q, rich)
            : (q.kind === 'single' || q.kind === 'multi')
              ? q.answers.map(i => richEl('span', { class: 'answer-chip correct-chip' }, rich.inline(choiceText(q.choices[i]))))
              : [richEl('span', { class: 'answer-chip correct-chip' }, rich.inline(q.back || ''))];

          return h('details', { class: 'wrong-item-box', open: idx === 0 },
            h('summary', { class: 'wrong-item-summary' },
              h('span', { class: `chip type-badge type-${q.kind}` }, itemTypeLabel(q.kind)),
              q.topic ? h('span', { class: 'ux-chip' }, q.topic) : null,
              richEl('span', { class: 'wrong-item-title' }, rich.inline(q.prompt || q.front || '')),
              h('span', { class: 'muted', style: 'margin-left: auto; font-size: 12px;' }, 'Xem chi tiết ▾')),
            h('div', { class: 'wrong-item-body' },
              h('div', { class: 'feedback-compare-grid' },
                h('div', { class: 'feedback-compare-col' },
                  h('div', { class: 'feedback-col-label' }, 'Bạn trả lời'),
                  h('div', { class: 'answer-chips-wrap' },
                    h('span', { class: 'answer-chip wrong-chip' }, userStr))),
                h('div', { class: 'feedback-compare-col' },
                  h('div', { class: 'feedback-col-label' }, 'Đáp án đúng'),
                  h('div', { class: 'answer-chips-wrap' }, ...acceptedChips))),
              q.explanation
                ? h('div', { class: 'explanation-box' },
                    h('h4', null, 'Giải thích'),
                    richEl('div', { class: 'explanation-body' }, rich.html(q.explanation)))
                : null,
              h('div', { style: 'margin-top: 10px; display: flex; justify-content: flex-end;' },
                h('button', {
                  type: 'button',
                  class: 'ux-btn sm',
                  title: 'Chấm lại câu này là Đúng và cập nhật điểm phiên học',
                  onclick: async () => {
                    const now = Date.now();
                    const cKey = item.cardKey || cardKey(entry.deck.meta.id, q.id, q.direction || 'fwd');
                    const { nextCard, overrideLogEntry } = applyCardOverride(
                      item.prevState,
                      item.logEntry || { t: now, card: cKey, ms: item.ms || 0 },
                      now,
                      { learnSteps: settings?.learnSteps }
                    );
                    if (!progress.cards) progress.cards = {};
                    progress.cards[cKey] = nextCard;
                    if (!Array.isArray(progress.log)) progress.log = [];
                    progress.log.push(overrideLogEntry);

                    if (!isTrial) {
                      await window.api.saveProgress(progress);
                    }

                    item.grade = { ok: true, near: false, rating: RATING.GOOD, overridden: true };
                    renderResult(root, { entry, config, history, progress, settings, isTrial }, actions);
                  },
                }, '✓ Tôi chấm lại là đúng'))));
        }))) : null)
  );

  attachImageHandlers(root);
}
