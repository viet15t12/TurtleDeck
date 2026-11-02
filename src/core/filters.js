// src/core/filters.js — Lọc và phân loại danh sách câu hỏi theo chủ đề, nhãn và trạng thái học SRS.
// Theo study-app.md mục 4.4 và study-app-phases.md GĐ5. Hàm thuần, ES module, không phụ thuộc DOM/Electron.

import { cardKey } from './srs.js';

// Trích xuất danh sách chủ đề duy nhất không rỗng
export function extractTopics(items = []) {
  const topics = new Set();
  for (const it of items) {
    if (it?.topic && typeof it.topic === 'string') {
      const trimmed = it.topic.trim();
      if (trimmed) topics.add(trimmed);
    }
  }
  return [...topics].sort((a, b) => a.localeCompare(b, 'vi'));
}

// Trích xuất danh sách nhãn (tags) duy nhất không rỗng
export function extractTags(items = []) {
  const tags = new Set();
  for (const it of items) {
    if (Array.isArray(it?.tags)) {
      for (const t of it.tags) {
        if (typeof t === 'string' && t.trim()) tags.add(t.trim());
      }
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b, 'vi'));
}

// Xác định trạng thái học SRS của một item ('new' | 'learning' | 'due' | 'mastered' | 'error-prone' | 'starred')
export function getItemStatus(item, progress = {}, { deckId = 'deck', now = Date.now(), leechThreshold = 1 } = {}) {
  if (!item || typeof item !== 'object') return 'new';

  // 1. Kiểm tra đánh dấu sao
  const isStarred = item.starred === true ||
    (Array.isArray(progress.starred) && progress.starred.includes(item.id)) ||
    (progress.starred && typeof progress.starred === 'object' && progress.starred[item.id] === true);
  if (isStarred) return 'starred';

  const cards = progress.cards || {};
  const key = cardKey(deckId, item.id, 'fwd');
  const card = cards[key] || cards[item.id];

  if (!card || card.state === 'new') {
    return 'new';
  }

  // 2. Kiểm tra sai nhiều (lapses >= ngưỡng)
  if ((card.lapses || 0) >= leechThreshold) {
    return 'error-prone';
  }

  // 3. Đang học hoặc học lại ngắn hạn
  if (card.state === 'learning' || card.state === 'relearning') {
    return 'learning';
  }

  // 4. Ôn tập đã đến hạn
  if (card.state === 'review') {
    if ((card.due || 0) <= now) {
      return 'due';
    }
    return 'mastered';
  }

  return 'new';
}

// Lọc danh sách items theo tiêu chí topic, tag, status và từ khoá tìm kiếm
export function filterItems(items = [], criteria = {}, { progress = {}, deckId = 'deck', now = Date.now() } = {}) {
  const { topic, tag, status, search } = criteria;
  const cards = progress.cards || {};

  return items.filter(it => {
    if (!it || typeof it !== 'object') return false;

    // 1. Lọc theo Topic
    if (topic && topic !== 'all') {
      const matchTopic = Array.isArray(topic)
        ? topic.includes(it.topic)
        : it.topic === topic;
      if (!matchTopic) return false;
    }

    // 2. Lọc theo Tag
    if (tag && tag !== 'all') {
      const itTags = Array.isArray(it.tags) ? it.tags : [];
      const matchTag = Array.isArray(tag)
        ? tag.some(t => itTags.includes(t))
        : itTags.includes(tag);
      if (!matchTag) return false;
    }

    // 3. Lọc theo Trạng thái học (status)
    if (status && status !== 'all') {
      const itemSt = getItemStatus(it, progress, { deckId, now });
      const normStatus = String(status).toLowerCase();

      if (normStatus === 'starred' || normStatus === 'đã sao') {
        const isStarred = it.starred === true || (Array.isArray(progress.starred) && progress.starred.includes(it.id));
        if (!isStarred) return false;
      } else if (normStatus === 'error-prone' || normStatus === 'sai nhiều' || normStatus === 'lapsed') {
        const key = cardKey(deckId, it.id, 'fwd');
        const card = cards[key] || cards[it.id];
        if (!card || (card.lapses || 0) < 1) return false;
      } else if (normStatus === 'new' || normStatus === 'mới') {
        const key = cardKey(deckId, it.id, 'fwd');
        const card = cards[key] || cards[it.id];
        if (card && card.state !== 'new') return false;
      } else if (normStatus === 'learning' || normStatus === 'đang học') {
        const key = cardKey(deckId, it.id, 'fwd');
        const card = cards[key] || cards[it.id];
        if (!card || (card.state !== 'learning' && card.state !== 'relearning')) return false;
        if ((card.lapses || 0) >= 1) return false;
      } else if (normStatus === 'due' || normStatus === 'đến hạn') {
        const key = cardKey(deckId, it.id, 'fwd');
        const card = cards[key] || cards[it.id];
        if (!card || card.state !== 'review' || (card.due || 0) > now) return false;
      } else if (normStatus === 'mastered' || normStatus === 'đã thuộc') {
        const key = cardKey(deckId, it.id, 'fwd');
        const card = cards[key] || cards[it.id];
        if (!card || card.state !== 'review' || (card.due || 0) <= now) return false;
      }
    }

    // 4. Lọc theo Từ khoá tìm kiếm
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim().toLowerCase();
      const content = [
        it.question,
        it.term,
        it.definition,
        it.front,
        it.back,
        it.topic,
        ...(Array.isArray(it.choices) ? it.choices.map(c => (typeof c === 'string' ? c : c?.text)) : []),
      ].filter(Boolean).join(' ').toLowerCase();

      if (!content.includes(q)) return false;
    }

    return true;
  });
}
