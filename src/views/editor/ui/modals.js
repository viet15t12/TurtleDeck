// src/views/editor/ui/modals.js — Quản lý và render các hộp thoại phụ trợ (Modal) trong Editor
import { h } from '../../dom.js';
import { KINDS, kindOf, kindLabel, mismatchedItems, formatMismatchWarning } from '../../../core/deckkinds.js';
import { renderImageManagerModal } from '../imagemanager.js';
import { renderBulkImportModal } from '../bulkimport.js';

export function createModalManager({ shellEl, state, actions, services, ui, panes }) {
  let activeModalEl = null;

  function closeModal() {
    if (activeModalEl) {
      activeModalEl.remove();
      activeModalEl = null;
    }
  }

  function getActiveModal() {
    return activeModalEl;
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
          `Bộ thẻ "${state.getDeck().meta.title}" có thay đổi chưa lưu. Bạn muốn làm gì trước khi rời màn hình soạn?`),
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
    const d = state.getDeck();
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
              const curDeck = state.getDeck();
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
              actions.commitDeck(next);
              ui.syncPanes();
              closeModal();
            },
          }, 'Lưu thông tin'))));
    shellEl.append(activeModalEl);
  }

  async function openImageManager() {
    closeModal();
    activeModalEl = await renderImageManagerModal({
      deckKey: state.deckKey,
      getDeck: state.getDeck,
      getAssets: state.getAssets,
      refreshAssets: async () => {
        await services.refreshAssets();
        if (activeModalEl) openImageManager();
      },
      onInsertToActive: state.activeTextareaHelper
        ? relPath => state.activeTextareaHelper.insertImageMarkdown(relPath)
        : null,
      onJumpToItem: id => actions.switchActiveItem(id),
      onMarkDirty: () => {
        state.dirty = true;
        ui.renderTopbar();
      },
      onClose: closeModal,
      showToast: ui.showToast,
    });
    shellEl.append(activeModalEl);
  }

  function openBulkImportModal() {
    closeModal();
    activeModalEl = renderBulkImportModal({
      deckKey: state.deckKey,
      deck: state.getDeck(),
      onImportSuccess: (newDeck, count) => {
        actions.commitDeck(newDeck);
        ui.showToast(`Đã thêm ${count} mục vào bộ thẻ.`);
        ui.syncPanes();
      },
      onClose: closeModal,
      showToast: ui.showToast,
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

  return {
    closeModal,
    getActiveModal,
    openUnsavedModal,
    openConfirmModal,
    openBulkInputModal,
    openDeckMetaModal,
    openImageManager,
    openBulkImportModal,
    openShortcutsModal,
  };
}

