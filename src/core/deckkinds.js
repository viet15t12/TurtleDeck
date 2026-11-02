// src/core/deckkinds.js — Phân loại bộ thẻ (meta.kind: 'qa' | 'quiz' | 'vocab'), dạng mục cho phép,
// chế độ học theo loại, suy diễn loại bộ thẻ và phát hiện mục lệch loại (study-app-phase3b.md mục 2).
// Hàm thuần, ES module, không phụ thuộc Electron/DOM, test bằng `node --test`.

export const KINDS = {
  qa: {
    id: 'qa',
    label: 'Thẻ ghi nhớ',
    description: 'Lật thẻ hai mặt để ghi nhớ khái niệm, định nghĩa, công thức',
    icon: '🗂',
    allowedTypes: ['card'],
    defaultType: 'card',
    available: true,
    comingSoon: null,
    modes: [
      {
        id: 'srs',
        label: 'Ôn hôm nay',
        description: 'Lật thẻ hai mặt và tự đánh giá mức nhớ theo lịch lặp lại ngắt quãng',
      },
      {
        id: 'all',
        label: 'Học tất cả',
        description: 'Lật ôn toàn bộ thẻ trong bộ theo thứ tự hoặc ngẫu nhiên',
      },
    ],
  },
  quiz: {
    id: 'quiz',
    label: 'Đề luyện thi',
    description: 'Câu hỏi trắc nghiệm, điền đáp án và gõ lệnh để luyện thi',
    icon: '📝',
    allowedTypes: ['single', 'multi', 'fill', 'command'],
    defaultType: 'single',
    available: true,
    comingSoon: null,
    modes: [
      {
        id: 'srs',
        label: 'Ôn hôm nay',
        description: 'Ôn các câu đến hạn và học câu mới trong hạn mức ngày',
      },
      {
        id: 'practice',
        label: 'Luyện tập',
        description: 'Luyện tập tự do theo số lượng câu và thứ tự tuỳ chọn',
      },
    ],
  },
  vocab: {
    id: 'vocab',
    label: 'Từ vựng',
    description: 'Học từ vựng kèm phiên âm, từ loại, câu ví dụ và luyện tập đa chiều',
    icon: '🔤',
    allowedTypes: ['vocab'],
    defaultType: 'vocab',
    available: false,
    comingSoon: 'Có ở bản sau',
    modes: [
      {
        id: 'srs',
        label: 'Ôn hôm nay',
        description: 'Ôn từ vựng đến hạn và học từ mới trong hạn mức ngày',
      },
      {
        id: 'flashcards',
        label: 'Flashcards',
        description: 'Lật thẻ từ vựng hai mặt để ghi nhớ nghĩa và ví dụ',
      },
    ],
  },
};

export const ITEM_TYPE_LABELS = {
  single: 'Trắc nghiệm',
  multi: 'Trắc nghiệm',
  fill: 'Điền',
  command: 'Lệnh',
  card: 'Thẻ',
  vocab: 'Từ vựng',
};

export function isValidKind(kind) {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(KINDS, kind);
}

// Xác định dạng (type) của một item: ưu tiên item.type, nếu thiếu thì suy từ trường dữ liệu
export function detectItemType(item, deckKind) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  if (typeof item.type === 'string' && item.type.trim() !== '') {
    return item.type.trim();
  }
  if ('term' in item || 'definition' in item || deckKind === 'vocab') return 'vocab';
  if ('front' in item || 'back' in item) return 'card';
  return null;
}

// Suy ra loại bộ thẻ từ danh sách items (§2.2 quy tắc 2):
// - toàn 'card' (khi có ít nhất 1 mục) → 'qa'
// - có mục 'vocab' → 'vocab'
// - còn lại → 'quiz'
export function inferKind(itemsOrDeck) {
  const rawItems = Array.isArray(itemsOrDeck)
    ? itemsOrDeck
    : (Array.isArray(itemsOrDeck?.items) ? itemsOrDeck.items : []);
  const validItems = rawItems.filter(it => it && typeof it === 'object' && !Array.isArray(it));
  if (validItems.length === 0) return 'quiz';

  const types = validItems.map(it => detectItemType(it));
  if (types.every(t => t === 'card')) return 'qa';
  if (types.some(t => t === 'vocab')) return 'vocab';
  return 'quiz';
}

// Lấy loại bộ thẻ: nếu meta.kind hợp lệ ('qa' | 'quiz' | 'vocab') thì dùng, ngược lại suy ra bằng inferKind
export function kindOf(deckOrKind) {
  if (isValidKind(deckOrKind)) return deckOrKind;
  const declared = deckOrKind?.meta?.kind ?? deckOrKind?.kind;
  if (isValidKind(declared)) return declared;
  return inferKind(deckOrKind?.items ?? deckOrKind);
}

// Danh sách dạng mục cho phép của loại bộ thẻ
export function allowedTypes(kindOrDeck) {
  const k = kindOf(kindOrDeck);
  return [...KINDS[k].allowedTypes];
}

// Dạng mục mặc định khi thêm mới vào bộ thẻ thuộc loại kind
export function defaultTypeFor(kindOrDeck) {
  const k = kindOf(kindOrDeck);
  return KINDS[k].defaultType;
}

// Danh sách các chế độ học hiện có của loại bộ thẻ (chỉ trả các chế độ đã làm)
export function modesFor(kindOrDeck) {
  const k = kindOf(kindOrDeck);
  return KINDS[k].modes.map(m => ({ ...m }));
}

// Tìm các mục có dạng không nằm trong allowedTypes của bộ thẻ (hoặc của targetKind khi chuẩn bị đổi loại)
export function mismatchedItems(deckOrItems, targetKind) {
  const items = Array.isArray(deckOrItems)
    ? deckOrItems
    : (Array.isArray(deckOrItems?.items) ? deckOrItems.items : []);
  const kind = isValidKind(targetKind) ? targetKind : kindOf(deckOrItems);
  const allowed = new Set(KINDS[kind].allowedTypes);

  return items.filter(it => {
    if (!it || typeof it !== 'object' || Array.isArray(it)) return false;
    const t = detectItemType(it);
    return t !== null && !allowed.has(t);
  });
}

export function kindLabel(kindOrDeck) {
  const k = kindOf(kindOrDeck);
  return KINDS[k]?.label || 'Đề luyện thi';
}

export function itemTypeLabel(type) {
  return ITEM_TYPE_LABELS[type] || String(type || '');
}

// Tạo câu cảnh báo tiếng Việt thân thiện cho các mục lệch loại
// Ví dụ: "3 mục dạng Thẻ nằm trong bộ Đề luyện thi."
export function formatMismatchWarning(deckOrItems, targetKind) {
  const kind = isValidKind(targetKind) ? targetKind : kindOf(deckOrItems);
  const mismatched = mismatchedItems(deckOrItems, kind);
  if (mismatched.length === 0) return '';

  const countsByLabel = new Map();
  for (const it of mismatched) {
    const t = detectItemType(it);
    const lbl = itemTypeLabel(t);
    countsByLabel.set(lbl, (countsByLabel.get(lbl) || 0) + 1);
  }

  const parts = [...countsByLabel.entries()].map(([lbl, count]) => `${count} mục dạng ${lbl}`);
  return `${parts.join(', ')} nằm trong bộ ${KINDS[kind].label}.`;
}

