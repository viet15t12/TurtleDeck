// src/views/editor/editor.js — Khung 100vh 3 cột, Topbar, Splitter, Phím tắt, Undo/Redo toàn cục (study-app-editor-ux.md)
import { h, fileName } from '../dom.js';
import { makeRich } from '../../core/richtext.js';
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
  createHistory,
} from '../../core/deckmodel.js';
import {
  KINDS,
  kindOf,
  kindLabel,
  mismatchedItems,
  formatMismatchWarning,
} from '../../core/deckkinds.js';
import { createListPane } from './list.js';
import { createFormPane } from './form.js';
import { createPreviewPane } from './preview.js';
import { renderImageManagerModal } from './imagemanager.js';
import { renderBulkImportModal } from './bulkimport.js';
import { closeMathPopover } from './mathpopover.js';

function formatTimeHHMM(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function renderEditor(root, { entry, initialItemId }, actions) {
  const api = window.api;
  const deckKey = entry.deckKey;
  const rich = makeRich(deckKey);

  // Khởi tạo bộ thẻ có ít nhất 1 mục (dạng mặc định theo loại bộ thẻ)
  let initialDeck = JSON.parse(JSON.stringify(entry.deck));
  initialDeck.meta = {
    ...initialDeck.meta,
    kind: kindOf(initialDeck),
  };
  if (!initialDeck.items || initialDeck.items.length === 0) {
    const first = newItemLike(initialDeck);
    initialDeck = addItem(initialDeck, first);
  }

  const history = createHistory(initialDeck, 100);
  let activeId = (initialItemId && initialDeck.items.some(i => i.id === initialItemId))
    ? initialItemId
    : (initialDeck.items[0]?.id || null);
  let dirty = !entry.path;
  let lastSavedAt = entry.path ? new Date() : null;
  let assetsList = [];
  let activeTextareaHelper = null;

  // Trạng thái kiểm tra lỗi đúng lúc (§9)
  // Các mục có sẵn khi mở bộ thẻ (không rỗng) được coi là đã kiểm tra
  const touchedItems = new Set();
  const touchedFieldsByItem = new Map(); // itemId -> Set<field>
  for (const it of initialDeck.items) {
    if (!isBlankNewItem(it)) touchedItems.add(it.id);
  }

  // Bố cục 3 cột & độ rộng lưu trong settings.json (§3)
  let listWidth = 260;
  let previewWidth = 400;
  let previewCollapsed = false;
  let recentMathSnippets = ['frac', 'sqrt', 'pow', 'sub', 'sum', 'int'];
  let mobileTab = 'form'; // 'form' | 'preview' (khi < 1200px)
  let drawerOpen = false; // (khi < 900px)
  let saveMenuOpen = false;
  let editingTitle = false;

  const getDeck = () => history.current();
  const getActiveItem = () => getDeck().items.find(i => i.id === activeId) || getDeck().items[0] || null;
  const getAssets = () => assetsList;

  function isItemTouched(id) {
    return touchedItems.has(id);
  }

  function getTouchedFields(id) {
    if (!touchedFieldsByItem.has(id)) touchedFieldsByItem.set(id, new Set());
    return touchedFieldsByItem.get(id);
  }

  function markFieldTouched(field) {
    if (!activeId) return;
    getTouchedFields(activeId).add(field);
  }

  function syncWindowTitle() {
    const t = getDeck().meta?.title || 'Bộ thẻ';
    document.title = `${dirty ? '● ' : ''}${t} — Soạn bộ thẻ`;
  }

  // ── Toast thông báo góc dưới kèm nút hành động (§4, §5) ───────────────────
  const toastHost = h('div', { class: 'ux-toast-host' });
  let currentToastTimer = null;

  function showToast(message, { actionLabel, onAction, duration = 5000 } = {}) {
    if (currentToastTimer) {
      clearTimeout(currentToastTimer);
      currentToastTimer = null;
    }
    const toastEl = h('div', { class: 'ux-toast', role: 'status' },
      h('span', null, message),
      actionLabel ? h('button', {
        type: 'button',
        class: 'ux-toast-action',
        onclick: () => {
          toastEl.remove();
          if (onAction) onAction();
        },
      }, actionLabel) : null,
      h('button', {
        type: 'button',
        class: 'ux-toast-close',
        title: 'Đóng',
        onclick: () => toastEl.remove(),
      }, '✕'));

    toastHost.replaceChildren(toastEl);
    if (duration > 0) {
      currentToastTimer = setTimeout(() => toastEl.remove(), duration);
    }
  }

  // ── Khung DOM chính ────────────────────────────────────────────────────────
  const topbarEl = h('header', { class: 'editor-topbar' });
  const listColEl = h('aside', {
    class: 'editor-col-list',
    style: `width: ${listWidth}px;`,
  });
  const formColEl = h('main', { class: 'editor-col-form' });
  const previewColEl = h('aside', {
    class: 'editor-col-preview',
    style: `width: ${previewWidth}px;`,
  });

  const leftSplitter = createSplitter('left');
  const rightSplitter = createSplitter('right');

  const drawerBackdrop = h('div', {
    class: 'editor-drawer-backdrop',
    onclick: () => {
      drawerOpen = false;
      syncResponsiveClasses();
    },
  });

  const bodyEl = h('div', { class: 'editor-body' },
    drawerBackdrop,
    listColEl,
    leftSplitter,
    formColEl,
    rightSplitter,
    previewColEl);

  const shellEl = h('div', { class: 'editor-shell' }, topbarEl, bodyEl, toastHost);

  function syncResponsiveClasses() {
    bodyEl.classList.toggle('mobile-show-preview', mobileTab === 'preview');
    bodyEl.classList.toggle('drawer-open', drawerOpen);
    previewColEl.classList.toggle('collapsed', previewCollapsed);
    rightSplitter.style.display = previewCollapsed ? 'none' : '';
  }

  // Kéo vách ngăn 6px và lưu vào settings.json (§3)
  function createSplitter(side) {
    const sp = h('div', {
      class: 'editor-splitter',
      title: 'Kéo để thay đổi độ rộng cột',
      onmousedown: ev => {
        ev.preventDefault();
        sp.classList.add('dragging');
        const startX = ev.clientX;
        const startW = side === 'left' ? listWidth : previewWidth;

        const onMove = moveEv => {
          const dx = moveEv.clientX - startX;
          if (side === 'left') {
            listWidth = Math.max(200, Math.min(400, startW + dx));
            listColEl.style.width = `${listWidth}px`;
          } else {
            previewWidth = Math.max(320, Math.min(640, startW - dx));
            previewColEl.style.width = `${previewWidth}px`;
          }
        };

        const onUp = () => {
          sp.classList.remove('dragging');
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          persistLayoutSettings();
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      },
    });
    return sp;
  }

  async function loadLayoutSettings() {
    try {
      const s = await api.loadSettings();
      if (typeof s?.editorListWidth === 'number') {
        listWidth = Math.max(200, Math.min(400, s.editorListWidth));
        listColEl.style.width = `${listWidth}px`;
      }
      if (typeof s?.editorPreviewWidth === 'number') {
        previewWidth = Math.max(320, Math.min(640, s.editorPreviewWidth));
        previewColEl.style.width = `${previewWidth}px`;
      }
      if (typeof s?.editorPreviewCollapsed === 'boolean') {
        previewCollapsed = s.editorPreviewCollapsed;
        syncResponsiveClasses();
        renderTopbar();
      }
      if (Array.isArray(s?.recentMathSnippets)) {
        recentMathSnippets = s.recentMathSnippets.slice(0, 8);
      }
    } catch {
      // Bỏ qua nếu không đọc được settings
    }
  }

  async function persistLayoutSettings() {
    try {
      await api.saveSettings({
        editorListWidth: listWidth,
        editorPreviewWidth: previewWidth,
        editorPreviewCollapsed: previewCollapsed,
        recentMathSnippets,
      });
    } catch {
      // Bỏ qua
    }
  }

  function recordRecentSnippet(snippetId) {
    if (!snippetId) return;
    recentMathSnippets = [snippetId, ...recentMathSnippets.filter(id => id !== snippetId)].slice(0, 8);
    persistLayoutSettings();
  }

  // ── Quản lý tài nguyên ảnh ─────────────────────────────────────────────────
  async function refreshAssets() {
    const res = await api.listAssets(deckKey);
    if (res?.ok) {
      assetsList = res.assets || [];
      listPane.render();
      previewPane.render(getActiveItem(), { immediate: true });
    }
  }

  async function uploadImageFile(file) {
    try {
      const buf = await file.arrayBuffer();
      const res = await api.addImageBytes(deckKey, new Uint8Array(buf), file.name || 'clipboard.png');
      if (!res?.ok) {
        showToast('Không chèn được ảnh: ' + (res?.error || 'Lỗi'));
        return null;
      }
      await refreshAssets();
      dirty = true;
      renderTopbar();
      return res.path;
    } catch (e) {
      showToast('Lỗi đọc ảnh: ' + (e?.message || e));
      return null;
    }
  }

  async function pickImageFromDialog() {
    const res = await api.addImages(deckKey);
    if (!res?.length) return null;
    const first = res[0];
    if (!first.ok) {
      showToast('Không thêm được ảnh: ' + (first.error || 'Lỗi'));
      return null;
    }
    await refreshAssets();
    dirty = true;
    renderTopbar();
    return first.path;
  }

  // ── Chuẩn hoá mục trước khi rời đi (§6.2, §9) ─────────────────────────────
  function finalizeCurrentItemBeforeLeave() {
    const cur = getActiveItem();
    if (!cur) return;
    if (!isBlankNewItem(cur)) {
      touchedItems.add(cur.id);
    }
    const normalized = normalizeOnLeave(cur);
    if (normalized !== cur) {
      const nextDeck = updateItem(getDeck(), cur.id, normalized);
      history.push(nextDeck);
    }
  }

  function switchActiveItem(nextId, { focusPrimary = false } = {}) {
    if (!nextId || nextId === activeId) return;
    closeMathPopover();
    finalizeCurrentItemBeforeLeave();
    activeId = nextId;
    drawerOpen = false;
    syncResponsiveClasses();
    listPane.render();
    formPane.render();
    previewPane.render(getActiveItem(), { immediate: true });
    listPane.scrollToItem(activeId);
    if (focusPrimary) {
      formPane.focusPrimaryField();
    }
  }

  // ── Các vùng giao diện con ─────────────────────────────────────────────────
  const previewPane = createPreviewPane({
    container: previewColEl,
    deckKey,
    rich,
    getAssets,
    onToggleCollapse: () => togglePreviewCollapse(),
  });

  const listPane = createListPane({
    container: listColEl,
    getDeck,
    getAssets,
    getActiveId: () => activeId,
    isItemTouched,
    onSelect: id => switchActiveItem(id),
    onAddLikeCurrent: () => handleAddLikeCurrent(),
    onAddByType: type => handleAddByType(type),
    onDuplicate: id => handleDuplicateItem(id),
    onDeleteIds: ids => handleDeleteItems(ids),
    onMoveItem: (fromIdx, toIdx) => {
      const next = moveItem(getDeck(), fromIdx, toIdx);
      commitDeck(next);
      listPane.render();
      formPane.render();
    },
    onChangeItemType: (id, newType) => handleChangeTypeForId(id, newType),
    onBulkSetTopic: ids => openBulkInputModal({
      title: `Gán chủ đề cho ${ids.length} mục`,
      label: 'Tên chủ đề:',
      placeholder: 'Nhập chủ đề (để trống nếu muốn xoá chủ đề)…',
      onConfirm: val => {
        let d = getDeck();
        for (const id of ids) d = updateItem(d, id, { topic: val.trim() });
        commitDeck(d);
        listPane.render();
        formPane.render();
        showToast(`Đã gán chủ đề cho ${ids.length} mục.`, {
          actionLabel: 'Hoàn tác',
          onAction: () => performUndo(),
        });
      },
    }),
    onBulkAddTag: ids => openBulkInputModal({
      title: `Gán nhãn cho ${ids.length} mục`,
      label: 'Tên nhãn cần thêm:',
      placeholder: 'Nhập nhãn…',
      onConfirm: val => {
        const clean = val.trim();
        if (!clean) return;
        let d = getDeck();
        for (const id of ids) {
          const it = d.items.find(x => x.id === id);
          if (it) {
            const tags = [...new Set([...(it.tags || []), clean])];
            d = updateItem(d, id, { tags });
          }
        }
        commitDeck(d);
        listPane.render();
        formPane.render();
        showToast(`Đã thêm nhãn "${clean}" cho ${ids.length} mục.`, {
          actionLabel: 'Hoàn tác',
          onAction: () => performUndo(),
        });
      },
    }),
    onOpenAssetManager: () => openImageManager(),
    onOpenBulkImport: () => openBulkImportModal(),
  });

  const formPane = createFormPane({
    container: formColEl,
    deckKey,
    rich,
    getDeck,
    getItem: getActiveItem,
    getAssets,
    getRecentSnippets: () => recentMathSnippets,
    onRecordRecentSnippet: recordRecentSnippet,
    isItemTouched,
    getTouchedFields,
    markFieldTouched,
    onPatchItem: (patch, meta = {}) => {
      const cur = getActiveItem();
      if (!cur) return;
      const next = updateItem(getDeck(), cur.id, patch);
      commitDeck(next, {
        mergeKey: meta.mergeKey ? `${cur.id}:${meta.mergeKey}` : undefined,
        cursor: meta.cursor,
        beforeCursor: meta.beforeCursor,
      });
      // Chỉ vá đúng hàng đang gõ ở cột Danh sách + cập nhật Xem trước, KHÔNG render lại Form (§13.2)
      listPane.patchRow(cur.id);
      previewPane.render(getActiveItem());
    },
    onChangeType: newType => {
      const cur = getActiveItem();
      if (cur) handleChangeTypeForId(cur.id, newType);
    },
    onNavigatePrev: () => navigateRelative(-1),
    onNavigateNext: () => navigateRelative(1),
    onDuplicate: () => { if (activeId) handleDuplicateItem(activeId); },
    onDelete: () => { if (activeId) handleDeleteItems([activeId]); },
    onUploadFile: file => uploadImageFile(file),
    onPickImageDialog: () => pickImageFromDialog(),
    onSetActiveTextarea: helper => { activeTextareaHelper = helper; },
    mobileTab,
    onChangeMobileTab: tab => {
      mobileTab = tab;
      syncResponsiveClasses();
      formPane.render();
    },
  });

  function commitDeck(nextDeck, opts = {}) {
    history.push(nextDeck, opts);
    dirty = true;
    renderTopbar();
  }

  function handleAddLikeCurrent() {
    finalizeCurrentItemBeforeLeave();
    const d = getDeck();
    const cur = getActiveItem();
    const curIdx = cur ? d.items.findIndex(i => i.id === cur.id) : d.items.length - 1;
    const item = newItemLike(d, cur);
    const next = addItem(d, item, curIdx + 1);
    activeId = item.id;
    commitDeck(next);
    listPane.render();
    formPane.render();
    previewPane.render(getActiveItem(), { immediate: true });
    listPane.scrollToItem(activeId);
    formPane.focusPrimaryField();
  }

  function handleAddByType(type) {
    finalizeCurrentItemBeforeLeave();
    const d = getDeck();
    const cur = getActiveItem();
    const curIdx = cur ? d.items.findIndex(i => i.id === cur.id) : d.items.length - 1;
    const base = newItem(type, newItemId(d));
    if (type === 'single' || type === 'multi') {
      base.choices = ['', '', '', ''];
    }
    if (cur?.topic) base.topic = cur.topic;
    if (cur?.tags?.length) base.tags = [...cur.tags];
    const next = addItem(d, base, curIdx + 1);
    activeId = base.id;
    commitDeck(next);
    listPane.render();
    formPane.render();
    previewPane.render(getActiveItem(), { immediate: true });
    listPane.scrollToItem(activeId);
    formPane.focusPrimaryField();
  }

  function handleDuplicateItem(id) {
    finalizeCurrentItemBeforeLeave();
    const beforeIds = new Set(getDeck().items.map(i => i.id));
    const next = duplicateItem(getDeck(), id);
    const added = next.items.find(i => !beforeIds.has(i.id));
    if (added) {
      activeId = added.id;
      touchedItems.add(added.id);
    }
    commitDeck(next);
    listPane.render();
    formPane.render();
    previewPane.render(getActiveItem(), { immediate: true });
    listPane.scrollToItem(activeId);
    showToast('Đã nhân đôi mục.', {
      actionLabel: 'Hoàn tác',
      onAction: () => performUndo(),
    });
  }

  function handleChangeTypeForId(id, newType) {
    const d = getDeck();
    const it = d.items.find(i => i.id === id);
    if (!it) return;
    const converted = changeType(it, newType);
    const next = updateItem(d, id, converted);
    commitDeck(next);
    listPane.render();
    formPane.render();
    previewPane.render(getActiveItem(), { immediate: true });
    showToast('Đã đổi dạng câu hỏi.', {
      actionLabel: 'Hoàn tác',
      onAction: () => performUndo(),
    });
  }

  function handleDeleteItems(ids) {
    if (!ids?.length) return;
    const d = getDeck();
    if (d.items.length <= ids.length) {
      showToast('Bộ thẻ phải giữ lại ít nhất 1 mục.');
      return;
    }

    const executeDelete = () => {
      const currentIdx = d.items.findIndex(i => i.id === activeId);
      const next = removeItems(d, ids);
      if (ids.includes(activeId)) {
        const nextIdx = Math.min(currentIdx, next.items.length - 1);
        activeId = next.items[Math.max(0, nextIdx)]?.id || null;
      }
      commitDeck(next);
      listPane.render();
      formPane.render();
      previewPane.render(getActiveItem(), { immediate: true });
      showToast(`Đã xoá ${ids.length} mục.`, {
        actionLabel: 'Hoàn tác',
        onAction: () => performUndo(),
      });
    };

    // Xoá từ 5 mục trở lên mới hiện hộp thoại xác nhận (§4, §5)
    if (ids.length >= 5) {
      openConfirmModal({
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
    const items = getDeck().items || [];
    const idx = items.findIndex(i => i.id === activeId);
    if (idx === -1) return;
    const targetIdx = idx + delta;
    if (targetIdx >= 0 && targetIdx < items.length) {
      switchActiveItem(items[targetIdx].id);
    }
  }

  function togglePreviewCollapse() {
    previewCollapsed = !previewCollapsed;
    syncResponsiveClasses();
    renderTopbar();
    persistLayoutSettings();
  }

  // ── Undo / Redo toàn cục có khôi phục mục & vị trí con trỏ (§13.3) ─────────
  function performUndo() {
    if (!history.canUndo()) return;
    history.undo();
    const cur = history.cursor();
    const d = getDeck();
    if (cur?.itemId && d.items.some(i => i.id === cur.itemId)) {
      activeId = cur.itemId;
    } else if (!d.items.some(i => i.id === activeId)) {
      activeId = d.items[0]?.id || null;
    }
    dirty = true;
    renderTopbar();
    listPane.render();
    formPane.render();
    previewPane.render(getActiveItem(), { immediate: true });
    if (cur) {
      formPane.restoreCursor(cur);
    }
  }

  function performRedo() {
    if (!history.canRedo()) return;
    history.redo();
    const cur = history.cursor();
    const d = getDeck();
    if (cur?.itemId && d.items.some(i => i.id === cur.itemId)) {
      activeId = cur.itemId;
    } else if (!d.items.some(i => i.id === activeId)) {
      activeId = d.items[0]?.id || null;
    }
    dirty = true;
    renderTopbar();
    listPane.render();
    formPane.render();
    previewPane.render(getActiveItem(), { immediate: true });
    if (cur) {
      formPane.restoreCursor(cur);
    }
  }

  // ── Lưu bộ thẻ (§4) ────────────────────────────────────────────────────────
  async function performSave(saveAs = false) {
    finalizeCurrentItemBeforeLeave();
    const d = getDeck();
    const resolvedKind = kindOf(d);
    const deckToSave = {
      ...d,
      meta: {
        ...d.meta,
        kind: resolvedKind,
      },
    };
    for (const it of deckToSave.items) touchedItems.add(it.id);

    const assetsMap = new Map(assetsList.map(a => [a.name, a]));
    const unused = unusedAssets(deckToSave, assetsMap);
    if (unused.length > 0) {
      const clean = window.confirm(
        `Bộ thẻ có ${unused.length} ảnh không được mục nào sử dụng. Bạn có muốn xoá các ảnh dư thừa trước khi lưu không?`
      );
      if (clean) {
        for (const p of unused) await api.removeAsset(deckKey, p);
        await refreshAssets();
      }
    }

    const jsonText = JSON.stringify(deckToSave, null, 2);
    const res = await api.saveDeck(deckKey, jsonText, { saveAs });
    if (res?.canceled) return false;
    if (!res?.ok) {
      showToast('Không lưu được: ' + (res?.error || 'Lỗi không rõ'));
      return false;
    }

    entry.path = res.path;
    entry.deck = res.deck;
    entry.deckText = res.deckText;
    entry.issues = res.issues || [];
    entry.assetCount = res.assetCount;
    dirty = false;
    lastSavedAt = new Date();
    renderTopbar();
    listPane.render();
    formPane.updateValidationUI();

    const updatedAssetsMap = new Map(assetsList.map(a => [a.name, a]));
    const incompleteCount = d.items.filter(it => hasError(validateItem(it, { assets: updatedAssetsMap }))).length;

    if (incompleteCount > 0) {
      showToast(`Đã lưu. ${incompleteCount} mục chưa hoàn chỉnh sẽ được bỏ qua khi học.`, {
        actionLabel: 'Xem',
        onAction: () => listPane.setIncompleteFilter(true),
      });
    } else {
      showToast(`Đã lưu "${fileName(res.path)}".`);
    }
    return true;
  }

  // ── Học thử ngay trên bộ thẻ đang soạn (§4) ───────────────────────────────
  function handleTrialStudy() {
    finalizeCurrentItemBeforeLeave();
    const d = getDeck();
    const assetsMap = new Map(assetsList.map(a => [a.name, a]));
    const validItems = d.items.filter(it => !hasError(validateItem(it, { assets: assetsMap })));
    if (validItems.length === 0) {
      for (const it of d.items) touchedItems.add(it.id);
      listPane.render();
      formPane.updateValidationUI();
      showToast('Chưa có mục nào hoàn chỉnh để học thử. Hãy bổ sung câu hỏi và đáp án trước.');
      return;
    }
    entry.deck = JSON.parse(JSON.stringify(d));
    entry.deckText = JSON.stringify(d, null, 2);
    if (actions.startTrialSession) {
      actions.startTrialSession(entry, d);
    } else {
      actions.startSession(entry, { count: validItems.length, shuffle: false });
    }
  }

  // ── Quay lại với hộp thoại 3 lựa chọn khi chưa lưu (§4) ───────────────────
  function handleBack() {
    const goBack = () => {
      cleanup();
      if (entry.path) actions.openDeckView(entry);
      else actions.home();
    };

    if (!dirty) {
      goBack();
      return;
    }

    openUnsavedModal({
      onSaveAndExit: async () => {
        const ok = await performSave(false);
        if (ok) goBack();
      },
      onDiscardAndExit: () => goBack(),
    });
  }

  // ── Thanh trên Topbar (§4) ─────────────────────────────────────────────────
  function renderTopbar() {
    syncWindowTitle();
    const d = getDeck();

    let titleNode;
    if (editingTitle) {
      const inp = h('input', {
        type: 'text',
        class: 'editor-title-input',
        value: d.meta.title || '',
        onkeydown: ev => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            inp.blur();
          } else if (ev.key === 'Escape') {
            editingTitle = false;
            renderTopbar();
          }
        },
        onblur: () => {
          const val = inp.value.trim();
          editingTitle = false;
          if (val && val !== d.meta.title) {
            const next = { ...d, meta: { ...d.meta, title: val } };
            commitDeck(next);
          } else {
            renderTopbar();
          }
        },
      });
      titleNode = inp;
      queueMicrotask(() => {
        inp.focus();
        inp.select();
      });
    } else {
      titleNode = h('button', {
        type: 'button',
        class: 'editor-title-btn',
        title: 'Bấm để đổi tên bộ thẻ',
        onclick: () => {
          editingTitle = true;
          renderTopbar();
        },
      },
        h('span', { class: 'editor-title-text' }, d.meta.title || 'Bộ thẻ chưa đặt tên'),
        h('span', { class: 'editor-title-pencil' }, '✎'));
    }

    const statusNode = dirty
      ? h('span', { class: 'editor-save-status unsaved' },
          h('span', { class: 'status-dot' }),
          'Chưa lưu')
      : h('span', { class: 'editor-save-status' },
          lastSavedAt ? `Đã lưu ${formatTimeHHMM(lastSavedAt)}` : 'Đã lưu');

    const saveDropdown = saveMenuOpen ? h('div', {
      class: 'ux-popover align-right',
      onclick: ev => ev.stopPropagation(),
    },
      h('button', {
        class: 'ux-popover-item',
        onclick: () => {
          saveMenuOpen = false;
          renderTopbar();
          performSave(true);
        },
      }, 'Lưu thành bản sao…'),
      h('button', {
        class: 'ux-popover-item',
        onclick: () => {
          saveMenuOpen = false;
          renderTopbar();
          performSave(true);
        },
      }, 'Xuất bản sao (.sdeck)…'),
      h('div', { class: 'ux-popover-sep' }),
      h('button', {
        class: 'ux-popover-item',
        onclick: () => {
          saveMenuOpen = false;
          renderTopbar();
          openDeckMetaModal();
        },
      }, 'Thông tin bộ thẻ…'),
      h('button', {
        class: 'ux-popover-item',
        onclick: () => {
          saveMenuOpen = false;
          renderTopbar();
          openBulkImportModal();
        },
      }, 'Nhập hàng loạt…'),
      h('button', {
        class: 'ux-popover-item',
        onclick: () => {
          saveMenuOpen = false;
          renderTopbar();
          openImageManager();
        },
      }, `Quản lý ảnh (${assetsList.length})…`),
      h('div', { class: 'ux-popover-sep' }),
      h('button', {
        class: 'ux-popover-item',
        onclick: () => {
          saveMenuOpen = false;
          renderTopbar();
          openShortcutsModal();
        },
      }, 'Bảng phím tắt (Ctrl+/)')) : null;

    const currentKind = kindOf(d);
    const kindBadgeNode = h('button', {
      type: 'button',
      class: 'ux-kind-badge',
      'data-kind': currentKind,
      title: 'Loại bộ thẻ — bấm để mở Thông tin bộ thẻ',
      style: 'cursor: pointer;',
      onclick: () => openDeckMetaModal(),
    }, KINDS[currentKind]?.icon || '📝', kindLabel(currentKind));

    topbarEl.replaceChildren(
      h('div', { class: 'editor-topbar-left' },
        h('button', {
          type: 'button',
          class: 'ux-icon-btn editor-drawer-btn',
          title: 'Mở danh sách mục',
          onclick: () => {
            drawerOpen = !drawerOpen;
            syncResponsiveClasses();
          },
        }, '☰'),
        h('button', {
          type: 'button',
          class: 'ux-icon-btn',
          title: 'Quay lại bộ thẻ',
          onclick: handleBack,
        }, '←'),
        titleNode,
        kindBadgeNode,
        statusNode),

      h('div', { class: 'editor-topbar-right' },
        previewCollapsed ? h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          title: 'Hiện lại cột Xem trước (Ctrl+\\)',
          onclick: togglePreviewCollapse,
        }, '⇤ Xem trước') : null,
        h('button', {
          type: 'button',
          class: 'ux-btn sm',
          title: 'Học thử ngay trên bộ đang soạn',
          onclick: handleTrialStudy,
        }, '▶ Học thử'),
        h('button', {
          type: 'button',
          class: 'ux-icon-btn',
          disabled: !history.canUndo(),
          title: 'Hoàn tác (Ctrl+Z)',
          onclick: performUndo,
        }, '↶'),
        h('button', {
          type: 'button',
          class: 'ux-icon-btn',
          disabled: !history.canRedo(),
          title: 'Làm lại (Ctrl+Y)',
          onclick: performRedo,
        }, '↷'),
        h('div', { class: 'ux-split-btn' },
          h('button', {
            type: 'button',
            class: 'ux-btn primary sm',
            title: 'Lưu bộ thẻ (Ctrl+S)',
            onclick: () => performSave(false),
          }, 'Lưu'),
          h('button', {
            type: 'button',
            class: 'ux-btn primary sm ux-split-caret',
            title: 'Tác vụ lưu & cài đặt bộ thẻ',
            onclick: ev => {
              ev.stopPropagation();
              saveMenuOpen = !saveMenuOpen;
              renderTopbar();
            },
          }, '▾'),
          saveDropdown))
    );
  }

  // ── Các hộp thoại phụ trợ ──────────────────────────────────────────────────
  let activeModalEl = null;
  function closeModal() {
    if (activeModalEl) {
      activeModalEl.remove();
      activeModalEl = null;
    }
  }

  function openUnsavedModal({ onSaveAndExit, onDiscardAndExit }) {
    closeModal();
    activeModalEl = h('div', {
      class: 'modal-backdrop',
      onclick: ev => { if (ev.target === activeModalEl) closeModal(); },
    },
      h('div', { class: 'modal-dialog' },
        h('h2', null, 'Thay đổi chưa được lưu'),
        h('p', { class: 'muted', style: 'margin: 8px 0 20px;' },
          `Bộ thẻ "${getDeck().meta.title}" có thay đổi chưa lưu. Bạn muốn làm gì trước khi rời màn hình soạn?`),
        h('div', { class: 'toolbar', style: 'justify-content: flex-end; gap: 8px;' },
          h('button', {
            type: 'button',
            class: 'ux-btn ghost',
            onclick: closeModal,
          }, 'Ở lại'),
          h('button', {
            type: 'button',
            class: 'ux-btn danger-hover',
            onclick: () => { closeModal(); onDiscardAndExit(); },
          }, 'Không lưu'),
          h('button', {
            type: 'button',
            class: 'ux-btn primary',
            onclick: () => { closeModal(); onSaveAndExit(); },
          }, 'Lưu & Quay lại'))));
    shellEl.append(activeModalEl);
  }

  function openConfirmModal({ title, message, confirmLabel, danger, onConfirm }) {
    closeModal();
    activeModalEl = h('div', {
      class: 'modal-backdrop',
      onclick: ev => { if (ev.target === activeModalEl) closeModal(); },
    },
      h('div', { class: 'modal-dialog' },
        h('h2', null, title),
        h('p', { class: 'muted', style: 'margin: 8px 0 20px;' }, message),
        h('div', { class: 'toolbar', style: 'justify-content: flex-end; gap: 8px;' },
          h('button', { type: 'button', class: 'ux-btn ghost', onclick: closeModal }, 'Huỷ'),
          h('button', {
            type: 'button',
            class: `ux-btn ${danger ? 'danger' : 'primary'}`,
            onclick: () => { closeModal(); onConfirm(); },
          }, confirmLabel || 'Xác nhận'))));
    shellEl.append(activeModalEl);
  }

  function openBulkInputModal({ title, label, placeholder, onConfirm }) {
    closeModal();
    const inp = h('input', {
      type: 'text',
      class: 'ux-input',
      placeholder,
      onkeydown: ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          const val = inp.value;
          closeModal();
          onConfirm(val);
        }
      },
    });
    activeModalEl = h('div', {
      class: 'modal-backdrop',
      onclick: ev => { if (ev.target === activeModalEl) closeModal(); },
    },
      h('div', { class: 'modal-dialog' },
        h('h2', null, title),
        h('div', { class: 'form-field', style: 'margin: 14px 0 20px;' },
          h('label', { class: 'form-label' }, label),
          inp),
        h('div', { class: 'toolbar', style: 'justify-content: flex-end; gap: 8px;' },
          h('button', { type: 'button', class: 'ux-btn ghost', onclick: closeModal }, 'Huỷ'),
          h('button', {
            type: 'button',
            class: 'ux-btn primary',
            onclick: () => {
              const val = inp.value;
              closeModal();
              onConfirm(val);
            },
          }, 'Áp dụng'))));
    shellEl.append(activeModalEl);
    queueMicrotask(() => inp.focus());
  }

  function openDeckMetaModal() {
    closeModal();
    const d = getDeck();
    const meta = d.meta || {};
    let title = meta.title || '';
    let description = meta.description || '';
    let lang = meta.lang || 'vi';
    let kind = kindOf(d);

    const kindGridHost = h('div', { class: 'ux-kind-grid' });
    const mismatchHost = h('div');
    const descCountEl = h('span', { class: 'muted', style: 'font-size: 12px;' }, `${description.length}/200`);

    function renderKindCardsAndWarning() {
      kindGridHost.replaceChildren(
        ...['qa', 'quiz', 'vocab'].map(k => {
          const info = KINDS[k];
          const isVocabLocked = !info.available && kindOf(d) !== k;
          const isActive = kind === k;
          return h('button', {
            type: 'button',
            class: `ux-kind-card ${isActive ? 'active' : ''} ${isVocabLocked ? 'disabled' : ''}`,
            'data-kind': k,
            disabled: isVocabLocked,
            onclick: () => {
              if (isVocabLocked) return;
              kind = k;
              renderKindCardsAndWarning();
            },
          },
            h('div', { class: 'ux-kind-card-head' },
              h('span', { class: 'ux-kind-icon' }, info.icon),
              info.comingSoon ? h('span', { class: 'ux-kind-soon' }, info.comingSoon) : null),
            h('div', { class: 'ux-kind-title' }, info.label),
            h('div', { class: 'ux-kind-desc' }, info.description));
        })
      );

      const mismatched = mismatchedItems(d, kind);
      if (mismatched.length > 0) {
        mismatchHost.replaceChildren(
          h('div', { class: 'ux-mismatch-banner', style: 'margin-top: 8px;' },
            h('span', { style: 'font-weight: 700;' }, '⚠'),
            h('div', null,
              h('div', { style: 'font-weight: 600;' }, formatMismatchWarning(d, kind)),
              h('div', { style: 'font-size: 12px; margin-top: 2px;' },
                `Có ${mismatched.length} mục lệch loại với "${kindLabel(kind)}". Các mục này không bị xoá hay tự chuyển đổi.`)))
        );
      } else {
        mismatchHost.replaceChildren();
      }
    }

    renderKindCardsAndWarning();

    activeModalEl = h('div', {
      class: 'modal-backdrop',
      onclick: ev => { if (ev.target === activeModalEl) closeModal(); },
    },
      h('div', { class: 'modal-dialog', style: 'max-width: 600px; width: 94vw;' },
        h('h2', null, 'Thông tin bộ thẻ'),
        h('div', { style: 'display: flex; flex-direction: column; gap: 14px; margin: 14px 0 20px;' },
          h('div', { class: 'form-field' },
            h('label', { class: 'form-label' }, 'Tên bộ thẻ'),
            h('input', {
              type: 'text',
              class: 'ux-input',
              value: title,
              oninput: ev => { title = ev.target.value; },
            })),
          h('div', { class: 'form-field' },
            h('label', { class: 'form-label' }, 'Loại bộ thẻ'),
            kindGridHost,
            mismatchHost),
          h('div', { class: 'form-field' },
            h('div', { class: 'form-label-row' },
              h('label', { class: 'form-label' }, 'Mô tả (tuỳ chọn, tối đa 200 ký tự)'),
              descCountEl),
            h('textarea', {
              class: 'ux-textarea',
              rows: '2',
              maxLength: 200,
              placeholder: 'Mô tả ngắn về nội dung bộ thẻ (hiện trên thẻ ở trang chủ)…',
              value: description,
              oninput: ev => {
                description = ev.target.value.slice(0, 200);
                descCountEl.textContent = `${description.length}/200`;
              },
            })),
          h('div', { class: 'form-field', style: 'max-width: 180px;' },
            h('label', { class: 'form-label' }, 'Ngôn ngữ'),
            h('input', {
              type: 'text',
              class: 'ux-input',
              value: lang,
              oninput: ev => { lang = ev.target.value; },
            }))),
        h('div', { class: 'toolbar', style: 'justify-content: flex-end; gap: 8px;' },
          h('button', { type: 'button', class: 'ux-btn ghost', onclick: closeModal }, 'Huỷ'),
          h('button', {
            type: 'button',
            class: 'ux-btn primary',
            onclick: () => {
              if (!title.trim()) return;
              const curDeck = getDeck();
              const cleanDesc = description.trim().slice(0, 200);
              const nextMeta = {
                ...curDeck.meta,
                title: title.trim(),
                kind,
                lang: lang.trim() || 'vi',
              };
              if (cleanDesc) nextMeta.description = cleanDesc;
              else delete nextMeta.description;
              const next = {
                ...curDeck,
                meta: nextMeta,
              };
              commitDeck(next);
              listPane.render();
              formPane.render();
              previewPane.render(getActiveItem(), { immediate: true });
              closeModal();
            },
          }, 'Lưu thông tin'))));
    shellEl.append(activeModalEl);
  }

  async function openImageManager() {
    closeModal();
    activeModalEl = await renderImageManagerModal({
      deckKey,
      getDeck,
      getAssets,
      refreshAssets: async () => {
        await refreshAssets();
        if (activeModalEl) openImageManager();
      },
      onInsertToActive: activeTextareaHelper
        ? relPath => activeTextareaHelper.insertImageMarkdown(relPath)
        : null,
      onJumpToItem: id => switchActiveItem(id),
      onMarkDirty: () => {
        dirty = true;
        renderTopbar();
      },
      onClose: closeModal,
      showToast,
    });
    shellEl.append(activeModalEl);
  }

  function openBulkImportModal() {
    closeModal();
    activeModalEl = renderBulkImportModal({
      deckKey,
      deck: getDeck(),
      onImportSuccess: (newDeck, count) => {
        applyDeckMutation(newDeck, {
          preserveActive: true,
          label: `Nhập hàng loạt ${count} mục`,
        });
        showToast(`Đã thêm ${count} mục vào bộ thẻ.`);
        listPane.render();
        formPane.render();
        previewPane.render(getActiveItem(), { immediate: true });
      },
      onClose: closeModal,
      showToast,
    });
    shellEl.append(activeModalEl);
  }

  function openShortcutsModal() {
    closeModal();
    const shortcuts = [
      ['Ctrl + S', 'Lưu bộ thẻ'],
      ['Ctrl + Z', 'Hoàn tác'],
      ['Ctrl + Y / Ctrl + Shift + Z', 'Làm lại'],
      ['Ctrl + Enter', 'Thêm mục mới cùng dạng ngay sau mục hiện tại'],
      ['Ctrl + D', 'Nhân đôi mục đang chọn'],
      ['Alt + ↑ / Alt + ↓', 'Chuyển sang mục trước / mục tiếp theo'],
      ['Alt + Shift + ↑ / ↓', 'Đổi vị trí mục lên / xuống trong danh sách'],
      ['Delete', 'Xoá mục đang chọn (khi đứng ở danh sách)'],
      ['Ctrl + F', 'Tìm kiếm trong danh sách mục'],
      ['Ctrl + B / Ctrl + I', 'In đậm / In nghiêng văn bản'],
      ['Ctrl + M / Ctrl + Shift + M', 'Công thức toán trong dòng / khối riêng'],
      ['Tab (trong công thức)', 'Nhảy sang ô trống ▢ kế tiếp'],
      ['Enter / Backspace rỗng (lựa chọn)', 'Thêm lựa chọn mới / xoá lựa chọn trống'],
      ['Ctrl + \\', 'Ẩn / hiện cột Xem trước'],
      ['Ctrl + /', 'Mở bảng phím tắt này'],
    ];

    activeModalEl = h('div', {
      class: 'modal-backdrop',
      onclick: ev => { if (ev.target === activeModalEl) closeModal(); },
    },
      h('div', { class: 'modal-dialog' },
        h('div', { class: 'modal-head' },
          h('h2', null, 'Phím tắt trình soạn thảo'),
          h('button', { type: 'button', class: 'ux-icon-btn', onclick: closeModal }, '✕')),
        h('div', { style: 'display: flex; flex-direction: column; gap: 8px; margin: 12px 0 18px;' },
          shortcuts.map(([key, desc]) => h('div', {
            style: 'display: flex; justify-content: space-between; align-items: center; gap: 16px; font-size: 13px; padding: 4px 0; border-bottom: 1px solid var(--c-border);',
          },
            h('span', null, desc),
            h('kbd', {
              style: 'font-family: var(--font-mono); font-size: 11px; padding: 2px 6px; border-radius: 4px; background: var(--c-surface-2); border: 1px solid var(--c-border-strong); white-space: nowrap;',
            }, key)))),
        h('div', { class: 'toolbar', style: 'justify-content: flex-end;' },
          h('button', { type: 'button', class: 'ux-btn primary', onclick: closeModal }, 'Đóng'))));
    shellEl.append(activeModalEl);
  }

  // ── Bắt phím tắt toàn cục trong Editor (§11, §13.3) ────────────────────────
  function onGlobalKeyDown(ev) {
    if (!document.body.contains(shellEl)) {
      cleanup();
      return;
    }

    if (ev.key === 'Escape' && activeModalEl) {
      ev.preventDefault();
      closeModal();
      return;
    }

    const ctrl = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();

    // Ctrl+S: Lưu
    if (ctrl && !ev.shiftKey && key === 's') {
      ev.preventDefault();
      performSave(false);
      return;
    }

    // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z: Hoàn tác / Làm lại toàn cục (chặn undo riêng lẻ của input)
    if (ctrl && !ev.shiftKey && key === 'z') {
      ev.preventDefault();
      performUndo();
      return;
    }
    if ((ctrl && key === 'y') || (ctrl && ev.shiftKey && key === 'z')) {
      ev.preventDefault();
      performRedo();
      return;
    }

    // Ctrl+Enter: Thêm mục mới cùng dạng ngay sau mục hiện tại
    if (ctrl && ev.key === 'Enter') {
      ev.preventDefault();
      handleAddLikeCurrent();
      return;
    }

    // Ctrl+D: Nhân đôi mục đang chọn
    if (ctrl && !ev.shiftKey && key === 'd') {
      ev.preventDefault();
      if (activeId) handleDuplicateItem(activeId);
      return;
    }

    // Ctrl+F: Tìm kiếm trong danh sách
    if (ctrl && !ev.shiftKey && key === 'f') {
      ev.preventDefault();
      if (window.innerWidth < 900) {
        drawerOpen = true;
        syncResponsiveClasses();
      }
      listPane.focusSearch();
      return;
    }

    // Ctrl+\: Ẩn / hiện Xem trước
    if (ctrl && ev.key === '\\') {
      ev.preventDefault();
      togglePreviewCollapse();
      return;
    }

    // Ctrl+/: Hiện bảng phím tắt
    if (ctrl && ev.key === '/') {
      ev.preventDefault();
      openShortcutsModal();
      return;
    }

    // Alt+Shift+↑/↓: Đổi vị trí mục đang chọn lên / xuống
    if (ev.altKey && ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      ev.preventDefault();
      const d = getDeck();
      const idx = d.items.findIndex(i => i.id === activeId);
      if (idx === -1) return;
      const toIdx = ev.key === 'ArrowUp' ? idx - 1 : idx + 1;
      if (toIdx >= 0 && toIdx < d.items.length) {
        const next = moveItem(d, idx, toIdx);
        commitDeck(next);
        listPane.render();
        formPane.render();
        listPane.scrollToItem(activeId);
      }
      return;
    }

    // Alt+↑/↓: Chuyển sang mục trước / sau
    if (ev.altKey && !ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      ev.preventDefault();
      navigateRelative(ev.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    // Delete khi focus ở danh sách (không đứng trong input/textarea)
    const tag = document.activeElement?.tagName;
    const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (ev.key === 'Delete' && !isInputFocused && listPane.isListFocused()) {
      ev.preventDefault();
      const sel = listPane.getSelectedIds();
      handleDeleteItems(sel.length ? sel : (activeId ? [activeId] : []));
    }
  }

  function onDocumentClick() {
    if (saveMenuOpen) {
      saveMenuOpen = false;
      renderTopbar();
    }
  }

  function onBeforeUnload(ev) {
    if (dirty && document.body.contains(shellEl)) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  }

  function cleanup() {
    closeMathPopover();
    window.removeEventListener('keydown', onGlobalKeyDown);
    document.removeEventListener('click', onDocumentClick);
    window.removeEventListener('beforeunload', onBeforeUnload);
  }

  window.addEventListener('keydown', onGlobalKeyDown);
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('beforeunload', onBeforeUnload);

  // Khởi tạo hiển thị
  syncResponsiveClasses();
  renderTopbar();
  listPane.render();
  formPane.render();
  previewPane.render(getActiveItem(), { immediate: true });
  root.replaceChildren(shellEl);
  if (initialItemId && activeId) {
    queueMicrotask(() => listPane.scrollToItem(activeId));
  }

  loadLayoutSettings();
  refreshAssets();
}
