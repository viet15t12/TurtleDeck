// src/views/home/workspace.js — Dựng bàn làm việc gồm danh sách thư mục con, danh sách bộ thẻ và trạng thái rỗng

import { h } from '../dom.js';
import { stripAccents } from '../../core/deckmodel.js';
import { kindOf } from '../../core/deckkinds.js';
import { renderFolderCard } from '../components/foldercard.js';
import { renderDeckCard } from '../components/deckcard.js';
import { selectSubfolders, selectDecks, countFolderDecks } from './query.js';
import { renderEmptyFolder } from './empty-state.js';

export function createWorkspace(ctx) {
  const mainContainer = h('div', { class: 'nautilus-workspace-container' });

  function renderCardsOnly() {
    const { ui, folderStore, data, nav, folderAction, togglePin, dnd, deckCardActions } = ctx;
    const qNorm = stripAccents(ui.searchQuery.trim());

    const queryInput = {
      entries: data.entries,
      flatFolders: folderStore.flatFolders,
      locationsByDeckId: folderStore.locationsByDeckId,
      deckIdsByFolderId: folderStore.deckIdsByFolderId,
      linksByFolderId: folderStore.linksByFolderId,
      primaryLocationByDeckId: folderStore.primaryLocationByDeckId,
      selectedFolderId: ui.selectedFolderId,
      filterKind: ui.filterKind,
      searchQuery: ui.searchQuery,
      sortBy: ui.sortBy,
      statsByUid: data.statsByUid,
      stripAccents,
      kindOf,
      findFolder: folderStore.findFolder,
    };

    const directSubfolders = selectSubfolders(queryInput);
    const filteredDecks = selectDecks(queryInput);

    const contentElements = [];

    // Render danh sách thư mục con (Subfolders)
    if (directSubfolders.length > 0) {
      const folderHeader = h(
        'div',
        { class: 'nautilus-section-header' },
        h('div', { class: 'section-label', style: 'margin: 0;' }, `Thư mục con (${directSubfolders.length})`)
      );

      const folderGrid = h(
        'div',
        { class: `nautilus-subfolders-grid ${ui.viewMode === 'list' ? 'list-view' : ''}` },
        ...directSubfolders.map(f => {
          const childFolders = folderStore.flatFolders.filter(cf => cf.parentId === f.id);
          const deckCount = countFolderDecks(f.id, {
            flatFolders: folderStore.flatFolders,
            deckIdsByFolderId: folderStore.deckIdsByFolderId,
            locationsByDeckId: folderStore.locationsByDeckId,
            linksByFolderId: folderStore.linksByFolderId,
            entries: data.entries,
            recursive: true,
          });
          const isPinned = ui.pinnedFolderIds.includes(f.id);

          return renderFolderCard({
            folder: f,
            deckCount,
            subfolderCount: childFolders.length,
            isPinned,
            onOpen: targetId => nav.navigateToFolder(targetId),
            onFolderAction: folderAction,
            onTogglePin: togglePin,
            onDropDeck: dnd.handleDropDeck,
            onDropFolder: dnd.handleDropFolder,
          });
        })
      );

      contentElements.push(h('div', { class: 'nautilus-subfolders-section' }, folderHeader, folderGrid));
    }

    // Render danh sách bộ thẻ (Decks)
    if (filteredDecks.length > 0) {
      const deckHeader = h(
        'div',
        { class: 'nautilus-section-header' },
        h('div', { class: 'section-label', style: 'margin: 0;' }, `Bộ thẻ (${filteredDecks.length})`)
      );

      const deckContainer = h(
        'div',
        { class: `deck-grid ${ui.viewMode === 'list' ? 'list-view' : ''}` },
        ...filteredDecks.map(e =>
          renderDeckCard(
            e,
            data.statsByUid.get(e.uid) || {
              new: 0,
              learning: 0,
              due: 0,
              mastered: 0,
              newLeftToday: 0,
              lastStudied: null,
            },
            deckCardActions
          )
        )
      );

      contentElements.push(h('div', { class: 'nautilus-decks-section' }, deckHeader, deckContainer));
    }

    // Khi cả thư mục và bộ thẻ đều trống
    if (directSubfolders.length === 0 && filteredDecks.length === 0) {
      contentElements.push(renderEmptyFolder(ctx, qNorm));
    }

    mainContainer.replaceChildren(...contentElements);
  }

  return {
    mainContainer,
    renderCardsOnly,
  };
}
