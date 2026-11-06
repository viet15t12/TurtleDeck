// src/views/home/index.js — Điểm vào chính của màn hình Home (khởi tạo ctx, ghép các module con)

import { h } from '../dom.js';
import { deckStats, countReviewedToday } from '../../core/deckstats.js';
import { renderFolderTree } from '../components/foldertree.js';
import { homeUiState, savePref } from './ui-state.js';
import { createFolderStore } from './folder-store.js';
import { createNavigation } from './navigation.js';
import { createBreadcrumb } from './breadcrumb.js';
import { createDndHandlers } from './dnd.js';
import { createFolderActionHandler } from './folder-actions.js';
import { createDeckCardActions } from './deck-actions.js';
import { createTransferActions } from './transfer-actions.js';
import { createImportMenu, createBackupMenu } from './menus.js';
import { createToolbar } from './toolbar.js';
import { renderTodayStrip } from './today-strip.js';
import { createFilterBar } from './filter-bar.js';
import { createWorkspace } from './workspace.js';
import { attachHomeKeyboard, detachHomeKeyboard } from './keyboard.js';

export { detachHomeKeyboard };

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

  const folderStore = createFolderStore();
  const sidebarHost = h('aside', { class: `folder-sidebar ${homeUiState.sidebarOpen ? '' : 'collapsed'}` });
  const bannerHost = h('div', { class: 'home-banner-host' });
  const listHost = h('div', { class: 'home-list-host' });

  const ctx = {
    root,
    busy,
    ui: homeUiState,
    data: {
      entries,
      progress,
      settings,
      statsByUid,
    },
    actions,
    folderStore,
    sidebarHost,
    refresh: {},
  };

  const nav = createNavigation(ctx);
  ctx.nav = nav;

  const dnd = createDndHandlers(ctx);
  ctx.dnd = dnd;

  const folderAction = createFolderActionHandler(ctx);
  ctx.folderAction = folderAction;

  const deckCardActions = createDeckCardActions(ctx);
  ctx.deckCardActions = deckCardActions;

  const transfer = createTransferActions(ctx);
  ctx.transfer = transfer;

  const importMenu = createImportMenu(ctx);
  const backupMenu = createBackupMenu(ctx);
  ctx.menus = { importMenu, backupMenu };

  const toolbarObj = createToolbar(ctx);
  ctx.toolbar = toolbarObj;

  const breadcrumb = createBreadcrumb(ctx);
  ctx.breadcrumb = breadcrumb;

  const workspace = createWorkspace(ctx);
  ctx.workspace = workspace;

  function togglePin(folderId) {
    const idx = homeUiState.pinnedFolderIds.indexOf(folderId);
    if (idx >= 0) {
      homeUiState.pinnedFolderIds.splice(idx, 1);
    } else {
      homeUiState.pinnedFolderIds.push(folderId);
    }
    savePref('turtle_pinned_folders', JSON.stringify(homeUiState.pinnedFolderIds));
    renderSidebar();
    workspace.renderCardsOnly();
  }
  ctx.togglePin = togglePin;

  function renderSidebar() {
    sidebarHost.replaceChildren(
      renderFolderTree({
        folders: folderStore.flatFolders,
        selectedFolderId: homeUiState.selectedFolderId,
        pinnedFolderIds: homeUiState.pinnedFolderIds,
        onFolderSelect: fId => nav.navigateToFolder(fId),
        onFolderAction: folderAction,
        onTogglePin: togglePin,
        onDropDeck: dnd.handleDropDeck,
        onDropFolder: dnd.handleDropFolder,
        onToggleSidebar: () => toolbarObj.toggleSidebar(false),
      })
    );
  }

  function renderDeckSection() {
    const filterBar = createFilterBar(ctx);
    const navRow = h('div', { class: 'nautilus-toolbar-row' },
      h('div', { class: 'nautilus-nav-controls' }, nav.backBtn, nav.forwardBtn),
      breadcrumb.pathBarHost
    );
    breadcrumb.renderBreadcrumbBar();
    workspace.renderCardsOnly();
    listHost.replaceChildren(navRow, filterBar, workspace.mainContainer);
  }

  async function refreshFolders() {
    await folderStore.refreshFolders();
    breadcrumb.renderBreadcrumbBar();
    renderSidebar();
    workspace.renderCardsOnly();
  }

  Object.assign(ctx.refresh, {
    folders: refreshFolders,
    cards: () => workspace.renderCardsOnly(),
    sidebar: renderSidebar,
    breadcrumb: () => breadcrumb.renderBreadcrumbBar(),
    deckSection: renderDeckSection,
  });

  refreshFolders();
  renderSidebar();
  renderDeckSection();

  root.replaceChildren(
    h('header', { class: 'page-head home-header' },
      h('div', { class: 'home-brand-block' },
        h('img', { src: './assets/logo.svg', alt: 'Turtle Deck', class: 'home-brand-logo' }),
        h('div', null,
          h('h1', { class: 'home-brand-title' }, 'Turtle Deck'),
          h('p', { class: 'home-brand-subtitle' }, `${entries.length} bộ thẻ · Thư viện học tập`)
        )
      ),
      toolbarObj.toolbar
    ),
    h('div', { class: 'home-layout' },
      sidebarHost,
      h('main', { class: 'home-content' },
        renderTodayStrip({ totalDueToday, totalNewLeftToday, reviewedToday }),
        bannerHost,
        listHost
      )
    )
  );

  attachHomeKeyboard(ctx);
}

