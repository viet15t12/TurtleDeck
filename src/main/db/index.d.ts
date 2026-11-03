import Database from 'better-sqlite3';
import { MigrationResult } from './migration.js';
import { SrsRepository } from './repositories/srs.repo.js';
import { DeckRepository } from './repositories/deck.repo.js';
import { StatsRepository } from './repositories/stats.repo.js';
import { MatchRepository } from './repositories/match.repo.js';
export declare class DatabaseManager {
    private static instance;
    db: Database.Database;
    srs: SrsRepository;
    deck: DeckRepository;
    stats: StatsRepository;
    match: MatchRepository;
    lastMigrationResult: MigrationResult | null;
    constructor(dbPathOrMemory?: string, userDataPath?: string);
    static getInstance(userDataPath?: string): DatabaseManager;
    /**
     * Tạo cơ sở dữ liệu in-memory cho Unit Tests
     */
    static createInMemory(): DatabaseManager;
    /**
     * Sao lưu cơ sở dữ liệu an toàn khi đang ở WAL mode bằng db.backup() hoặc VACUUM INTO
     */
    backup(destFilePath: string): Promise<void>;
    close(): void;
}
//# sourceMappingURL=index.d.ts.map