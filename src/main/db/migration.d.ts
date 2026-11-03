import type Database from 'better-sqlite3';
export interface MigrationResult {
    migrated: boolean;
    cardsCount: number;
    logsCount: number;
    metaCount: number;
    error?: string;
}
export declare function parseProgressCardKey(key: string): {
    deckId: string;
    itemId: string;
    direction: string;
};
export declare function parseProgressMetaKey(key: string): {
    deckId: string;
    itemId: string;
};
/**
 * Đọc progress.json định dạng cũ (study-app.md mục 8) và nạp vào SQLite trong 1 transaction duy nhất.
 * Nếu thành công: đổi tên thành progress.json.migrated.
 * Nếu lỗi: giữ nguyên file cũ và không ném lỗi để app vẫn chạy an toàn.
 */
export declare function migrateLegacyProgress(db: Database.Database, userDataOrFilePath: string): MigrationResult;
//# sourceMappingURL=migration.d.ts.map