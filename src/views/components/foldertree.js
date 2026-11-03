// src/views/components/foldertree.js — Cây thư mục hiển thị ở sidebar với đóng/mở và phân cấp
import { h } from '../dom.js';
import { showFolderContextMenu } from './foldermenu.js';

// Lưu trạng thái mở/đóng của các nhánh thư mục
const expandedFolderIds = new Set();

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
  onFolderSelect,
  onFolderAction,
  onDropDeck,
  onToggleSidebar,
}) {
  const container = h('div', { class: 'folder-tree-container' });

  const treeHead = h('div', { class: 'folder-tree-head' },
    h('span', { class: 'folder-tree-title' }, 'THƯ MỤC'),
    h('div', { style: 'display: flex; gap: 4px; align-items: center;' },
      h('button', {
        type: 'button',
        class: 'ux-btn sm ghost',
        title: 'Tạo thư mục mới ở cấp gốc',
        onclick: (e) => {
          e.stopPropagation();
          onFolderAction?.('create', null);
        },
      }, '+ Thư mục'),
      onToggleSidebar ? h('button', {
        type: 'button',
        class: 'ux-icon-btn sm',
        title: 'Ẩn danh sách thư mục',
        onclick: (e) => {
          e.stopPropagation();
          onToggleSidebar();
        },
      }, '✕') : null
    )
  );

  const treeList = h('div', { class: 'folder-tree-list' });

  // 1. Mục: Tất cả bộ thẻ
  const allItem = h('div', {
    class: `folder-item ${selectedFolderId === 'all' ? 'active' : ''}`,
    onclick: () => onFolderSelect?.('all'),
  },
    h('span', { class: 'folder-icon' }, '📚'),
    h('span', { class: 'folder-name' }, 'Tất cả bộ thẻ')
  );

  // 2. Mục: Cấp gốc (Chưa phân loại)
  const rootItem = h('div', {
    class: `folder-item ${selectedFolderId === null ? 'active' : ''}`,
    'data-folder-id': 'root',
    onclick: () => onFolderSelect?.(null),
    ondragover: (e) => {
      e.preventDefault();
      rootItem.classList.add('drag-over');
    },
    ondragleave: () => rootItem.classList.remove('drag-over'),
    ondrop: (e) => {
      e.preventDefault();
      rootItem.classList.remove('drag-over');
      const deckId = e.dataTransfer.getData('text/plain');
      if (deckId) onDropDeck?.(deckId, null);
    },
  },
    h('span', { class: 'folder-icon' }, '🏠'),
    h('span', { class: 'folder-name' }, 'Thư mục gốc (Root)')
  );

  treeList.append(allItem, rootItem);

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

    const toggleBtn = hasChildren
      ? h('button', {
          type: 'button',
          class: `folder-toggle ${isExpanded ? 'expanded' : ''}`,
          title: isExpanded ? 'Thu gọn' : 'Mở rộng',
          onclick: (e) => {
            e.stopPropagation();
            if (isExpanded) expandedFolderIds.delete(node.id);
            else expandedFolderIds.add(node.id);
            // Re-render tree
            const parent = container.parentElement;
            if (parent) {
              container.replaceWith(renderFolderTree({
                folders,
                selectedFolderId,
                onFolderSelect,
                onFolderAction,
                onDropDeck,
                onToggleSidebar,
              }));
            }
          },
        }, isExpanded ? '▼' : '▶')
      : h('span', { class: 'folder-toggle-spacer' });

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
      onclick: () => onFolderSelect?.(node.id),
      ondragover: (e) => {
        e.preventDefault();
        itemEl.classList.add('drag-over');
      },
      ondragleave: () => itemEl.classList.remove('drag-over'),
      ondrop: (e) => {
        e.preventDefault();
        itemEl.classList.remove('drag-over');
        const deckId = e.dataTransfer.getData('text/plain');
        if (deckId) onDropDeck?.(deckId, node.id);
      },
    },
      toggleBtn,
      h('span', { class: 'folder-icon' }, isExpanded ? '📂' : '📁'),
      h('span', { class: 'folder-name', title: node.path }, node.name),
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

  container.append(treeHead, treeList);
  return container;
}
