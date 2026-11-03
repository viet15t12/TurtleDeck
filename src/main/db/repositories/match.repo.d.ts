import type Database from 'better-sqlite3';
export interface MatchRecord {
    deckId: string;
    bestTimeMs: number;
    achievedAt: number;
    pairsCount: number;
}
export declare class MatchRepository {
    private db;
    private stmtGet;
    private stmtUpsert;
    constructor(db: Database.Database);
    getRecord(deckId: string): MatchRecord | null;
    saveRecord(deckId: string, timeMs: number, pairsCount: number, achievedAt?: number): boolean;
}
//# sourceMappingURL=match.repo.d.ts.map