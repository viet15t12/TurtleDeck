// src/views/home.js — màn hình chính: mở / nhập bộ thẻ, danh sách bộ thẻ đã nạp, số thẻ đến hạn/mới, nút Ôn hôm nay.
import { h, fileName } from './dom.js';
import { KINDS, kindOf, kindLabel, modesFor } from '../core/deckkinds.js';
import { deckStats } from '../core/deckstats.js';

const countIssues = e => (e.issues || []).filter(i => i.level === 'warn' || i.level === 'error').length;

function deckRow(entry, { progress, settings }, actions) {
  const remove = h('button', { class: 'btn small ghost', title: 'Gỡ khỏi danh sách (không xoá file)',
    onclick: ev => { ev.stopPropagation(); actions.remove(entry); } }, 'Gỡ');

  if (entry.status === 'loading') {
    return h('li', { class: 'deck-row loading' },
      h('div', { class: 'deck-main' }, h('div', { class: 'deck-title' }, fileName(entry.path)), h('div', { class: 'deck-sub' }, 'Đang mở…')));
  }

  if (entry.status !== 'ok') {
    return h('li', { class: 'deck-row bad' },
      h('div', { class: 'deck-main' },
        h('div', { class: 'deck-title' }, fileName(entry.path) || 'Bộ thẻ'),
        h('div', { class: 'deck-sub error-text' }, entry.error || 'Không mở được bộ thẻ.'),
        entry.path ? h('div', { class: 'deck-path' }, entry.path) : null),
      h('div', { class: 'deck-actions' },
        entry.status !== 'missing' && entry.path ? h('button', { class: 'btn small', onclick: () => actions.reload(entry) }, 'Thử lại') : null,
        remove));
  }

  const { meta, items } = entry.deck;
  const kind = kindOf(entry.deck);
  const kInfo = KINDS[kind];
  const warn = countIssues(entry);
  const st = deckStats(entry.deck, progress, settings, Date.now());
  const dueToday = st.due + st.learning;
  const totalToday = dueToday + st.newLeftToday;
  const totalValid = st.new + st.learning + st.due + st.mastered;
  const modes = modesFor(kind);

  const studyMenu = h('div', { class: 'menu', hidden: true },
    ...modes.map(m => h('button', {
      class: 'menu-item',
      onclick: ev => {
        ev.stopPropagation();
        studyMenu.hidden = true;
        if (m.id === 'srs') actions.startSrsSession(entry);
        else if (m.id === 'all' || m.id === 'flashcards') actions.startSession(entry, { mode: m.id, count: items.length, shuffle: false, persist: true });
        else actions.openSessionSetup(entry);
      },
    },
      h('div', { style: 'font-weight: 600;' }, m.label),
      h('div', { class: 'muted', style: 'font-size: 12px;' }, m.description)))
  );

  const moreMenu = h('div', { class: 'menu', hidden: true },
    h('button', { class: 'menu-item', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.openEditor(entry); } }, '✏ Sửa bộ thẻ'),
    actions.openDeckInfoModal ? h('button', { class: 'menu-item', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.openDeckInfoModal(entry); } }, 'ℹ Thông tin bộ thẻ…') : null,
    h('button', { class: 'menu-item', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.duplicateDeck(entry); } }, '📄 Sao chép'),
    entry.path ? null : h('button', { class: 'menu-item', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.saveAs(entry); } }, '💾 Lưu thành .sdeck…'),
    h('button', { class: 'menu-item error-text', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.remove(entry); } }, '✕ Gỡ khỏi danh sách')
  );

  return h('li', { class: 'deck-row', tabindex: '0', role: 'button',
    title: entry.path || (entry.source ? `Nhập từ: ${entry.source}` : ''),
    onclick: () => actions.openDeckView(entry),
    onkeydown: ev => { if (ev.key === 'Enter') actions.openDeckView(entry); } },
    h('div', { class: 'deck-main' },
      h('div', { class: 'deck-title' },
        h('span', { class: 'ux-kind-badge', 'data-kind': kind, style: 'margin-right: 8px;' }, kInfo?.icon || '📝', kindLabel(kind)),
        meta.title,
        entry.path ? null : h('span', { class: 'badge unsaved' }, '● chưa lưu')),
      meta.description ? h('div', { class: 'muted', style: 'font-size: 13px; margin: 4px 0;' }, meta.description) : null,
      h('div', { class: 'deck-sub' },
        h('span', null, `${items.length} mục`),
        h('span', {
          class: `badge srs-counts ${dueToday > 0 ? 'has-due' : ''}`,
          title: `Mới: ${st.new} (còn hôm nay: ${st.newLeftToday}) · Đang học: ${st.learning} · Đến hạn: ${st.due} · Đã thuộc: ${st.mastered}`,
        }, `Mới ${st.new} · Đang học ${st.learning} · Đến hạn ${st.due} · Đã thuộc ${st.mastered}`),
        warn ? h('span', { class: 'badge warn', title: 'Số cảnh báo / mục bị bỏ qua' }, `⚠ ${warn} cảnh báo`) : null)),
    h('div', { class: 'deck-actions' },
      totalValid > 0 ? h('button', {
        class: `btn small ${totalToday > 0 ? 'primary' : ''}`,
        onclick: ev => { ev.stopPropagation(); actions.startSrsSession(entry); },
      }, totalToday > 0 ? `Ôn hôm nay · ${totalToday}` : 'Hôm nay đã xong ✓') : null,
      items.length ? h('div', { class: 'menu-wrap' },
        h('button', {
          class: 'btn small',
          onclick: ev => { ev.stopPropagation(); studyMenu.hidden = !studyMenu.hidden; },
        }, 'Học ▾'),
        studyMenu) : null,
      h('button', { class: 'btn small',
        onclick: ev => { ev.stopPropagation(); actions.openEditor(entry); } }, 'Sửa'),
      h('div', { class: 'menu-wrap' },
        h('button', { class: 'btn small ghost',
          onclick: ev => { ev.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; } }, '⋯'),
        moreMenu)));
}

