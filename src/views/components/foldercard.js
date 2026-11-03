// src/views/components/foldercard.js — Card hiển thị thư mục trên bàn làm việc kiểu Nautilus / GNOME Files
import { h } from '../dom.js';
import { showFolderContextMenu } from './foldermenu.js';
import { isCurrentlyDragging } from './dragdrop.js';

function createFolderSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('class', 'nautilus-folder-svg');
  svg.innerHTML = `
    <path d="M19.5 21a3 3 0 0 0 3-3v-4.5a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3V18a3 3 0 0 0 3 3h15z" fill="var(--c-folder-front, #3584e4)" opacity="0.95"/>
    <path d="M1.5 8.25A2.25 2.25 0 0 1 3.75 6h4.172a2.25 2.25 0 0 1 1.59.66l1.079 1.08a.75.75 0 0 0 .53.22H20.25a2.25 2.25 0 0 1 2.25 2.25v2.29H1.5V8.25z" fill="var(--c-folder-back, #1c71d8)"/>
    <path d="M1.5 12h21v6a3 3 0 0 1-3 3h-15a3 3 0 0 1-3-3v-6z" fill="var(--c-folder-front, #3584e4)"/>
  `;
  return svg;
}

export function renderFolderCard({
  folder,
  deckCount = 0,
  subfolderCount = 0,
  isPinned = false,
  onOpen,
  onFolderAction,
  onTogglePin,
  onDropDeck,
  onDropFolder,
}) {
  const card = h('div', {
    class: 'nautilus-folder-card',
    'data-folder-id': folder.id,
    tabindex: '0',
    role: 'button',
    title: `Thư mục: ${folder.path || folder.name} (Nhấp đúp hoặc nhấp để mở)`,
    onclick: (e) => {
      if (isCurrentlyDragging()) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (e.target.closest('.nautilus-folder-action-btn') || e.target.closest('.nautilus-folder-pin-btn')) return;
      onOpen?.(folder.id);
    },
    ondblclick: (e) => {
      if (isCurrentlyDragging()) {
        e.stopPropagation();
        e.preventDefault();
        return;
      }
      if (e.target.closest('.nautilus-folder-action-btn') || e.target.closest('.nautilus-folder-pin-btn')) return;
      onOpen?.(folder.id);
    },
    onkeydown: (e) => {
      if (e.key === 'Enter') {
        onOpen?.(folder.id);
      }
    },
  });

  // Hỗ trợ kéo chính thư mục này thả vào thư mục khác
  card.setAttribute('draggable', 'true');
  card.addEventListener('dragstart', (e) => {
    if (e.target.closest('button, .nautilus-folder-top-actions')) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/turtle-folder-id', folder.id);
    e.dataTransfer.setData('text/plain', folder.id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('is-dragging');
  });

  // Hỗ trợ nhận thả deck hoặc folder con khác
  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    if (!card.contains(e.relatedTarget)) {
      card.classList.remove('drag-over');
    }
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    card.classList.remove('drag-over');

    const draggedFolderId = e.dataTransfer.getData('application/turtle-folder-id');
    const draggedDeckId = e.dataTransfer.getData('application/turtle-deck-id') || e.dataTransfer.getData('text/plain');

    if (draggedFolderId) {
      if (draggedFolderId !== folder.id) {
        onDropFolder?.(draggedFolderId, folder.id);
      }
    } else if (draggedDeckId) {
      onDropDeck?.(draggedDeckId, folder.id);
    }
  });

  // Nút Ghim vào Bookmark
  const pinBtn = h('button', {
    type: 'button',
    class: `nautilus-folder-pin-btn ${isPinned ? 'pinned' : ''}`,
    title: isPinned ? 'Bỏ ghim khỏi thanh bên' : 'Ghim vào thanh bên (Bookmark)',
    onclick: (e) => {
      e.stopPropagation();
      onTogglePin?.(folder.id);
    },
  }, isPinned ? '★' : '☆');

  // Nút Menu tuỳ chọn ⋮
  const menuBtn = h('button', {
    type: 'button',
    class: 'nautilus-folder-action-btn',
    title: 'Tuỳ chọn thư mục',
    onclick: (e) => {
      e.stopPropagation();
      showFolderContextMenu(folder, menuBtn, {
        onCreateSubfolder: (f) => onFolderAction?.('create', f),
        onRenameFolder: (f) => onFolderAction?.('rename', f),
        onMoveFolder: (f) => onFolderAction?.('move', f),
        onDeleteFolder: (f) => onFolderAction?.('delete', f),
      });
    },
  }, '⋮');

  const iconContainer = h('div', { class: 'nautilus-folder-icon-wrap' }, createFolderSvg());

  let metaText = 'Trống';
  const parts = [];
  if (subfolderCount > 0) parts.push(`${subfolderCount} thư mục`);
  if (deckCount > 0) parts.push(`${deckCount} bộ thẻ`);
  if (parts.length > 0) metaText = parts.join(' · ');

  const infoWrap = h('div', { class: 'nautilus-folder-info' },
    h('div', { class: 'nautilus-folder-name', title: folder.name }, folder.name),
    h('div', { class: 'nautilus-folder-meta' }, metaText)
  );

  const topActions = h('div', { class: 'nautilus-folder-top-actions' }, pinBtn, menuBtn);

  card.append(topActions, iconContainer, infoWrap);
  return card;
}

