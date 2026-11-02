// src/core/matchgame.js — Tạo bảng chơi ghép thẻ, kiểm tra kết quả ghép và ghi nhận kỷ lục thời gian.
// Theo study-app.md mục 6.2 và study-app-phases.md GĐ5. Hàm thuần, ES module, không phụ thuộc DOM/Electron.

// Xáo trộn mảng ngẫu nhiên (Fisher-Yates)
function shuffleArray(arr, rand = Math.random) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

// Trích xuất 2 mặt của một item để ghép đôi: term/front/question và definition/back/answer.
export function extractItemPair(item) {
  if (!item || typeof item !== 'object') return null;

  const left = {
    id: `${item.id}-left`,
    itemId: item.id,
    side: 'left',
    text: item.term || item.front || item.question || '',
    image: item.image || item.frontImage || null,
  };

  const right = {
    id: `${item.id}-right`,
    itemId: item.id,
    side: 'right',
    text: item.definition || item.back || item.answerDisplay || (Array.isArray(item.choices) && item.answer ? item.choices[item.answer[0]] : '') || '',
    image: item.answerImage || item.backImage || null,
  };

  if (!left.text && !left.image) return null;
  if (!right.text && !right.image) return null;

  return { left, right, item };
}

// Tạo ván chơi Match từ danh sách items hoặc bộ thẻ:
// Chọn 6–8 cặp (mặc định 6); nếu deck ít hơn (ví dụ 3 thẻ) thì lấy toàn bộ số thẻ có được.
export function createMatchGame(deckOrItems, { maxPairs = 6, shuffle = true, rand = Math.random } = {}) {
  const items = Array.isArray(deckOrItems)
    ? deckOrItems
    : (Array.isArray(deckOrItems?.items) ? deckOrItems.items : []);
  const deckId = deckOrItems?.meta?.id || 'deck';

  const validPairs = items
    .map(extractItemPair)
    .filter(Boolean);

  if (validPairs.length === 0) {
    return { deckId, pairsCount: 0, cards: [] };
  }

  // Giới hạn 6–8 cặp, tự giảm nếu deck ít thẻ (vd: 3 thẻ -> 3 cặp)
  const targetPairs = Math.max(1, Math.min(validPairs.length, Math.min(8, Math.max(6, maxPairs))));
  const selectedPairs = shuffle
    ? shuffleArray(validPairs, rand).slice(0, targetPairs)
    : validPairs.slice(0, targetPairs);

  const flatCards = [];
  selectedPairs.forEach(({ left, right }) => {
    flatCards.push({ ...left, matched: false, selected: false });
    flatCards.push({ ...right, matched: false, selected: false });
  });

  return {
    deckId,
    pairsCount: selectedPairs.length,
    cards: shuffle ? shuffleArray(flatCards, rand) : flatCards,
  };
}

// Kiểm tra 2 thẻ có tạo thành một cặp chính xác hay không
export function checkMatch(cardA, cardB) {
  if (!cardA || !cardB) return { ok: false };
  if (cardA.id === cardB.id) return { ok: false };
  const ok = cardA.itemId === cardB.itemId && cardA.side !== cardB.side;
  return { ok, itemId: ok ? cardA.itemId : null };
}

// Lấy kỷ lục thời gian (ms) của bộ thẻ
export function getMatchRecord(progress, deckId) {
  if (!progress || typeof progress !== 'object') return null;
  const records = progress.matchRecords || progress.meta?.matchRecords;
  const rec = records?.[deckId];
  return typeof rec === 'number' && Number.isFinite(rec) ? rec : null;
}

// Cập nhật kỷ lục thời gian mới nhất (nếu thời gian mới nhanh hơn kỷ lục cũ)
export function updateMatchRecord(progress = {}, deckId, elapsedMs) {
  const currentRecord = getMatchRecord(progress, deckId);
  const isNewRecord = currentRecord === null || elapsedMs < currentRecord;
  const bestTime = isNewRecord ? elapsedMs : currentRecord;

  const records = { ...(progress.matchRecords || {}) };
  if (isNewRecord) {
    records[deckId] = elapsedMs;
  }

  return {
    isNewRecord,
    bestTime,
    progress: {
      ...progress,
      matchRecords: records,
    },
  };
}

// Định dạng thời gian ms thành chuỗi dễ đọc (ví dụ: "14.2s" hoặc "01:23.4")
export function formatMatchTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s';
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const mins = Math.floor(totalSeconds / 60);
  const secs = (totalSeconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
}

