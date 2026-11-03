import type Database from 'better-sqlite3';
import { SrsCard, SrsDeckSummary, ItemMetaRecord, LegacyProgressData } from '../../../core/types/srs.types.js';
export declare function ratingToNumber(rating: any): number;
export declare function numberToRating(num: number): 'again' | 'hard' | 'good' | 'easy';
export declare class SrsRepository {
    private db;
    stmtGetCard: Database.Statement;
    private stmtUpsertCard;
    private stmtInsertLog;
    private stmtGetDueCards;
    private stmtGetSummary;
    private stmtGetMeta;
    private stmtUpsertMetaStarred;
    private stmtUpsertMetaNote;
    constructor(db: Database.Database);
    getCard(deckId: string, itemId: string, direction?: string): SrsCard | null;
    /**
     * Ghi nhận một lượt ôn tập nguyên tử (Atomic transaction): cập nhật srs_cards + chèn review_logs
     */
    recordReview(card: SrsCard, log: any): void;
    getDueCards(deckId: string, now: number, limit?: number): SrsCard[];
    getReviewLogs(deckId?: string, limit?: number): any[];
    getSummary(deckId: string, now: number): SrsDeckSummary;
    getMeta(deckId: string, itemId: string): ItemMetaRecord | null;
    setStarred(deckId: string, itemId: string, starred: boolean): void;
    setNote(deckId: string, itemId: string, note: string): void;
    clearDeckProgress(deckId?: string | null): void;
    /**
     * Xuất toàn bộ tiến độ ra đối tượng tương thích với study-app.md mục 8
     */
    exportProgressData(): {
        version: number;
        cards: Record<string, any>;
        meta: Record<string, any>;
        log: any[];
    };
    /**
     * Nạp dữ liệu tiến độ từ đối tượng LegacyProgressData vào SQLite
     */
    importProgressData(data: LegacyProgressData, mode?: 'merge' | 'replace'): {
        cardsCount: number;
        logsCount: number;
        metaCount: number;
    };
}
//# sourceMappingURL=srs.repo.d.ts.map