export declare const RATING_CORRECT: Record<number, boolean>;
export declare function isCorrectRating(rating: number): boolean;
export declare function dayKey(timestamp: number, tz?: string): string;
export declare function resolveEffectiveLog(log?: any[]): any[];
export declare function parseCardKey(key: unknown): {
    deckId: string;
    itemId: string;
    direction: string;
};
export declare function streak(progress: any, { now, tz }?: {
    now?: number;
    tz?: string;
}): {
    current: number;
    longest: number;
};
export declare function reviewsPerDay(progress: any, days?: number, { now, tz }?: {
    now?: number;
    tz?: string;
}): any[];
export declare function heatmap(progress: any, days?: number, { now, tz }?: {
    now?: number;
    tz?: string;
}): any[];
export declare function accuracyByDeck(progress: any, decks?: any[], { filterDeckId }?: {
    filterDeckId?: string | null;
}): any[];
export declare function accuracyByTopic(progress: any, { deckId, itemsLookup }?: {
    deckId?: string | null;
    itemsLookup?: any;
}): any[];
export declare function leeches(cards?: any, { threshold, deckId }?: {
    threshold?: number;
    deckId?: string | null;
}): any[];
export declare function summary(progress: any, decks?: any[], { now, tz }?: {
    now?: number;
    tz?: string;
}): any;
//# sourceMappingURL=stats.d.ts.map