// src/views/home/folder-store.js — Quản lý nạp cây thư mục ảo, vị trí bộ thẻ và nguồn sự thật dẫn xuất

import { flattenFolders } from '../components/foldertree.js';

export function normalizeFolderId(id) {
  if (id === undefined || id === null) return null;
  const s = String(id).trim();
  if (!s || s === 'all' || s === 'root') return null;
  return s;
}

export function formatFolderError(res, fallbackMsg = 'Đã xảy ra lỗi thao tác thư mục.') {
  const code = res?.code;
  switch (code) {
    case 'FolderNotFound':
      return 'Thư mục không tồn tại hoặc đã bị xoá.';
    case 'DeckNotFound':
      return 'Không tìm thấy bộ thẻ trong cơ sở dữ liệu.';
    case 'FolderNameConflict':
      return 'Tên thư mục đã tồn tại trong cùng thư mục cha.';
    case 'FolderCycle':
      return 'Không thể di chuyển thư mục vào chính nó hoặc thư mục con cháu của nó.';
    case 'InvalidLinkTarget':
      return 'Không thể tạo liên kết tới Thư mục gốc.';
    case 'AlreadyInFolder':
      return 'Bộ thẻ đã có mặt trong thư mục này.';
    case 'CannotUnlinkPrimary':
      return 'Không thể xoá liên kết đối với vị trí chính của bộ thẻ.';
    default:
      return res?.error || fallbackMsg;
  }
}

