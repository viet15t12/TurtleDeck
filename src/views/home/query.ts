// src/views/home/query.ts — Các hàm thuần lọc thư mục con, bộ thẻ và đếm số lượng từ nguồn dữ liệu duy nhất

import type { Deck, DeckKind, DeckLocation, Entry, Folder } from '../../core/types.js';
// @ts-ignore
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
  deckIdsByFolderId?: Map<string | null, Set<string>>;
  linksByFolderId?: Map<string, DeckLocation[]>;
  primaryLocationByDeckId?: Map<string, DeckLocation>;
  selectedFolderId: 'all' | string | null;
  filterKind: 'all' | DeckKind;
  searchQuery: string;
  sortBy: 'due' | 'recent' | 'title';
  statsByUid: Map<number, DeckStats>;
  stripAccents: (s: string) => string;
  kindOf: (d: Deck) => DeckKind;
  findFolder: (id: string | null) => Folder | null;
}

function normalizeFolderKey(id: string | null | undefined): string | null {
  if (id === undefined || id === null) return null;
  const s = String(id).trim();
  if (!s || s === 'all' || s === 'root') return null;
  return s;
}

export function buildDeckIdsByFolderId(
  locationsByDeckId: Map<string, string | null>,
  linksByFolderId?: Map<string, DeckLocation[]>
): Map<string | null, Set<string>> {
  const map = new Map<string | null, Set<string>>();
  map.set(null, new Set());

  for (const [deckId, folderId] of locationsByDeckId.entries()) {
    const norm = normalizeFolderKey(folderId);
    if (!map.has(norm)) map.set(norm, new Set());
    map.get(norm)!.add(deckId);
  }

  if (linksByFolderId) {
    for (const [folderId, links] of linksByFolderId.entries()) {
      const norm = normalizeFolderKey(folderId);
      if (norm === null) continue;
      if (!map.has(norm)) map.set(norm, new Set());
      const set = map.get(norm)!;
      for (const link of links) {
        if (link?.deckId) set.add(link.deckId);
      }
    }
  }

  return map;
}

export function getSubtreeFolderIds(folderId: string, flatFolders: Folder[]): Set<string> {
  const norm = normalizeFolderKey(folderId);
  if (!norm) return new Set();
  const subtree = new Set<string>([norm]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of flatFolders) {
      const pid = normalizeFolderKey(f.parentId);
      if (pid && subtree.has(pid) && !subtree.has(f.id)) {
        subtree.add(f.id);
        changed = true;
      }
    }
  }
  return subtree;
}

export function countFolderDecks(
  folderId: string | null,
  options: {
    flatFolders: Folder[];
    deckIdsByFolderId?: Map<string | null, Set<string>>;
    locationsByDeckId?: Map<string, string | null>;
    linksByFolderId?: Map<string, DeckLocation[]>;
    entries?: Entry[];
    recursive?: boolean;
  }
): number {
  const {
    flatFolders = [],
    deckIdsByFolderId,
    locationsByDeckId = new Map(),
    linksByFolderId,
    entries,
    recursive = true,
  } = options;

  const effectiveMap = deckIdsByFolderId || buildDeckIdsByFolderId(locationsByDeckId, linksByFolderId);
  const normTarget = normalizeFolderKey(folderId);

  const folderIdsToCount: Array<string | null> =
    normTarget !== null && recursive
      ? Array.from(getSubtreeFolderIds(normTarget, flatFolders))
      : [normTarget];

  const uniqueDeckIds = new Set<string>();
  for (const fid of folderIdsToCount) {
    const set = effectiveMap.get(fid);
    if (set) {
      for (const did of set) {
        uniqueDeckIds.add(did);
      }
    }
  }

  if (entries && entries.length > 0) {
    const entryDeckIds = new Set<string>();
    for (const e of entries) {
      const did = e.deck?.meta?.id;
      if (did) entryDeckIds.add(did);
    }
    if (entryDeckIds.size > 0) {
      let count = 0;
      for (const did of uniqueDeckIds) {
        if (entryDeckIds.has(did)) count++;
      }
      return count;
    }
  }

  return uniqueDeckIds.size;
}

