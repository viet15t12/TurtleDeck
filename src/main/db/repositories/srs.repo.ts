// src/main/db/repositories/srs.repo.ts — Repository quản lý tiến trình SRS, logs và item_meta
import type Database from 'better-sqlite3';
import { SrsCard, ReviewLogEntry, SrsDeckSummary, ItemMetaRecord, LegacyProgressData } from '../../../core/types/srs.types.js';
import { parseProgressCardKey, parseProgressMetaKey } from '../migration.js';

export function ratingToNumber(rating: any): number {
  if (typeof rating === 'number' && rating >= 1 && rating <= 4) return rating;
  switch (rating) {
    case 'again': return 1;
    case 'hard': return 2;
    case 'good': return 3;
    case 'easy': return 4;
    default: return 3;
  }
}

export function numberToRating(num: number): 'again' | 'hard' | 'good' | 'easy' {
  switch (num) {
    case 1: return 'again';
    case 2: return 'hard';
    case 3: return 'good';
    case 4: return 'easy';
    default: return 'good';
  }
}

export class SrsRepository {
  public stmtGetCard: Database.Statement;
  private stmtUpsertCard: Database.Statement;
  private stmtInsertLog: Database.Statement;
  private stmtGetDueCards: Database.Statement;
  private stmtGetSummary: Database.Statement;
  private stmtGetMeta: Database.Statement;
  private stmtUpsertMetaStarred: Database.Statement;
  private stmtUpsertMetaNote: Database.Statement;

  constructor(private db: Database.Database) {
    this.stmtGetCard = db.prepare(`
      SELECT 
        deck_id as deckId,
        item_id as itemId,
        direction,
        state,
        step,
        ease,
        interval,
        due,
        reps,
        lapses,
        updated_at as updatedAt
      FROM srs_cards 
      WHERE deck_id = ? AND item_id = ? AND direction = ?
    `);

    this.stmtUpsertCard = db.prepare(`
      INSERT INTO srs_cards (deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at)
      VALUES (@deckId, @itemId, @direction, @state, @step, @ease, @interval, @due, @reps, @lapses, @updatedAt)
      ON CONFLICT(deck_id, item_id, direction) DO UPDATE SET
        state = excluded.state,
        step = excluded.step,
        ease = excluded.ease,
        interval = excluded.interval,
        due = excluded.due,
        reps = excluded.reps,
        lapses = excluded.lapses,
        updated_at = excluded.updated_at
    `);

    this.stmtInsertLog = db.prepare(`
      INSERT INTO review_logs (deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new)
      VALUES (@deckId, @itemId, @direction, @rating, @reviewTime, @elapsedMs, @isNew)
    `);

    this.stmtGetDueCards = db.prepare(`
      SELECT 
        deck_id as deckId,
        item_id as itemId,
        direction,
        state,
        step,
        ease,
        interval,
        due,
        reps,
        lapses,
        updated_at as updatedAt
      FROM srs_cards
      WHERE deck_id = ? AND (state IN ('learning', 'relearning') OR (state = 'review' AND due <= ?))
      ORDER BY due ASC
      LIMIT ?
    `);

    this.stmtGetSummary = db.prepare(`
      SELECT 
        COUNT(CASE WHEN state = 'new' THEN 1 END) as newCount,
        COUNT(CASE WHEN state IN ('learning', 'relearning') THEN 1 END) as learningCount,
        COUNT(CASE WHEN state = 'review' AND due <= ? THEN 1 END) as dueCount,
        COUNT(CASE WHEN state = 'review' AND due > ? THEN 1 END) as masteredCount,
        COUNT(*) as totalCards
      FROM srs_cards
      WHERE deck_id = ?
    `);

    this.stmtGetMeta = db.prepare(`
      SELECT deck_id as deckId, item_id as itemId, starred, note, updated_at as updatedAt
      FROM item_meta
      WHERE deck_id = ? AND item_id = ?
    `);

    this.stmtUpsertMetaStarred = db.prepare(`
      INSERT INTO item_meta (deck_id, item_id, starred, note, updated_at)
      VALUES (?, ?, ?, '', ?)
      ON CONFLICT(deck_id, item_id) DO UPDATE SET
        starred = excluded.starred,
        updated_at = excluded.updated_at
    `);

    this.stmtUpsertMetaNote = db.prepare(`
      INSERT INTO item_meta (deck_id, item_id, starred, note, updated_at)
      VALUES (?, ?, 0, ?, ?)
      ON CONFLICT(deck_id, item_id) DO UPDATE SET
        note = excluded.note,
        updated_at = excluded.updated_at
    `);
  }

