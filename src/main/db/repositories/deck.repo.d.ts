import type Database from 'better-sqlite3';
import { DeckItem } from '../../../core/types/item.types.js';
import { DeckData } from '../../../core/types/deck.types.js';
export declare function extractSearchText(item: any): string;
export declare class DeckRepository {
    private db;
    private stmtUpsertDeck;
    private stmtGetDeck;
    private stmtGetDeckHash;
    private stmtUpsertItem;
    private stmtDeleteItem;
    private stmtGetItemsForDeck;
    constructor(db: Database.Database);
    getDeck(deckId: string): any;
    getDeckHash(deckId: string): string | null;
    getItems(deckId: string): DeckItem[];
    /**
     * Đồng bộ gói thẻ vào SQLite khi mở hoặc lưu file .sdeck:
     * Tính hash SHA-1 của deck.json. Nếu hash thay đổi thì đồng bộ bảng items cache.
     * Item biến mất khỏi deck: xoá khỏi cache items, nhưng GIỮ NGUYÊN tiến trình srs_cards!
     */
    syncDeck(deck: DeckData, filePath?: string | null): {
        synced: boolean;
        hash: string;
        changed: boolean;
        itemsCount: number;
    };
    /**
     * Truy vấn danh sách câu hỏi theo tiêu chí (deckId, query, topic, type, starredOnly, limit, offset)
     */
    queryItems(paramsOrDeckId: string | {
        deckId?: string;
        query?: string;
        type?: string;
        topic?: string;
        tag?: string;
        starredOnly?: boolean;
        limit?: number;
        offset?: number;
    }, options?: {
        query?: string;
        type?: string;
        topic?: string;
        tag?: string;
        starredOnly?: boolean;
        limit?: number;
        offset?: number;
    }): {
        items: DeckItem[];
        total: number;
    };
}
//# sourceMappingURL=deck.repo.d.ts.map