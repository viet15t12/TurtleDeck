// src/views/home/breadcrumb.js — Dựng thanh breadcrumbs và hỗ trợ thả thư mục/bộ thẻ vào pill

import { h } from '../dom.js';

export function createBreadcrumb(ctx) {
  const pathBarHost = h('div', { class: 'nautilus-path-bar' });

  function renderBreadcrumbBar() {
    pathBarHost.replaceChildren();
    const { ui, folderStore, nav, dnd } = ctx;

    const makeSegment = ({ label, icon, folderId, isActive }) => {
      const pill = h(
        'button',
        {
          type: 'button',
          class: `nautilus-path-pill ${isActive ? 'active' : ''}`,
          title: `Đi đến ${label}`,
          onclick: () => nav.navigateToFolder(folderId),
          ondragover: e => {
            e.preventDefault();
            pill.classList.add('drag-over');
          },
          ondragleave: () => pill.classList.remove('drag-over'),
          ondrop: e => {
            e.preventDefault();
            pill.classList.remove('drag-over');
            const draggedFolderId = e.dataTransfer.getData('application/turtle-folder-id');
            const deckId =
              e.dataTransfer.getData('application/turtle-deck-id') || e.dataTransfer.getData('text/plain');
            if (draggedFolderId && draggedFolderId !== folderId) {
              dnd.handleDropFolder(draggedFolderId, folderId === 'all' ? null : folderId);
            } else if (deckId) {
              dnd.handleDropDeck(deckId, folderId === 'all' ? null : folderId);
            }
          },
        },
        icon ? h('span', null, icon) : null,
        h('span', null, label)
      );
      return pill;
    };

    if (ui.selectedFolderId === 'all') {
      pathBarHost.append(makeSegment({ label: 'Tất cả bộ thẻ', icon: '📚', folderId: 'all', isActive: true }));
      return;
    }

    // Luôn bắt đầu từ Thư mục gốc
    pathBarHost.append(
      makeSegment({
        label: 'Home',
        icon: '🏠',
        folderId: null,
        isActive: ui.selectedFolderId === null,
      })
    );

    if (ui.selectedFolderId !== null) {
      const chain = folderStore.getBreadcrumbChain(ui.selectedFolderId);
      for (let i = 0; i < chain.length; i++) {
        const f = chain[i];
        const isLast = i === chain.length - 1;
        pathBarHost.append(
          h('span', { class: 'nautilus-path-sep' }, '›'),
          makeSegment({
            label: f.name,
            icon: '📁',
            folderId: f.id,
            isActive: isLast,
          })
        );
      }
    }
  }

  return {
    pathBarHost,
    renderBreadcrumbBar,
  };
}

