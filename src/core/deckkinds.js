// src/core/deckkinds.ts — Phân loại bộ thẻ (meta.kind: 'qa' | 'quiz' | 'vocab'), dạng mục cho phép,
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
            {
                id: 'learn',
                label: 'Học thích ứng',
                description: 'Học thẻ ghi nhớ theo các bậc thành thạo nâng dần',
            },
            {
                id: 'match',
                label: 'Ghép thẻ',
                description: 'Ghép nhanh mặt trước và mặt sau các thẻ',
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
            {
                id: 'exam',
                label: 'Thi thử',
                description: 'Thi thử có tính giờ, không hiện đáp án đến cuối',
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
        available: true,
        comingSoon: null,
        modes: [
            {
                id: 'srs',
                label: 'Ôn hôm nay',
                description: 'Ôn từ vựng đến hạn và học từ mới trong hạn mức ngày',
            },
            {
                id: 'learn',
                label: 'Học thích ứng',
                description: 'Học từ vựng theo mức độ thành thạo nâng dần',
            },
            {
                id: 'flashcards',
                label: 'Flashcards',
                description: 'Lật thẻ từ vựng hai mặt để ghi nhớ nghĩa và ví dụ',
            },
            {
                id: 'mc',
                label: 'Trắc nghiệm',
                description: 'Chọn đáp án đúng giữa các từ vựng',
            },
            {
                id: 'write',
                label: 'Gõ đáp án',
                description: 'Gõ từ hoặc nghĩa để luyện phản xạ',
            },
            {
                id: 'match',
                label: 'Ghép thẻ',
                description: 'Ghép nhanh từ vựng với định nghĩa tương ứng',
            },
            {
                id: 'cloze',
                label: 'Điền chỗ trống (Cloze)',
                description: 'Điền từ vựng thích hợp vào câu ví dụ',
            },
            {
                id: 'listen',
                label: 'Nghe–Gõ',
                description: 'Nghe phát âm và gõ lại từ vựng',
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
    listen: 'Nghe–Gõ',
};
export function isValidKind(kind) {
    return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(KINDS, kind);
}
// Xác định dạng (type) của một item: ưu tiên item.type, nếu thiếu thì suy từ trường dữ liệu
export function detectItemType(item, deckKind) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
        return null;
    if (typeof item.type === 'string' && item.type.trim() !== '') {
        return item.type.trim();
    }
    if ('term' in item || 'definition' in item)
        return 'vocab';
    if ('question' in item || 'choices' in item)
        return 'single';
    if ('front' in item || 'back' in item)
        return 'card';
    if (deckKind === 'vocab')
        return 'vocab';
    return null;
}
export const itemType = detectItemType;
// Suy ra loại bộ thẻ từ danh sách items (§2.2 quy tắc 2):
export function inferKind(itemsOrDeck) {
    const rawItems = Array.isArray(itemsOrDeck)
        ? itemsOrDeck
        : (Array.isArray(itemsOrDeck?.items) ? itemsOrDeck.items : []);
    const validItems = rawItems.filter((it) => it && typeof it === 'object' && !Array.isArray(it));
    if (validItems.length === 0)
        return 'quiz';
    const types = validItems.map((it) => detectItemType(it));
    if (types.every((t) => t === 'card'))
        return 'qa';
    if (types.some((t) => t === 'vocab'))
        return 'vocab';
    return 'quiz';
}
// Lấy loại bộ thẻ: nếu meta.kind hợp lệ ('qa' | 'quiz' | 'vocab') thì dùng, ngược lại suy ra bằng inferKind
export function kindOf(deckOrKind) {
    if (isValidKind(deckOrKind))
        return deckOrKind;
    const declared = deckOrKind?.meta?.kind ?? deckOrKind?.kind;
    if (isValidKind(declared))
        return declared;
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
    return items.filter((it) => {
        if (!it || typeof it !== 'object' || Array.isArray(it))
            return false;
        const t = detectItemType(it);
        return t !== null && !allowed.has(t);
    });
}
export function kindLabel(kindOrDeck) {
    const k = kindOf(kindOrDeck);
    return KINDS[k]?.label || 'Đề luyện thi';
}
export function itemTypeLabel(type) {
    return ITEM_TYPE_LABELS[type || ''] || String(type || '');
}
export function formatMismatchWarning(deckOrItems, targetKind) {
    const kind = isValidKind(targetKind) ? targetKind : kindOf(deckOrItems);
    const mismatched = mismatchedItems(deckOrItems, kind);
    if (mismatched.length === 0)
        return '';
    const countsByLabel = new Map();
    for (const it of mismatched) {
        const t = detectItemType(it);
        const lbl = itemTypeLabel(t);
        countsByLabel.set(lbl, (countsByLabel.get(lbl) || 0) + 1);
    }
    const parts = [...countsByLabel.entries()].map(([lbl, count]) => `${count} mục dạng ${lbl}`);
    return `${parts.join(', ')} nằm trong bộ ${KINDS[kind].label}.`;
}
export function checkModeAvailability(modeId, deckOrItems, { hasVoice = true } = {}) {
    const items = Array.isArray(deckOrItems)
        ? deckOrItems
        : (Array.isArray(deckOrItems?.items) ? deckOrItems.items : []);
    const k = kindOf(deckOrItems);
    if (modeId === 'match' && items.length < 2) {
        return { available: false, reason: 'Chế độ Ghép thẻ cần ít nhất 2 mục.' };
    }
    if (k !== 'vocab') {
        if (items.length === 0) {
            return { available: false, reason: 'Bộ thẻ chưa có mục nào.' };
        }
        return { available: true, reason: '' };
    }
    // Đối với bộ thẻ Từ vựng (vocab):
    const vocabItems = items.filter(it => it && typeof it === 'object' && ('term' in it || it.type === 'vocab'));
    if (vocabItems.length === 0) {
        return { available: false, reason: 'Bộ thẻ chưa có từ vựng nào.' };
    }
    if (modeId === 'mc') {
        const validCount = vocabItems.filter(it => it.term && it.definition).length;
        if (validCount < 2) {
            return { available: false, reason: 'Trắc nghiệm cần ít nhất 2 từ vựng hợp lệ.' };
        }
    }
    if (modeId === 'cloze') {
        const hasClozeCandidate = vocabItems.some(it => {
            if (!it.example || !it.term)
                return false;
            const terms = [it.term, ...(Array.isArray(it.forms) ? it.forms : [])].filter(Boolean);
            const ex = String(it.example).toLowerCase();
            return terms.some(t => ex.includes(String(t).toLowerCase()));
        });
        if (!hasClozeCandidate) {
            return { available: false, reason: 'Chế độ Điền chỗ trống cần ít nhất 1 từ có câu ví dụ chứa từ vựng.' };
        }
    }
    if (modeId === 'listen') {
        if (!hasVoice) {
            return { available: false, reason: 'Chưa tìm thấy giọng đọc trên máy (cần cài đặt speech-dispatcher và espeak-ng).' };
        }
    }
    return { available: true, reason: '' };
}
//# sourceMappingURL=deckkinds.js.map