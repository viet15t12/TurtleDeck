// src/views/home/folder-store.js — Quản lý nạp cây thư mục, vị trí bộ thẻ và helper tra cứu

import { flattenFolders } from '../components/foldertree.js';

export function createFolderStore() {
  let rawFolderTree = [];
  let flatFolders = [];
  let deckLocations = [];
  let locationsByDeckId = new Map();

  async function refreshDeckLocations() {
    if (window.api?.getDeckLocations) {
      try {
        const locs = (await window.api.getDeckLocations()) || [];
        deckLocations = locs;
        locationsByDeckId = new Map(locs.filter(l => !l.isLink).map(l => [l.deckId, l.folderId]));
      } catch (e) {
        console.warn('Không thể nạp danh sách vị trí bộ thẻ:', e);
      }
    }
  }

  async function refreshFolders() {
    if (window.api?.getFolderTree) {
      try {
        rawFolderTree = await window.api.getFolderTree();
        flatFolders = flattenFolders(rawFolderTree);
      } catch (e) {
        console.warn('Không thể nạp cây thư mục:', e);
      }
    }
    await refreshDeckLocations();
  }

  function findFolder(fId) {
    if (!fId || fId === 'all') return null;
    return flatFolders.find(f => f.id === fId) || null;
  }

  function getBreadcrumbChain(fId) {
    if (!fId || fId === 'all') return [];
    const chain = [];
    let current = findFolder(fId);
    while (current) {
      chain.unshift(current);
      current = current.parentId ? findFolder(current.parentId) : null;
    }
    return chain;
  }

  return {
    refreshFolders,
    refreshDeckLocations,
    findFolder,
    getBreadcrumbChain,
    get rawFolderTree() {
      return rawFolderTree;
    },
    get flatFolders() {
      return flatFolders;
    },
    get deckLocations() {
      return deckLocations;
    },
    get locationsByDeckId() {
      return locationsByDeckId;
    },
  };
}
