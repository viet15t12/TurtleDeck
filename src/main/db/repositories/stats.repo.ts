// src/main/db/repositories/stats.repo.ts — Thống kê hiệu năng cao bằng truy vấn SQL
import type Database from 'better-sqlite3';
import { DailyReviewStat, LeechItemInfo, RetentionBreakdown, OverallStreak } from '../../../core/types/stats.types.js';

export function getTzModifier(tz?: string): string {
  if (tz === 'Asia/Saigon' || tz === 'Asia/Ho_Chi_Minh') return '+07:00';
  return 'localtime';
}

export class StatsRepository {
  constructor(private db: Database.Database) {}

  /**
   * Lấy lịch sử ôn tập theo ngày cho biểu đồ Activity / Heatmap
   */
  public getDailyActivity(
    deckIdOrLimit?: string | number | { deckId?: string; limitDays?: number; tz?: string },
    limitDaysOrTz?: number | string,
    tzParam = 'Asia/Saigon'
  ): DailyReviewStat[] {
    let deckId: string | undefined;
    let limitDays = 365;
    let tz = tzParam;

    if (typeof deckIdOrLimit === 'object' && deckIdOrLimit !== null) {
      deckId = deckIdOrLimit.deckId;
      limitDays = deckIdOrLimit.limitDays ?? 365;
      tz = deckIdOrLimit.tz ?? tzParam;
    } else if (typeof deckIdOrLimit === 'number') {
      limitDays = deckIdOrLimit;
      if (typeof limitDaysOrTz === 'string') {
        tz = limitDaysOrTz;
      }
    } else if (typeof deckIdOrLimit === 'string') {
      deckId = deckIdOrLimit;
      if (typeof limitDaysOrTz === 'number') {
        limitDays = limitDaysOrTz;
      }
      if (typeof tzParam === 'string') {
        tz = tzParam;
      }
    }

    const tzMod = getTzModifier(tz);
    const sql = `
      SELECT 
        strftime('%Y-%m-%d', datetime(review_time / 1000, 'unixepoch', '${tzMod}')) as date,
        COUNT(*) as count,
        ROUND(AVG(CASE WHEN rating >= 2 THEN 1.0 ELSE 0.0 END) * 100, 1) as retentionRate,
        SUM(elapsed_ms) as timeSpentMs
      FROM review_logs
      ${deckId ? 'WHERE deck_id = ?' : ''}
      GROUP BY date
      ORDER BY date DESC
      LIMIT ?
    `;

    const stmt = this.db.prepare(sql);
    const rows = deckId ? stmt.all(deckId, limitDays) : stmt.all(limitDays);
    return rows as DailyReviewStat[];
  }

  /**
   * Tính toán tỉ lệ ghi nhớ tổng quan (Retention Breakdown)
   */
  public getRetentionBreakdown(deckId?: string): RetentionBreakdown {
    const sql = `
      SELECT
        COUNT(CASE WHEN rating = 1 THEN 1 END) as again,
        COUNT(CASE WHEN rating = 2 THEN 1 END) as hard,
        COUNT(CASE WHEN rating = 3 THEN 1 END) as good,
        COUNT(CASE WHEN rating = 4 THEN 1 END) as easy,
        COUNT(*) as total
      FROM review_logs
      ${deckId ? 'WHERE deck_id = ?' : ''}
    `;

    const stmt = this.db.prepare(sql);
    const row: any = deckId ? stmt.get(deckId) : stmt.get();
    const correct = (row?.hard || 0) + (row?.good || 0) + (row?.easy || 0);
    const total = row?.total || 0;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    return {
      again: row?.again || 0,
      hard: row?.hard || 0,
      good: row?.good || 0,
      easy: row?.easy || 0,
      total,
      retentionPercentage: percentage,
    };
  }

