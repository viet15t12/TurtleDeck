import { DeckItem } from './item.types.js';

export type DeckKind = 'qa' | 'quiz' | 'vocab';

export interface DeckMeta {
  id: string;
  title: string;
  kind?: DeckKind;
  lang?: string;
  description?: string;
  created?: number;
  updated?: number;
  totalItems?: number;
  formatVersion?: number;
}

export interface DeckData {
  formatVersion?: number;
  meta: DeckMeta;
  items: DeckItem[];
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  field: string;
  msg: string;
  itemId?: string;
}

export interface ParseResult {
  ok: boolean;
  deck?: DeckData;
  issues: ValidationIssue[];
  error?: string;
}

