import { SrsRating, SrsDirection } from './srs.types.js';
export interface DailyReviewStat {
    date: string;
    count: number;
    retentionRate: number;
    timeSpentMs: number;
}
export interface HeatmapCell {
    date: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
}
export interface LeechItemInfo {
    deckId: string;
    itemId: string;
    direction: SrsDirection;
    lapses: number;
    prompt: string;
    lastRating: SrsRating;
    lastReviewTime: number;
}
export interface RetentionBreakdown {
    again: number;
    hard: number;
    good: number;
    easy: number;
    total: number;
    retentionPercentage: number;
}
export interface DeckStatsReport {
    deckId: string;
    totalItems: number;
    learnedItems: number;
    matureItems: number;
    currentStreak: number;
    longestStreak: number;
    retention: RetentionBreakdown;
    leeches: LeechItemInfo[];
    dailyHistory: DailyReviewStat[];
}
export interface OverallStreak {
    currentStreak: number;
    longestStreak: number;
    totalReviews: number;
}
//# sourceMappingURL=stats.types.d.ts.map