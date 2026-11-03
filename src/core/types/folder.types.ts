// src/core/types/folder.types.ts — Kiểu dữ liệu cho cấu trúc thư mục và vị trí bộ thẻ

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  depth: number;
  createdAt: number;
  updatedAt: number;
  children?: Folder[];
}

export interface DeckLocation {
  id: string;
  deckId: string;
  folderId: string | null;
  filePath: string;
  isLink: boolean;
  linkTarget?: string | null;
  createdAt: number;
}

export type Result<T = void> =
  | { ok: true; data: T; error?: never }
  | { ok: false; error: string; data?: never };

