export type SrsRating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy
export type SrsDirection = 'fwd' | 'rev' | 'en-vi' | 'vi-en' | string;
export type SrsCardState = 'new' | 'learning' | 'review' | 'relearning';

export interface SrsCard {
  deckId?: string;
  itemId?: string;
  direction?: SrsDirection;
  state: SrsCardState;
  step?: number;
  ease: number;
  interval: number;
  due: number;
  reps: number;
  lapses: number;
  updatedAt?: number;
}

export interface ReviewLogEntry {
  id?: number;
  deckId: string;
  itemId: string;
  direction: SrsDirection;
  rating: SrsRating;
  reviewTime: number;
  elapsedMs: number;
  isNew: boolean;
}

export interface LegacyReviewLog {
  t: number;
  card: string; // "deckId:itemId:direction"
  rating: number;
  ms: number;
}

export interface LegacyItemMeta {
  starred?: boolean;
  note?: string;
}

export interface LegacyProgressData {
  version?: number;
  cards?: Record<string, SrsCard>;
  meta?: Record<string, LegacyItemMeta>;
  log?: LegacyReviewLog[];
}

export interface SrsDeckSummary {
  newCount: number;
  learningCount: number;
  dueCount: number;
  masteredCount: number;
  totalCards: number;
}

export interface ItemMetaRecord {
  deckId: string;
  itemId: string;
  starred: boolean;
  note: string;
  updatedAt: number;
}
