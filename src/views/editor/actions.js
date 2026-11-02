// src/views/editor/actions.js — Các hành động nghiệp vụ (Business Logic) của Editor
import { fileName } from '../dom.js';
import { validateItem, hasError } from '../../core/validate.js';
import {
  newItem,
  newItemId,
  newItemLike,
  isBlankNewItem,
  normalizeOnLeave,
  addItem,
  removeItems,
  duplicateItem,
  moveItem,
  updateItem,
  changeType,
  unusedAssets,
} from '../../core/deckmodel.js';
import { kindOf } from '../../core/deckkinds.js';
import { closeMathPopover } from './mathpopover.js';

export function createActions({ state, services, ui, modals, panes, appActions, cleanup }) {
  function commitDeck(nextDeck, opts = {}) {
    state.history.push(nextDeck, opts);
    state.dirty = true;
    ui.renderTopbar();
  }

  function finalizeCurrentItemBeforeLeave() {
    const cur = state.getActiveItem();
    if (!cur) return;
    if (!isBlankNewItem(cur)) {
      state.touchedItems.add(cur.id);
    }
    const normalized = normalizeOnLeave(cur);
    if (normalized !== cur) {
      const nextDeck = updateItem(state.getDeck(), cur.id, normalized);
      state.history.push(nextDeck);
    }
  }

  function switchActiveItem(nextId, { focusPrimary = false } = {}) {
    if (!nextId || nextId === state.activeId) return;
    closeMathPopover();
    finalizeCurrentItemBeforeLeave();
    state.activeId = nextId;
    state.drawerOpen = false;
    ui.syncResponsive();
    if (panes.list) panes.list.render();
    if (panes.form) panes.form.render();
    if (panes.preview) panes.preview.render(state.getActiveItem(), { immediate: true });
    if (panes.list) panes.list.scrollToItem(state.activeId);
    if (focusPrimary && panes.form) {
      panes.form.focusPrimaryField();
    }
  }

  function handleAddLikeCurrent() {
    finalizeCurrentItemBeforeLeave();
    const d = state.getDeck();
    const cur = state.getActiveItem();
    const curIdx = cur ? d.items.findIndex(i => i.id === cur.id) : d.items.length - 1;
    const item = newItemLike(d, cur);
    const next = addItem(d, item, curIdx + 1);
    state.activeId = item.id;
    commitDeck(next);
    ui.syncPanes({ focusPrimary: true });
  }

  function handleAddByType(type) {
    finalizeCurrentItemBeforeLeave();
    const d = state.getDeck();
    const cur = state.getActiveItem();
    const curIdx = cur ? d.items.findIndex(i => i.id === cur.id) : d.items.length - 1;
    const base = newItem(type, newItemId(d));
    if (type === 'single' || type === 'multi') {
      base.choices = ['', '', '', ''];
    }
    if (cur?.topic) base.topic = cur.topic;
    if (cur?.tags?.length) base.tags = [...cur.tags];
    const next = addItem(d, base, curIdx + 1);
    state.activeId = base.id;
    commitDeck(next);
    ui.syncPanes({ focusPrimary: true });
  }

  function handleDuplicateItem(id) {
    finalizeCurrentItemBeforeLeave();
    const beforeIds = new Set(state.getDeck().items.map(i => i.id));
    const next = duplicateItem(state.getDeck(), id);
    const added = next.items.find(i => !beforeIds.has(i.id));
    if (added) {
      state.activeId = added.id;
      state.touchedItems.add(added.id);
    }
    commitDeck(next);
    ui.syncPanes();
    ui.showToast('Đã nhân đôi mục.', {
      actionLabel: 'Hoàn tác',
      onAction: () => performUndo(),
    });
  }

  function handleChangeTypeForId(id, newType) {
    const d = state.getDeck();
    const it = d.items.find(i => i.id === id);
    if (!it) return;
    const converted = changeType(it, newType);
    const next = updateItem(d, id, converted);
    commitDeck(next);
    ui.syncPanes();
    ui.showToast('Đã đổi dạng câu hỏi.', {
      actionLabel: 'Hoàn tác',
      onAction: () => performUndo(),
    });
  }

  function handleDeleteItems(ids) {
    if (!ids?.length) return;
    const d = state.getDeck();
    if (d.items.length <= ids.length) {
      ui.showToast('Bộ thẻ phải giữ lại ít nhất 1 mục.');
      return;
    }

    const executeDelete = () => {
      const currentIdx = d.items.findIndex(i => i.id === state.activeId);
      const next = removeItems(d, ids);
      if (ids.includes(state.activeId)) {
        const nextIdx = Math.min(currentIdx, next.items.length - 1);
        state.activeId = next.items[Math.max(0, nextIdx)]?.id || null;
      }
      commitDeck(next);
      ui.syncPanes();
      ui.showToast(`Đã xoá ${ids.length} mục.`, {
        actionLabel: 'Hoàn tác',
        onAction: () => performUndo(),
      });
    };

    if (ids.length >= 5) {
      modals.openConfirmModal({
        title: `Xoá ${ids.length} mục?`,
        message: `Bạn sắp xoá ${ids.length} mục khỏi bộ thẻ. Bạn vẫn có thể Hoàn tác (Ctrl+Z) ngay sau khi xoá.`,
        confirmLabel: `Xoá ${ids.length} mục`,
        danger: true,
        onConfirm: executeDelete,
      });
    } else {
      executeDelete();
    }
  }

  function navigateRelative(delta) {
    const items = state.getDeck().items || [];
    const idx = items.findIndex(i => i.id === state.activeId);
    if (idx === -1) return;
    const targetIdx = idx + delta;
    if (targetIdx >= 0 && targetIdx < items.length) {
      switchActiveItem(items[targetIdx].id);
    }
  }

  function togglePreviewCollapse() {
    state.previewCollapsed = !state.previewCollapsed;
    ui.syncResponsive();
    ui.renderTopbar();
    services.persistLayoutSettings();
  }

  function performUndo() {
    if (!state.history.canUndo()) return;
    state.history.undo();
    const cur = state.history.cursor();
    const d = state.getDeck();
    if (cur?.itemId && d.items.some(i => i.id === cur.itemId)) {
      state.activeId = cur.itemId;
    } else if (!d.items.some(i => i.id === state.activeId)) {
      state.activeId = d.items[0]?.id || null;
    }
    state.dirty = true;
    ui.renderTopbar();
    ui.syncPanes();
    if (cur && panes.form) {
      panes.form.restoreCursor(cur);
    }
  }

  function performRedo() {
    if (!state.history.canRedo()) return;
    state.history.redo();
    const cur = state.history.cursor();
    const d = state.getDeck();
    if (cur?.itemId && d.items.some(i => i.id === cur.itemId)) {
      state.activeId = cur.itemId;
    } else if (!d.items.some(i => i.id === state.activeId)) {
      state.activeId = d.items[0]?.id || null;
    }
    state.dirty = true;
    ui.renderTopbar();
    ui.syncPanes();
    if (cur && panes.form) {
      panes.form.restoreCursor(cur);
    }
  }

  async function performSave(saveAs = false) {
    finalizeCurrentItemBeforeLeave();
    const d = state.getDeck();
    const resolvedKind = kindOf(d);
    const deckToSave = {
      ...d,
      meta: {
        ...d.meta,
        kind: resolvedKind,
      },
    };
    for (const it of deckToSave.items) state.touchedItems.add(it.id);

    const assetsMap = new Map(state.assetsList.map(a => [a.name, a]));
    const unused = unusedAssets(deckToSave, assetsMap);
    if (unused.length > 0) {
      const clean = window.confirm(
        `Bộ thẻ có ${unused.length} ảnh không được mục nào sử dụng. Bạn có muốn xoá các ảnh dư thừa trước khi lưu không?`
      );
      if (clean) {
        for (const p of unused) await services.removeAsset(p);
        await services.refreshAssets();
      }
    }

    const jsonText = JSON.stringify(deckToSave, null, 2);
    const res = await services.saveDeck(jsonText, { saveAs });
    if (res?.canceled) return false;
    if (!res?.ok) {
      ui.showToast('Không lưu được: ' + (res?.error || 'Lỗi không rõ'));
      return false;
    }

    state.entry.path = res.path;
    state.entry.deck = res.deck;
    state.entry.deckText = res.deckText;
    state.entry.issues = res.issues || [];
    state.entry.assetCount = res.assetCount;
    state.dirty = false;
    state.lastSavedAt = new Date();
    ui.renderTopbar();
    if (panes.list) panes.list.render();
    if (panes.form) panes.form.updateValidationUI();

    const updatedAssetsMap = new Map(state.assetsList.map(a => [a.name, a]));
    const incompleteCount = d.items.filter(it => hasError(validateItem(it, { assets: updatedAssetsMap }))).length;

    if (incompleteCount > 0) {
      ui.showToast(`Đã lưu. ${incompleteCount} mục chưa hoàn chỉnh sẽ được bỏ qua khi học.`, {
        actionLabel: 'Xem',
        onAction: () => panes.list && panes.list.setIncompleteFilter(true),
      });
    } else {
      ui.showToast(`Đã lưu "${fileName(res.path)}".`);
    }
    return true;
  }

  function handleTrialStudy() {
    finalizeCurrentItemBeforeLeave();
    const d = state.getDeck();
    const assetsMap = new Map(state.assetsList.map(a => [a.name, a]));
    const validItems = d.items.filter(it => !hasError(validateItem(it, { assets: assetsMap })));
    if (validItems.length === 0) {
      for (const it of d.items) state.touchedItems.add(it.id);
      if (panes.list) panes.list.render();
      if (panes.form) panes.form.updateValidationUI();
      ui.showToast('Chưa có mục nào hoàn chỉnh để học thử. Hãy bổ sung câu hỏi và đáp án trước.');
      return;
    }
    state.entry.deck = JSON.parse(JSON.stringify(d));
    state.entry.deckText = JSON.stringify(d, null, 2);
    if (appActions.startTrialSession) {
      appActions.startTrialSession(state.entry, d);
    } else {
      appActions.startSession(state.entry, { count: validItems.length, shuffle: false });
    }
  }

  function handleBack() {
    const goBack = () => {
      if (cleanup) cleanup();
      if (state.entry.path) appActions.openDeckView(state.entry);
      else appActions.home();
    };

    if (!state.dirty) {
      goBack();
      return;
    }

    modals.openUnsavedModal({
      onSaveAndExit: async () => {
        const ok = await performSave(false);
        if (ok) goBack();
      },
      onDiscardAndExit: () => goBack(),
    });
  }

  return {
    commitDeck,
    finalizeCurrentItemBeforeLeave,
    switchActiveItem,
    handleAddLikeCurrent,
    handleAddByType,
    handleDuplicateItem,
    handleChangeTypeForId,
    handleDeleteItems,
    navigateRelative,
    togglePreviewCollapse,
    performUndo,
    performRedo,
    performSave,
    handleTrialStudy,
    handleBack,
    handleMoveItem: (fromIdx, toIdx) => {
      const next = moveItem(state.getDeck(), fromIdx, toIdx);
      commitDeck(next);
      if (panes.list) panes.list.render();
      if (panes.form) panes.form.render();
    },
  };
}