export function createFolderStore() {
  let rawFolderTree = [];
  let flatFolders = [];
  let deckLocations = [];
  let locationsByDeckId = new Map();
  let primaryLocationByDeckId = new Map();
  let linksByFolderId = new Map();
  let deckIdsByFolderId = new Map();
  let isLoaded = false;

  function rebuildDerivedLocations(locs = deckLocations) {
    deckLocations = Array.isArray(locs) ? [...locs] : [];
    locationsByDeckId = new Map();
    primaryLocationByDeckId = new Map();
    linksByFolderId = new Map();
    deckIdsByFolderId = new Map();
    deckIdsByFolderId.set(null, new Set());

    for (const f of flatFolders) {
      if (!deckIdsByFolderId.has(f.id)) {
        deckIdsByFolderId.set(f.id, new Set());
      }
      if (!linksByFolderId.has(f.id)) {
        linksByFolderId.set(f.id, []);
      }
    }

    for (const loc of deckLocations) {
      if (!loc || !loc.deckId) continue;
      const folderId = normalizeFolderId(loc.folderId);
      const isLink = Boolean(loc.isLink);

      if (!isLink) {
        locationsByDeckId.set(loc.deckId, folderId);
        primaryLocationByDeckId.set(loc.deckId, { ...loc, folderId, isLink: false });
      } else if (folderId !== null) {
        if (!linksByFolderId.has(folderId)) {
          linksByFolderId.set(folderId, []);
        }
        linksByFolderId.get(folderId).push({ ...loc, folderId, isLink: true });
      }

      if (!deckIdsByFolderId.has(folderId)) {
        deckIdsByFolderId.set(folderId, new Set());
      }
      deckIdsByFolderId.get(folderId).add(loc.deckId);
    }
  }

  function rebuildTreeFromFlat(folders) {
    const map = new Map();
    for (const f of folders) {
      map.set(f.id, {
        ...f,
        parentId: normalizeFolderId(f.parentId),
        sortOrder: f.sortOrder ?? 0,
        children: [],
      });
    }

    const roots = [];
    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId).children.push(node);
      } else {
        node.parentId = null;
        roots.push(node);
      }
    }

    const sortNodes = list => {
      list.sort((a, b) => {
        const sa = a.sortOrder ?? 0;
        const sb = b.sortOrder ?? 0;
        if (sa !== sb) return sa - sb;
        return String(a.name || '').localeCompare(String(b.name || ''), 'vi', { sensitivity: 'base' });
      });
    };

    // Tính lại depth và path theo duyệt BFS/DFS lặp không đệ quy
    sortNodes(roots);
    const stack = roots.map(r => ({ node: r, depth: 0, parentPath: '' })).reverse();
    const orderedFlat = [];

    while (stack.length > 0) {
      const { node, depth, parentPath } = stack.pop();
      node.depth = depth;
      node.path = parentPath ? `${parentPath}/${node.name}` : node.name;
      orderedFlat.push(node);

      if (node.children && node.children.length > 0) {
        sortNodes(node.children);
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push({
            node: node.children[i],
            depth: depth + 1,
            parentPath: node.path,
          });
        }
      }
    }

    rawFolderTree = roots;
    flatFolders = orderedFlat;
    rebuildDerivedLocations(deckLocations);
  }

  async function refreshDeckLocations() {
    if (typeof window !== 'undefined' && window.api?.getDeckLocations) {
      try {
        const locs = (await window.api.getDeckLocations()) || [];
        rebuildDerivedLocations(locs);
      } catch (e) {
        console.warn('Không thể nạp danh sách vị trí bộ thẻ:', e);
      }
    }
  }

  async function refreshFolders(force = true) {
    if (!force && isLoaded) {
      return;
    }
    if (typeof window !== 'undefined' && window.api?.getFolderTree) {
      try {
        rawFolderTree = (await window.api.getFolderTree()) || [];
        flatFolders = flattenFolders(rawFolderTree);
      } catch (e) {
        console.warn('Không thể nạp cây thư mục:', e);
      }
    }
    await refreshDeckLocations();
    isLoaded = true;
  }

  function invalidate() {
    isLoaded = false;
  }

  function findFolder(fId) {
    const norm = normalizeFolderId(fId);
    if (!norm) return null;
    return flatFolders.find(f => f.id === norm) || null;
  }

  function getSubtreeIds(folderId) {
    const norm = normalizeFolderId(folderId);
    if (!norm) return new Set();
    const subtree = new Set([norm]);
    let added = true;
    while (added) {
      added = false;
      for (const f of flatFolders) {
        if (f.parentId && subtree.has(f.parentId) && !subtree.has(f.id)) {
          subtree.add(f.id);
          added = true;
        }
      }
    }
    return subtree;
  }

  function isDescendantOrSelf(candidateId, ancestorId) {
    const normCand = normalizeFolderId(candidateId);
    const normAnc = normalizeFolderId(ancestorId);
    if (!normCand || !normAnc) return false;
    if (normCand === normAnc) return true;
    let cur = findFolder(normCand);
    const visited = new Set();
    while (cur && cur.parentId && !visited.has(cur.id)) {
      visited.add(cur.id);
      if (cur.parentId === normAnc) return true;
      cur = findFolder(cur.parentId);
    }
    return false;
  }

  function getBreadcrumbChain(fId) {
    const norm = normalizeFolderId(fId);
    if (!norm) return [];
    const chain = [];
    const visited = new Set();
    let current = findFolder(norm);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.unshift(current);
      current = current.parentId ? findFolder(current.parentId) : null;
    }
    return chain;
  }

  // Các hàm cập nhật trực tiếp từ kết quả lệnh Rust trả về (Mục 6.3)
  function applyFolderCreated(folder) {
    if (!folder || !folder.id) return;
    const next = flatFolders.filter(f => f.id !== folder.id);
    next.push(folder);
    rebuildTreeFromFlat(next);
  }

  function applyFolderRenamed(id, newName, updatedFolder) {
    const next = flatFolders.map(f => {
      if (f.id === id) {
        return updatedFolder ? { ...f, ...updatedFolder } : { ...f, name: newName };
      }
      return f;
    });
    rebuildTreeFromFlat(next);
  }

  function applyFolderMoved(id, newParentId, updatedFolder) {
    const normParent = normalizeFolderId(newParentId);
    const next = flatFolders.map(f => {
      if (f.id === id) {
        return updatedFolder ? { ...f, ...updatedFolder } : { ...f, parentId: normParent };
      }
      return f;
    });
    rebuildTreeFromFlat(next);
  }

  function applyFolderDeleted(deletedFolderId, affectedDeckIds = []) {
    const removedSet = getSubtreeIds(deletedFolderId);
    if (removedSet.size === 0) return;

    const remainingFolders = flatFolders.filter(f => !removedSet.has(f.id));
    const affectedSet = new Set(Array.isArray(affectedDeckIds) ? affectedDeckIds : []);

    const nextLocations = [];
    for (const loc of deckLocations) {
      const fid = normalizeFolderId(loc.folderId);
      if (loc.isLink) {
        if (fid && removedSet.has(fid)) {
          continue; // Liên kết trong nhánh bị xóa sẽ bị gỡ
        }
        nextLocations.push(loc);
      } else {
        if ((fid && removedSet.has(fid)) || affectedSet.has(loc.deckId)) {
          nextLocations.push({ ...loc, folderId: null });
        } else {
          nextLocations.push(loc);
        }
      }
    }

    deckLocations = nextLocations;
    rebuildTreeFromFlat(remainingFolders);
  }

  function applyDeckMoved(deckId, newFolderId, returnedLocation = null) {
    const normFolder = normalizeFolderId(returnedLocation ? returnedLocation.folderId : newFolderId);
    const nextLocations = [];
    let foundPrimary = false;

    for (const loc of deckLocations) {
      if (loc.deckId === deckId) {
        if (loc.isLink && normFolder !== null && normalizeFolderId(loc.folderId) === normFolder) {
          // Xóa liên kết trùng tại thư mục đích
          continue;
        }
        if (!loc.isLink) {
          foundPrimary = true;
          nextLocations.push(
            returnedLocation
              ? { ...loc, ...returnedLocation, folderId: normFolder, isLink: false }
              : { ...loc, folderId: normFolder, isLink: false }
          );
          continue;
        }
      }
      nextLocations.push(loc);
    }

    if (!foundPrimary) {
      nextLocations.push(
        returnedLocation || {
          id: `primary-${deckId}`,
          deckId,
          folderId: normFolder,
          isLink: false,
          createdAt: Date.now(),
        }
      );
    }

    rebuildDerivedLocations(nextLocations);
  }

  function applyDeckLinked(location) {
    if (!location || !location.deckId) return;
    const normFolder = normalizeFolderId(location.folderId);
    if (!normFolder) return;
    const nextLocations = deckLocations.filter(
      l => !(l.deckId === location.deckId && normalizeFolderId(l.folderId) === normFolder && l.isLink)
    );
    nextLocations.push({ ...location, folderId: normFolder, isLink: true });
    rebuildDerivedLocations(nextLocations);
  }

  function applyDeckUnlinked(locationId) {
    if (!locationId) return;
    const nextLocations = deckLocations.filter(l => !(l.id === locationId && l.isLink));
    rebuildDerivedLocations(nextLocations);
  }

  function setStateForTest({ folders = [], locations = [] }) {
    rebuildTreeFromFlat(folders);
    rebuildDerivedLocations(locations);
    isLoaded = true;
  }

  return {
    refreshFolders,
    refreshDeckLocations,
    invalidate,
    findFolder,
    getSubtreeIds,
    isDescendantOrSelf,
    getBreadcrumbChain,
    applyFolderCreated,
    applyFolderRenamed,
    applyFolderMoved,
    applyFolderDeleted,
    applyDeckMoved,
    applyDeckLinked,
    applyDeckUnlinked,
    setStateForTest,
    get isLoaded() {
      return isLoaded;
    },
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
    get primaryLocationByDeckId() {
      return primaryLocationByDeckId;
    },
    get linksByFolderId() {
      return linksByFolderId;
    },
    get deckIdsByFolderId() {
      return deckIdsByFolderId;
    },
  };
}
