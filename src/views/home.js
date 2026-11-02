// src/views/home.js — Màn hình chính (GĐ3B Lượt 2): dải Hôm nay, lọc/tìm/sắp xếp, lưới thẻ bộ thẻ,
// thanh tiến độ xếp chồng, nút Ôn hôm nay · N / Hôm nay đã xong ✓, Học ▾ theo loại, trạng thái trống 3 ô lớn.
import { h, fileName } from './dom.js';
import { KINDS, kindOf, kindLabel, modesFor } from '../core/deckkinds.js';
import { deckStats, countReviewedToday } from '../core/deckstats.js';
import { stripAccents } from '../core/deckmodel.js';
import { renderStackedBar } from './components/stackedbar.js';

const countIssues = e => (e.issues || []).filter(i => i.level === 'warn' || i.level === 'error').length;

// Giữ trạng thái bộ lọc/tìm kiếm/sắp xếp trên Home giữa các lần render
const homeUiState = {
  filterKind: 'all', // 'all' | 'qa' | 'quiz' | 'vocab'
  searchQuery: '',
  sortBy: 'due',     // 'due' | 'recent' | 'title'
};

function createSearchSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('class', 'ux-search-icon');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '7');
  circle.setAttribute('cy', '7');
  circle.setAttribute('r', '4.8');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', 'M10.6 10.6L14 14');
  line.setAttribute('stroke-linecap', 'round');
  svg.append(circle, line);
  return svg;
}

function closeAllDropdowns(except) {
  document.querySelectorAll('.menu, .ux-popover[data-dropdown]').forEach(el => {
    if (el !== except) el.hidden = true;
  });
}

