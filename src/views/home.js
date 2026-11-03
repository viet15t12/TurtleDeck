// src/views/home.js — Màn hình chính: Dải Hôm nay, Cây thư mục sidebar (0.1.3),
// lọc/tìm/sắp xếp, lưới thẻ bộ thẻ, kéo thả deck vào thư mục.
import { h, fileName } from './dom.js';
import { KINDS, kindOf, modesFor } from '../core/deckkinds.js';
import { deckStats, countReviewedToday } from '../core/deckstats.js';
import { stripAccents } from '../core/deckmodel.js';
import { renderDeckCard } from './components/deckcard.js';
import { renderFolderTree, flattenFolders } from './components/foldertree.js';
import { openFolderModal } from './components/foldermenu.js';
import { promptDropAction } from './components/dragdrop.js';

// Giữ trạng thái bộ lọc/tìm kiếm/sắp xếp và thư mục đang chọn giữa các lần render
const homeUiState = {
  filterKind: 'all', // 'all' | 'qa' | 'quiz' | 'vocab'
  filterGroup: 'all', // 'all' | 'LPIC/101' | ...
  searchQuery: '',
  sortBy: 'due',     // 'due' | 'recent' | 'title'
  selectedFolderId: 'all', // 'all' | null (root) | folderId
  sidebarOpen: typeof localStorage !== 'undefined'
    ? localStorage.getItem('turtle_folder_sidebar_open') !== 'false'
    : true,
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
      h('button', { type: 'button', class: 'ux-btn', disabled: busy, onclick: () => actions.importDeck('text') }, 'Nhập từ CSV / TSV / Markdown…'),
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

  const importMenu = h('div', { class: 'ux-popover align-right', 'data-dropdown': '1', hidden: true, style: 'min-width: 250px;' },
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: () => { importMenu.hidden = true; actions.importDeck('text'); },
    }, 'Từ file bảng / văn bản (.csv, .tsv, .txt, .md)…'),
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

  const sidebarHost = h('aside', { class: `folder-sidebar ${homeUiState.sidebarOpen ? '' : 'collapsed'}` });

  const sidebarToggleBtn = h('button', {
    type: 'button',
    class: `ux-btn ${homeUiState.sidebarOpen ? 'active' : ''}`,
    title: homeUiState.sidebarOpen ? 'Thu gọn danh mục thư mục' : 'Mở danh mục thư mục',
    onclick: () => toggleSidebar(),
  }, homeUiState.sidebarOpen ? '📁 Thư mục ▾' : '📁 Thư mục ▸');

  function toggleSidebar(forceState) {
    homeUiState.sidebarOpen = typeof forceState === 'boolean' ? forceState : !homeUiState.sidebarOpen;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('turtle_folder_sidebar_open', String(homeUiState.sidebarOpen));
      } catch {}
    }
    if (homeUiState.sidebarOpen) {
      sidebarHost.classList.remove('collapsed');
      sidebarToggleBtn.classList.add('active');
      sidebarToggleBtn.textContent = '📁 Thư mục ▾';
      sidebarToggleBtn.title = 'Thu gọn danh mục thư mục';
    } else {
      sidebarHost.classList.add('collapsed');
      sidebarToggleBtn.classList.remove('active');
      sidebarToggleBtn.textContent = '📁 Thư mục ▸';
      sidebarToggleBtn.title = 'Mở danh mục thư mục';
    }
  }

  const toolbar = h('div', { class: 'toolbar' },
    h('button', {
      type: 'button',
      class: 'ux-btn primary',
      disabled: busy,
      onclick: () => actions.openNewDeckModal(),
    }, '+ Bộ thẻ mới'),
    sidebarToggleBtn,
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
      onclick: actions.openStats,
    }, '📊 Thống kê'),
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

  const bannerHost = h('div', { class: 'home-banner-host' });
  const listHost = h('div', { class: 'home-list-host' });

  let rawFolderTree = [];
  let flatFolders = [];

  async function refreshFolders() {
    if (window.api?.getFolderTree) {
      try {
        rawFolderTree = await window.api.getFolderTree();
        flatFolders = flattenFolders(rawFolderTree);
      } catch (e) {
        console.warn('Không thể nạp cây thư mục:', e);
      }
    }
    renderSidebar();
    renderDeckSection();
  }

  function handleFolderAction(actionType, folder) {
    if (actionType === 'create') {
      openFolderModal({
        type: 'create',
        folder,
        onConfirm: async (name) => {
          const res = await window.api?.createFolder(name, folder?.id || null);
          if (res && !res.ok) throw new Error(res.error);
          await refreshFolders();
        },
      });
    } else if (actionType === 'rename') {
      openFolderModal({
        type: 'rename',
        folder,
        onConfirm: async (newName) => {
          const res = await window.api?.renameFolder(folder.id, newName);
          if (res && !res.ok) throw new Error(res.error);
          await refreshFolders();
        },
      });
    } else if (actionType === 'move') {
      openFolderModal({
        type: 'move',
        folder,
        folders: flatFolders,
        onConfirm: async (newParentId) => {
          const res = await window.api?.moveFolder(folder.id, newParentId);
          if (res && !res.ok) throw new Error(res.error);
          await refreshFolders();
        },
      });
    } else if (actionType === 'delete') {
      openFolderModal({
        type: 'delete',
        folder,
        onConfirm: async () => {
          const res = await window.api?.deleteFolder(folder.id);
          if (res && !res.ok) throw new Error(res.error);
          if (homeUiState.selectedFolderId === folder.id) {
            homeUiState.selectedFolderId = 'all';
          }
          await refreshFolders();
        },
      });
    }
  }

  function handleDropDeck(deckId, targetFolderId) {
    const entry = entries.find(e => e.deck?.meta?.id === deckId);
    const deckTitle = entry?.deck?.meta?.title || 'Bộ thẻ';
    const targetFolder = flatFolders.find(f => f.id === targetFolderId);
    const folderName = targetFolder ? targetFolder.name : 'Thư mục gốc';

    promptDropAction({
      deckTitle,
      folderName,
      onChoose: async (choice) => {
        if (choice === 'move') {
          const res = await window.api?.moveDeck(deckId, targetFolderId);
          if (res && !res.ok) alert(res.error);
        } else if (choice === 'link') {
          const res = await window.api?.linkDeck(deckId, targetFolderId);
          if (res && !res.ok) alert(res.error);
        }
        await refreshFolders();
        actions.reloadLibrary?.();
      },
    });
  }

  // Tác vụ di chuyển và liên kết từ menu của thẻ
  const deckCardActions = {
    ...actions,
    onMoveDeck: (entry) => {
      const deckId = entry.deck?.meta?.id;
      if (!deckId) return;
      openFolderModal({
        type: 'move',
        folder: { name: entry.deck?.meta?.title || fileName(entry.path), parentId: null, path: '' },
        folders: flatFolders,
        onConfirm: async (targetFolderId) => {
          const res = await window.api?.moveDeck(deckId, targetFolderId);
          if (res && !res.ok) throw new Error(res.error);
          await refreshFolders();
          actions.reloadLibrary?.();
        },
      });
    },
    onLinkDeck: (entry) => {
      const deckId = entry.deck?.meta?.id;
      if (!deckId) return;
      openFolderModal({
        type: 'move',
        folder: { name: entry.deck?.meta?.title || fileName(entry.path), parentId: null, path: '' },
        folders: flatFolders,
        onConfirm: async (targetFolderId) => {
          const res = await window.api?.linkDeck(deckId, targetFolderId);
          if (res && !res.ok) throw new Error(res.error);
          await refreshFolders();
          actions.reloadLibrary?.();
        },
      });
    },
    onUnlinkDeck: async (entry) => {
      if (!confirm(`Bạn có chắc muốn xoá liên kết bộ thẻ "${entry.deck?.meta?.title}" khỏi thư mục này?`)) return;
      if (entry.locationId) {
        await window.api?.unlinkDeck(entry.locationId, true);
        await refreshFolders();
        actions.reloadLibrary?.();
      }
    },
  };

  function renderSidebar() {
    sidebarHost.replaceChildren(
      renderFolderTree({
        folders: flatFolders,
        selectedFolderId: homeUiState.selectedFolderId,
        onFolderSelect: (fId) => {
          homeUiState.selectedFolderId = fId;
          renderSidebar();
          renderCardsOnly();
        },
        onFolderAction: handleFolderAction,
        onDropDeck: handleDropDeck,
        onToggleSidebar: () => toggleSidebar(false),
      })
    );
  }

  function updateBanner(count = 0) {
    if (homeUiState.selectedFolderId === 'all') {
      bannerHost.replaceChildren();
      bannerHost.hidden = true;
      return;
    }

    let folderName = 'Thư mục gốc (Root)';
    let folderIcon = '🏠';
    if (homeUiState.selectedFolderId !== null) {
      const targetFolder = flatFolders.find(f => f.id === homeUiState.selectedFolderId);
      if (targetFolder) {
        folderName = targetFolder.path || targetFolder.name;
        folderIcon = '📁';
      }
    }

    bannerHost.hidden = false;
    bannerHost.replaceChildren(
      h('div', { class: 'active-folder-banner' },
        h('div', { class: 'active-folder-banner-left' },
          h('span', null, folderIcon),
          h('span', { style: 'font-weight: 600;' }, 'Đang xem thư mục:'),
          h('span', { class: 'ux-chip active' }, folderName),
          h('span', { class: 'muted', style: 'font-size: 13px;' }, `(${count} bộ thẻ)`)),
        h('button', {
          type: 'button',
          class: 'ux-btn sm ghost',
          title: 'Hiển thị tất cả bộ thẻ',
          onclick: () => {
            homeUiState.selectedFolderId = 'all';
            renderSidebar();
            renderDeckSection();
          },
        }, '✕ Bỏ lọc'))
    );
  }

  let renderCardsOnly = () => {};

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

    renderCardsOnly = function() {
      const qNorm = stripAccents(homeUiState.searchQuery.trim());
      const filtered = entries.filter(e => {
        // 1. Lọc theo thư mục đang chọn trong sidebar
        if (homeUiState.selectedFolderId !== 'all') {
          if (homeUiState.selectedFolderId === null) {
            // Thư mục gốc: không có group hoặc relPath không chứa dấu phân cách thư mục
            if (e.group || (e.relPath && e.relPath.includes('/'))) return false;
          } else {
            const targetFolder = flatFolders.find(f => f.id === homeUiState.selectedFolderId);
            if (targetFolder) {
              const matchesGroup = e.group === targetFolder.path;
              const matchesRel = e.relPath && (e.relPath === targetFolder.path || e.relPath.startsWith(`${targetFolder.path}/`));
              if (!matchesGroup && !matchesRel) return false;
            }
          }
        }

        // 2. Lọc theo loại thẻ
        if (homeUiState.filterKind !== 'all') {
          if (e.status !== 'ok' || !e.deck) return false;
          if (kindOf(e.deck) !== homeUiState.filterKind) return false;
        }

        // 3. Tìm kiếm theo từ khoá
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
        // Mặc định 'due': Cần ôn nhất
        const dueA = stA.due + stA.learning;
        const dueB = stB.due + stB.learning;
        if (dueB !== dueA) return dueB - dueA;
        const todayA = dueA + stA.newLeftToday;
        const todayB = dueB + stB.newLeftToday;
        if (todayB !== todayA) return todayB - todayA;
        return titleA.localeCompare(titleB, 'vi');
      });

      updateBanner(filtered.length);

      if (!filtered.length) {
        cardsContainer.replaceChildren(
          h('div', { class: 'empty', style: 'padding: 32px;' },
            h('p', { style: 'font-weight: 600; margin: 0 0 6px;' }, 'Không tìm thấy bộ thẻ nào khớp bộ lọc.'),
            h('p', { class: 'muted', style: 'margin: 0 0 14px; font-size: 13px;' },
              'Thử chọn lại loại bộ thẻ, thư mục hoặc xoá từ khoá tìm kiếm.'),
            h('button', {
              type: 'button',
              class: 'ux-btn sm',
              onclick: () => {
                homeUiState.filterKind = 'all';
                homeUiState.selectedFolderId = 'all';
                homeUiState.searchQuery = '';
                renderSidebar();
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
          }, deckCardActions)))
      );
    };

    renderCardsOnly();
    listHost.replaceChildren(filterBar, cardsContainer);
  }

  // Khởi tạo ban đầu
  refreshFolders();
  renderSidebar();
  renderDeckSection();

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'TURTLE DECK'),
        h('h1', null, 'Bộ thẻ của bạn')),
      toolbar),
    h('div', { class: 'home-layout' },
      sidebarHost,
      h('main', { class: 'home-content' },
        todaySection,
        bannerHost,
        listHost
      )
    )
  );

  const onHomeKeyDown = (e) => {
    if (!root.isConnected) {
      window.removeEventListener('keydown', onHomeKeyDown);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      toggleSidebar();
    }
  };
  window.addEventListener('keydown', onHomeKeyDown);
}
