// src/views/components/foldermenu.js — Menu ngữ cảnh và modal tương tác cho thư mục
import { h } from '../dom.js';

export function showFolderContextMenu(folder, triggerBtn, actions) {
  // Gỡ menu cũ nếu đang mở
  document.querySelectorAll('.folder-context-menu-floating').forEach(el => el.remove());

  const menu = h('div', {
    class: 'ux-popover folder-context-menu-floating',
    style: 'position: fixed; z-index: 10000; min-width: 175px; box-shadow: var(--shadow-md);',
  });

  const close = () => {
    menu.remove();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onKeyDown);
  };

  const onDocClick = (e) => {
    if (!menu.contains(e.target) && e.target !== triggerBtn) {
      close();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };

  const btnSub = h('button', {
    type: 'button',
    class: 'ux-popover-item',
    onclick: (e) => {
      e.stopPropagation();
      close();
      actions.onCreateSubfolder?.(folder);
    },
  }, '📁 + Thư mục con');

  const btnRename = h('button', {
    type: 'button',
    class: 'ux-popover-item',
    onclick: (e) => {
      e.stopPropagation();
      close();
      actions.onRenameFolder?.(folder);
    },
  }, '✏ Đổi tên');

  const btnMove = h('button', {
    type: 'button',
    class: 'ux-popover-item',
    onclick: (e) => {
      e.stopPropagation();
      close();
      actions.onMoveFolder?.(folder);
    },
  }, '📦 Di chuyển thư mục');

  const btnDelete = h('button', {
    type: 'button',
    class: 'ux-popover-item text-danger',
    onclick: (e) => {
      e.stopPropagation();
      close();
      actions.onDeleteFolder?.(folder);
    },
  }, '🗑 Xoá thư mục');

  menu.append(btnSub, btnRename, btnMove, btnDelete);
  document.body.append(menu);

  // Tính vị trí cố định theo triggerBtn trên viewport
  const rect = triggerBtn.getBoundingClientRect();
  const menuWidth = 180;
  let left = rect.right - menuWidth;
  if (left < 10) left = 10;
  let top = rect.bottom + 4;
  if (window.innerHeight - rect.bottom < 170) {
    top = Math.max(10, rect.top - 160);
  }

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);
  }, 10);
}

export function renderFolderMenu(folder, actions) {
  const menu = h('div', { class: 'ux-popover folder-context-menu', 'data-dropdown': '1', hidden: true });

  const btnSub = h('button', {
    type: 'button',
    class: 'ux-popover-item',
    onclick: (e) => {
      e.stopPropagation();
      menu.hidden = true;
      actions.onCreateSubfolder?.(folder);
    },
  }, '📁 + Thư mục con');

  const btnRename = h('button', {
    type: 'button',
    class: 'ux-popover-item',
    onclick: (e) => {
      e.stopPropagation();
      menu.hidden = true;
      actions.onRenameFolder?.(folder);
    },
  }, '✏ Đổi tên');

  const btnMove = h('button', {
    type: 'button',
    class: 'ux-popover-item',
    onclick: (e) => {
      e.stopPropagation();
      menu.hidden = true;
      actions.onMoveFolder?.(folder);
    },
  }, '📦 Di chuyển thư mục');

  const btnDelete = h('button', {
    type: 'button',
    class: 'ux-popover-item text-danger',
    onclick: (e) => {
      e.stopPropagation();
      menu.hidden = true;
      actions.onDeleteFolder?.(folder);
    },
  }, '🗑 Xoá thư mục');

  menu.append(btnSub, btnRename, btnMove, btnDelete);
  return menu;
}

