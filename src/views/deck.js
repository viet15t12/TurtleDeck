// src/views/deck.js — Deck view: thông tin bộ thẻ, bảng item (rút gọn) và danh sách cảnh báo / mục bị bỏ qua.
import { h, shorten, fileName } from './dom.js';
import { toPlain } from '../core/richtext.js';
import { deckDueCounts } from '../core/planner.js';

const TYPE_LABEL = {
  single: '1 đáp án', multi: 'Nhiều đáp án', fill: 'Điền', command: 'Lệnh', card: 'Thẻ', vocab: 'Từ vựng',
};

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
        h('th', null, 'Đáp án / Nghĩa'), h('th', null, 'Chủ đề'), h('th', null, 'Tags'))),
      h('tbody', null, items.map((it, i) => {
        const s = summarize(it);
        return h('tr', null,
          h('td', { class: 'num' }, i + 1),
          h('td', null, h('span', { class: `chip type-${s.type}` }, TYPE_LABEL[s.type] ?? s.type)),
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
  const issues = entry.issues || [];
  const skipped = issues.filter(i => i.skipped).length;
  const counts = deckDueCounts(entry.deck, progress, Date.now(), {
    newCardsPerDay: settings?.newCardsPerDay,
  });
  const totalToday = counts.dueToday + counts.newToday;

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null,
        h('button', { class: 'btn ghost back', onclick: actions.home }, '← Về Home'),
        h('h1', null, meta.title,
          entry.path ? null : h('span', { class: 'badge unsaved' }, '● chưa lưu')),
        h('p', { class: 'deck-meta' },
          h('span', { class: 'chip' }, meta.kind),
          meta.lang ? h('span', { class: 'chip' }, meta.lang) : null,
          h('span', null, `${items.length} mục học được`),
          h('span', { class: `badge srs-counts ${counts.dueToday > 0 ? 'has-due' : ''}` },
            `Đến hạn hôm nay: ${counts.dueToday} / Thẻ mới: ${counts.newToday}`),
          skipped ? h('span', { class: 'error-text' }, `${skipped} mục bị bỏ qua`) : null,
          h('span', null, `${entry.assetCount ?? 0} ảnh`)),
        h('p', { class: 'deck-path' }, entry.path ? entry.path : `Nhập từ: ${entry.source}`)),
      h('div', { class: 'toolbar' },
        counts.total > 0 ? h('button', {
          class: 'btn primary',
          onclick: () => actions.startSrsSession(entry),
        }, totalToday > 0 ? `▶ Ôn hôm nay (${totalToday})` : '▶ Ôn hôm nay') : null,
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