  public getCard(deckId: string, itemId: string, direction = 'fwd'): SrsCard | null {
    const row = this.stmtGetCard.get(deckId, itemId, direction) as any;
    return row || null;
  }

  /**
   * Ghi nhận một lượt ôn tập nguyên tử (Atomic transaction): cập nhật srs_cards + chèn review_logs
   */
  public recordReview(card: SrsCard, log: any): void {
    const ratingNum = ratingToNumber(log.rating);
    const reviewTime = log.reviewTime ?? log.t ?? Date.now();
    const elapsedMs = log.elapsedMs ?? log.timeSpentMs ?? log.ms ?? 0;
    const isNew = log.isNew ? 1 : 0;

    const recordTx = this.db.transaction(() => {
      this.stmtUpsertCard.run({
        deckId: card.deckId,
        itemId: card.itemId,
        direction: card.direction || 'fwd',
        state: card.state,
        step: card.step || 0,
        ease: card.ease ?? 2.5,
        interval: card.interval || 0,
        due: card.due || 0,
        reps: card.reps || 0,
        lapses: card.lapses || 0,
        updatedAt: card.updatedAt || Date.now(),
      });

      this.stmtInsertLog.run({
        deckId: log.deckId || card.deckId,
        itemId: log.itemId || card.itemId,
        direction: log.direction || card.direction || 'fwd',
        rating: ratingNum,
        reviewTime: reviewTime,
        elapsedMs: elapsedMs,
        isNew: isNew,
      });
    });

    recordTx();
  }

  public getDueCards(deckId: string, now: number, limit = 50): SrsCard[] {
    return this.stmtGetDueCards.all(deckId, now, limit) as SrsCard[];
  }

  public getReviewLogs(deckId?: string, limit = 100): any[] {
    if (deckId) {
      return this.db.prepare('SELECT * FROM review_logs WHERE deck_id = ? ORDER BY review_time DESC, id DESC LIMIT ?').all(deckId, limit);
    }
    return this.db.prepare('SELECT * FROM review_logs ORDER BY review_time DESC, id DESC LIMIT ?').all(limit);
  }

  public getSummary(deckId: string, now: number): SrsDeckSummary {
    const totalItemsRow = this.db.prepare('SELECT COUNT(*) as c FROM items WHERE deck_id = ?').get(deckId) as any;
    const totalItems = totalItemsRow?.c || 0;

    const row = this.stmtGetSummary.get(now, now, deckId) as any;
    const learningCount = row?.learningCount || 0;
    const dueCount = row?.dueCount || 0;
    const masteredCount = row?.masteredCount || 0;
    const srsTotal = row?.totalCards || 0;

    const newCount = totalItems > 0
      ? Math.max(0, totalItems - (learningCount + dueCount + masteredCount))
      : (row?.newCount || 0);

    return {
      newCount,
      learningCount,
      dueCount,
      masteredCount,
      totalCards: Math.max(totalItems, srsTotal),
    };
  }

  public getMeta(deckId: string, itemId: string): ItemMetaRecord | null {
    const row = this.stmtGetMeta.get(deckId, itemId) as any;
    if (!row) return null;
    return {
      deckId: row.deckId,
      itemId: row.itemId,
      starred: Boolean(row.starred),
      note: row.note || '',
      updatedAt: row.updatedAt,
    };
  }

  public setStarred(deckId: string, itemId: string, starred: boolean): void {
    this.stmtUpsertMetaStarred.run(deckId, itemId, starred ? 1 : 0, Date.now());
  }

  public setNote(deckId: string, itemId: string, note: string): void {
    this.stmtUpsertMetaNote.run(deckId, itemId, note || '', Date.now());
  }

  public clearDeckProgress(deckId: string | null = null): void {
    const clearTx = this.db.transaction(() => {
      if (!deckId || deckId === 'all') {
        this.db.prepare('DELETE FROM srs_cards').run();
        this.db.prepare('DELETE FROM review_logs').run();
        this.db.prepare('DELETE FROM item_meta').run();
      } else {
        this.db.prepare('DELETE FROM srs_cards WHERE deck_id = ?').run(deckId);
        this.db.prepare('DELETE FROM review_logs WHERE deck_id = ?').run(deckId);
        this.db.prepare('DELETE FROM item_meta WHERE deck_id = ?').run(deckId);
      }
    });
    clearTx();
  }

