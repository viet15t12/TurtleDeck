export class MatchRepository {
    db;
    stmtGet;
    stmtUpsert;
    constructor(db) {
        this.db = db;
        this.stmtGet = db.prepare(`
      SELECT deck_id as deckId, best_time_ms as bestTimeMs, achieved_at as achievedAt, pairs_count as pairsCount
      FROM match_records
      WHERE deck_id = ?
    `);
        this.stmtUpsert = db.prepare(`
      INSERT INTO match_records (deck_id, best_time_ms, achieved_at, pairs_count)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(deck_id) DO UPDATE SET
        best_time_ms = excluded.best_time_ms,
        achieved_at = excluded.achieved_at,
        pairs_count = excluded.pairs_count
      WHERE excluded.best_time_ms < match_records.best_time_ms
    `);
    }
    getRecord(deckId) {
        return this.stmtGet.get(deckId) || null;
    }
    saveRecord(deckId, timeMs, pairsCount, achievedAt = Date.now()) {
        const current = this.getRecord(deckId);
        if (!current || timeMs < current.bestTimeMs) {
            this.stmtUpsert.run(deckId, timeMs, achievedAt, pairsCount);
            return true;
        }
        return false;
    }
}
//# sourceMappingURL=match.repo.js.map