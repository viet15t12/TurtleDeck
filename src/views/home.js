// src/views/home.js — màn hình chính: mở / nhập bộ thẻ, danh sách bộ thẻ đã nạp.
import { h, fileName } from './dom.js';

const countIssues = e => (e.issues || []).filter(i => i.level === 'warn' || i.level === 'error').length;

function deckRow(entry, actions) {
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
  const warn = countIssues(entry);

  const moreMenu = h('div', { class: 'menu', hidden: true },
    h('button', { class: 'menu-item', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.openEditor(entry); } }, '✏ Sửa bộ thẻ'),
    h('button', { class: 'menu-item', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.duplicateDeck(entry); } }, '📄 Sao chép'),
    entry.path ? null : h('button', { class: 'menu-item', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.saveAs(entry); } }, '💾 Lưu thành .sdeck…'),
    h('button', { class: 'menu-item error-text', onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.remove(entry); } }, '✕ Gỡ khỏi danh sách')
  );

  return h('li', { class: 'deck-row', tabindex: '0', role: 'button',
    onclick: () => actions.openDeckView(entry),
    onkeydown: ev => { if (ev.key === 'Enter') actions.openDeckView(entry); } },
    h('div', { class: 'deck-main' },
      h('div', { class: 'deck-title' }, meta.title,
        entry.path ? null : h('span', { class: 'badge unsaved' }, '● chưa lưu')),
      h('div', { class: 'deck-sub' },
        h('span', null, `${items.length} mục`),
        h('span', { class: 'chip' }, meta.kind),
        warn ? h('span', { class: 'badge warn', title: 'Số cảnh báo / mục bị bỏ qua' }, `⚠ ${warn} cảnh báo`) : null),
      h('div', { class: 'deck-path' }, entry.path || `Nhập từ: ${entry.source}`)),
    h('div', { class: 'deck-actions' },
      items.length ? h('button', { class: 'btn small primary',
        onclick: ev => { ev.stopPropagation(); actions.openSessionSetup(entry); } }, 'Học') : null,
      h('button', { class: 'btn small',
        onclick: ev => { ev.stopPropagation(); actions.openEditor(entry); } }, 'Sửa'),
      h('div', { class: 'menu-wrap' },
        h('button', { class: 'btn small ghost',
          onclick: ev => { ev.stopPropagation(); moreMenu.hidden = !moreMenu.hidden; } }, '⋯'),
        moreMenu)));
}

export function renderHome(root, { entries, busy }, actions) {
  const importMenu = h('div', { class: 'menu', hidden: true },
    h('button', { class: 'menu-item', onclick: () => { importMenu.hidden = true; actions.importDeck('file'); } }, 'Từ file deck .json…'),
    h('button', { class: 'menu-item', onclick: () => { importMenu.hidden = true; actions.importDeck('dir'); } }, 'Từ thư mục (deck.json + img/)…'));

  const toolbar = h('div', { class: 'toolbar' },
    h('button', { class: 'btn primary', disabled: busy, onclick: actions.openNewDeckModal }, '+ Bộ thẻ mới'),
    h('button', { class: 'btn', disabled: busy, onclick: actions.openFiles }, 'Mở file…'),
    h('div', { class: 'menu-wrap' },
      h('button', { class: 'btn', disabled: busy, 'aria-haspopup': 'menu',
        onclick: ev => { ev.stopPropagation(); importMenu.hidden = !importMenu.hidden; } }, 'Nhập… ▾'),
      importMenu));

  const list = entries.length
    ? h('ul', { class: 'deck-list' }, entries.map(e => deckRow(e, actions)))
    : h('div', { class: 'empty' },
        h('p', null, 'Chưa có bộ thẻ nào.'),
        h('p', { class: 'muted' }, 'Bấm "Mở file…" để chọn file .sdeck, hoặc "Nhập…" để chuyển một deck .json / thư mục thành .sdeck.'));

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null, h('p', { class: 'eyebrow' }, 'STUDY APP'), h('h1', null, 'Bộ thẻ của bạn')),
      toolbar),
    list);
}
