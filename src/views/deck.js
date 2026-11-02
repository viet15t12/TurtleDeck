// src/views/deck.js — Deck view: thông tin bộ thẻ, bảng item (rút gọn) và danh sách cảnh báo / mục bị bỏ qua.
import { h, shorten, fileName } from './dom.js';
import { toPlain } from '../core/richtext.js';
import { KINDS, kindOf, kindLabel, itemTypeLabel, mismatchedItems, formatMismatchWarning } from '../core/deckkinds.js';
import { deckStats } from '../core/deckstats.js';

const choiceText = c => typeof c === 'string' ? c : [c?.text, c?.image ? `[ảnh ${c.image}]` : ''].filter(Boolean).join(' ');

// nội dung chính + đáp án của item, dạng văn bản thuần rút gọn
function summarize(it) {
  const type = it.type ?? 'vocab';
  switch (type) {
    case 'single': case 'multi':
      return { type, main: toPlain(it.question), answer: toPlain((it.answer || []).map(i => choiceText(it.choices?.[i])).join(' · ')) };
    case 'fill': case 'command':
      return { type, main: toPlain(it.question), answer: toPlain(it.answerDisplay || (it.answer || []).join(' | ')) };
    case 'card':
      return { type, main: toPlain(it.front), answer: toPlain(it.back) };
    default:
      return { type: 'vocab', main: toPlain(it.term), answer: toPlain(it.definition) };
  }
}

function itemTable(items) {
  if (!items.length) return h('p', { class: 'muted' }, 'Không có mục nào học được.');
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'items' },
      h('thead', null, h('tr', null,
        h('th', { class: 'num' }, '#'), h('th', null, 'Dạng'), h('th', null, 'Câu hỏi / Từ'),
        h('th', null, 'Đáp án / Nghĩa'), h('th', null, 'Chủ đề'), h('th', null, 'Nhãn'))),
      h('tbody', null, items.map((it, i) => {
        const s = summarize(it);
        return h('tr', null,
          h('td', { class: 'num' }, i + 1),
          h('td', null, h('span', { class: `chip type-${s.type}` }, itemTypeLabel(s.type))),
          h('td', { title: String(s.main ?? '') }, shorten(s.main)),
          h('td', { class: 'muted', title: String(s.answer ?? '') }, shorten(s.answer, 60)),
          h('td', null, it.topic ?? ''),
          h('td', null, (it.tags || []).map(t => h('span', { class: 'tag' }, t))));
      }))));
}

function issueList(issues) {
  if (!issues.length) return h('p', { class: 'muted' }, 'Không có cảnh báo.');
  const sorted = [...issues].sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1));
  return h('ul', { class: 'issues' }, sorted.map(i =>
    h('li', { class: `issue ${i.level}` },
      h('span', { class: 'issue-icon' }, i.level === 'error' ? '✕' : '⚠'),
      h('span', null,
        i.itemId && !i.skipped ? h('code', null, i.itemId) : null,
        i.itemId && !i.skipped ? ' ' : null,
        i.msg))));
}

export function renderDeck(root, entry, actions, { progress, settings } = {}) {
  const { meta, items } = entry.deck;
  const kind = kindOf(entry.deck);
  const kInfo = KINDS[kind];
  const rawIssues = entry.issues || [];
  const mismatched = mismatchedItems(entry.deck);
  const hasMismatchInIssues = rawIssues.some(i => i.mismatch || (i.msg && i.msg.includes('nằm trong bộ')));
  const issues = (!hasMismatchInIssues && mismatched.length > 0)
    ? [...rawIssues, { level: 'warn', mismatch: true, msg: formatMismatchWarning(entry.deck) }]
    : rawIssues;

  const skipped = issues.filter(i => i.skipped).length;
  const st = deckStats(entry.deck, progress, settings, Date.now());
  const dueToday = st.due + st.learning;
  const totalToday = dueToday + st.newLeftToday;
  const totalValid = st.new + st.learning + st.due + st.mastered;

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null,
        h('button', { class: 'btn ghost back', onclick: actions.home }, '← Về trang chủ'),
        h('h1', null,
          h('span', { class: 'ux-kind-badge', 'data-kind': kind, style: 'margin-right: 10px; vertical-align: middle;' }, kInfo?.icon || '📝', kindLabel(kind)),
          meta.title,
          entry.path ? null : h('span', { class: 'badge unsaved' }, '● chưa lưu')),
        meta.description ? h('p', { class: 'muted', style: 'margin: 4px 0 8px;' }, meta.description) : null,
        h('p', { class: 'deck-meta' },
          h('span', null, `${items.length} mục học được`),
          h('span', { class: `badge srs-counts ${dueToday > 0 ? 'has-due' : ''}` },
            `Mới ${st.new} (hôm nay ${st.newLeftToday}) · Đang học ${st.learning} · Đến hạn ${st.due} · Đã thuộc ${st.mastered}`),
          skipped ? h('span', { class: 'error-text' }, `${skipped} mục bị bỏ qua`) : null,
          h('span', null, `${entry.assetCount ?? 0} ảnh`))),
      h('div', { class: 'toolbar' },
        totalValid > 0 ? h('button', {
          class: 'btn primary',
          onclick: () => actions.startSrsSession(entry),
        }, totalToday > 0 ? `▶ Ôn hôm nay · ${totalToday}` : '▶ Ôn hôm nay') : null,
        items.length ? h('button', { class: 'btn', onclick: () => actions.openSessionSetup(entry) }, 'Học tuỳ chọn') : null,
        h('button', { class: 'btn', onclick: () => actions.openEditor(entry) }, '✏ Sửa bộ thẻ'),
        entry.path ? null : h('button', { class: 'btn', onclick: () => actions.saveAs(entry) }, 'Lưu thành .sdeck…'),
        h('button', { class: 'btn ghost', onclick: () => actions.remove(entry) }, 'Gỡ khỏi danh sách'))),
    h('section', { class: 'panel' },
      h('h2', null, `Cảnh báo / mục bị bỏ qua (${issues.length})`),
      issueList(issues)),
    h('section', { class: 'panel' },
      h('h2', null, `Các mục (${items.length})`),
      itemTable(items)));
  root.ownerDocument.title = `${meta.title} — ${fileName(entry.path) || 'Study App'}`;
}
