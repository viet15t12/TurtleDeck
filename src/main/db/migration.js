import path from 'node:path';
import fs from 'node:fs';
import { ratingToNumber } from './repositories/srs.repo.js';
export function parseProgressCardKey(key) {
    if (typeof key !== 'string')
        return { deckId: '', itemId: '', direction: 'fwd' };
    const parts = key.split(':');
    if (parts.length >= 3) {
        return {
            deckId: parts[0],
            itemId: parts.slice(1, -1).join(':'),
            direction: parts[parts.length - 1] || 'fwd',
        };
    }
    if (parts.length === 2) {
        return { deckId: parts[0], itemId: parts[1], direction: 'fwd' };
    }
    return { deckId: key, itemId: key, direction: 'fwd' };
}
export function parseProgressMetaKey(key) {
    if (typeof key !== 'string')
        return { deckId: '', itemId: '' };
    const parts = key.split(':');
    if (parts.length >= 2) {
        return {
            deckId: parts[0],
            itemId: parts.slice(1).join(':'),
        };
    }
    return { deckId: key, itemId: key };
}
/**
 * Đọc progress.json định dạng cũ (study-app.md mục 8) và nạp vào SQLite trong 1 transaction duy nhất.
 * Nếu thành công: đổi tên thành progress.json.migrated.
 * Nếu lỗi: giữ nguyên file cũ và không ném lỗi để app vẫn chạy an toàn.
 */
export function migrateLegacyProgress(db, userDataOrFilePath) {
    const legacyPath = (fs.existsSync(userDataOrFilePath) && fs.statSync(userDataOrFilePath).isFile())
        ? userDataOrFilePath
        : path.join(userDataOrFilePath, 'progress.json');
    if (!fs.existsSync(legacyPath)) {
        return { migrated: false, cardsCount: 0, logsCount: 0, metaCount: 0 };
    }
    let content;
    try {
        content = fs.readFileSync(legacyPath, 'utf8');
    }
    catch (err) {
        console.error('[Migration] Không thể đọc file progress.json:', err);
        return { migrated: false, cardsCount: 0, logsCount: 0, metaCount: 0, error: err.message };
    }
    let legacy;
    try {
        legacy = JSON.parse(content.replace(/^\uFEFF/, ''));
    }
    catch (err) {
        console.error('[Migration] progress.json không phải JSON hợp lệ:', err);
        return { migrated: false, cardsCount: 0, logsCount: 0, metaCount: 0, error: err.message };
    }
    if (!legacy || typeof legacy !== 'object') {
        return { migrated: false, cardsCount: 0, logsCount: 0, metaCount: 0 };
    }
    let cardsCount = 0;
    let logsCount = 0;
    let metaCount = 0;
    try {
        const insertCard = db.prepare(`
      INSERT OR REPLACE INTO srs_cards (deck_id, item_id, direction, state, step, ease, interval, due, reps, lapses, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const checkLogExists = db.prepare(`
      SELECT 1 FROM review_logs
      WHERE deck_id = ? AND item_id = ? AND direction = ? AND review_time = ?
      LIMIT 1
    `);
        const insertLog = db.prepare(`
      INSERT INTO review_logs (deck_id, item_id, direction, rating, review_time, elapsed_ms, is_new)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        const insertMeta = db.prepare(`
      INSERT OR REPLACE INTO item_meta (deck_id, item_id, starred, note, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
        const now = Date.now();
        const migrateTx = db.transaction(() => {
            // 1. Migrate cards: key là deckId:itemId:direction
            if (legacy.cards && typeof legacy.cards === 'object') {
                for (const [key, card] of Object.entries(legacy.cards)) {
                    if (!card || typeof card !== 'object')
                        continue;
                    const parsed = parseProgressCardKey(key);
                    if (!parsed.deckId || !parsed.itemId)
                        continue;
                    insertCard.run(parsed.deckId, parsed.itemId, parsed.direction || 'fwd', card.state || 'new', Number.isInteger(card.step) ? card.step : 0, typeof card.ease === 'number' ? card.ease : 2.5, Number.isInteger(card.interval) ? card.interval : 0, typeof card.due === 'number' ? card.due : 0, Number.isInteger(card.reps) ? card.reps : 0, Number.isInteger(card.lapses) ? card.lapses : 0, typeof card.updatedAt === 'number' ? card.updatedAt : now);
                    cardsCount++;
                }
            }
            // 2. Migrate meta: key là deckId:itemId, { starred: true, note: "" }
            if (legacy.meta && typeof legacy.meta === 'object') {
                for (const [key, m] of Object.entries(legacy.meta)) {
                    if (!m || typeof m !== 'object')
                        continue;
                    const parsed = parseProgressMetaKey(key);
                    if (!parsed.deckId || !parsed.itemId)
                        continue;
                    insertMeta.run(parsed.deckId, parsed.itemId, m.starred ? 1 : 0, typeof m.note === 'string' ? m.note : '', now);
                    metaCount++;
                }
            }
            // 3. Migrate logs: { t: number, card: string, rating: number, ms: number }
            if (Array.isArray(legacy.log)) {
                for (const entry of legacy.log) {
                    if (!entry || typeof entry !== 'object' || !entry.card || typeof entry.t !== 'number')
                        continue;
                    const parsed = parseProgressCardKey(entry.card);
                    if (!parsed.deckId || !parsed.itemId)
                        continue;
                    // Chống trùng lặp nếu nạp lại
                    const exists = checkLogExists.get(parsed.deckId, parsed.itemId, parsed.direction, entry.t);
                    if (exists)
                        continue;
                    const rating = ratingToNumber(entry.rating);
                    insertLog.run(parsed.deckId, parsed.itemId, parsed.direction || 'fwd', rating, entry.t, typeof entry.ms === 'number' ? Math.max(0, entry.ms) : 0, entry.isNew ? 1 : 0);
                    logsCount++;
                }
            }
        });
        migrateTx();
        // Đổi tên thành progress.json.migrated sau khi commit thành công
        const migratedPath = `${legacyPath}.migrated`;
        fs.renameSync(legacyPath, migratedPath);
        return {
            migrated: true,
            cardsCount,
            logsCount,
            metaCount,
        };
    }
    catch (err) {
        console.error('[Migration] Lỗi khi thực hiện transaction migration:', err);
        return {
            migrated: false,
            cardsCount: 0,
            logsCount: 0,
            metaCount: 0,
            error: err.message,
        };
    }
}
//# sourceMappingURL=migration.js.map