import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEditorState } from '../src/views/editor/state.js';
import { createActions } from '../src/views/editor/actions.js';
import { createServices } from '../src/views/editor/services.js';

test('editor state: khởi tạo state, getter/setter và các phương thức', () => {
  const entry = {
    deckKey: 'test-deck-1',
    deck: {
      meta: { id: 'd-1', title: 'Bộ thẻ test', kind: 'quiz' },
      items: [
        { id: 'q-1', type: 'single', question: 'Câu 1', choices: [{ text: 'A' }, { text: 'B' }], answer: [0] },
        { id: 'q-2', type: 'single', question: 'Câu 2', choices: [{ text: 'C' }, { text: 'D' }], answer: [1] },
      ],
    },
  };

  const state = createEditorState({ entry, initialItemId: 'q-2' });

  assert.equal(state.deckKey, 'test-deck-1');
  assert.equal(state.activeId, 'q-2');
  assert.equal(state.dirty, true); // do chưa có entry.path
  assert.equal(state.getDeck().items.length, 2);
  assert.equal(state.getActiveItem().id, 'q-2');

  assert.equal(state.isItemTouched('q-1'), true);
  state.markFieldTouched('choices');
  assert.equal(state.getTouchedFields('q-2').has('choices'), true);

  state.recordRecentSnippet('frac');
  assert.equal(state.recentMathSnippets[0], 'frac');
});

test('editor actions: thêm, nhân đôi, đổi loại, xoá và undo/redo', () => {
  const entry = {
    deckKey: 'test-deck-2',
    deck: {
      meta: { id: 'd-2', title: 'Bộ thẻ actions', kind: 'quiz' },
      items: [
        { id: 'q-1', type: 'single', question: 'Câu 1', choices: [{ text: 'A', correct: true }], answer: [0] },
      ],
    },
  };

  const state = createEditorState({ entry });
  const mockUi = {
    renderTopbar: () => {},
    syncResponsive: () => {},
    syncPanes: () => {},
    showToast: () => {},
  };
  const mockModals = {
    openConfirmModal: ({ onConfirm }) => onConfirm(),
    openUnsavedModal: () => {},
  };
  const mockPanes = {
    list: { render: () => {}, scrollToItem: () => {}, patchRow: () => {} },
    form: { render: () => {}, focusPrimaryField: () => {}, updateValidationUI: () => {} },
    preview: { render: () => {} },
  };
  const mockServices = {
    persistLayoutSettings: async () => {},
  };

  const actions = createActions({
    state,
    services: mockServices,
    ui: mockUi,
    modals: mockModals,
    panes: mockPanes,
    appActions: {},
  });

  // 1. Thêm mục cùng dạng
  actions.handleAddLikeCurrent();
  assert.equal(state.getDeck().items.length, 2);
  assert.equal(state.history.canUndo(), true);

  // 2. Nhân đôi
  const secondId = state.activeId;
  actions.handleDuplicateItem(secondId);
  assert.equal(state.getDeck().items.length, 3);

  // 3. Đổi dạng
  actions.handleChangeTypeForId(secondId, 'fill');
  const changed = state.getDeck().items.find(i => i.id === secondId);
  assert.equal(changed.type, 'fill');

  // 4. Hoàn tác (Undo)
  actions.performUndo();
  const undone = state.getDeck().items.find(i => i.id === secondId);
  assert.equal(undone.type, 'single');

  // 5. Làm lại (Redo)
  actions.performRedo();
  const redone = state.getDeck().items.find(i => i.id === secondId);
  assert.equal(redone.type, 'fill');

  // 6. Xoá mục
  actions.handleDeleteItems([secondId]);
  assert.equal(state.getDeck().items.length, 2);
});

test('editor services: giao tiếp với mock window.api', async () => {
  let savedSettings = null;
  const mockApi = {
    loadSettings: async () => ({ editorListWidth: 300, editorPreviewWidth: 450, editorPreviewCollapsed: true }),
    saveSettings: async d => { savedSettings = d; return { ok: true }; },
    listAssets: async () => ({ ok: true, assets: [{ name: 'img/test.png', size: 1024 }] }),
  };

  const entry = {
    deckKey: 'test-deck-3',
    deck: { meta: { id: 'd-3', title: 'Test', kind: 'qa' }, items: [{ id: 'c-1', type: 'card', front: 'A', back: 'B' }] },
  };
  const state = createEditorState({ entry });
  const services = createServices(mockApi, state);

  await services.loadLayoutSettings({
    listColEl: { style: {} },
    previewColEl: { style: {} },
    onLayoutChange: () => {},
  });

  assert.equal(state.listWidth, 300);
  assert.equal(state.previewWidth, 450);
  assert.equal(state.previewCollapsed, true);

  await services.persistLayoutSettings();
  assert.equal(savedSettings.editorListWidth, 300);

  const assets = await services.refreshAssets();
  assert.equal(assets.length, 1);
  assert.equal(assets[0].name, 'img/test.png');
});

