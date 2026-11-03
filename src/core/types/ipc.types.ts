import { DeckItem } from './item.types.js';
import { SrsCard, SrsDeckSummary, SrsRating, SrsDirection, ItemMetaRecord } from './srs.types.js';
import { DeckStatsReport, OverallStreak } from './stats.types.js';
import { Folder, DeckLocation } from './folder.types.js';

export interface IpcContracts {
  // Gói thẻ .sdeck
  'deck:open': {
    request: { filePath?: string | string[] } | string | string[] | void;
    response: Array<{
      path: string;
      ok: boolean;
      deckKey?: string;
      deckText?: string;
      deck?: any;
      error?: string;
      issues?: any[];
      total?: number;
      skipped?: number;
      assetCount?: number;
      missing?: boolean;
    }>;
  };
  'deck:import': {
    request: { kind?: string } | string | void;
    response: any;
  };
  'deck:save': {
    request: { deckKey: string; deckText?: string; filePath?: string; saveAs?: boolean; pruneUnused?: boolean };
    response: {
      ok: boolean;
      path?: string;
      filePath?: string;
      deckText?: string;
      deck?: any;
      canceled?: boolean;
      error?: string;
      issues?: any[];
      total?: number;
      skipped?: number;
      assetCount?: number;
    };
  };
  'deck:close': {
    request: { deckKey: string } | string;
    response: boolean;
  };
  'deck:duplicate': {
    request: { oldDeckKey: string } | string;
    response: any;
  };
  'deck:exportCopy': {
    request: { filePath: string } | string;
    response: { ok: boolean; path?: string; error?: string; canceled?: boolean };
  };
  'deck:showInFolder': {
    request: { filePath: string } | string;
    response: boolean;
  };
  'deck:new': {
    request: void;
    response: {
      ok: boolean;
      deckKey: string;
      deckText: string;
      deck: any;
      issues: any[];
      total: number;
      skipped: number;
      assetCount: number;
    };
  };
  'deck:queryItems': {
    request: { deckId: string; query?: string; type?: string; starredOnly?: boolean; limit?: number; offset?: number; tag?: string };
    response: { items: DeckItem[]; total: number };
  };

  // Quản lý ảnh & assets
  'asset:add': {
    request: { deckKey: string } | string;
    response: any;
  };
  'asset:addBytes': {
    request: { deckKey: string; name: string; bytes: number[] | Uint8Array };
    response: { ok: boolean; path?: string; error?: string };
  };
  'asset:list': {
    request: { deckKey: string } | string;
    response: string[];
  };
  'asset:remove': {
    request: { deckKey: string; assetPath: string };
    response: { ok: boolean; error?: string };
  };

  // Tiến độ & Cài đặt
  'progress:load': {
    request: void;
    response: any;
  };
  'progress:save': {
    request: any;
    response: { ok: boolean; error?: string };
  };
  'progress:export': {
    request: void;
    response: { ok: boolean; path?: string; canceled?: boolean; error?: string };
  };
  'progress:pickImport': {
    request: void;
    response: any;
  };
  'progress:applyImport': {
    request: { importedProgress: any; mode?: 'merge' | 'replace' };
    response: any;
  };
  'settings:load': {
    request: void;
    response: any;
  };
  'settings:save': {
    request: any;
    response: { ok: boolean; error?: string };
  };

  // Nhập dữ liệu
  'import:pickFile': {
    request: void;
    response: { ok: boolean; path?: string; token?: string; name?: string; size?: number; canceled?: boolean; error?: string };
  };
  'import:preview': {
    request: { token?: string; filePath?: string; format?: string; separator?: string; hasHeader?: boolean };
    response: any;
  };
  'import:commit': {
    request: { token?: string; filePath?: string; items?: any[]; options?: any };
    response: any;
  };

  // Thư viện & Thư mục
  'library:getDir': {
    request: void;
    response: string;
  };
  'library:pickDir': {
    request: void;
    response: string | null;
  };
  'library:setDir': {
    request: { dir: string } | string;
    response: { ok: boolean; dir?: string; error?: string };
  };
  'library:scan': {
    request: void;
    response: any[];
  };

