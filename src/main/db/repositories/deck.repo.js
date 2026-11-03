import { sha1 } from '../../../core/hash.js';
export function extractSearchText(item) {
    const parts = [];
    if (item.question)
        parts.push(item.question);
    if (item.prompt)
        parts.push(item.prompt);
    if (item.front)
        parts.push(item.front);
    if (item.back)
        parts.push(item.back);
    if (item.term)
        parts.push(item.term);
    if (item.definition)
        parts.push(item.definition);
    if (item.example)
        parts.push(item.example);
    if (item.explanation)
        parts.push(item.explanation);
    if (Array.isArray(item.choices)) {
        for (const c of item.choices) {
            if (typeof c === 'string')
                parts.push(c);
            else if (c && typeof c.text === 'string')
                parts.push(c.text);
        }
    }
    if (Array.isArray(item.answer)) {
        for (const a of item.answer) {
            if (typeof a === 'string')
                parts.push(a);
        }
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim();
}
export class DeckRepository {
    db;
    stmtUpsertDeck;
    stmtGetDeck;
    stmtGetDeckHash;
    stmtUpsertItem;
    stmtDeleteItem;
    stmtGetItemsForDeck;
    constructor(db) {
        this.db = db;
        this.stmtUpsertDeck = db.prepare(`
      INSERT INTO decks (id, file_path, title, kind, lang, description, version, deck_hash, created_at, updated_at)
      VALUES (@id, @filePath, @title, @kind, @lang, @description, @version, @deckHash, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        file_path = excluded.file_path,
        title = excluded.title,
        kind = excluded.kind,
        lang = excluded.lang,
        description = excluded.description,
        version = excluded.version,
        deck_hash = excluded.deck_hash,
        updated_at = excluded.updated_at
    `);
        this.stmtGetDeck = db.prepare(`SELECT * FROM decks WHERE id = ?`);
        this.stmtGetDeckHash = db.prepare(`SELECT deck_hash FROM decks WHERE id = ?`);
        this.stmtUpsertItem = db.prepare(`
      INSERT INTO items (id, deck_id, type, topic, tags_json, content_json, search_text, starred, created_at)
      VALUES (@id, @deckId, @type, @topic, @tagsJson, @contentJson, @searchText, @starred, @createdAt)
      ON CONFLICT(deck_id, id) DO UPDATE SET
        type = excluded.type,
        topic = excluded.topic,
        tags_json = excluded.tags_json,
        content_json = excluded.content_json,
        search_text = excluded.search_text
    `);
        this.stmtDeleteItem = db.prepare(`DELETE FROM items WHERE deck_id = ? AND id = ?`);
        this.stmtGetItemsForDeck = db.prepare(`
      SELECT content_json FROM items WHERE deck_id = ? ORDER BY rowid ASC
    `);
    }
    getDeck(deckId) {
        return this.stmtGetDeck.get(deckId) || null;
    }
    getDeckHash(deckId) {
        const row = this.stmtGetDeckHash.get(deckId);
        return row?.deck_hash || null;
    }
    getItems(deckId) {
        const rows = this.stmtGetItemsForDeck.all(deckId);
        return rows.map(r => JSON.parse(r.content_json));
    }
    /**
     * Đồng bộ gói thẻ vào SQLite khi mở hoặc lưu file .sdeck:
     * Tính hash SHA-1 của deck.json. Nếu hash thay đổi thì đồng bộ bảng items cache.
     * Item biến mất khỏi deck: xoá khỏi cache items, nhưng GIỮ NGUYÊN tiến trình srs_cards!
     */
    syncDeck(deck, filePath) {
        const deckText = JSON.stringify(deck);
        const currentHash = sha1(deckText);
        const existingHash = this.getDeckHash(deck.meta.id);
        const changed = existingHash !== currentHash;
        const now = Date.now();
        const tx = this.db.transaction(() => {
            this.stmtUpsertDeck.run({
                id: deck.meta.id,
                filePath: filePath || null,
                title: deck.meta.title || 'Bộ thẻ',
                kind: deck.meta.kind || 'quiz',
                lang: deck.meta.lang || 'vi',
                description: deck.meta.description || null,
                version: deck.formatVersion || 1,
                deckHash: currentHash,
                createdAt: deck.meta.created || now,
                updatedAt: deck.meta.updated || now,
            });
            if (!changed) {
                return;
            }
            // 1. Cập nhật / thêm mới các item hiện có trong deck
            const currentItemIds = new Set();
            for (const item of (deck.items || [])) {
                if (!item || !item.id)
                    continue;
                currentItemIds.add(item.id);
                this.stmtUpsertItem.run({
                    id: item.id,
                    deckId: deck.meta.id,
                    type: item.type || 'single',
                    topic: item.topic || null,
                    tagsJson: item.tags ? JSON.stringify(item.tags) : null,
                    contentJson: JSON.stringify(item),
                    searchText: extractSearchText(item),
                    starred: item.starred ? 1 : 0,
                    createdAt: now,
                });
            }
            // 2. Xoá các item không còn trong deck khỏi bảng cache items
            // (Trigger sẽ tự xoá khỏi items_fts; srs_cards không có FK cascade nên được giữ nguyên an toàn!)
            const cachedItems = this.db.prepare('SELECT id FROM items WHERE deck_id = ?').all(deck.meta.id);
            for (const cached of cachedItems) {
                if (!currentItemIds.has(cached.id)) {
                    this.stmtDeleteItem.run(deck.meta.id, cached.id);
                }
            }
        });
        tx();
        return { synced: true, hash: currentHash, changed, itemsCount: (deck.items || []).length };
    }
    /**
     * Truy vấn danh sách câu hỏi theo tiêu chí (deckId, query, topic, type, starredOnly, limit, offset)
     */
    queryItems(paramsOrDeckId, options) {
        const params = typeof paramsOrDeckId === 'string'
            ? { deckId: paramsOrDeckId, ...(options || {}) }
            : paramsOrDeckId;
        const { deckId, query, type, topic, tag, starredOnly, limit = 50, offset = 0 } = params;
        const conditions = [];
        const args = [];
        if (deckId) {
            conditions.push('i.deck_id = ?');
            args.push(deckId);
        }
        if (type) {
            conditions.push('i.type = ?');
            args.push(type);
        }
        if (topic) {
            conditions.push('i.topic = ?');
            args.push(topic);
        }
        if (tag) {
            conditions.push('(i.tags_json LIKE ? OR instr(i.tags_json, ?))');
            args.push(`%"${tag}"%`, tag);
        }
        if (starredOnly) {
            conditions.push('(i.starred = 1 OR m.starred = 1)');
        }
        if (type) {
            conditions.push('i.type = ?');
            args.push(type);
        }
        if (starredOnly) {
            conditions.push('(i.starred = 1 OR m.starred = 1)');
        }
        let ftsJoin = '';
        if (query && query.trim()) {
            // Sử dụng FTS5 nếu có query
            ftsJoin = 'JOIN items_fts fts ON fts.deck_id = i.deck_id AND fts.item_id = i.id';
            conditions.push('fts.search_text MATCH ?');
            args.push(query.trim().replace(/[*"']/g, '') + '*');
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const countSql = `
      SELECT COUNT(*) as total
      FROM items i
      LEFT JOIN item_meta m ON m.deck_id = i.deck_id AND m.item_id = i.id
      ${ftsJoin}
      ${whereClause}
    `;
        const countRow = this.db.prepare(countSql).get(...args);
        const total = countRow?.total || 0;
        const querySql = `
      SELECT i.content_json, COALESCE(m.starred, i.starred) as isStarred, COALESCE(m.note, '') as note
      FROM items i
      LEFT JOIN item_meta m ON m.deck_id = i.deck_id AND m.item_id = i.id
      ${ftsJoin}
      ${whereClause}
      ORDER BY i.rowid ASC
      LIMIT ? OFFSET ?
    `;
        const rows = this.db.prepare(querySql).all(...args, limit, offset);
        const items = rows.map(r => {
            const item = JSON.parse(r.content_json);
            if (r.isStarred)
                item.starred = true;
            if (r.note)
                item.note = r.note;
            return item;
        });
        return { items, total };
    }
}
//# sourceMappingURL=deck.repo.js.map