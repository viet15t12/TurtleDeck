// src/views/home/toolbar.js — Dựng thanh công cụ toolbar, nút chuyển view mode và toggle sidebar

import { h } from '../dom.js';
import { closeAllDropdowns } from './menus.js';
import { savePref } from './ui-state.js';

export function createToolbar(ctx) {
  const { ui, actions, menus, folderAction, refresh } = ctx;

  function setViewMode(mode) {
    ui.viewMode = mode;
    savePref('turtle_view_mode', mode);
    gridBtn.classList.toggle('active', mode === 'grid');
    listBtn.classList.toggle('active', mode === 'list');
    refresh.cards();
  }

  const gridBtn = h(
    'button',
    {
      type: 'button',
      class: `nautilus-view-btn ${ui.viewMode === 'grid' ? 'active' : ''}`,
      title: 'Chế độ xem dạng lưới (Grid)',
      onclick: () => setViewMode('grid'),
    },
    '⊞'
  );

  const listBtn = h(
    'button',
    {
      type: 'button',
      class: `nautilus-view-btn ${ui.viewMode === 'list' ? 'active' : ''}`,
      title: 'Chế độ xem danh sách (List)',
      onclick: () => setViewMode('list'),
    },
    '☰'
  );

  const viewToggleGroup = h('div', { class: 'nautilus-view-toggle' }, gridBtn, listBtn);

  const sidebarToggleBtn = h(
    'button',
    {
      type: 'button',
      class: `ux-btn ${ui.sidebarOpen ? 'active' : ''}`,
      title: ui.sidebarOpen ? 'Thu gọn thanh bên' : 'Mở thanh bên (Bookmarks)',
      onclick: () => toggleSidebar(),
    },
    ui.sidebarOpen ? '📁 Thanh bên ▾' : '📁 Thanh bên ▸'
  );

  function toggleSidebar(forceState) {
    ui.sidebarOpen = typeof forceState === 'boolean' ? forceState : !ui.sidebarOpen;
    savePref('turtle_folder_sidebar_open', String(ui.sidebarOpen));
    if (ui.sidebarOpen) {
      ctx.sidebarHost.classList.remove('collapsed');
      sidebarToggleBtn.classList.add('active');
      sidebarToggleBtn.textContent = '📁 Thanh bên ▾';
    } else {
      ctx.sidebarHost.classList.add('collapsed');
      sidebarToggleBtn.classList.remove('active');
      sidebarToggleBtn.textContent = '📁 Thanh bên ▸';
    }
  }

  const toolbar = h(
    'div',
    { class: 'toolbar' },
    h(
      'button',
      {
        type: 'button',
        class: 'ux-btn primary',
        disabled: ctx.busy,
        onclick: () => actions.openNewDeckModal(),
      },
      '+ Bộ thẻ mới'
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'ux-btn',
        disabled: ctx.busy,
        title: 'Tạo thư mục mới trong vị trí hiện tại',
        onclick: () => {
          const parentId = ui.selectedFolderId === 'all' ? null : ui.selectedFolderId;
          const parentFolder = ctx.folderStore.findFolder(parentId);
          folderAction('create', parentFolder);
        },
      },
      '+ Thư mục'
    ),
    sidebarToggleBtn,
    h(
      'div',
      { class: 'menu-wrap' },
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn',
          disabled: ctx.busy,
          'aria-haspopup': 'menu',
          onclick: ev => {
            ev.stopPropagation();
            const willOpen = menus.importMenu.hidden;
            closeAllDropdowns(menus.importMenu);
            menus.importMenu.hidden = !willOpen;
          },
        },
        'Nhập… ▾'
      ),
      menus.importMenu
    ),
    h(
      'div',
      { class: 'menu-wrap' },
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn',
          disabled: ctx.busy,
          'aria-haspopup': 'menu',
          onclick: ev => {
            ev.stopPropagation();
            const willOpen = menus.backupMenu.hidden;
            closeAllDropdowns(menus.backupMenu);
            menus.backupMenu.hidden = !willOpen;
          },
        },
        'Sao lưu… ▾'
      ),
      menus.backupMenu
    ),
    viewToggleGroup,
    h(
      'button',
      {
        type: 'button',
        class: 'ux-btn',
        disabled: ctx.busy,
        onclick: actions.openStats,
      },
      '📊 Thống kê'
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'ux-btn',
        disabled: ctx.busy,
        onclick: actions.openSettings,
      },
      '⚙ Cài đặt'
    )
  );

  return {
    toolbar,
    toggleSidebar,
    sidebarToggleBtn,
    viewToggleGroup,
  };
}
