// src/core/types.ts — Kiểu dữ liệu dùng chung cho Renderer và Core logic.

export type Rating = 1 | 2 | 3 | 4; // RATING.AGAIN | HARD | GOOD | EASY
export type DeckKind = 'qa' | 'quiz' | 'vocab';
export type QuestionKind = 'single' | 'multi' | 'fill' | 'command' | 'listen' | 'card';
export type Direction = 'fwd' | 'rev' | string;

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

export interface DeckItem {
  id: string;
  type?: string;
  [k: string]: unknown;
}

export interface Deck {
  meta: DeckMeta;
  items: DeckItem[];
  formatVersion?: number;
}

export interface CardState {
  state: 'new' | 'learning' | 'review' | 'relearning';
  step?: number;
  ease: number;
  interval: number;
  due: number;
  reps: number;
  lapses: number;
  deckId?: string;
  itemId?: string;
  direction?: Direction;
  updatedAt?: number;
  [k: string]: unknown;
}

export interface ReviewLogEntry {
  t: number;
  card: string;
  rating: number;
  ms: number;
  [k: string]: unknown;
}

export interface ItemMeta {
  starred?: boolean;
  note?: string;
}

export interface Progress {
  version: 1 | number;
  cards: Record<string, CardState>;
  meta: Record<string, ItemMeta>;
  log: ReviewLogEntry[];
}

export interface Settings {
  version: number;
  decks: string[];
  newCardsPerDay: number;
  learnSteps: number[];
  ttsLang?: string;
  ttsVoiceName?: string;
  theme?: 'system' | 'light' | 'dark';
  libraryDir?: string;
}

export type EntryStatus = 'loading' | 'ok' | 'error' | 'missing';

export interface Entry {
  uid: number;
  path: string | null;
  status: EntryStatus;
  deckKey?: string | null;
  deckText?: string;
  deck?: Deck | null;
  issues: unknown[];
  error?: string | null;
  source?: string;
  assetCount?: number;
  group?: string;
  relPath?: string;
  inLibrary?: boolean;
  total?: number;
  skipped?: number;
  missing?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  path: string;
  depth?: number;
  createdAt?: number;
  updatedAt?: number;
  children?: Folder[];
}

export interface DeckLocation {
  id?: string;
  deckId: string;
  folderId: string | null;
  filePath?: string;
  isLink?: boolean;
  linkTarget?: string | null;
  locationId?: string;
  createdAt?: number;
}

export interface SessionConfig {
  mode?: 'srs' | 'custom' | 'trial' | 'learn' | 'match' | 'exam';
  persist?: boolean;
  count?: number;
  shuffle?: boolean;
  itemIds?: string[];
  [k: string]: unknown;
}

export type Route =
  | { name: 'home' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'editor'; uid: number; itemId?: string | null }
  | { name: 'deck' | 'learn' | 'match' | 'exam'; uid: number; config?: Record<string, unknown> }
  | { name: 'session'; uid: number; config?: SessionConfig; fromEditor?: boolean; trialDeck?: Deck };

