// src/main/db/repositories/match.repo.ts — Quản lý kỷ lục chế độ Match
import type Database from 'better-sqlite3';

export interface MatchRecord {
  deckId: string;
  bestTimeMs: number;
  achievedAt: number;
  pairsCount: number;
}

export class MatchRepository {
  private stmtGet: Database.Statement;
  private stmtUpsert: Database.Statement;

  constructor(private db: Database.Database) {
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

  public getRecord(deckId: string): MatchRecord | null {
    return (this.stmtGet.get(deckId) as MatchRecord) || null;
  }

  public saveRecord(deckId: string, timeMs: number, pairsCount: number, achievedAt = Date.now()): boolean {
    const current = this.getRecord(deckId);
    if (!current || timeMs < current.bestTimeMs) {
      this.stmtUpsert.run(deckId, timeMs, achievedAt, pairsCount);
      return true;
    }
    return false;
  }
}

