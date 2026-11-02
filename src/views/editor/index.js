// src/views/editor/index.js — Orchestrator điều phối các module của Editor (§3, §4, §5, §6, §10, §13)
import { h } from '../dom.js';
import { makeRich } from '../../core/richtext.js';
import { updateItem } from '../../core/deckmodel.js';
import { createListPane } from './list.js';
import { createFormPane } from './form.js';
import { createPreviewPane } from './preview.js';
import { createEditorState } from './state.js';
import { createServices } from './services.js';
import { createActions } from './actions.js';
import { createToastManager } from './ui/toast.js';
import { createModalManager } from './ui/modals.js';
import { renderTopbar as topbarRender } from './ui/topbar.js';
import { createSplitter, syncResponsiveClasses } from './ui/layout.js';
import { registerGlobalShortcuts } from './shortcuts.js';

export function renderEditor(root, { entry, initialItemId }, appActions) {
  const state = createEditorState({ entry, initialItemId });
  const rich = makeRich(state.deckKey);
  const services = createServices(window.api, state);

  // 1. Toast
  const { toastHost, showToast } = createToastManager();

  // 2. DOM Shell
  const topbarEl = h('header', { class: 'editor-topbar' });
  const listColEl = h('aside', {
    class: 'editor-col-list',
    style: `width: ${state.listWidth}px;`,
  });
  const formColEl = h('main', { class: 'editor-col-form' });
  const previewColEl = h('aside', {
    class: 'editor-col-preview',
    style: `width: ${state.previewWidth}px;`,
  });

  const drawerBackdrop = h('div', {
    class: 'editor-drawer-backdrop',
    onclick: () => {
      state.drawerOpen = false;
      syncLayout();
    },
  });

  // Reference holders
  const panes = { list: null, form: null, preview: null };
  let modals = null;
  let actions = null;
  let cleanupShortcuts = null;

  function syncLayout() {
    syncResponsiveClasses({ bodyEl, previewColEl, rightSplitter, state });
  }

  function renderTopbar() {
    topbarRender(topbarEl, { state, actions, modals });
  }

  function syncPanes(opts = {}) {
    if (panes.list) panes.list.render();
    if (panes.form) panes.form.render();
    if (panes.preview) panes.preview.render(state.getActiveItem(), { immediate: true });
    if (panes.list) panes.list.scrollToItem(state.activeId);
    if (opts.focusPrimary && panes.form) {
      panes.form.focusPrimaryField();
    }
  }

  const ui = {
    showToast,
    renderTopbar,
    syncResponsive: syncLayout,
    syncPanes,
  };

  const leftSplitter = createSplitter('left', {
    state,
    listColEl,
    previewColEl,
    onPersistLayout: () => services.persistLayoutSettings(),
  });
  const rightSplitter = createSplitter('right', {
    state,
    listColEl,
    previewColEl,
    onPersistLayout: () => services.persistLayoutSettings(),
  });

  const bodyEl = h('div', { class: 'editor-body' },
    drawerBackdrop,
    listColEl,
    leftSplitter,
    formColEl,
    rightSplitter,
    previewColEl);

  const shellEl = h('div', { class: 'editor-shell' }, topbarEl, bodyEl, toastHost);

  modals = createModalManager({
    shellEl,
    state,
    actions: {
      commitDeck: d => actions.commitDeck(d),
      switchActiveItem: (id, o) => actions.switchActiveItem(id, o),
    },
    services,
    ui,
    panes,
  });

  actions = createActions({
    state,
    services,
    ui,
    modals,
    panes,
    appActions,
    cleanup: () => { if (cleanupShortcuts) cleanupShortcuts(); },
  });

  // 3. Khởi tạo các Pane (List, Form, Preview)
  panes.preview = createPreviewPane({
    container: previewColEl,
    deckKey: state.deckKey,
    rich,
    getAssets: state.getAssets,
    onToggleCollapse: () => actions.togglePreviewCollapse(),
  });

  panes.list = createListPane({
    container: listColEl,
    getDeck: state.getDeck,
    getAssets: state.getAssets,
    getActiveId: () => state.activeId,
    isItemTouched: id => state.isItemTouched(id),
    onSelect: id => actions.switchActiveItem(id),
    onAddLikeCurrent: () => actions.handleAddLikeCurrent(),
    onAddByType: type => actions.handleAddByType(type),
    onDuplicate: id => actions.handleDuplicateItem(id),
    onDeleteIds: ids => actions.handleDeleteItems(ids),
    onMoveItem: (fromIdx, toIdx) => actions.handleMoveItem(fromIdx, toIdx),
    onChangeItemType: (id, newType) => actions.handleChangeTypeForId(id, newType),
    onBulkSetTopic: ids => modals.openBulkInputModal({
      title: `Gán chủ đề cho ${ids.length} mục`,
      label: 'Tên chủ đề:',
      placeholder: 'Nhập chủ đề (để trống nếu muốn xoá chủ đề)…',
      onConfirm: val => {
        let d = state.getDeck();
        for (const id of ids) d = updateItem(d, id, { topic: val.trim() });
        actions.commitDeck(d);
        syncPanes();
        showToast(`Đã gán chủ đề cho ${ids.length} mục.`, {
          actionLabel: 'Hoàn tác',
          onAction: () => actions.performUndo(),
        });
      },
    }),
    onBulkAddTag: ids => modals.openBulkInputModal({
      title: `Gán nhãn cho ${ids.length} mục`,
      label: 'Tên nhãn cần thêm:',
      placeholder: 'Nhập nhãn…',
      onConfirm: val => {
        const clean = val.trim();
        if (!clean) return;
        let d = state.getDeck();
        for (const id of ids) {
          const it = d.items.find(x => x.id === id);
          if (it) {
            const tags = [...new Set([...(it.tags || []), clean])];
            d = updateItem(d, id, { tags });
          }
        }
        actions.commitDeck(d);
        syncPanes();
        showToast(`Đã thêm nhãn "${clean}" cho ${ids.length} mục.`, {
          actionLabel: 'Hoàn tác',
          onAction: () => actions.performUndo(),
        });
      },
    }),
    onOpenAssetManager: () => modals.openImageManager(),
    onOpenBulkImport: () => modals.openBulkImportModal(),
  });

  panes.form = createFormPane({
    container: formColEl,
    deckKey: state.deckKey,
    rich,
    getDeck: state.getDeck,
    getItem: state.getActiveItem,
    getAssets: state.getAssets,
    getRecentSnippets: () => state.recentMathSnippets,
    onRecordRecentSnippet: snippetId => {
      state.recordRecentSnippet(snippetId);
      services.persistLayoutSettings();
    },
    isItemTouched: id => state.isItemTouched(id),
    getTouchedFields: id => state.getTouchedFields(id),
    markFieldTouched: field => state.markFieldTouched(field),
    onPatchItem: (patch, meta = {}) => {
      const cur = state.getActiveItem();
      if (!cur) return;
      const next = updateItem(state.getDeck(), cur.id, patch);
      actions.commitDeck(next, {
        mergeKey: meta.mergeKey ? `${cur.id}:${meta.mergeKey}` : undefined,
        cursor: meta.cursor,
        beforeCursor: meta.beforeCursor,
      });
      panes.list.patchRow(cur.id);
      panes.preview.render(state.getActiveItem());
    },
    onChangeType: newType => {
      const cur = state.getActiveItem();
      if (cur) actions.handleChangeTypeForId(cur.id, newType);
    },
    onNavigatePrev: () => actions.navigateRelative(-1),
    onNavigateNext: () => actions.navigateRelative(1),
    onDuplicate: () => { if (state.activeId) actions.handleDuplicateItem(state.activeId); },
    onDelete: () => { if (state.activeId) actions.handleDeleteItems([state.activeId]); },
    onUploadFile: file => services.uploadImageFile(file, {
      showToast,
      onAssetsRefreshed: () => {
        panes.list.render();
        panes.preview.render(state.getActiveItem(), { immediate: true });
      },
      onMarkDirty: () => {
        state.dirty = true;
        renderTopbar();
      },
    }),
    onPickImageDialog: () => services.pickImageFromDialog({
      showToast,
      onAssetsRefreshed: () => {
        panes.list.render();
        panes.preview.render(state.getActiveItem(), { immediate: true });
      },
      onMarkDirty: () => {
        state.dirty = true;
        renderTopbar();
      },
    }),
    onSetActiveTextarea: helper => { state.activeTextareaHelper = helper; },
    mobileTab: state.mobileTab,
    onChangeMobileTab: tab => {
      state.mobileTab = tab;
      syncLayout();
      panes.form.render();
    },
  });

  // 4. Global Shortcuts & Event Listeners
  cleanupShortcuts = registerGlobalShortcuts({
    shellEl,
    state,
    actions,
    modals,
    panes,
    ui,
  });

  // 5. Initial Render
  syncLayout();
  renderTopbar();
  panes.list.render();
  panes.form.render();
  panes.preview.render(state.getActiveItem(), { immediate: true });
  root.replaceChildren(shellEl);

  if (initialItemId && state.activeId) {
    queueMicrotask(() => panes.list.scrollToItem(state.activeId));
  }

  services.loadLayoutSettings({
    listColEl,
    previewColEl,
    onLayoutChange: () => {
      syncLayout();
      renderTopbar();
    },
  });

  services.refreshAssets(() => {
    panes.list.render();
    panes.preview.render(state.getActiveItem(), { immediate: true });
  });
}

