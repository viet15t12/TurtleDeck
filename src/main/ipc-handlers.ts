// src/main/ipc-handlers.ts — Đăng ký các kênh IPC có type giữa Main và Renderer
import electron from 'electron';
import { DatabaseManager } from './db/index.js';
import { calculateNextState, newCard } from '../core/srs.js';
import { IpcContracts, IpcChannel, IpcRequest } from '../core/types/ipc.types.js';

export interface IpcDispatcher {
  handle(channel: string, listener: (event: any, ...args: any[]) => any): void;
}

const defaultDispatcher: IpcDispatcher = (typeof electron === 'object' && electron !== null && 'ipcMain' in electron)
  ? (electron as any).ipcMain
  : undefined;

export function registerTypedIpcHandlers(
  dbManager: DatabaseManager,
  dispatcher: IpcDispatcher = defaultDispatcher
): void {
  // ── SRS: recordReview (Atomic calculation & write) ─────────────────────────
  dispatcher.handle('srs:recordReview', async (_event, params: IpcRequest<'srs:recordReview'>) => {
    const { deckId, itemId, direction = 'fwd', rating, elapsedMs } = params;
    const now = Date.now();

    const existing = dbManager.srs.getCard(deckId, itemId, direction) || {
      ...newCard(),
      deckId,
      itemId,
      direction,
    };

    const isNew = existing.state === 'new';
    const { card: nextCard } = calculateNextState(existing, rating, now);

    dbManager.srs.recordReview(nextCard, {
      deckId,
      itemId,
      direction,
      rating,
      reviewTime: now,
      elapsedMs: elapsedMs || 0,
      isNew,
    });

    return { ok: true, card: nextCard };
  });

  // ── SRS: getDeckSummary ───────────────────────────────────────────────────
  dispatcher.handle('srs:getDeckSummary', async (_event, params?: IpcRequest<'srs:getDeckSummary'>) => {
    const deckId = params?.deckId || '';
    const now = params?.now ?? Date.now();
    return dbManager.srs.getSummary(deckId, now);
  });

  // ── SRS: getDueItems ──────────────────────────────────────────────────────
  dispatcher.handle('srs:getDueItems', async (_event, params: IpcRequest<'srs:getDueItems'>) => {
    const { deckId, limit = 50, now = Date.now() } = params;
    const dueCards = dbManager.srs.getDueCards(deckId, now, limit);
    const items = dbManager.deck.getItems(deckId);
    const itemsMap = new Map(items.map(i => [i.id, i]));

    const result = [];
    for (const card of dueCards) {
      const item = itemsMap.get(card.itemId!);
      if (item) {
        result.push({ item, card });
      }
    }
    return result;
  });

  // ── SRS: getCard ──────────────────────────────────────────────────────────
  dispatcher.handle('srs:getCard', async (_event, params: IpcRequest<'srs:getCard'>) => {
    const { deckId, itemId, direction = 'fwd' } = params;
    return dbManager.srs.getCard(deckId, itemId, direction);
  });

  // ── Deck: queryItems (FTS search & filters) ───────────────────────────────
  dispatcher.handle('deck:queryItems', async (_event, params: IpcRequest<'deck:queryItems'>) => {
    return dbManager.deck.queryItems(params);
  });

  // ── Stats: getDeckReport ──────────────────────────────────────────────────
  dispatcher.handle('stats:getDeckReport', async (_event, params: IpcRequest<'stats:getDeckReport'>) => {
    const { deckId, days = 90 } = params;
    const now = Date.now();
    const items = dbManager.deck.getItems(deckId);
    const summary = dbManager.srs.getSummary(deckId, now);
    const dailyHistory = dbManager.stats.getDailyActivity(deckId, days);
    const retention = dbManager.stats.getRetentionBreakdown(deckId);
    const leeches = dbManager.stats.getLeechCards(deckId);
    const streak = dbManager.stats.getOverallStreak('Asia/Saigon', now);

    return {
      deckId,
      totalItems: items.length || summary.totalCards,
      learnedItems: summary.learningCount + summary.dueCount + summary.masteredCount,
      matureItems: summary.masteredCount,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      retention,
      leeches,
      dailyHistory,
    };
  });

  // ── Stats: getOverallStreak ───────────────────────────────────────────────
  dispatcher.handle('stats:getOverallStreak', async () => {
    return dbManager.stats.getOverallStreak('Asia/Saigon', Date.now());
  });

  // ── Meta: get, setStarred, setNote ────────────────────────────────────────
  dispatcher.handle('meta:get', async (_event, { deckId, itemId }: IpcRequest<'meta:get'>) => {
    return dbManager.srs.getMeta(deckId, itemId);
  });

  dispatcher.handle('meta:setStarred', async (_event, { deckId, itemId, starred }: IpcRequest<'meta:setStarred'>) => {
    dbManager.srs.setStarred(deckId, itemId, starred);
    return { ok: true };
  });

  dispatcher.handle('meta:setNote', async (_event, { deckId, itemId, note }: IpcRequest<'meta:setNote'>) => {
    dbManager.srs.setNote(deckId, itemId, note);
    return { ok: true };
  });
}

