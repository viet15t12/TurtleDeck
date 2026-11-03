import type Database from 'better-sqlite3';
import { DailyReviewStat, LeechItemInfo, RetentionBreakdown, OverallStreak } from '../../../core/types/stats.types.js';
export declare function getTzModifier(tz?: string): string;
export declare class StatsRepository {
    private db;
    constructor(db: Database.Database);
    /**
     * Lấy lịch sử ôn tập theo ngày cho biểu đồ Activity / Heatmap
     */
    getDailyActivity(deckIdOrLimit?: string | number | {
        deckId?: string;
        limitDays?: number;
        tz?: string;
    }, limitDaysOrTz?: number | string, tzParam?: string): DailyReviewStat[];
    /**
     * Tính toán tỉ lệ ghi nhớ tổng quan (Retention Breakdown)
     */
    getRetentionBreakdown(deckId?: string): RetentionBreakdown;
    /**
     * Truy vấn danh sách thẻ Leech (lapses >= threshold) kèm prompt lấy từ items cache
     */
    getLeechCards(deckId?: string, threshold?: number): LeechItemInfo[];
    /**
     * Tính chuỗi ngày học liên tiếp (Streak) hoàn toàn bằng SQL
     */
    getOverallStreak(tz?: string, now?: number): OverallStreak;
}
//# sourceMappingURL=stats.repo.d.ts.map