export function renderHome(root, { entries, busy, progress, settings }, actions) {
  const importMenu = h('div', { class: 'menu', hidden: true },
    h('button', { class: 'menu-item', onclick: () => { importMenu.hidden = true; actions.importDeck('file'); } }, 'Từ file deck .json…'),
    h('button', { class: 'menu-item', onclick: () => { importMenu.hidden = true; actions.importDeck('dir'); } }, 'Từ thư mục (deck.json + img/)…'));

  const toolbar = h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', disabled: busy, onclick: actions.openNewDeckModal }, '+ Bộ thẻ mới'),
    h('button', { class: 'btn', disabled: busy, onclick: actions.openFiles }, 'Mở file…'),
    h('div', { class: 'menu-wrap' },
      h('button', { class: 'btn', disabled: busy, 'aria-haspopup': 'menu',
        onclick: ev => { ev.stopPropagation(); importMenu.hidden = !importMenu.hidden; } }, 'Nhập… ▾'),
      importMenu),
    h('button', { class: 'btn', disabled: busy, onclick: actions.openSettings }, '⚙ Cài đặt'));

  const list = entries.length
    ? h('ul', { class: 'deck-list' }, entries.map(e => deckRow(e, { progress, settings }, actions)))
    : h('div', { class: 'empty' },
        h('p', null, 'Chưa có bộ thẻ nào.'),
        h('p', { class: 'muted' }, 'Bấm "Mở file…" để chọn file .sdeck, hoặc "Nhập…" để chuyển một deck .json / thư mục thành .sdeck.'));

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'STUDY APP'), h('h1', null, 'Bộ thẻ của bạn')),
      toolbar),
    list);
}