  // Bản nháp (Drafts)
  'draft:save': {
    request: { metaId: string; deckKey: string; deckText: string };
    response: { ok: boolean; error?: string };
  };
  'draft:delete': {
    request: { metaId: string } | string;
    response: { ok: boolean; error?: string };
  };
  'draft:list': {
    request: void;
    response: any[];
  };
  'draft:load': {
    request: { draftId: string } | string;
    response: any;
  };

  // Sao lưu (Backup)
  'backup:create': {
    request: void;
    response: { ok: boolean; file?: string; error?: string };
  };
  'backup:list': {
    request: void;
    response: Array<{ name: string; size: number; mtime: number }>;
  };
  'backup:restore': {
    request: { name: string } | string;
    response: { ok: boolean; error?: string };
  };
  'backup:openFolder': {
    request: void;
    response: { ok: boolean; error?: string };
  };

  // SRS
  'srs:getDeckSummary': {
    request: { deckId: string; now?: number } | void;
    response: SrsDeckSummary;
  };
  'srs:getDueItems': {
    request: { deckId: string; limit?: number; now?: number };
    response: { item: DeckItem; card: SrsCard }[];
  };
  'srs:recordReview': {
    request: { deckId: string; itemId: string; direction: SrsDirection; rating: SrsRating; elapsedMs: number };
    response: { ok: boolean; card: SrsCard };
  };
  'srs:getCard': {
    request: { deckId: string; itemId: string; direction: SrsDirection };
    response: SrsCard | null;
  };

  // Thống kê
  'stats:getDeckReport': {
    request: { deckId: string; days?: number };
    response: DeckStatsReport;
  };
  'stats:getOverallStreak': {
    request: void;
    response: OverallStreak;
  };

  // Meta (sao, ghi chú)
  'meta:get': {
    request: { deckId: string; itemId: string };
    response: ItemMetaRecord | null;
  };
  'meta:setStarred': {
    request: { deckId: string; itemId: string; starred: boolean };
    response: { ok: boolean };
  };
  'meta:setNote': {
    request: { deckId: string; itemId: string; note: string };
    response: { ok: boolean };
  };

  // Folder operations
  'folder:create': {
    request: { name: string; parentId: string | null };
    response: { ok: boolean; folder?: Folder; error?: string };
  };
  'folder:rename': {
    request: { id: string; newName: string };
    response: { ok: boolean; error?: string };
  };
  'folder:move': {
    request: { id: string; newParentId: string | null };
    response: { ok: boolean; error?: string };
  };
  'folder:delete': {
    request: { id: string };
    response: { ok: boolean; error?: string };
  };
  'folder:getTree': {
    request: void;
    response: Folder[];
  };

  // Deck location operations
  'deck:move': {
    request: { deckId: string; newFolderId: string | null };
    response: { ok: boolean; error?: string };
  };
  'deck:link': {
    request: { deckId: string; targetFolderId: string | null };
    response: { ok: boolean; error?: string };
  };
  'deck:unlink': {
    request: { locationId: string; deleteFile: boolean };
    response: { ok: boolean; error?: string };
  };
  'deck:getLocations': {
    request: { deckId: string };
    response: DeckLocation[];
  };
}

export interface IpcEvents {
  'deck:openExternal': { filePaths: string[] };
  'deck:changed': { filePath: string };
  'deck:fileAdded': { filePath: string };
  'deck:fileRemoved': { filePath: string };
  'deck:watchError': { error: string };
  'deck:moved': { deckId: string; newFolderId: string | null; filePath: string };
  'deck:linked': { deckId: string; targetFolderId: string | null; filePath: string };
  'deck:unlinked': { locationId: string; deckId: string };
  'folder:changed': any;
  'app:ready': void;
}

export type IpcChannel = keyof IpcContracts;
export type IpcRequest<C extends IpcChannel> = IpcContracts[C]['request'];
export type IpcResponse<C extends IpcChannel> = IpcContracts[C]['response'];
export type IpcEventChannel = keyof IpcEvents;
