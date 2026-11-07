// src/views/components/foldertree.js — Cây thư mục và Bookmarks ở sidebar kiểu Nautilus
import { h } from '../dom.js';
import { showFolderContextMenu } from './foldermenu.js';

// Lưu trạng thái mở/đóng của các nhánh thư mục (khởi tạo từ localStorage: homeUi.expandedFolderIds)
const expandedFolderIds = new Set(
  (() => {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('homeUi.expandedFolderIds') : null;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })()
);

function persistExpandedFolders() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('homeUi.expandedFolderIds', JSON.stringify([...expandedFolderIds]));
    }
  } catch {}
}

export function flattenFolders(nodes = []) {
  const result = [];
  function walk(list) {
    for (const node of list) {
      result.push(node);
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  }
  walk(nodes);
  return result;
}

export function renderFolderTree({
  folders = [],
  selectedFolderId = 'all',
  pinnedFolderIds = [],
  onFolderSelect,
  onFolderAction,
  onTogglePin,
  onDropDeck,
  onDropFolder,
  onToggleSidebar,
}) {
  const container = h('div', { class: 'folder-tree-container' });

  // 1. Phần Bookmarks (Dấu trang / Lối tắt như Nautilus)
  const bookmarksHead = h('div', { class: 'folder-tree-head' },
    h('span', { class: 'folder-tree-title' }, 'DẤU TRANG / LỐI TẮT'),
    onToggleSidebar ? h('button', {
      type: 'button',
      class: 'ux-icon-btn sm',
      title: 'Ẩn thanh bên',
      onclick: (e) => {
        e.stopPropagation();
        onToggleSidebar();
      },
    }, '✕') : null
  );

  const bookmarksList = h('div', { class: 'folder-bookmarks-list' });

  // Mục: Tất cả bộ thẻ
  const allItem = h('div', {
    class: `folder-item ${selectedFolderId === 'all' ? 'active' : ''}`,
    title: 'Hiển thị tất cả bộ thẻ trong thư viện',
    onclick: () => onFolderSelect?.('all'),
  },
    h('span', { class: 'folder-icon' }, '📚'),
    h('span', { class: 'folder-name' }, 'Tất cả bộ thẻ')
  );

  // Mục: Thư mục gốc (Home / Root)
  const rootItem = h('div', {
    class: `folder-item ${selectedFolderId === null ? 'active' : ''}`,
    'data-folder-id': 'root',
    title: 'Thư mục gốc của ứng dụng (Home)',
    onclick: () => onFolderSelect?.(null),
    ondragover: (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      rootItem.classList.add('drag-over');
    },
    ondragleave: (e) => {
      e.stopPropagation();
      rootItem.classList.remove('drag-over');
    },
    ondrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      rootItem.classList.remove('drag-over');
      const draggedFolderId = e.dataTransfer.getData('application/turtle-folder-id');
      const deckId = e.dataTransfer.getData('application/turtle-deck-id') || e.dataTransfer.getData('text/plain');
      if (draggedFolderId) {
        onDropFolder?.(draggedFolderId, null);
      } else if (deckId) {
        onDropDeck?.(deckId, null);
      }
    },
  },
    h('span', { class: 'folder-icon' }, '🏠'),
    h('span', { class: 'folder-name' }, 'Thư mục gốc (Home)')
  );

  bookmarksList.append(allItem, rootItem);

  // Thêm các thư mục đã ghim (Bookmarks / Pinned Folders)
  if (Array.isArray(pinnedFolderIds) && pinnedFolderIds.length > 0) {
    for (const pId of pinnedFolderIds) {
      const folder = folders.find(f => f.id === pId);
      if (!folder) continue;

      const pinnedEl = h('div', {
        class: `folder-item ${selectedFolderId === folder.id ? 'active' : ''}`,
        'data-folder-id': folder.id,
        title: `Đã ghim: ${folder.path || folder.name}`,
        onclick: () => onFolderSelect?.(folder.id),
        ondragover: (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          pinnedEl.classList.add('drag-over');
        },
        ondragleave: (e) => {
          e.stopPropagation();
          pinnedEl.classList.remove('drag-over');
        },
        ondrop: (e) => {
          e.preventDefault();
          e.stopPropagation();
          pinnedEl.classList.remove('drag-over');
          const draggedFolderId = e.dataTransfer.getData('application/turtle-folder-id');
          const deckId = e.dataTransfer.getData('application/turtle-deck-id') || e.dataTransfer.getData('text/plain');
          if (draggedFolderId && draggedFolderId !== folder.id) {
            onDropFolder?.(draggedFolderId, folder.id);
          } else if (deckId) {
            onDropDeck?.(deckId, folder.id);
          }
        },
      },
        h('span', { class: 'folder-icon' }, '⭐'),
        h('span', { class: 'folder-name' }, folder.name),
        h('button', {
          type: 'button',
          class: 'folder-unpin-btn',
          title: 'Bỏ ghim',
          onclick: (e) => {
            e.stopPropagation();
            onTogglePin?.(folder.id);
          },
        }, '✕')
      );
      bookmarksList.append(pinnedEl);
    }
  }

  // 2. Phần Cây Thư Mục (Folder Tree)
  const treeHead = h('div', { class: 'folder-tree-head', style: 'margin-top: 14px;' },
    h('span', { class: 'folder-tree-title' }, 'CÂY THƯ MỤC'),
    h('div', { style: 'display: flex; gap: 4px; align-items: center;' },
      h('button', {
        type: 'button',
        class: 'ux-btn sm ghost',
        title: 'Tạo thư mục mới ở cấp gốc',
        onclick: (e) => {
          e.stopPropagation();
          onFolderAction?.('create', null);
        },
      }, '+ Thư mục')
    )
  );

  const treeList = h('div', { class: 'folder-tree-list' });

  // Xây dựng cấu trúc cây lồng nhau
  const folderMap = new Map();
  for (const f of folders) {
    folderMap.set(f.id, { ...f, children: [] });
  }

  const rootFolders = [];
  for (const f of folders) {
    const node = folderMap.get(f.id);
    if (f.parentId && folderMap.has(f.parentId)) {
      folderMap.get(f.parentId).children.push(node);
    } else {
      rootFolders.push(node);
    }
  }

  function renderNode(node) {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedFolderIds.has(node.id);
    const isPinned = Array.isArray(pinnedFolderIds) && pinnedFolderIds.includes(node.id);

    const toggleBtn = hasChildren
      ? h('button', {
          type: 'button',
          class: `folder-toggle ${isExpanded ? 'expanded' : ''}`,
          title: isExpanded ? 'Thu gọn' : 'Mở rộng',
          onclick: (e) => {
            e.stopPropagation();
            if (isExpanded) expandedFolderIds.delete(node.id);
            else expandedFolderIds.add(node.id);
            persistExpandedFolders();
            // Re-render
            const parent = container.parentElement;
            if (parent) {
              container.replaceWith(renderFolderTree({
                folders,
                selectedFolderId,
                pinnedFolderIds,
                onFolderSelect,
                onFolderAction,
                onTogglePin,
                onDropDeck,
                onDropFolder,
                onToggleSidebar,
              }));
            }
          },
        }, isExpanded ? '▼' : '▶')
      : h('span', { class: 'folder-toggle-spacer' });

    // Nút Ghim nhanh
    const pinBtn = h('button', {
      type: 'button',
      class: `folder-pin-quick-btn ${isPinned ? 'pinned' : ''}`,
      title: isPinned ? 'Bỏ ghim khỏi dấu trang' : 'Ghim vào dấu trang (Bookmark)',
      onclick: (e) => {
        e.stopPropagation();
        onTogglePin?.(node.id);
      },
    }, isPinned ? '★' : '☆');

    const menuBtn = h('button', {
      type: 'button',
      class: 'folder-menu-btn',
      title: 'Tuỳ chọn thư mục',
      onclick: (e) => {
        e.stopPropagation();
        showFolderContextMenu(node, menuBtn, {
          onCreateSubfolder: (f) => onFolderAction?.('create', f),
          onRenameFolder: (f) => onFolderAction?.('rename', f),
          onMoveFolder: (f) => onFolderAction?.('move', f),
          onDeleteFolder: (f) => onFolderAction?.('delete', f),
        });
      },
    }, '⋮');

    const itemEl = h('div', {
      class: `folder-item ${selectedFolderId === node.id ? 'active' : ''}`,
      style: `padding-left: ${10 + node.depth * 14}px;`,
      'data-folder-id': node.id,
      draggable: 'true',
      onclick: () => onFolderSelect?.(node.id),
      ondragstart: (e) => {
        e.dataTransfer.setData('application/turtle-folder-id', node.id);
        e.dataTransfer.setData('text/plain', node.id);
        e.dataTransfer.effectAllowed = 'move';
        itemEl.classList.add('is-dragging');
      },
      ondragend: () => {
        itemEl.classList.remove('is-dragging');
      },
      ondragover: (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        itemEl.classList.add('drag-over');
      },
      ondragleave: (e) => {
        e.stopPropagation();
        itemEl.classList.remove('drag-over');
      },
      ondrop: (e) => {
        e.preventDefault();
        e.stopPropagation();
        itemEl.classList.remove('drag-over');
        const draggedFolderId = e.dataTransfer.getData('application/turtle-folder-id');
        const deckId = e.dataTransfer.getData('application/turtle-deck-id') || e.dataTransfer.getData('text/plain');
        if (draggedFolderId && draggedFolderId !== node.id) {
          onDropFolder?.(draggedFolderId, node.id);
        } else if (deckId) {
          onDropDeck?.(deckId, node.id);
        }
      },
    },
      toggleBtn,
      h('span', { class: 'folder-icon' }, isExpanded ? '📂' : '📁'),
      h('span', { class: 'folder-name', title: node.path }, node.name),
      pinBtn,
      menuBtn
    );

    const nodeEl = h('div', { class: 'folder-node' }, itemEl);

    if (hasChildren && isExpanded) {
      const childrenContainer = h('div', { class: 'folder-children' });
      for (const child of node.children) {
        childrenContainer.append(renderNode(child));
      }
      nodeEl.append(childrenContainer);
    }

    return nodeEl;
  }

  for (const rootNode of rootFolders) {
    treeList.append(renderNode(rootNode));
  }

  container.append(bookmarksHead, bookmarksList, treeHead, treeList);
  return container;
}
