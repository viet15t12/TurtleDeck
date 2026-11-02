// src/views/editor/state.js — Quản lý toàn bộ trạng thái (State/Store) của trình soạn thảo Editor
import { createHistory, newItemLike, addItem, isBlankNewItem } from '../../core/deckmodel.js';
import { kindOf } from '../../core/deckkinds.js';

export function createEditorState({ entry, initialItemId }) {
  const deckKey = entry.deckKey;

  // Khởi tạo bộ thẻ có ít nhất 1 mục (dạng mặc định theo loại bộ thẻ)
  let initialDeck = JSON.parse(JSON.stringify(entry.deck || {}));
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

  const state = {
    entry,
    deckKey,
    history,

    get activeId() { return activeId; },
    set activeId(v) { activeId = v; },

    get dirty() { return dirty; },
    set dirty(v) { dirty = v; },

    get lastSavedAt() { return lastSavedAt; },
    set lastSavedAt(v) { lastSavedAt = v; },

    get assetsList() { return assetsList; },
    set assetsList(v) { assetsList = v; },

    get activeTextareaHelper() { return activeTextareaHelper; },
    set activeTextareaHelper(v) { activeTextareaHelper = v; },

    touchedItems,
    touchedFieldsByItem,

    get listWidth() { return listWidth; },
    set listWidth(v) { listWidth = v; },

    get previewWidth() { return previewWidth; },
    set previewWidth(v) { previewWidth = v; },

    get previewCollapsed() { return previewCollapsed; },
    set previewCollapsed(v) { previewCollapsed = v; },

    get recentMathSnippets() { return recentMathSnippets; },
    set recentMathSnippets(v) { recentMathSnippets = v; },

    get mobileTab() { return mobileTab; },
    set mobileTab(v) { mobileTab = v; },

    get drawerOpen() { return drawerOpen; },
    set drawerOpen(v) { drawerOpen = v; },

    get saveMenuOpen() { return saveMenuOpen; },
    set saveMenuOpen(v) { saveMenuOpen = v; },

    get editingTitle() { return editingTitle; },
    set editingTitle(v) { editingTitle = v; },

    getDeck() {
      return history.current();
    },

    getActiveItem() {
      const d = history.current();
      return d.items.find(i => i.id === activeId) || d.items[0] || null;
    },

    getAssets() {
      return assetsList;
    },

    isItemTouched(id) {
      return touchedItems.has(id);
    },

    getTouchedFields(id) {
      if (!touchedFieldsByItem.has(id)) {
        touchedFieldsByItem.set(id, new Set());
      }
      return touchedFieldsByItem.get(id);
    },

    markFieldTouched(field) {
      if (!activeId) return;
      state.getTouchedFields(activeId).add(field);
    },

    recordRecentSnippet(snippetId) {
      if (!snippetId) return;
      recentMathSnippets = [snippetId, ...recentMathSnippets.filter(id => id !== snippetId)].slice(0, 8);
    },

    syncWindowTitle() {
      const t = state.getDeck().meta?.title || 'Bộ thẻ';
      document.title = `${dirty ? '● ' : ''}${t} — Soạn bộ thẻ`;
    },
  };

  return state;
}

