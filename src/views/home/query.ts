// src/views/home/query.ts — Các hàm thuần lọc thư mục con và bộ thẻ

import type { Deck, DeckKind, Entry, Folder } from '../../core/types.js';
import { fileName } from '../dom.js';

export interface DeckStats {
  due: number;
  learning: number;
  newLeftToday: number;
  lastStudied: number | null;
  [k: string]: unknown;
}

export interface QueryInput {
  entries: Entry[];
  flatFolders: Folder[];
  locationsByDeckId: Map<string, string | null>;
  selectedFolderId: 'all' | string | null;
  filterKind: 'all' | DeckKind;
  searchQuery: string;
  sortBy: 'due' | 'recent' | 'title';
  statsByUid: Map<number, DeckStats>;
  stripAccents: (s: string) => string;
  kindOf: (d: Deck) => DeckKind;
  findFolder: (id: string | null) => Folder | null;
}

export function selectSubfolders(input: QueryInput): Folder[] {
  const { flatFolders, selectedFolderId, searchQuery, stripAccents } = input;
  const qNorm = stripAccents(searchQuery.trim());

  let directSubfolders: Folder[] = [];
  if (selectedFolderId !== 'all') {
    const parentId = selectedFolderId;
    directSubfolders = flatFolders.filter(f => f.parentId === parentId);
  } else if (!qNorm) {
    directSubfolders = flatFolders.filter(f => f.parentId === null);
  } else {
    directSubfolders = flatFolders.filter(f => stripAccents(f.name).includes(qNorm));
  }

  if (qNorm && selectedFolderId !== 'all') {
    directSubfolders = directSubfolders.filter(f => stripAccents(f.name).includes(qNorm));
  }
  return directSubfolders;
}

export function selectDecks(input: QueryInput): Entry[] {
  const {
    entries,
    locationsByDeckId,
    selectedFolderId,
    filterKind,
    searchQuery,
    sortBy,
    statsByUid,
    stripAccents,
    kindOf,
    findFolder,
  } = input;
  const qNorm = stripAccents(searchQuery.trim());

  const filtered = entries.filter(e => {
    const deckId = e.deck?.meta?.id;
    const assignedFolderId = deckId ? locationsByDeckId.get(deckId) : undefined;

    // Lọc theo thư mục
    if (selectedFolderId !== 'all') {
      if (assignedFolderId !== undefined) {
        if (assignedFolderId !== selectedFolderId) return false;
      } else {
        if (selectedFolderId === null) {
          if (e.group || (e.relPath && e.relPath.includes('/'))) return false;
        } else {
          const targetFolder = findFolder(selectedFolderId);
          if (targetFolder) {
            const matchesGroup = e.group === targetFolder.path;
            const matchesRel =
              e.relPath && (e.relPath === targetFolder.path || e.relPath.startsWith(`${targetFolder.path}/`));
            if (!matchesGroup && !matchesRel) return false;
          }
        }
      }
    }

    // Lọc theo loại thẻ
    if (filterKind !== 'all') {
      if (e.status !== 'ok' || !e.deck) return false;
      if (kindOf(e.deck) !== filterKind) return false;
    }

    // Lọc theo tìm kiếm từ khoá
    if (qNorm) {
      const title = e.deck?.meta?.title || fileName(e.path) || '';
      const desc = e.deck?.meta?.description || '';
      if (!stripAccents(`${title} ${desc}`).includes(qNorm)) return false;
    }
    return true;
  });

  // Sắp xếp
  filtered.sort((a, b) => {
    if (a.status !== 'ok' && b.status === 'ok') return 1;
    if (a.status === 'ok' && b.status !== 'ok') return -1;
    if (a.status !== 'ok' && b.status !== 'ok') return 0;

    const stA = statsByUid.get(a.uid) || { due: 0, learning: 0, newLeftToday: 0, lastStudied: null };
    const stB = statsByUid.get(b.uid) || { due: 0, learning: 0, newLeftToday: 0, lastStudied: null };
    const titleA = a.deck?.meta?.title || '';
    const titleB = b.deck?.meta?.title || '';

    if (sortBy === 'recent') {
      const tA = stA.lastStudied ?? -1;
      const tB = stB.lastStudied ?? -1;
      if (tB !== tA) return tB - tA;
      return titleA.localeCompare(titleB, 'vi');
    }
    if (sortBy === 'title') {
      return titleA.localeCompare(titleB, 'vi');
    }
    // Mặc định 'due': Cần ôn nhất
    const dueA = stA.due + stA.learning;
    const dueB = stB.due + stB.learning;
    if (dueB !== dueA) return dueB - dueA;
    const todayA = dueA + stA.newLeftToday;
    const todayB = dueB + stB.newLeftToday;
    if (todayB !== todayA) return todayB - todayA;
    return titleA.localeCompare(titleB, 'vi');
  });

  return filtered;
}