  /**
   * Xuất toàn bộ tiến độ ra đối tượng tương thích với study-app.md mục 8
   */
  public exportProgressData(): { version: number; cards: Record<string, any>; meta: Record<string, any>; log: any[] } {
    const cardsStmt = this.db.prepare(`
      SELECT deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at
      FROM srs_cards
    `);
    const cardsRows = cardsStmt.all() as any[];
    const cards: Record<string, any> = {};
    for (const r of cardsRows) {
      const key = `${r.deck_id}:${r.item_id}:${r.direction}`;
      cards[key] = {
        state: r.state,
        step: r.step,
        ease: r.ease,
        interval: r.interval,
        due: r.due,
        reps: r.reps,
        lapses: r.lapses,
        updatedAt: r.updated_at,
      };
    }

    const metaStmt = this.db.prepare(`
      SELECT deck_id, item_id, starred, note FROM item_meta
    `);
    const metaRows = metaStmt.all() as any[];
    const meta: Record<string, any> = {};
    for (const r of metaRows) {
      const key = `${r.deck_id}:${r.item_id}`;
      meta[key] = {
        starred: Boolean(r.starred),
        note: r.note || '',
      };
    }

    const logsStmt = this.db.prepare(`
      SELECT deck_id, item_id, direction, rating, review_time, elapsed_ms
      FROM review_logs
      ORDER BY review_time ASC
    `);
    const logRows = logsStmt.all() as any[];
    const log = logRows.map(r => ({
      t: r.review_time,
      card: `${r.deck_id}:${r.item_id}:${r.direction}`,
      rating: r.rating,
      ms: r.elapsed_ms,
    }));

    return {
      version: 1,
      cards,
      meta,
      log,
    };
  }

  /**
   * Nạp dữ liệu tiến độ từ đối tượng LegacyProgressData vào SQLite
   */
  public importProgressData(
    data: LegacyProgressData,
    mode: 'merge' | 'replace' = 'merge'
  ): { cardsCount: number; logsCount: number; metaCount: number } {
    if (!data || typeof data !== 'object') {
      return { cardsCount: 0, logsCount: 0, metaCount: 0 };
    }

    if (mode === 'replace') {
      this.clearDeckProgress('all');
    }

    let cardsCount = 0;
    let logsCount = 0;
    let metaCount = 0;
    const now = Date.now();

    const checkLogExists = this.db.prepare(`
      SELECT id FROM review_logs 
      WHERE deck_id = ? AND item_id = ? AND direction = ? AND review_time = ?
      LIMIT 1
    `);

    const tx = this.db.transaction(() => {
      if (data.cards && typeof data.cards === 'object') {
        for (const [key, card] of Object.entries(data.cards)) {
          if (!card || typeof card !== 'object') continue;
          const parsed = parseProgressCardKey(key);
          if (!parsed.deckId || !parsed.itemId) continue;

          this.stmtUpsertCard.run({
            deckId: parsed.deckId,
            itemId: parsed.itemId,
            direction: parsed.direction || 'fwd',
            state: card.state || 'new',
            step: card.step || (card as any).stepIndex || 0,
            ease: card.ease ?? 2.5,
            interval: card.interval || 0,
            due: card.due || 0,
            reps: card.reps || 0,
            lapses: card.lapses || 0,
            updatedAt: card.updatedAt || (card as any).lastReview || now,
          });
          cardsCount++;
        }
      }

      if (data.meta && typeof data.meta === 'object') {
        for (const [key, m] of Object.entries(data.meta)) {
          if (!m || typeof m !== 'object') continue;
          const parsed = parseProgressMetaKey(key);
          if (!parsed.deckId || !parsed.itemId) continue;

          if (m.starred !== undefined) {
            this.stmtUpsertMetaStarred.run(parsed.deckId, parsed.itemId, m.starred ? 1 : 0, now);
          }
          if (m.note !== undefined) {
            this.stmtUpsertMetaNote.run(parsed.deckId, parsed.itemId, m.note || '', now);
          }
          metaCount++;
        }
      }

      if (Array.isArray(data.log)) {
        for (const entry of data.log) {
          if (!entry || typeof entry !== 'object' || !entry.card) continue;
          const parsed = parseProgressCardKey(entry.card);
          if (!parsed.deckId || !parsed.itemId) continue;

          const reviewTime = entry.t || now;
          const exists = checkLogExists.get(parsed.deckId, parsed.itemId, parsed.direction, reviewTime);
          if (exists) continue;

          const ratingNum = ratingToNumber(entry.rating);
          const elapsedMs = entry.ms || 0;

          this.stmtInsertLog.run({
            deckId: parsed.deckId,
            itemId: parsed.itemId,
            direction: parsed.direction || 'fwd',
            rating: ratingNum,
            reviewTime,
            elapsedMs,
            isNew: (entry as any).isNew ? 1 : 0,
          });
          logsCount++;
        }
      }
    });

    tx();
    return { cardsCount, logsCount, metaCount };
  }
}
