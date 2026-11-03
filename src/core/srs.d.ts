import { SrsCard, SrsRating, SrsDirection, LegacyProgressData, LegacyReviewLog } from './types/srs.types.js';
export declare const DAY = 86400000;
export declare const MINUTE = 60000;
export declare const DEFAULT_LEARN_STEPS: number[];
export declare const RATING: {
    readonly AGAIN: 1;
    readonly HARD: 2;
    readonly GOOD: 3;
    readonly EASY: 4;
};
export declare function parseLearnSteps(input: unknown, fallback?: number[]): number[];
export declare function setLearnSteps(steps: unknown): number[];
export declare function getLearnSteps(): number[];
export declare function cardKey(deckId: string, itemId: string, direction?: SrsDirection): string;
export declare function newCard(): SrsCard;
export declare function schedule(card: Partial<SrsCard> | null | undefined, rating: number, now?: number, opts?: {
    learnSteps?: unknown;
} | unknown[]): SrsCard;
export declare const isDue: (c: SrsCard | null | undefined, now?: number) => boolean;
export declare function ratingFromGrade(grade: {
    ok?: boolean;
} | null | undefined, explicitRating?: number): number;
export declare function previewIntervalLabel(card: SrsCard | null | undefined, rating: number, now?: number, opts?: {
    learnSteps?: unknown;
} | unknown[]): string;
export declare function calculateNextState(card: SrsCard, rating: SrsRating, now?: number, opts?: {
    learnSteps?: unknown;
} | unknown[]): {
    card: SrsCard;
    nextIntervalText: string;
};
export interface RecordReviewArgs {
    deckId?: string;
    itemId?: string;
    direction?: SrsDirection;
    rating: number;
    ms?: number;
    now?: number;
    learnSteps?: unknown;
    persist?: boolean;
}
export interface RecordReviewResult {
    progress: LegacyProgressData;
    key: string | null;
    card: SrsCard | null;
    logEntry: LegacyReviewLog | null;
    persisted: boolean;
}
export declare function recordReview(progress: LegacyProgressData | null | undefined, { deckId, itemId, direction, rating, ms, now, learnSteps, persist, }: RecordReviewArgs): RecordReviewResult;
export declare function clearProgress(progress: LegacyProgressData | null | undefined, deckId?: string | null): LegacyProgressData;
//# sourceMappingURL=srs.d.ts.map