export function selectSubfolders(input: QueryInput): Folder[] {
  const { flatFolders, selectedFolderId, searchQuery, stripAccents } = input;
  const qNorm = stripAccents(searchQuery.trim());

  let directSubfolders: Folder[] = [];
  if (selectedFolderId !== 'all') {
    const parentId = normalizeFolderKey(selectedFolderId);
    directSubfolders = flatFolders.filter(f => normalizeFolderKey(f.parentId) === parentId);
  } else if (!qNorm) {
    directSubfolders = flatFolders.filter(f => normalizeFolderKey(f.parentId) === null);
  } else {
    directSubfolders = flatFolders.filter(f => stripAccents(f.name).includes(qNorm));
  }

  if (qNorm && selectedFolderId !== 'all') {
    directSubfolders = directSubfolders.filter(f => stripAccents(f.name).includes(qNorm));
  }

  directSubfolders.sort((a, b) => {
    const sa = (a as any).sortOrder ?? 0;
    const sb = (b as any).sortOrder ?? 0;
    if (sa !== sb) return sa - sb;
    return String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
  });

  return directSubfolders;
}

export function selectDecks(input: QueryInput): Entry[] {
  const {
    entries,
    locationsByDeckId,
    deckIdsByFolderId,
    linksByFolderId,
    primaryLocationByDeckId,
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
  const effectiveDeckIdsByFolder =
    deckIdsByFolderId || buildDeckIdsByFolderId(locationsByDeckId, linksByFolderId);

  const normSelected = selectedFolderId === 'all' ? 'all' : normalizeFolderKey(selectedFolderId);
  const allowedInSelected =
    normSelected !== 'all' ? effectiveDeckIdsByFolder.get(normSelected) || new Set<string>() : null;

  const filtered: Entry[] = [];

  for (const e of entries) {
    const deckId = e.deck?.meta?.id;

    // 1. Lọc theo thư mục dựa trên nguồn dữ liệu duy nhất deckIdsByFolderId
    if (normSelected !== 'all') {
      if (deckId) {
        const isKnownInStore =
          locationsByDeckId.has(deckId) || (allowedInSelected ? allowedInSelected.has(deckId) : false);
        if (isKnownInStore) {
          if (!allowedInSelected || !allowedInSelected.has(deckId)) {
            continue;
          }
        } else {
          // Bộ thẻ chưa có hàng trong store (ví dụ vừa tạo chưa lưu): mặc định thuộc Thư mục gốc (null)
          if (normSelected !== null) {
            continue;
          }
        }
      } else if (normSelected !== null) {
        continue;
      }
    }

    // 2. Lọc theo loại thẻ
    if (filterKind !== 'all') {
      if (e.status !== 'ok' || !e.deck) continue;
      if (kindOf(e.deck) !== filterKind) continue;
    }

    // 3. Lọc theo tìm kiếm từ khoá
    if (qNorm) {
      const title = e.deck?.meta?.title || fileName(e.path) || '';
      const desc = e.deck?.meta?.description || '';
      if (!stripAccents(`${title} ${desc}`).includes(qNorm)) continue;
    }

    // Gắn thông tin hiển thị vị trí (huy hiệu liên kết nếu là liên kết trong thư mục đang chọn)
    let isLink = false;
    let locationId: string | undefined = (e as any).locationId;
    let folderPath: string | undefined = undefined;

    if (deckId) {
      const primaryFolderId = normalizeFolderKey(locationsByDeckId.get(deckId));
      const primaryFolder = primaryFolderId ? findFolder(primaryFolderId) : null;
      const primaryLoc = primaryLocationByDeckId?.get(deckId);

      if (normSelected !== 'all' && normSelected !== null) {
        const linkLoc = linksByFolderId?.get(normSelected)?.find(l => l.deckId === deckId);
        if (linkLoc && primaryFolderId !== normSelected) {
          isLink = true;
          locationId = linkLoc.id;
        } else {
          isLink = false;
          locationId = primaryLoc?.id;
        }
        const currentFolder = findFolder(normSelected);
        folderPath = currentFolder?.path || currentFolder?.name;
      } else {
        isLink = false;
        locationId = primaryLoc?.id;
        folderPath = primaryFolder?.path || primaryFolder?.name;
      }
    }

    filtered.push({
      ...e,
      isLink,
      locationId,
      folderPath,
    } as Entry);
  }

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
