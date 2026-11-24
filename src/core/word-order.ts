// src/core/word-order.ts — Logic thuần cho dạng bài Sắp xếp từ (Word Order / Sentence Builder).

export interface WordBankToken {
  id: string;
  text: string;
}

export interface WordOrderGradeOptions {
  caseSensitive?: boolean;
}

/** Chuẩn hoá chuỗi câu đã ghép để chấm đáp án. */
export function normalizeWordOrder(s: unknown, caseSensitive = true): string {
  const base = String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  return caseSensitive ? base : base.toLowerCase();
}

/** Ghép danh sách id đã đặt trong vùng trả lời thành câu hoàn chỉnh. */
export function buildPlacedText(bank: WordBankToken[], placedIds: string[]): string {
  if (!Array.isArray(bank) || !Array.isArray(placedIds) || placedIds.length === 0) return '';
  const map = new Map<string, string>();
  for (const t of bank) {
    if (t && typeof t.id === 'string') map.set(t.id, String(t.text ?? ''));
  }
  return placedIds
    .map(id => map.get(id))
    .filter((t): t is string => t !== undefined)
    .join(' ');
}

/**
 * Xáo trộn answer + distractors và gán id duy nhất (t0, t1, ...).
 * Đảm bảo thứ tự sau khi xáo trộn khác thứ tự đáp án gốc khi có ít nhất 2 từ khác nhau.
 */
export function shuffleWordBank(
  answer: string[],
  distractors: string[] = [],
  rand: () => number = Math.random
): WordBankToken[] {
  const ans = (Array.isArray(answer) ? answer : []).map(w => String(w ?? '').trim()).filter(Boolean);
  const dist = (Array.isArray(distractors) ? distractors : []).map(w => String(w ?? '').trim()).filter(Boolean);
  const allWords = [...ans, ...dist];

  const tokens: WordBankToken[] = allWords.map((text, idx) => ({
    id: `t${idx}`,
    text,
  }));

  if (tokens.length <= 1) return tokens;

  const hasDistinctPair = new Set(allWords).size > 1;
  const targetStr = ans.join(' ');

  const shuffleInPlace = (arr: WordBankToken[]) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  };

  for (let attempt = 0; attempt < 12; attempt++) {
    shuffleInPlace(tokens);
    const currentPrefix = tokens.slice(0, ans.length).map(t => t.text).join(' ');
    if (!hasDistinctPair || currentPrefix !== targetStr || dist.length > 0 && tokens.slice(0, ans.length).some((t, i) => t.text !== ans[i])) {
      if (!hasDistinctPair || tokens.map(t => t.text).join(' ') !== targetStr) {
        return tokens;
      }
    }
  }

  // Fallback nếu vẫn trùng thứ tự đáp án: hoán đổi 2 phần tử khác text đầu tiên tìm được
  if (hasDistinctPair && tokens.map(t => t.text).join(' ') === targetStr) {
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].text !== tokens[i + 1].text) {
        const tmp = tokens[i];
        tokens[i] = tokens[i + 1];
        tokens[i + 1] = tmp;
        break;
      }
    }
  }

  return tokens;
}

/**
 * Chấm đáp án cho câu hỏi word-order bằng cách so sánh chuỗi sau khi ghép.
 * Hỗ trợ nhiều đáp án đúng qua altAnswers.
 */
export function gradeWordOrder(
  userInput: string | string[],
  answer: string[],
  altAnswers: string[][] = [],
  options: WordOrderGradeOptions = {}
): { ok: boolean; near: boolean } {
  const caseSensitive = options.caseSensitive !== false;
  const userStr = Array.isArray(userInput) ? userInput.join(' ') : String(userInput ?? '');
  const normUser = normalizeWordOrder(userStr, caseSensitive);

  if (!normUser) return { ok: false, near: false };

  const candidates: string[][] = [Array.isArray(answer) ? answer : []];
  if (Array.isArray(altAnswers)) {
    for (const alt of altAnswers) {
      if (Array.isArray(alt) && alt.length > 0) candidates.push(alt);
    }
  }

  const ok = candidates.some(cand => {
    const normCand = normalizeWordOrder(cand.join(' '), caseSensitive);
    return normCand.length > 0 && normUser === normCand;
  });

  return { ok, near: false };
}

/**
 * Sinh tự động câu hỏi word-order từ câu ví dụ của thẻ vocab hoặc văn bản sẵn có.
 */
export function generateWordOrderFromExample(
  example: string,
  {
    id = 'wo_auto',
    prompt_vi = '',
    forms = [],
    poolWords = [],
    distractorCount = 2,
    rand = Math.random,
  }: {
    id?: string;
    prompt_vi?: string;
    forms?: string[];
    poolWords?: string[];
    distractorCount?: number;
    rand?: () => number;
  } = {}
) {
  const answer = String(example ?? '').trim().split(/\s+/).filter(Boolean);
  const answerSet = new Set(answer.map(w => w.toLowerCase()));
  const distractorCandidates = [...forms, ...poolWords]
    .map(w => String(w ?? '').trim())
    .filter(w => w && !answerSet.has(w.toLowerCase()));

  const uniqueCandidates = [...new Set(distractorCandidates)];
  for (let i = uniqueCandidates.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = uniqueCandidates[i];
    uniqueCandidates[i] = uniqueCandidates[j];
    uniqueCandidates[j] = tmp;
  }

  return {
    id,
    type: 'word-order' as const,
    prompt_vi,
    answer,
    distractors: uniqueCandidates.slice(0, Math.max(0, distractorCount)),
  };
}

