// src/views/editor/ui/topbar.js — Render thanh công cụ trên cùng Topbar (§4)
import { h } from '../../dom.js';
import { KINDS, kindOf, kindLabel } from '../../../core/deckkinds.js';

export function formatTimeHHMM(date) {
  if (!date) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function renderTopbar(topbarEl, { state, actions, modals }) {
  state.syncWindowTitle();
  const d = state.getDeck();

  let titleNode;
  if (state.editingTitle) {
    const inp = h('input', {
      type: 'text',
      class: 'editor-title-input',
      value: d.meta.title || '',
      onkeydown: ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          inp.blur();
        } else if (ev.key === 'Escape') {
          state.editingTitle = false;
          renderTopbar(topbarEl, { state, actions, modals });
        }
      },
      onblur: () => {
        const val = inp.value.trim();
        state.editingTitle = false;
        if (val && val !== d.meta.title) {
          const next = { ...d, meta: { ...d.meta, title: val } };
          actions.commitDeck(next);
        } else {
          renderTopbar(topbarEl, { state, actions, modals });
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
        state.editingTitle = true;
        renderTopbar(topbarEl, { state, actions, modals });
      },
    },
      h('span', { class: 'editor-title-text' }, d.meta.title || 'Bộ thẻ chưa đặt tên'),
      h('span', { class: 'editor-title-pencil' }, '✎'));
  }

  const statusNode = state.dirty
    ? h('span', { class: 'editor-save-status unsaved' },
        h('span', { class: 'status-dot' }),
        'Chưa lưu')
    : h('span', { class: 'editor-save-status' },
        state.lastSavedAt ? `Đã lưu ${formatTimeHHMM(state.lastSavedAt)}` : 'Đã lưu');

  const saveDropdown = state.saveMenuOpen ? h('div', {
    class: 'ux-popover align-right',
    onclick: ev => ev.stopPropagation(),
  },
    h('button', {
      class: 'ux-popover-item',
      onclick: () => {
        state.saveMenuOpen = false;
        renderTopbar(topbarEl, { state, actions, modals });
        actions.performSave(true);
      },
    }, 'Lưu thành bản sao…'),
    h('button', {
      class: 'ux-popover-item',
      onclick: () => {
        state.saveMenuOpen = false;
        renderTopbar(topbarEl, { state, actions, modals });
        actions.performSave(true);
      },
    }, 'Xuất bản sao (.sdeck)…'),
    h('div', { class: 'ux-popover-sep' }),
    h('button', {
      class: 'ux-popover-item',
      onclick: () => {
        state.saveMenuOpen = false;
        renderTopbar(topbarEl, { state, actions, modals });
        modals.openDeckMetaModal();
      },
    }, 'Thông tin bộ thẻ…'),
    h('button', {
      class: 'ux-popover-item',
      onclick: () => {
        state.saveMenuOpen = false;
        renderTopbar(topbarEl, { state, actions, modals });
        modals.openBulkImportModal();
      },
    }, 'Nhập hàng loạt…'),
    h('button', {
      class: 'ux-popover-item',
      onclick: () => {
        state.saveMenuOpen = false;
        renderTopbar(topbarEl, { state, actions, modals });
        modals.openImageManager();
      },
    }, `Quản lý ảnh (${state.assetsList.length})…`),
    h('div', { class: 'ux-popover-sep' }),
    h('button', {
      class: 'ux-popover-item',
      onclick: () => {
        state.saveMenuOpen = false;
        renderTopbar(topbarEl, { state, actions, modals });
        modals.openShortcutsModal();
      },
    }, 'Bảng phím tắt (Ctrl+/)')) : null;

  const currentKind = kindOf(d);
  const kindBadgeNode = h('button', {
    type: 'button',
    class: 'ux-kind-badge',
    'data-kind': currentKind,
    title: 'Loại bộ thẻ — bấm để mở Thông tin bộ thẻ',
    style: 'cursor: pointer;',
    onclick: () => modals.openDeckMetaModal(),
  }, KINDS[currentKind]?.icon || '📝', kindLabel(currentKind));

  topbarEl.replaceChildren(
    h('div', { class: 'editor-topbar-left' },
      h('button', {
        type: 'button',
        class: 'ux-icon-btn editor-drawer-btn',
        title: 'Mở danh sách mục',
        onclick: () => {
          state.drawerOpen = !state.drawerOpen;
          actions.syncResponsive();
        },
      }, '☰'),
      h('button', {
        type: 'button',
        class: 'ux-icon-btn',
        title: 'Quay lại bộ thẻ',
        onclick: actions.handleBack,
      }, '←'),
      titleNode,
      kindBadgeNode,
      statusNode),

    h('div', { class: 'editor-topbar-right' },
      state.previewCollapsed ? h('button', {
        type: 'button',
        class: 'ux-btn ghost sm',
        title: 'Hiện lại cột Xem trước (Ctrl+\\)',
        onclick: actions.togglePreviewCollapse,
      }, '⇤ Xem trước') : null,
      h('button', {
        type: 'button',
        class: 'ux-btn sm',
        title: 'Học thử ngay trên bộ đang soạn',
        onclick: actions.handleTrialStudy,
      }, '▶ Học thử'),
      h('button', {
        type: 'button',
        class: 'ux-icon-btn',
        disabled: !state.history.canUndo(),
        title: 'Hoàn tác (Ctrl+Z)',
        onclick: actions.performUndo,
      }, '↶'),
      h('button', {
        type: 'button',
        class: 'ux-icon-btn',
        disabled: !state.history.canRedo(),
        title: 'Làm lại (Ctrl+Y)',
        onclick: actions.performRedo,
      }, '↷'),
      h('div', { class: 'ux-split-btn' },
        h('button', {
          type: 'button',
          class: 'ux-btn primary sm',
          title: 'Lưu bộ thẻ (Ctrl+S)',
          onclick: () => actions.performSave(false),
        }, 'Lưu'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary sm ux-split-caret',
          title: 'Tác vụ lưu & cài đặt bộ thẻ',
          onclick: ev => {
            ev.stopPropagation();
            state.saveMenuOpen = !state.saveMenuOpen;
            renderTopbar(topbarEl, { state, actions, modals });
          },
        }, '▾'),
        saveDropdown))
  );
}

