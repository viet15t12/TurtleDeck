// src/views/components/deckcard.js — Hiển thị thẻ bộ thẻ (Deck Card) với thông tin thư mục, liên kết và kéo thả
import { h, fileName } from '../dom.js';
import { KINDS, kindOf, kindLabel, modesFor } from '../../core/deckkinds.js';
import { renderStackedBar } from './stackedbar.js';
import { makeDeckDraggable } from './dragdrop.js';

const countIssues = e => (e.issues || []).filter(i => i.level === 'warn' || i.level === 'error').length;

function closeAllDropdowns(except) {
  document.querySelectorAll('.menu, .ux-popover[data-dropdown]').forEach(el => {
    if (el !== except) el.hidden = true;
  });
}

export function renderDeckCard(entry, st, actions, options = {}) {
  const removeBtn = entry.inLibrary ? null : h('button', {
    type: 'button',
    class: 'ux-btn sm ghost danger-hover',
    title: 'Gỡ khỏi danh sách (không xoá file)',
    onclick: ev => { ev.stopPropagation(); actions.remove(entry); },
  }, 'Gỡ');

  if (entry.status === 'loading') {
    return h('article', { class: 'deck-card loading', title: entry.path || '' },
      h('div', { class: 'deck-card-head' },
        h('span', { class: 'ux-chip' }, 'Đang mở…')),
      h('div', { class: 'deck-card-title' }, fileName(entry.path) || 'Bộ thẻ'),
      h('div', { class: 'muted', style: 'font-size: 13px;' }, 'Đang đọc dữ liệu bộ thẻ…'));
  }

  if (entry.status !== 'ok') {
    return h('article', { class: 'deck-card bad', title: entry.path || '' },
      h('div', { class: 'deck-card-head' },
        h('span', { class: 'ux-chip danger' }, entry.status === 'missing' ? 'Không tìm thấy file' : 'Lỗi đọc bộ thẻ')),
      h('div', { class: 'deck-card-title' }, fileName(entry.path) || 'Bộ thẻ'),
      h('div', { class: 'error-text', style: 'font-size: 13px;' }, entry.error || 'Không mở được bộ thẻ.'),
      h('div', { class: 'deck-card-footer' },
        entry.status !== 'missing' && entry.path
          ? h('button', { type: 'button', class: 'ux-btn sm', onclick: ev => { ev.stopPropagation(); actions.reload(entry); } }, 'Thử lại')
          : null,
        removeBtn));
  }

  const { meta, items } = entry.deck;
  const kind = kindOf(entry.deck);
  const kInfo = KINDS[kind];
  const warn = countIssues(entry);
  const dueToday = st.due + st.learning;
  const totalToday = dueToday + st.newLeftToday;
  const totalValid = st.new + st.learning + st.due + st.mastered;
  const modes = modesFor(kind);

  const isLink = Boolean(entry.isLink || options.location?.isLink);
  const folderPath = options.folderPath || entry.folderPath || entry.group;

  const studyMenu = h('div', { class: 'ux-popover', 'data-dropdown': '1', hidden: true, style: 'min-width: 250px;' },
    ...modes.map(m => h('button', {
      type: 'button',
      class: 'ux-popover-item deck-mode-menu-item',
      onclick: ev => {
        ev.stopPropagation();
        studyMenu.hidden = true;
        if (m.id === 'srs') actions.startSrsSession(entry);
        else if (m.id === 'learn') actions.startLearnSession(entry);
        else if (m.id === 'match') actions.startMatchSession(entry);
        else if (m.id === 'exam') actions.openSessionSetup(entry, { defaultMode: 'exam' });
        else if (m.id === 'all' || m.id === 'flashcards') {
          actions.startSession(entry, { mode: m.id, count: items.length, shuffle: false, persist: true });
        } else {
          actions.openSessionSetup(entry, { defaultMode: m.id });
        }
      },
    },
      h('div', null,
        h('div', { style: 'font-weight: 600; color: var(--c-text);' }, m.label),
        h('div', { class: 'muted', style: 'font-size: 12px; line-height: 1.35; margin-top: 2px;' }, m.description))))
  );

  const moreMenu = h('div', { class: 'ux-popover align-right', 'data-dropdown': '1', hidden: true, style: 'min-width: 220px;' },
    entry.path ? h('button', {
      type: 'button',
      class: 'ux-popover-item',
      title: entry.path,
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.showInFolder?.(entry); },
    }, '📂 Hiện trong thư mục') : null,

    // Thao tác di chuyển & tạo liên kết folder
    actions.onMoveDeck ? h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.onMoveDeck(entry); },
    }, '📦 Di chuyển vào thư mục…') : null,

    actions.onLinkDeck ? h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.onLinkDeck(entry); },
    }, '🔗 Tạo liên kết trong thư mục…') : null,

    isLink && actions.onUnlinkDeck ? h('button', {
      type: 'button',
      class: 'ux-popover-item text-danger',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.onUnlinkDeck(entry); },
    }, '✕ Xoá liên kết này') : null,

    h('div', { class: 'ux-popover-sep' }),

    entry.path ? h('button', {
      type: 'button',
      class: 'ux-popover-item',
      title: 'Xuất bản sao file .sdeck sang nơi khác và giữ nguyên mã bộ thẻ',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.exportCopy?.(entry); },
    }, '📤 Xuất bản sao…') : null,
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.duplicateDeck(entry); },
    }, '📄 Nhân đôi (Bản sao mới)'),
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.openDeckInfoModal?.(entry); },
    }, 'ℹ Thông tin bộ thẻ…'),
    entry.path ? null : h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.saveAs(entry); },
    }, '💾 Lưu thành .sdeck…'),
    entry.inLibrary ? null : h('div', { class: 'ux-popover-sep' }),
    entry.inLibrary ? null : h('button', {
      type: 'button',
      class: 'ux-popover-item danger',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.remove(entry); },
    }, '✕ Gỡ khỏi danh sách')
  );

  const tooltip = entry.path
    ? `${meta.title} — ${entry.path}`
    : (entry.source ? `${meta.title} (Nhập từ: ${entry.source})` : meta.title);

  const card = h('article', {
    class: 'deck-card',
    'data-kind': kind,
    tabindex: '0',
    role: 'button',
    title: tooltip,
    onclick: () => actions.openDeckView(entry),
    onkeydown: ev => {
      if (ev.target === ev.currentTarget && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        actions.openDeckView(entry);
      }
    },
  },
    h('div', { class: 'deck-card-head' },
      h('div', { class: 'deck-card-badges' },
        h('span', { class: 'ux-kind-badge', 'data-kind': kind }, kInfo?.icon || '📝', kindLabel(kind)),
        folderPath ? h('span', { class: 'ux-chip folder-chip', style: 'cursor: default; font-size: 11px;' }, `📁 ${folderPath}`) : null,
        isLink ? h('span', { class: 'ux-chip link-chip', title: `Liên kết tới: ${entry.linkTarget || 'file gốc'}` }, '🔗 Liên kết') : null,
        entry.path ? null : h('span', { class: 'badge unsaved' }, '● chưa lưu'),
        warn ? h('span', { class: 'ux-chip warn', title: `${warn} cảnh báo trong bộ thẻ` }, `⚠ ${warn}`) : null),
      h('div', { class: 'menu-wrap', onclick: ev => ev.stopPropagation() },
        h('button', {
          type: 'button',
          class: 'ux-icon-btn',
          title: 'Tác vụ khác',
          'aria-label': 'Tác vụ khác',
          onclick: ev => {
            ev.stopPropagation();
            const willOpen = moreMenu.hidden;
            closeAllDropdowns(moreMenu);
            moreMenu.hidden = !willOpen;
          },
        }, '⋯'),
        moreMenu)),

    h('div', { class: 'deck-card-body' },
      h('h3', { class: 'deck-card-title' }, meta.title),
      meta.description
        ? h('p', { class: 'deck-card-desc' }, meta.description)
        : null),

    h('div', { class: 'deck-card-progress' },
      renderStackedBar(st),
      h('div', { class: 'deck-stats-legend' },
        h('span', { class: 'stat-dot new' }, `Mới ${st.new}`),
        h('span', { class: 'stat-sep' }, '·'),
        h('span', { class: 'stat-dot learning' }, `Đang học ${st.learning}`),
        h('span', { class: 'stat-sep' }, '·'),
        h('span', { class: `stat-dot due ${st.due > 0 ? 'has-due' : ''}` }, `Đến hạn ${st.due}`),
        h('span', { class: 'stat-sep' }, '·'),
        h('span', { class: 'stat-dot mastered' }, `Đã thuộc ${st.mastered}`))),

    h('div', { class: 'deck-card-footer', onclick: ev => ev.stopPropagation() },
      totalValid > 0
        ? (totalToday > 0
            ? h('button', {
                type: 'button',
                class: 'ux-btn primary deck-primary-btn',
                onclick: ev => { ev.stopPropagation(); actions.startSrsSession(entry); },
              }, `Ôn hôm nay · ${totalToday}`)
            : h('button', {
                type: 'button',
                class: 'ux-btn deck-done-btn',
                disabled: true,
                title: 'Bạn đã hoàn thành lịch ôn và hạn mức thẻ mới hôm nay của bộ thẻ này',
              }, 'Hôm nay đã xong ✓'))
        : h('button', {
            type: 'button',
            class: 'ux-btn deck-done-btn',
            disabled: true,
          }, 'Chưa có mục hợp lệ'),
      items.length > 0 ? h('div', { class: 'menu-wrap' },
        h('button', {
          type: 'button',
          class: 'ux-btn',
          onclick: ev => {
            ev.stopPropagation();
            const willOpen = studyMenu.hidden;
            closeAllDropdowns(studyMenu);
            studyMenu.hidden = !willOpen;
          },
        }, 'Học ▾'),
        studyMenu) : null,
      h('button', {
        type: 'button',
        class: 'ux-btn',
        onclick: ev => { ev.stopPropagation(); actions.openEditor(entry); },
      }, 'Sửa'))
  );

  const deckId = entry.deck?.meta?.id;
  if (deckId) {
    makeDeckDraggable(card, deckId);
  }

  return card;
}