  /**
   * Truy vấn danh sách thẻ Leech (lapses >= threshold) kèm prompt lấy từ items cache
   */
  public getLeechCards(deckId?: string, threshold = 8): LeechItemInfo[] {
    const sql = `
      SELECT 
        c.deck_id as deckId,
        c.item_id as itemId,
        c.direction,
        c.lapses,
        COALESCE(i.search_text, c.item_id) as prompt,
        COALESCE(
          (SELECT rating FROM review_logs WHERE deck_id = c.deck_id AND item_id = c.item_id ORDER BY review_time DESC LIMIT 1),
          1
        ) as lastRating,
        c.updated_at as lastReviewTime
      FROM srs_cards c
      LEFT JOIN items i ON c.deck_id = i.deck_id AND c.item_id = i.id
      WHERE c.lapses >= ? ${deckId ? 'AND c.deck_id = ?' : ''}
      ORDER BY c.lapses DESC
    `;

    const stmt = this.db.prepare(sql);
    const rows = deckId ? stmt.all(threshold, deckId) : stmt.all(threshold);
    return rows as LeechItemInfo[];
  }

  /**
   * Tính chuỗi ngày học liên tiếp (Streak) hoàn toàn bằng SQL
   */
  public getOverallStreak(tz = 'Asia/Saigon', now = Date.now()): OverallStreak {
    const tzMod = getTzModifier(tz);

    const countRow = this.db.prepare('SELECT COUNT(*) as total FROM review_logs').get() as any;
    const totalReviews = countRow?.total || 0;

    const daysStmt = this.db.prepare(`
      SELECT DISTINCT strftime('%Y-%m-%d', datetime(review_time / 1000, 'unixepoch', '${tzMod}')) as d
      FROM review_logs
      ORDER BY d ASC
    `);
    const dateRows = daysStmt.all() as { d: string }[];
    if (dateRows.length === 0) {
      return { currentStreak: 0, longestStreak: 0, bestStreak: 0, totalReviews: 0 } as any;
    }

    const activeDaysSet = new Set<string>();
    const sortedDays: string[] = [];
    for (const r of dateRows) {
      if (r.d) {
        activeDaysSet.add(r.d);
        sortedDays.push(r.d);
      }
    }

    // Longest streak
    let longest = 0;
    let currentRun = 0;
    let prevDate: Date | null = null;

    for (const dStr of sortedDays) {
      const parts = dStr.split('-').map(Number);
      const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

      if (prevDate) {
        const diffMs = dateObj.getTime() - prevDate.getTime();
        const diffDays = Math.round(diffMs / 86400000);
        if (diffDays === 1) {
          currentRun++;
        } else {
          currentRun = 1;
        }
      } else {
        currentRun = 1;
      }
      prevDate = dateObj;
      if (currentRun > longest) longest = currentRun;
    }

    // Current streak tính theo ngày hiện tại ở timezone
    const todayStmt = this.db.prepare(`SELECT strftime('%Y-%m-%d', datetime(? / 1000, 'unixepoch', '${tzMod}')) as today`);
    const todayStr = (todayStmt.get(now) as any)?.today || '';
    const todayParts = todayStr.split('-').map(Number);
    const todayUtc = new Date(Date.UTC(todayParts[0], todayParts[1] - 1, todayParts[2]));

    const yesterdayUtc = new Date(todayUtc.getTime() - 86400000);
    const yY = yesterdayUtc.getUTCFullYear();
    const yM = String(yesterdayUtc.getUTCMonth() + 1).padStart(2, '0');
    const yD = String(yesterdayUtc.getUTCDate()).padStart(2, '0');
    const yesterdayStr = `${yY}-${yM}-${yD}`;

    let current = 0;
    let checkUtc: Date | null = null;

    if (activeDaysSet.has(todayStr)) {
      checkUtc = todayUtc;
    } else if (activeDaysSet.has(yesterdayStr)) {
      checkUtc = yesterdayUtc;
    } else {
      return { currentStreak: 0, longestStreak: longest, bestStreak: longest, totalReviews } as any;
    }

    while (true) {
      const cY = checkUtc.getUTCFullYear();
      const cM = String(checkUtc.getUTCMonth() + 1).padStart(2, '0');
      const cD = String(checkUtc.getUTCDate()).padStart(2, '0');
      const cStr = `${cY}-${cM}-${cD}`;

      if (activeDaysSet.has(cStr)) {
        current++;
        checkUtc = new Date(checkUtc.getTime() - 86400000);
      } else {
        break;
      }
    }

    return {
      currentStreak: current,
      longestStreak: Math.max(longest, current),
      bestStreak: Math.max(longest, current),
      totalReviews,
    } as any;
  }
}