export function openFolderModal({ type, folder, folders = [], onConfirm, onClose }) {
  const backdrop = h('div', {
    class: 'modal-backdrop',
    onclick: (e) => {
      if (e.target === backdrop) {
        backdrop.remove();
        onClose?.();
      }
    },
  });

  let title = 'Thư mục';
  let bodyContent;
  let confirmLabel = 'Xác nhận';
  let isDanger = false;
  let inputEl;
  let selectEl;

  const confirmAction = async () => {
    let value = null;
    if (type === 'create' || type === 'rename') {
      value = inputEl.value.trim();
      if (!value) {
        inputEl.focus();
        return;
      }
    } else if (type === 'move' || type === 'link') {
      value = selectEl.value || null;
    }
    confirmBtn.disabled = true;
    try {
      await onConfirm?.(value);
      backdrop.remove();
    } catch (err) {
      confirmBtn.disabled = false;
      alert(err.message || String(err));
    }
  };

  if (type === 'create') {
    title = folder ? `Tạo thư mục con trong "${folder.name}"` : 'Tạo thư mục mới';
    confirmLabel = 'Tạo';
    inputEl = h('input', {
      type: 'text',
      class: 'ux-input',
      placeholder: 'Nhập tên thư mục…',
      style: 'width: 100%;',
      onkeydown: (e) => {
        if (e.key === 'Enter') confirmAction();
      },
    });
    bodyContent = h('div', { class: 'form-group', style: 'margin-bottom: 16px;' },
      h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, 'Tên thư mục:'),
      inputEl
    );
  } else if (type === 'rename') {
    title = `Đổi tên thư mục "${folder.name}"`;
    confirmLabel = 'Lưu';
    inputEl = h('input', {
      type: 'text',
      class: 'ux-input',
      value: folder.name,
      style: 'width: 100%;',
      onkeydown: (e) => {
        if (e.key === 'Enter') confirmAction();
      },
    });
    bodyContent = h('div', { class: 'form-group', style: 'margin-bottom: 16px;' },
      h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, 'Tên mới:'),
      inputEl
    );
  } else if (type === 'move' || type === 'link') {
    const isLinkModal = type === 'link';
    title = isLinkModal
      ? `Tạo liên kết cho "${folder.name}"`
      : `Di chuyển "${folder.name}"`;
    confirmLabel = isLinkModal ? 'Tạo liên kết' : 'Di chuyển';

    const byId = new Map(folders.map(f => [f.id, f]));
    const isDescendant = candidate => {
      if (!folder.id) return false;
      if (candidate.id === folder.id) return true;
      let cur = candidate;
      const visited = new Set();
      while (cur && cur.parentId && !visited.has(cur.id)) {
        visited.add(cur.id);
        if (cur.parentId === folder.id) return true;
        cur = byId.get(cur.parentId);
      }
      if (folder.path && candidate.path && candidate.path.startsWith(`${folder.path}/`)) {
        return true;
      }
      return false;
    };

    const validTargets = folders.filter(f => !isDescendant(f));

    selectEl = h('select', { class: 'ux-select', style: 'width: 100%;' },
      isLinkModal ? null : h('option', { value: '' }, '📁 (Thư mục gốc - Root)'),
      ...validTargets.map(f => h('option', {
        value: f.id,
        selected: f.id === folder.parentId,
      }, `${'—'.repeat(f.depth || 0)} 📁 ${f.name} (${f.path || f.name})`))
    );

    bodyContent = h('div', { class: 'form-group', style: 'margin-bottom: 16px;' },
      h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' },
        isLinkModal ? 'Chọn thư mục đích để gắn liên kết:' : 'Chọn thư mục đích:'),
      selectEl
    );
  } else if (type === 'delete') {
    title = `Xoá thư mục "${folder.name}"?`;
    confirmLabel = 'Xoá vĩnh viễn';
    isDanger = true;
    bodyContent = h('div', { class: 'form-group', style: 'margin-bottom: 16px;' },
      h('p', { class: 'muted', style: 'margin: 0; line-height: 1.5;' },
        'Bạn có chắc chắn muốn xoá thư mục này không? Các thư mục con bên trong cũng sẽ bị xoá khỏi cây danh mục.'
      )
    );
  }

  const cancelBtn = h('button', {
    type: 'button',
    class: 'ux-btn ghost',
    onclick: () => {
      backdrop.remove();
      onClose?.();
    },
  }, 'Huỷ');

  const confirmBtn = h('button', {
    type: 'button',
    class: `ux-btn primary ${isDanger ? 'danger' : ''}`,
    onclick: confirmAction,
  }, confirmLabel);

  const modalBox = h('div', { class: 'modal-dialog', style: 'max-width: 440px;' },
    h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;' },
      h('h2', { style: 'margin: 0; font-size: 1.15rem;' }, title),
      h('button', {
        type: 'button',
        class: 'ux-icon-btn',
        title: 'Đóng',
        onclick: () => { backdrop.remove(); onClose?.(); },
      }, '✕')),
    bodyContent,
    h('div', { class: 'toolbar', style: 'justify-content: flex-end; gap: 8px; margin-top: 20px;' },
      cancelBtn,
      confirmBtn
    )
  );

  backdrop.append(modalBox);
  document.body.append(backdrop);

  if (inputEl) {
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 50);
  }
}
