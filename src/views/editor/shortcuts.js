// src/views/editor/shortcuts.js — Xử lý phím tắt và sự kiện toàn cục trong Editor (§11, §13.3)
import { closeMathPopover } from './mathpopover.js';
import { moveItem } from '../../core/deckmodel.js';

export function registerGlobalShortcuts({ shellEl, state, actions, modals, panes, ui }) {
  function onGlobalKeyDown(ev) {
    if (!document.body.contains(shellEl)) {
      cleanup();
      return;
    }

    const activeModal = modals.getActiveModal();
    if (ev.key === 'Escape' && activeModal) {
      ev.preventDefault();
      modals.closeModal();
      return;
    }

    const ctrl = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();

    // Ctrl+S: Lưu
    if (ctrl && !ev.shiftKey && key === 's') {
      ev.preventDefault();
      actions.performSave(false);
      return;
    }

    // Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z: Hoàn tác / Làm lại toàn cục
    if (ctrl && !ev.shiftKey && key === 'z') {
      ev.preventDefault();
      actions.performUndo();
      return;
    }
    if ((ctrl && key === 'y') || (ctrl && ev.shiftKey && key === 'z')) {
      ev.preventDefault();
      actions.performRedo();
      return;
    }

    // Ctrl+Enter: Thêm mục mới cùng dạng ngay sau mục hiện tại
    if (ctrl && ev.key === 'Enter') {
      ev.preventDefault();
      actions.handleAddLikeCurrent();
      return;
    }

    // Ctrl+D: Nhân đôi mục đang chọn
    if (ctrl && !ev.shiftKey && key === 'd') {
      ev.preventDefault();
      if (state.activeId) actions.handleDuplicateItem(state.activeId);
      return;
    }

    // Ctrl+F: Tìm kiếm trong danh sách
    if (ctrl && !ev.shiftKey && key === 'f') {
      ev.preventDefault();
      if (window.innerWidth < 900) {
        state.drawerOpen = true;
        ui.syncResponsive();
      }
      if (panes.list) panes.list.focusSearch();
      return;
    }

    // Ctrl+\: Ẩn / hiện Xem trước
    if (ctrl && ev.key === '\\') {
      ev.preventDefault();
      actions.togglePreviewCollapse();
      return;
    }

    // Ctrl+/: Hiện bảng phím tắt
    if (ctrl && ev.key === '/') {
      ev.preventDefault();
      modals.openShortcutsModal();
      return;
    }

    // Alt+Shift+↑/↓: Đổi vị trí mục đang chọn lên / xuống
    if (ev.altKey && ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      ev.preventDefault();
      const d = state.getDeck();
      const idx = d.items.findIndex(i => i.id === state.activeId);
      if (idx === -1) return;
      const toIdx = ev.key === 'ArrowUp' ? idx - 1 : idx + 1;
      if (toIdx >= 0 && toIdx < d.items.length) {
        actions.handleMoveItem(idx, toIdx);
        if (panes.list) panes.list.scrollToItem(state.activeId);
      }
      return;
    }

    // Alt+↑/↓: Chuyển sang mục trước / sau
    if (ev.altKey && !ev.shiftKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      ev.preventDefault();
      actions.navigateRelative(ev.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    // Delete khi focus ở danh sách (không đứng trong input/textarea/select)
    const tag = document.activeElement?.tagName;
    const isInputFocused = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (ev.key === 'Delete' && !isInputFocused && panes.list?.isListFocused?.()) {
      ev.preventDefault();
      const sel = panes.list.getSelectedIds?.() || [];
      actions.handleDeleteItems(sel.length ? sel : (state.activeId ? [state.activeId] : []));
    }
  }

  function onDocumentClick() {
    if (state.saveMenuOpen) {
      state.saveMenuOpen = false;
      ui.renderTopbar();
    }
  }

  function onBeforeUnload(ev) {
    if (state.dirty && document.body.contains(shellEl)) {
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

  return cleanup;
}

