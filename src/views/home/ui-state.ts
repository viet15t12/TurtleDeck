// src/views/home/ui-state.ts — Quản lý trạng thái UI màn hình chính và lưu trữ an toàn trong localStorage

import type { DeckKind } from '../../core/types.js';

export interface HomeUiState {
  filterKind: 'all' | DeckKind;
  searchQuery: string;
  sortBy: 'due' | 'recent' | 'title';
  selectedFolderId: 'all' | string | null;
  expandedFolderIds: string[];
  viewMode: 'grid' | 'list';
  sidebarOpen: boolean;
  pinnedFolderIds: string[];
  history: Array<'all' | string | null>;
  historyIndex: number;
}

export function loadHomeUiState(): HomeUiState {
  let viewMode: 'grid' | 'list' = 'grid';
  let sidebarOpen = true;
  let pinnedFolderIds: string[] = [];
  let selectedFolderId: 'all' | string | null = 'all';
  let expandedFolderIds: string[] = [];

  if (typeof localStorage !== 'undefined') {
    try {
      const vm = localStorage.getItem('turtle_view_mode');
      if (vm === 'grid' || vm === 'list') viewMode = vm;
    } catch {}
    try {
      const sb = localStorage.getItem('turtle_folder_sidebar_open');
      if (sb !== null) sidebarOpen = sb !== 'false';
    } catch {}
    try {
      const pinned = localStorage.getItem('turtle_pinned_folders');
      if (pinned) pinnedFolderIds = JSON.parse(pinned);
    } catch {}
    try {
      const sel = localStorage.getItem('homeUi.selectedFolderId');
      if (sel !== null) {
        selectedFolderId = sel === 'root' || sel === '' ? null : sel;
      }
    } catch {}
    try {
      const exp = localStorage.getItem('homeUi.expandedFolderIds');
      if (exp) {
        const parsed = JSON.parse(exp);
        if (Array.isArray(parsed)) expandedFolderIds = parsed;
      }
    } catch {}
  }

  return {
    filterKind: 'all',
    searchQuery: '',
    sortBy: 'due',
    selectedFolderId,
    expandedFolderIds,
    viewMode,
    sidebarOpen,
    pinnedFolderIds,
    history: [selectedFolderId],
    historyIndex: 0,
  };
}

export const homeUiState: HomeUiState = loadHomeUiState();

export function savePref(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }
}
