// src/views/home.js — Màn hình chính quản lý tệp kiểu Nautilus / GNOME Files:
// Sidebar Bookmarks, thanh điều hướng Breadcrumb, bàn làm việc hiển thị Thư mục con & Bộ thẻ,
// tìm kiếm/sắp xếp, kéo thả an toàn, nhập file độc lập và sao lưu toàn bộ.
import { h, fileName } from './dom.js';
import { notify } from './notify.js';
import { KINDS, kindOf } from '../core/deckkinds.js';
import { deckStats, countReviewedToday } from '../core/deckstats.js';
import { stripAccents } from '../core/deckmodel.js';
import { renderDeckCard } from './components/deckcard.js';
import { renderFolderCard } from './components/foldercard.js';
import { renderFolderTree, flattenFolders } from './components/foldertree.js';
import { openFolderModal } from './components/foldermenu.js';

// Trạng thái giao diện trang chủ
const homeUiState = {
  filterKind: 'all', // 'all' | 'qa' | 'quiz' | 'vocab'
  searchQuery: '',
  sortBy: 'due',     // 'due' | 'recent' | 'title'
  selectedFolderId: 'all', // 'all' | null (root) | folderId
  viewMode: typeof localStorage !== 'undefined'
    ? localStorage.getItem('turtle_view_mode') || 'grid'
    : 'grid',
  sidebarOpen: typeof localStorage !== 'undefined'
    ? localStorage.getItem('turtle_folder_sidebar_open') !== 'false'
    : true,
  pinnedFolderIds: typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem('turtle_pinned_folders') || '[]')
    : [],
  history: ['all'],
  historyIndex: 0,
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

  let rawFolderTree = [];
  let flatFolders = [];
  let deckLocations = [];
  let locationsByDeckId = new Map();

  async function refreshDeckLocations() {
    if (window.api?.getDeckLocations) {
      try {
        const locs = await window.api.getDeckLocations() || [];
        deckLocations = locs;
        locationsByDeckId = new Map(
          locs.filter(l => !l.isLink).map(l => [l.deckId, l.folderId])
        );
      } catch (e) {
        console.warn('Không thể nạp danh sách vị trí bộ thẻ:', e);
      }
    }
  }

  // Helper tìm thư mục theo ID
  function findFolder(fId) {
    if (!fId || fId === 'all') return null;
    return flatFolders.find(f => f.id === fId) || null;
  }

  // Lấy chuỗi cây phả hệ từ gốc đến thư mục hiện tại để hiển thị breadcrumb
  function getBreadcrumbChain(fId) {
    if (!fId || fId === 'all') return [];
    const chain = [];
    let current = findFolder(fId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? findFolder(current.parentId) : null;
    }
    return chain;
  }

  // Đổi trạng thái Ghim Bookmark
  function togglePin(folderId) {
    const idx = homeUiState.pinnedFolderIds.indexOf(folderId);
    if (idx >= 0) {
      homeUiState.pinnedFolderIds.splice(idx, 1);
    } else {
      homeUiState.pinnedFolderIds.push(folderId);
    }
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('turtle_pinned_folders', JSON.stringify(homeUiState.pinnedFolderIds));
      } catch {}
    }
    renderSidebar();
    renderCardsOnly();
  }

  // ── Điều hướng Lịch sử (Back / Forward kiểu Nautilus) ──────────────────────
  function navigateToFolder(folderId, recordHistory = true) {
    if (recordHistory) {
      if (homeUiState.selectedFolderId !== folderId) {
        homeUiState.history = homeUiState.history.slice(0, homeUiState.historyIndex + 1);
        homeUiState.history.push(folderId);
        homeUiState.historyIndex = homeUiState.history.length - 1;
      }
    }
    homeUiState.selectedFolderId = folderId;
    updateNavButtons();
    renderBreadcrumbBar();
    renderSidebar();
    renderCardsOnly();
  }

  function goBack() {
    if (homeUiState.historyIndex > 0) {
      homeUiState.historyIndex--;
      const prevFolder = homeUiState.history[homeUiState.historyIndex];
      navigateToFolder(prevFolder, false);
    }
  }

  function goForward() {
    if (homeUiState.historyIndex < homeUiState.history.length - 1) {
      homeUiState.historyIndex++;
      const nextFolder = homeUiState.history[homeUiState.historyIndex];
      navigateToFolder(nextFolder, false);
    }
  }

  const backBtn = h('button', {
    type: 'button',
    class: 'nautilus-nav-btn',
    title: 'Quay lại thư mục trước (Alt+←)',
    disabled: homeUiState.historyIndex <= 0,
    onclick: goBack,
  }, '‹');

  const forwardBtn = h('button', {
    type: 'button',
    class: 'nautilus-nav-btn',
    title: 'Tiến tới thư mục sau (Alt+→)',
    disabled: homeUiState.historyIndex >= homeUiState.history.length - 1,
    onclick: goForward,
  }, '›');

  function updateNavButtons() {
    backBtn.disabled = homeUiState.historyIndex <= 0;
    forwardBtn.disabled = homeUiState.historyIndex >= homeUiState.history.length - 1;
  }

  // ── Breadcrumbs Bar ───────────────────────────────────────────────────────
  const pathBarHost = h('div', { class: 'nautilus-path-bar' });

  function renderBreadcrumbBar() {
    pathBarHost.replaceChildren();

    const makeSegment = ({ label, icon, folderId, isActive }) => {
      const pill = h('button', {
        type: 'button',
        class: `nautilus-path-pill ${isActive ? 'active' : ''}`,
        title: `Đi đến ${label}`,
        onclick: () => navigateToFolder(folderId),
        ondragover: (e) => {
          e.preventDefault();
          pill.classList.add('drag-over');
        },
        ondragleave: () => pill.classList.remove('drag-over'),
        ondrop: (e) => {
          e.preventDefault();
          pill.classList.remove('drag-over');
          const draggedFolderId = e.dataTransfer.getData('application/turtle-folder-id');
          const deckId = e.dataTransfer.getData('application/turtle-deck-id') || e.dataTransfer.getData('text/plain');
          if (draggedFolderId && draggedFolderId !== folderId) {
            handleDropFolder(draggedFolderId, folderId === 'all' ? null : folderId);
          } else if (deckId) {
            handleDropDeck(deckId, folderId === 'all' ? null : folderId);
          }
        },
      },
        icon ? h('span', null, icon) : null,
        h('span', null, label)
      );
      return pill;
    };

    if (homeUiState.selectedFolderId === 'all') {
      pathBarHost.append(
        makeSegment({ label: 'Tất cả bộ thẻ', icon: '📚', folderId: 'all', isActive: true })
      );
      return;
    }

    // Luôn bắt đầu từ Thư mục gốc
    pathBarHost.append(
      makeSegment({
        label: 'Home',
        icon: '🏠',
        folderId: null,
        isActive: homeUiState.selectedFolderId === null,
      })
    );

    if (homeUiState.selectedFolderId !== null) {
      const chain = getBreadcrumbChain(homeUiState.selectedFolderId);
      for (let i = 0; i < chain.length; i++) {
        const f = chain[i];
        const isLast = i === chain.length - 1;
        pathBarHost.append(
          h('span', { class: 'nautilus-path-sep' }, '›'),
          makeSegment({
            label: f.name,
            icon: '📁',
            folderId: f.id,
            isActive: isLast,
          })
        );
      }
    }
  }

  // ── Xử lý kéo thả an toàn ("tránh lỗi vặt khi di chuyển") ────────────────
  async function handleDropDeck(deckId, targetFolderId) {
    try {
      locationsByDeckId.set(deckId, targetFolderId);
      renderCardsOnly();

      const res = await window.api?.moveDeck(deckId, targetFolderId);
      if (res && !res.ok) {
        alert('Không thể chuyển bộ thẻ: ' + res.error);
        await refreshDeckLocations();
        renderCardsOnly();
        return;
      }
      const targetFolder = findFolder(targetFolderId);
      const folderName = targetFolder ? targetFolder.name : 'Thư mục gốc (Home)';
      notify(`Đã chuyển bộ thẻ vào "${folderName}".`, 'success');
      await refreshFolders();
      actions.scanLibrary?.();
    } catch (err) {
      console.warn('Lỗi di chuyển deck:', err);
      await refreshDeckLocations();
      renderCardsOnly();
    }
  }

  async function handleDropFolder(draggedFolderId, targetFolderId) {
    if (draggedFolderId === targetFolderId) return;

    // Kiểm tra vòng lặp: targetFolderId không được là con cháu của draggedFolderId
    if (targetFolderId !== null) {
      const dragged = findFolder(draggedFolderId);
      const target = findFolder(targetFolderId);
      if (dragged && target) {
        if (target.path === dragged.path || target.path.startsWith(`${dragged.path}/`)) {
          alert('Không thể di chuyển thư mục vào bên trong chính nó hoặc thư mục con của nó.');
          return;
        }
      }
    }

    try {
      const res = await window.api?.moveFolder(draggedFolderId, targetFolderId);
      if (res && !res.ok) {
        alert('Không thể di chuyển thư mục: ' + res.error);
        return;
      }
      const targetFolder = findFolder(targetFolderId);
      const folderName = targetFolder ? targetFolder.name : 'Thư mục gốc';
      if (typeof window.notify === 'function') {
        window.notify(`Đã di chuyển thư mục vào "${folderName}".`, 'success');
      }
      await refreshFolders();
      actions.reloadLibrary?.();
    } catch (err) {
      console.warn('Lỗi di chuyển thư mục:', err);
    }
  }

  // ── Nhập bộ thẻ độc lập vào app storage ──────────────────────────────────
  async function handleImportSdeck() {
    try {
      const targetId = homeUiState.selectedFolderId === 'all' ? null : homeUiState.selectedFolderId;
      const res = await window.api?.importSdeck?.(targetId);
      if (res?.canceled) return;
      if (!res?.ok) {
        alert('Lỗi nhập bộ thẻ: ' + (res?.error || 'Lỗi không xác định'));
        return;
      }
      if (typeof window.notify === 'function') {
        window.notify(`Đã nhập thành công ${res.importedCount} bộ thẻ vào hệ thống lưu trữ độc lập của ứng dụng!`, 'success');
      }
      await refreshFolders();
      actions.reloadLibrary?.();
    } catch (err) {
      alert('Không thể nhập file bộ thẻ: ' + (err?.message || err));
    }
  }

  // ── Sao lưu & Khôi phục toàn bộ (Full Backup & Restore for OS reinstall) ───
  async function handleFullBackup() {
    try {
      const res = await window.api?.createFullBackup?.();
      if (res?.canceled) return;
      if (!res?.ok) {
        alert('Lỗi khi sao lưu toàn bộ hệ thống: ' + (res?.error || 'Lỗi'));
        return;
      }
      alert(`Sao lưu toàn bộ hoàn tất thành công!\n\n- File sao lưu: ${res.name || res.filePath}\n- Số bộ thẻ: ${res.decksCount}\n- Số thư mục: ${res.foldersCount}\n\nBạn có thể cất file này ra USB hoặc ổ đĩa ngoài để nạp lại sau khi cài lại hệ điều hành.`);
    } catch (err) {
      alert('Không thể tạo file sao lưu: ' + (err?.message || err));
    }
  }

  async function handleFullRestore() {
    if (!window.confirm('Khôi phục toàn bộ hệ thống sẽ giải nén tất cả bộ thẻ và cấu trúc thư mục từ file sao lưu vào ứng dụng.\n\nBạn có muốn tiếp tục chọn file .turtlebackup để khôi phục?')) {
      return;
    }
    try {
      const res = await window.api?.restoreFullBackup?.();
      if (res?.canceled) return;
      if (!res?.ok) {
        alert('Lỗi khôi phục từ bản sao lưu: ' + (res?.error || 'Lỗi'));
        return;
      }
      alert(`Khôi phục toàn bộ hệ thống thành công!\n\n- Đã nạp lại ${res.decksCount} bộ thẻ\n- Đã tái tạo ${res.foldersCount} thư mục\n\nỨng dụng sẽ tự động làm mới giao diện.`);
      await refreshFolders();
      actions.reloadLibrary?.();
    } catch (err) {
      alert('Không thể khôi phục bản sao lưu: ' + (err?.message || err));
    }
  }

  // ── Dropdown Menus (Nhập & Sao lưu) ───────────────────────────────────────
  const importMenu = h('div', { class: 'ux-popover align-right', 'data-dropdown': '1', hidden: true, style: 'min-width: 270px;' },
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      style: 'font-weight: 600;',
      onclick: () => { importMenu.hidden = true; handleImportSdeck(); },
    }, '📥 Nhập file bộ thẻ (.sdeck) vào đây…'),
    h('div', { style: 'height: 1px; background: var(--c-border); margin: 4px 0;' }),
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: () => { importMenu.hidden = true; actions.importDeck('text'); },
    }, 'Từ bảng / văn bản (.csv, .tsv, .txt, .md)…'),
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

  const backupMenu = h('div', { class: 'ux-popover align-right', 'data-dropdown': '1', hidden: true, style: 'min-width: 280px;' },
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      style: 'font-weight: 600;',
      onclick: () => { backupMenu.hidden = true; handleFullBackup(); },
    }, '💾 Sao lưu toàn bộ hệ thống (.turtlebackup)…'),
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: () => { backupMenu.hidden = true; handleFullRestore(); },
    }, '↺ Khôi phục toàn bộ từ file sao lưu…'),
    h('div', { style: 'height: 1px; background: var(--c-border); margin: 4px 0;' }),
    h('button', {
      type: 'button',
      class: 'ux-popover-item',
      onclick: () => { backupMenu.hidden = true; window.api?.openBackupsFolder?.(); },
    }, '📂 Mở thư mục sao lưu'));

  // ── Chuyển đổi View Mode (Grid vs List) ───────────────────────────────────
  function setViewMode(mode) {
    homeUiState.viewMode = mode;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('turtle_view_mode', mode); } catch {}
    }
    gridBtn.classList.toggle('active', mode === 'grid');
    listBtn.classList.toggle('active', mode === 'list');
    renderCardsOnly();
  }

  const gridBtn = h('button', {
    type: 'button',
    class: `nautilus-view-btn ${homeUiState.viewMode === 'grid' ? 'active' : ''}`,
    title: 'Chế độ xem dạng lưới (Grid)',
    onclick: () => setViewMode('grid'),
  }, '⊞');

  const listBtn = h('button', {
    type: 'button',
    class: `nautilus-view-btn ${homeUiState.viewMode === 'list' ? 'active' : ''}`,
    title: 'Chế độ xem danh sách (List)',
    onclick: () => setViewMode('list'),
  }, '☰');

  const viewToggleGroup = h('div', { class: 'nautilus-view-toggle' }, gridBtn, listBtn);

  // ── Sidebar Host & Toggle ────────────────────────────────────────────────
  const sidebarHost = h('aside', { class: `folder-sidebar ${homeUiState.sidebarOpen ? '' : 'collapsed'}` });

  const sidebarToggleBtn = h('button', {
    type: 'button',
    class: `ux-btn ${homeUiState.sidebarOpen ? 'active' : ''}`,
    title: homeUiState.sidebarOpen ? 'Thu gọn thanh bên' : 'Mở thanh bên (Bookmarks)',
    onclick: () => toggleSidebar(),
  }, homeUiState.sidebarOpen ? '📁 Thanh bên ▾' : '📁 Thanh bên ▸');

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
      sidebarToggleBtn.textContent = '📁 Thanh bên ▾';
    } else {
      sidebarHost.classList.add('collapsed');
      sidebarToggleBtn.classList.remove('active');
      sidebarToggleBtn.textContent = '📁 Thanh bên ▸';
    }
  }

  // ── Toolbar & Header Buttons ─────────────────────────────────────────────
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
      title: 'Tạo thư mục mới trong vị trí hiện tại',
      onclick: () => {
        const parentId = homeUiState.selectedFolderId === 'all' ? null : homeUiState.selectedFolderId;
        const parentFolder = findFolder(parentId);
        handleFolderAction('create', parentFolder);
      },
    }, '+ Thư mục'),
    sidebarToggleBtn,
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
    h('div', { class: 'menu-wrap' },
      h('button', {
        type: 'button',
        class: 'ux-btn',
        disabled: busy,
        'aria-haspopup': 'menu',
        onclick: ev => {
          ev.stopPropagation();
          const willOpen = backupMenu.hidden;
          closeAllDropdowns(backupMenu);
          backupMenu.hidden = !willOpen;
        },
      }, 'Sao lưu… ▾'),
      backupMenu),
    viewToggleGroup,
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

  // Hôm nay strip
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

  // Nạp lại cấu trúc thư mục từ Main
  async function refreshFolders() {
    if (window.api?.getFolderTree) {
      try {
        rawFolderTree = await window.api.getFolderTree();
        flatFolders = flattenFolders(rawFolderTree);
      } catch (e) {
        console.warn('Không thể nạp cây thư mục:', e);
      }
    }
    await refreshDeckLocations();
    renderBreadcrumbBar();
    renderSidebar();
    renderDeckSection();
  }

  // Xử lý các tác vụ thư mục (Tạo, Đổi tên, Di chuyển, Xoá)
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
            navigateToFolder(folder.parentId || null);
          } else {
            await refreshFolders();
          }
        },
      });
    }
  }

  // Tác vụ của thẻ bộ thẻ (Deck card)
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
        pinnedFolderIds: homeUiState.pinnedFolderIds,
        onFolderSelect: (fId) => navigateToFolder(fId),
        onFolderAction: handleFolderAction,
        onTogglePin: togglePin,
        onDropDeck: handleDropDeck,
        onDropFolder: handleDropFolder,
        onToggleSidebar: () => toggleSidebar(false),
      })
    );
  }

  let renderCardsOnly = () => {};

  function renderDeckSection() {
    const filterOptions = [
      { id: 'all', label: 'Tất cả' },
      { id: 'qa', label: `${KINDS.qa.icon} ${KINDS.qa.label}` },
      { id: 'quiz', label: `${KINDS.quiz.icon} ${KINDS.quiz.label}` },
      { id: 'vocab', label: `${KINDS.vocab.icon} ${KINDS.vocab.label}` },
    ];

    const searchInput = h('input', {
      type: 'text',
      class: 'ux-input ux-search-input',
      placeholder: 'Tìm theo tên thư mục hoặc bộ thẻ…',
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

    const searchWrap = h('div', { class: 'ux-search-wrap home-search-box', style: 'flex: 1; max-width: 320px;' });
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

    // Khối điều hướng Nautilus: Nút Back, Forward và Breadcrumb
    const navRow = h('div', { class: 'nautilus-toolbar-row' },
      h('div', { class: 'nautilus-nav-controls' }, backBtn, forwardBtn),
      pathBarHost
    );

    const mainContainer = h('div', { class: 'nautilus-workspace-container' });

    renderCardsOnly = function() {
      const qNorm = stripAccents(homeUiState.searchQuery.trim());

      // 1. Lọc Thư mục con trực tiếp trên bàn (Subfolders)
      let directSubfolders = [];
      if (homeUiState.selectedFolderId !== 'all') {
        const parentId = homeUiState.selectedFolderId;
        directSubfolders = flatFolders.filter(f => f.parentId === parentId);
      } else if (!qNorm) {
        // Ở chế độ xem tất cả, hiển thị các thư mục cấp gốc nếu không tìm kiếm
        directSubfolders = flatFolders.filter(f => f.parentId === null);
      } else {
        // Đang tìm kiếm ở 'all': lọc tất cả thư mục khớp từ khoá
        directSubfolders = flatFolders.filter(f => stripAccents(f.name).includes(qNorm));
      }

      if (qNorm && homeUiState.selectedFolderId !== 'all') {
        directSubfolders = directSubfolders.filter(f => stripAccents(f.name).includes(qNorm));
      }

      // 2. Lọc Bộ thẻ (Decks)
      const filteredDecks = entries.filter(e => {
        const deckId = e.deck?.meta?.id;
        const assignedFolderId = deckId ? locationsByDeckId.get(deckId) : undefined;

        // Lọc theo thư mục
        if (homeUiState.selectedFolderId !== 'all') {
          if (assignedFolderId !== undefined) {
            // Nguồn chuẩn từ cơ sở dữ liệu vị trí bộ thẻ
            if (assignedFolderId !== homeUiState.selectedFolderId) return false;
          } else {
            // Fallback theo cấu trúc group / relPath trên đĩa
            if (homeUiState.selectedFolderId === null) {
              if (e.group || (e.relPath && e.relPath.includes('/'))) return false;
            } else {
              const targetFolder = findFolder(homeUiState.selectedFolderId);
              if (targetFolder) {
                const matchesGroup = e.group === targetFolder.path;
                const matchesRel = e.relPath && (e.relPath === targetFolder.path || e.relPath.startsWith(`${targetFolder.path}/`));
                if (!matchesGroup && !matchesRel) return false;
              }
            }
          }
        }

        // Lọc theo loại thẻ
        if (homeUiState.filterKind !== 'all') {
          if (e.status !== 'ok' || !e.deck) return false;
          if (kindOf(e.deck) !== homeUiState.filterKind) return false;
        }

        // Lọc theo tìm kiếm từ khoá
        if (qNorm) {
          const title = e.deck?.meta?.title || fileName(e.path) || '';
          const desc = e.deck?.meta?.description || '';
          if (!stripAccents(`${title} ${desc}`).includes(qNorm)) return false;
        }
        return true;
      });

      // Sắp xếp bộ thẻ
      filteredDecks.sort((a, b) => {
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

      // 3. Render giao diện bàn làm việc
      const contentElements = [];

      // Render danh sách thư mục con (Subfolders)
      if (directSubfolders.length > 0) {
        const folderHeader = h('div', { class: 'nautilus-section-header' },
          h('div', { class: 'section-label', style: 'margin: 0;' }, `Thư mục con (${directSubfolders.length})`)
        );

        const folderGrid = h('div', { class: `nautilus-subfolders-grid ${homeUiState.viewMode === 'list' ? 'list-view' : ''}` },
          ...directSubfolders.map(f => {
            // Đếm số item bên trong thư mục này
            const childFolders = flatFolders.filter(cf => cf.parentId === f.id);
            const childDecks = entries.filter(e => {
              if (e.group === f.path) return true;
              if (e.relPath && (e.relPath === f.path || e.relPath.startsWith(`${f.path}/`))) return true;
              return false;
            });
            const isPinned = homeUiState.pinnedFolderIds.includes(f.id);

            return renderFolderCard({
              folder: f,
              deckCount: childDecks.length,
              subfolderCount: childFolders.length,
              isPinned,
              onOpen: (targetId) => navigateToFolder(targetId),
              onFolderAction: handleFolderAction,
              onTogglePin: togglePin,
              onDropDeck: handleDropDeck,
              onDropFolder: handleDropFolder,
            });
          })
        );

        contentElements.push(h('div', { class: 'nautilus-subfolders-section' }, folderHeader, folderGrid));
      }

      // Render danh sách bộ thẻ (Decks)
      if (filteredDecks.length > 0) {
        const deckHeader = h('div', { class: 'nautilus-section-header' },
          h('div', { class: 'section-label', style: 'margin: 0;' }, `Bộ thẻ (${filteredDecks.length})`)
        );

        const deckContainer = h('div', { class: `deck-grid ${homeUiState.viewMode === 'list' ? 'list-view' : ''}` },
          ...filteredDecks.map(e => renderDeckCard(e, statsByUid.get(e.uid) || {
            new: 0, learning: 0, due: 0, mastered: 0, newLeftToday: 0, lastStudied: null,
          }, deckCardActions))
        );

        contentElements.push(h('div', { class: 'nautilus-decks-section' }, deckHeader, deckContainer));
      }

      // Khi cả thư mục và bộ thẻ đều trống
      if (directSubfolders.length === 0 && filteredDecks.length === 0) {
        contentElements.push(
          h('div', { class: 'empty', style: 'padding: 40px 20px; text-align: center;' },
            h('div', { style: 'font-size: 38px; margin-bottom: 8px;' }, '📁'),
            h('p', { style: 'font-weight: 600; margin: 0 0 6px;' },
              qNorm ? 'Không tìm thấy thư mục hoặc bộ thẻ nào khớp với từ khoá.' : 'Thư mục này hiện chưa có nội dung.'
            ),
            h('p', { class: 'muted', style: 'margin: 0 0 16px; font-size: 13px;' },
              qNorm ? 'Thử xoá từ khoá tìm kiếm hoặc chọn thư mục khác.' : 'Bạn có thể tạo thư mục con mới hoặc tạo/nhập bộ thẻ vào vị trí này.'
            ),
            h('div', { style: 'display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;' },
              h('button', {
                type: 'button',
                class: 'ux-btn sm primary',
                onclick: () => actions.openNewDeckModal(),
              }, '+ Tạo bộ thẻ'),
              h('button', {
                type: 'button',
                class: 'ux-btn sm',
                onclick: () => {
                  const parentId = homeUiState.selectedFolderId === 'all' ? null : homeUiState.selectedFolderId;
                  handleFolderAction('create', findFolder(parentId));
                },
              }, '+ Tạo thư mục con'),
              h('button', {
                type: 'button',
                class: 'ux-btn sm',
                onclick: handleImportSdeck,
              }, '📥 Nhập file .sdeck vào đây')
            )
          )
        );
      }

      mainContainer.replaceChildren(...contentElements);
    };

    renderBreadcrumbBar();
    renderCardsOnly();
    listHost.replaceChildren(navRow, filterBar, mainContainer);
  }

  // Khởi tạo ban đầu
  refreshFolders();
  renderSidebar();
  renderDeckSection();

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null,
        h('p', { class: 'eyebrow' }, 'TURTLE DECK — FILE MANAGER'),
        h('h1', null, 'Quản lý Bộ thẻ & Thư mục')),
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
    // Alt + Left: Back, Alt + Right: Forward
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
    }
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      goForward();
    }
  };
  window.addEventListener('keydown', onHomeKeyDown);
}