function renderDeckCard(entry, st, actions) {
  const removeBtn = h('button', {
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

  const studyMenu = h('div', { class: 'ux-popover', 'data-dropdown': '1', hidden: true, style: 'min-width: 250px;' },
    ...modes.map(m => h('button', {
      type: 'button',
      class: 'ux-popover-item deck-mode-menu-item',
      onclick: ev => {
        ev.stopPropagation();
        studyMenu.hidden = true;
        if (m.id === 'srs') actions.startSrsSession(entry);
        else if (m.id === 'all' || m.id === 'flashcards') {
          actions.startSession(entry, { mode: m.id, count: items.length, shuffle: false, persist: true });
        } else {
          actions.openSessionSetup(entry);
        }
      },
    },
      h('div', null,
        h('div', { style: 'font-weight: 600; color: var(--c-text);' }, m.label),
        h('div', { class: 'muted', style: 'font-size: 12px; line-height: 1.35; margin-top: 2px;' }, m.description))))
  );

  const moreMenu = h('div', { class: 'ux-popover align-right', 'data-dropdown': '1', hidden: true, style: 'min-width: 210px;' },
    entry.path ? h('button', {
      type: 'button',
      class: 'ux-popover-item',
      title: entry.path,
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.showInFolder?.(entry); },
    }, '📂 Hiện trong thư mục') : null,
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.duplicateDeck(entry); },
    }, '📄 Sao chép'),
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
    h('div', { class: 'ux-popover-sep' }),
    h('button', {
      type: 'button',
      class: 'ux-popover-item danger',
      onclick: ev => { ev.stopPropagation(); moreMenu.hidden = true; actions.remove(entry); },
    }, '✕ Gỡ khỏi danh sách')
  );

  const tooltip = entry.path
    ? `${meta.title} — ${entry.path}`
    : (entry.source ? `${meta.title} (Nhập từ: ${entry.source})` : meta.title);

  return h('article', {
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
}

function renderEmptyHome(busy, actions) {
  return h('section', { class: 'home-empty-state panel' },
    h('div', { class: 'home-empty-intro' },
      h('h2', null, 'Bắt đầu tạo bộ thẻ đầu tiên của bạn'),
      h('p', { class: 'muted' },
        'Chọn một loại bộ thẻ bên dưới để tạo mới ngay trong trình soạn, hoặc mở file bộ thẻ có sẵn trên máy.')),
    h('div', { class: 'ux-kind-grid home-empty-kinds' },
      ...['qa', 'quiz', 'vocab'].map(k => {
        const info = KINDS[k];
        const disabled = !info.available || busy;
        return h('button', {
          type: 'button',
          class: `ux-kind-card ${disabled ? 'disabled' : ''}`,
          'data-kind': k,
          disabled,
          onclick: () => {
            if (disabled) return;
            actions.openNewDeckModal(k);
          },
        },
          h('div', { class: 'ux-kind-card-head' },
            h('span', { class: 'ux-kind-icon' }, info.icon),
            info.comingSoon ? h('span', { class: 'ux-kind-soon' }, info.comingSoon) : h('span', { class: 'ux-chip active' }, '+ Tạo mới')),
          h('div', { class: 'ux-kind-title' }, info.label),
          h('div', { class: 'ux-kind-desc' }, info.description));
      })),
    h('div', { class: 'home-empty-actions' },
      h('span', { class: 'muted', style: 'font-size: 13px;' }, 'Hoặc mở dữ liệu có sẵn:'),
      h('button', { type: 'button', class: 'ux-btn', disabled: busy, onclick: actions.openFiles }, '📂 Mở file…'),
      h('button', { type: 'button', class: 'ux-btn', disabled: busy, onclick: () => actions.importDeck('file') }, 'Nhập từ file .json…'),
      h('button', { type: 'button', class: 'ux-btn', disabled: busy, onclick: () => actions.importDeck('dir') }, 'Nhập từ thư mục…')));
}

export function renderHome(root, { entries, busy, progress, settings }, actions) {
  const now = Date.now();
  const statsByUid = new Map();

  let totalDueToday = 0;
  let totalNewLeftToday = 0;

  for (const e of entries) {
    if (e.status === 'ok' && e.deck) {
      const st = deckStats(e.deck, progress, settings, now);
      statsByUid.set(e.uid, st);
      totalDueToday += st.due + st.learning;
      totalNewLeftToday += st.newLeftToday;
    }
  }
  const reviewedToday = countReviewedToday(progress, now);

  const importMenu = h('div', { class: 'ux-popover align-right', 'data-dropdown': '1', hidden: true, style: 'min-width: 220px;' },
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: () => { importMenu.hidden = true; actions.importDeck('file'); },
    }, 'Từ file nguồn .json…'),
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: () => { importMenu.hidden = true; actions.importDeck('dir'); },
    }, 'Từ thư mục (kèm ảnh)…'));

  const toolbar = h('div', { class: 'toolbar' },
    h('button', {
      type: 'button',
      class: 'ux-btn primary',
      disabled: busy,
      onclick: () => actions.openNewDeckModal(),
    }, '+ Bộ thẻ mới'),
    h('button', {
      type: 'button',
      class: 'ux-btn',
      disabled: busy,
      onclick: actions.openFiles,
    }, 'Mở file…'),
    h('div', { class: 'menu-wrap' },
      h('button', {
        type: 'button',
        class: 'ux-btn',
        disabled: busy,
        'aria-haspopup': 'menu',
        onclick: ev => {
          ev.stopPropagation();
          const willOpen = importMenu.hidden;
          closeAllDropdowns(importMenu);
          importMenu.hidden = !willOpen;
        },
      }, 'Nhập… ▾'),
      importMenu),
    h('button', {
      type: 'button',
      class: 'ux-btn',
      disabled: busy,
      onclick: actions.openSettings,
    }, '⚙ Cài đặt'));

  const todaySection = h('section', { class: 'today-section' },
    h('div', { class: 'section-label' }, 'Hôm nay'),
    h('div', { class: 'today-strip' },
      h('div', { class: 'today-card' },
        h('div', { class: 'today-card-label' }, 'Đến hạn'),
        h('div', { class: `today-card-value ${totalDueToday > 0 ? 'accent-due' : ''}` }, String(totalDueToday))),
      h('div', { class: 'today-card' },
        h('div', { class: 'today-card-label' }, 'Thẻ mới còn lại'),
        h('div', { class: 'today-card-value accent-new' }, String(totalNewLeftToday))),
      h('div', { class: 'today-card' },
        h('div', { class: 'today-card-label' }, 'Đã ôn hôm nay'),
        h('div', { class: 'today-card-value accent-ok' }, String(reviewedToday)))));

  const listHost = h('div', { class: 'home-list-host' });

  function renderDeckSection() {
    if (!entries.length) {
      listHost.replaceChildren(renderEmptyHome(busy, actions));
      return;
    }

    const filterOptions = [
      { id: 'all', label: 'Tất cả' },
      { id: 'qa', label: `${KINDS.qa.icon} ${KINDS.qa.label}` },
      { id: 'quiz', label: `${KINDS.quiz.icon} ${KINDS.quiz.label}` },
      { id: 'vocab', label: `${KINDS.vocab.icon} ${KINDS.vocab.label}` },
    ];

    const searchInput = h('input', {
      type: 'text',
      class: 'ux-input ux-search-input',
      placeholder: 'Tìm theo tên bộ thẻ…',
      value: homeUiState.searchQuery,
      oninput: ev => {
        homeUiState.searchQuery = ev.target.value;
        renderCardsOnly();
        clearBtn.hidden = !homeUiState.searchQuery;
      },
    });

    const clearBtn = h('button', {
      type: 'button',
      class: 'ux-search-clear',
      title: 'Xoá tìm kiếm',
      hidden: !homeUiState.searchQuery,
      onclick: () => {
        homeUiState.searchQuery = '';
        searchInput.value = '';
        clearBtn.hidden = true;
        renderCardsOnly();
        searchInput.focus();
      },
    }, '✕');

    const searchWrap = h('div', { class: 'ux-search-wrap home-search-box' });
    searchWrap.append(createSearchSvg(), searchInput, clearBtn);

    const sortSelect = h('select', {
      class: 'ux-select',
      'aria-label': 'Sắp xếp bộ thẻ',
      onchange: ev => {
        homeUiState.sortBy = ev.target.value;
        renderCardsOnly();
      },
    },
      h('option', { value: 'due', selected: homeUiState.sortBy === 'due' }, 'Sắp xếp: Cần ôn nhất'),
      h('option', { value: 'recent', selected: homeUiState.sortBy === 'recent' }, 'Sắp xếp: Vừa học gần đây'),
      h('option', { value: 'title', selected: homeUiState.sortBy === 'title' }, 'Sắp xếp: Tên A→Z'));

    const filterBar = h('div', { class: 'home-filter-bar' },
      h('div', { class: 'home-filter-chips' },
        ...filterOptions.map(opt => h('button', {
          type: 'button',
          class: `ux-chip ${homeUiState.filterKind === opt.id ? 'active' : ''}`,
          onclick: () => {
            homeUiState.filterKind = opt.id;
            renderDeckSection();
          },
        }, opt.label))),
      h('div', { class: 'home-filter-right' },
        searchWrap,
        sortSelect));

    const cardsContainer = h('div');

    function renderCardsOnly() {
      const qNorm = stripAccents(homeUiState.searchQuery.trim());
      const filtered = entries.filter(e => {
        if (homeUiState.filterKind !== 'all') {
          if (e.status !== 'ok' || !e.deck) return false;
          if (kindOf(e.deck) !== homeUiState.filterKind) return false;
        }
        if (qNorm) {
          const title = e.deck?.meta?.title || fileName(e.path) || '';
          const desc = e.deck?.meta?.description || '';
          if (!stripAccents(`${title} ${desc}`).includes(qNorm)) return false;
        }
        return true;
      });

      filtered.sort((a, b) => {
        if (a.status !== 'ok' && b.status === 'ok') return 1;
        if (a.status === 'ok' && b.status !== 'ok') return -1;
        if (a.status !== 'ok' && b.status !== 'ok') return 0;

        const stA = statsByUid.get(a.uid) || { due: 0, learning: 0, newLeftToday: 0, lastStudied: null };
        const stB = statsByUid.get(b.uid) || { due: 0, learning: 0, newLeftToday: 0, lastStudied: null };
        const titleA = a.deck?.meta?.title || '';
        const titleB = b.deck?.meta?.title || '';

        if (homeUiState.sortBy === 'recent') {
          const tA = stA.lastStudied ?? -1;
          const tB = stB.lastStudied ?? -1;
          if (tB !== tA) return tB - tA;
          return titleA.localeCompare(titleB, 'vi');
        }
        if (homeUiState.sortBy === 'title') {
          return titleA.localeCompare(titleB, 'vi');
        }
        // Mặc định 'due': Cần ôn nhất (nhiều thẻ đến hạn trước, sau đó tổng thẻ hôm nay)
        const dueA = stA.due + stA.learning;
        const dueB = stB.due + stB.learning;
        if (dueB !== dueA) return dueB - dueA;
        const todayA = dueA + stA.newLeftToday;
        const todayB = dueB + stB.newLeftToday;
        if (todayB !== todayA) return todayB - todayA;
        return titleA.localeCompare(titleB, 'vi');
      });

      if (!filtered.length) {
        cardsContainer.replaceChildren(
          h('div', { class: 'empty', style: 'padding: 32px;' },
            h('p', { style: 'font-weight: 600; margin: 0 0 6px;' }, 'Không tìm thấy bộ thẻ nào khớp bộ lọc.'),
            h('p', { class: 'muted', style: 'margin: 0 0 14px; font-size: 13px;' },
              'Thử chọn lại loại bộ thẻ hoặc xoá từ khoá tìm kiếm.'),
            h('button', {
              type: 'button',
              class: 'ux-btn sm',
              onclick: () => {
                homeUiState.filterKind = 'all';
                homeUiState.searchQuery = '';
                renderDeckSection();
              },
            }, 'Xoá bộ lọc'))
        );
        return;
      }

      cardsContainer.replaceChildren(
        h('div', { class: 'deck-grid' },
          ...filtered.map(e => renderDeckCard(e, statsByUid.get(e.uid) || {
            new: 0, learning: 0, due: 0, mastered: 0, newLeftToday: 0, lastStudied: null,
          }, actions)))
      );
    }

    renderCardsOnly();
    listHost.replaceChildren(filterBar, cardsContainer);
  }

  renderDeckSection();

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'STUDY APP'),
        h('h1', null, 'Bộ thẻ của bạn')),
      toolbar),
    todaySection,
    listHost
  );
}
