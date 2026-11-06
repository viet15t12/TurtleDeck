// src/core/validate.ts — kiểm tra item / bộ thẻ. Hàm thuần, dùng chung cho parser (main) và Editor (GĐ2C).
// validateItem trả danh sách vấn đề [{ level: 'error' | 'warn', field, msg }]; item có 'error' bị bỏ qua khi học.

import { imageRefs } from './deckmodel.js';
import { kindOf, mismatchedItems, formatMismatchWarning } from './deckkinds.js';
import { normalizeTerm } from './hash.js';
import type { ValidationIssue } from './types/deck.types.js';

export const ITEM_TYPES = ['single', 'multi', 'fill', 'command', 'card', 'translate'];
export const DECK_KINDS = ['vocab', 'qa', 'quiz'];
export const MATCH_MODES = ['normalized', 'exact', 'regex', 'number', 'latex'];
export const SUPPORTED_FORMAT_VERSION = 1;

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const MAX_IMG_SIZE = 5 * 1024 * 1024;
const MD_IMG_WITH_ALT = /!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/g;

const TYPE_LABEL: Record<string, string> = {
  single: 'Trắc nghiệm', multi: 'Trắc nghiệm',
  fill: 'Điền', command: 'Lệnh', card: 'Thẻ', vocab: 'Từ vựng',
  translate: 'Dịch câu',
};

const isStr = (v: unknown): v is string => typeof v === 'string';
const nonEmpty = (v: unknown): v is string => isStr(v) && v.trim() !== '';
const isObj = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);

// số dạng "1/3", "0,5", "1e-3", "-2.5" (cùng quy tắc với grader GĐ2B)
export function parseNumber(s: unknown): number {
  const str = String(s ?? '').trim().replace(',', '.');
  const f = str.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  if (str === '') return NaN;
  const n = Number(str);
  return Number.isFinite(n) ? n : NaN;
}

// Dạng của item: type khai báo; không có type mà có term (hoặc deck vocab) → 'vocab'; ngược lại null
export function itemType(item: any, deckKind?: string): string | null {
  if (!isObj(item)) return null;
  if (item.type !== undefined) return item.type;
  if ('term' in item || deckKind === 'vocab') return 'vocab';
  return null;
}

// Khoá so sánh lựa chọn trùng: text + image
const choiceKey = (c: any) => isStr(c) ? `${c.trim()}\u0000` : `${(c.text ?? '').trim()}\u0000${(c.image ?? '').trim()}`;

function checkChoices(item: any, type: string, add: (level: 'error' | 'warn', field: string, msg: string) => void) {
  const { choices, answer } = item;
  if (!Array.isArray(choices)) { add('error', 'choices', 'Thiếu danh sách lựa chọn (choices).'); return; }
  if (choices.length < 2) add('error', 'choices', 'Cần ít nhất 2 lựa chọn.');
  const seen = new Map<string, number>();
  choices.forEach((c, i) => {
    const ok = isStr(c) ? nonEmpty(c)
      : isObj(c) && (c.text === undefined || isStr(c.text)) && (c.image === undefined || isStr(c.image))
        && (nonEmpty(c.text) || nonEmpty(c.image));
    if (!ok) { add('error', `choices[${i}]`, `Lựa chọn ${i + 1} rỗng hoặc sai dạng (phải là chữ hoặc {text, image}).`); return; }
    const k = choiceKey(c);
    if (seen.has(k)) add('error', `choices[${i}]`, `Lựa chọn ${i + 1} trùng với lựa chọn ${seen.get(k)! + 1}.`);
    else seen.set(k, i);
  });

  if (!Array.isArray(answer)) { add('error', 'answer', 'Thiếu đáp án đúng (answer phải là danh sách chỉ số lựa chọn, vd [1]).'); return; }
  if (answer.length === 0) { add('error', 'answer', 'Chưa đánh dấu đáp án đúng.'); return; }
  const bad = answer.filter(a => !Number.isInteger(a) || a < 0 || a >= choices.length);
  if (bad.length) add('error', 'answer', `Đáp án ${bad.map(String).join(', ')} nằm ngoài danh sách lựa chọn (chỉ số tính từ 0 đến ${choices.length - 1}).`);
  if (new Set(answer).size !== answer.length) add('error', 'answer', 'Đáp án bị lặp lại.');
  if (type === 'single' && answer.length !== 1) add('error', 'answer', `Câu một đáp án phải có đúng 1 đáp án đúng (đang có ${answer.length}).`);
}

function checkTextAnswers(item: any, add: (level: 'error' | 'warn', field: string, msg: string) => void) {
  const { answer } = item;
  const match = item.match ?? 'normalized';
  if (!MATCH_MODES.includes(match)) add('error', 'match', `Kiểu chấm "${match}" không hợp lệ (dùng: ${MATCH_MODES.join(', ')}).`);
  if (!Array.isArray(answer) || answer.length === 0) { add('error', 'answer', 'Cần ít nhất 1 đáp án chấp nhận (answer là danh sách chuỗi).'); return; }
  answer.forEach((a, i) => {
    if (!nonEmpty(a)) { add('error', `answer[${i}]`, `Đáp án ${i + 1} rỗng hoặc không phải chuỗi.`); return; }
    if (match === 'regex') {
      try { new RegExp(a); } catch (e: any) { add('error', `answer[${i}]`, `Biểu thức regex ở đáp án ${i + 1} không hợp lệ: ${e.message}`); }
    }
    if (match === 'number' && Number.isNaN(parseNumber(a))) add('error', `answer[${i}]`, `Đáp án ${i + 1} ("${a}") không đọc được thành số.`);
  });
  if (item.tolerance !== undefined && !(typeof item.tolerance === 'number' && Number.isFinite(item.tolerance) && item.tolerance >= 0))
    add('error', 'tolerance', 'Dung sai (tolerance) phải là số không âm.');
}

function checkTranslateAnswers(item: any, add: (level: 'error' | 'warn', field: string, msg: string) => void) {
  const { answers, pattern } = item;
  if (!Array.isArray(answers) || answers.length === 0) {
    add('error', 'answers', 'Cần ít nhất 1 câu trả lời mẫu chấp nhận được (answers là danh sách chuỗi).');
    return;
  }
  answers.forEach((a, i) => {
    if (!nonEmpty(a)) {
      add('error', `answers[${i}]`, `Câu trả lời mẫu ${i + 1} rỗng hoặc không phải chuỗi.`);
    }
  });
  if (pattern !== undefined && isStr(pattern) && nonEmpty(pattern)) {
    try {
      new RegExp(pattern);
    } catch (e: any) {
      add('error', 'pattern', `Cấu trúc regex không hợp lệ: ${e.message}`);
    }
  }
}

export interface ValidateItemOptions {
  deckKind?: string;
  assets?: any;
}

export function validateItem(item: any, { deckKind, assets }: ValidateItemOptions = {}): any[] {
  const out: any[] = [];
  const add = (level: 'error' | 'warn', field: string, msg: string) => out.push({ level, field, msg });
  if (!isObj(item)) { add('error', '', 'Mục không phải đối tượng JSON.'); return out; }

  if (item.id === undefined || item.id === null || item.id === '') add('error', 'id', 'Thiếu id.');
  else if (!nonEmpty(item.id)) add('error', 'id', 'id phải là chuỗi khác rỗng.');

  const type = itemType(item, deckKind);
  if (type === null) { add('error', 'type', `Thiếu dạng câu hỏi (type: ${ITEM_TYPES.join(' / ')}).`); return out; }
  if (type !== 'vocab' && !ITEM_TYPES.includes(type)) { add('error', 'type', `Dạng câu hỏi "${type}" không hỗ trợ (dùng: ${ITEM_TYPES.join(', ')}).`); return out; }

  const need = (field: string, label: string) => { if (!nonEmpty(item[field])) add('error', field, `Thiếu ${label} (${field}).`); };
  switch (type) {
    case 'single': case 'multi': need('question', 'câu hỏi'); checkChoices(item, type, add); break;
    case 'fill': case 'command': need('question', 'câu hỏi'); checkTextAnswers(item, add); break;
    case 'card': need('front', 'mặt trước'); need('back', 'mặt sau'); break;
    case 'vocab': need('term', 'từ'); need('definition', 'nghĩa'); break;
    case 'translate': need('vi', 'câu tiếng Việt'); need('keyword', 'từ gợi ý'); checkTranslateAnswers(item, add); break;
  }

  for (const f of ['topic', 'explanation', 'image', 'answerImage', 'imageAlt', 'answerImageAlt', 'answerDisplay', 'phonetic', 'pos', 'example', 'vi', 'keyword', 'pattern'])
    if (item[f] !== undefined && !isStr(item[f])) add('error', f, `Trường ${f} phải là chuỗi.`);
  for (const f of ['tags', 'forms', 'synonyms', 'acceptableForms'])
    if (item[f] !== undefined && !(Array.isArray(item[f]) && item[f].every(isStr))) add('error', f, `Trường ${f} phải là danh sách chuỗi.`);

  if (nonEmpty(item.image) && item.imageAlt !== undefined && !nonEmpty(item.imageAlt)) {
    add('warn', 'image', `Thiếu mô tả cho ảnh "${item.image}" (alt text).`);
  }
  if (nonEmpty(item.answerImage) && item.answerImageAlt !== undefined && !nonEmpty(item.answerImageAlt)) {
    add('warn', 'answerImage', `Thiếu mô tả cho ảnh "${item.answerImage}" (alt text).`);
  }

  if (type === 'vocab' && nonEmpty(item.example) && nonEmpty(item.term)) {
    const candidates = [item.term, ...(Array.isArray(item.forms) ? item.forms : [])].filter(nonEmpty);
    const hasMatch = candidates.some(w => {
      const esc = w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
      const re = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${esc}(?:$|[^\\p{L}\\p{N}_])`, 'iu');
      return re.test(item.example);
    });
    if (!hasMatch) {
      add('warn', 'example', 'Câu ví dụ không chứa từ vựng hoặc các dạng biến thể trong forms (chế độ Điền chỗ trống Cloze sẽ bị bỏ qua).');
    }
  }

  const checkTextWarnings = (text: unknown, fieldName: string) => {
    if (typeof text !== 'string') return;
    for (const m of text.matchAll(MD_IMG_WITH_ALT)) {
      if (!m[1] || m[1].trim() === '') {
        add('warn', fieldName, `Thiếu mô tả cho ảnh "${m[2]}" (alt text).`);
      }
    }
    if (text.includes('▢')) {
      add('warn', fieldName, 'Công thức còn ô trống.');
    }
  };
  checkTextWarnings(item.question, 'question');
  checkTextWarnings(item.explanation, 'explanation');
  checkTextWarnings(item.front, 'front');
  checkTextWarnings(item.back, 'back');
  checkTextWarnings(item.answerDisplay, 'answerDisplay');
  checkTextWarnings(item.term, 'term');
  checkTextWarnings(item.definition, 'definition');
  checkTextWarnings(item.example, 'example');
  if (Array.isArray(item.choices)) {
    item.choices.forEach((c: any, idx: number) => {
      if (typeof c === 'string') checkTextWarnings(c, `choices[${idx}]`);
      else if (isObj(c) && typeof c.text === 'string') checkTextWarnings(c.text, `choices[${idx}]`);
    });
  }
  if (Array.isArray(item.answer)) {
    item.answer.forEach((a: any, idx: number) => {
      if (typeof a === 'string' && a.includes('▢')) {
        add('warn', `answer[${idx}]`, 'Công thức còn ô trống.');
      }
    });
  }

  const refs = imageRefs(item);
  for (const ref of refs) {
    if (!IMG_EXT.test(ref)) {
      add('warn', 'image', `Ảnh "${ref}" có định dạng không được hỗ trợ (chỉ nhận png, jpg, jpeg, gif, webp, svg).`);
    } else if (assets) {
      let data: any;
      let has = false;
      if (assets instanceof Map) {
        has = assets.has(ref);
        data = assets.get(ref);
      } else if (assets instanceof Set) {
        has = assets.has(ref);
      } else if (Array.isArray(assets)) {
        has = assets.includes(ref);
      } else if (isObj(assets)) {
        has = ref in assets;
        data = assets[ref];
      }
      if (!has) {
        add('warn', 'image', `Không tìm thấy ảnh "${ref}" trong gói bộ thẻ.`);
      } else if (data && (data.byteLength > MAX_IMG_SIZE || data.length > MAX_IMG_SIZE)) {
        add('warn', 'image', `Ảnh "${ref}" vượt quá dung lượng cho phép (> 5 MB).`);
      }
    }
  }

  return out;
}

export const hasError = (issues: any[]): boolean => issues.some(i => i.level === 'error');
export const typeLabel = (t: string): string => TYPE_LABEL[t] ?? String(t);

export function friendlyIssue(issue: any): string {
  if (!issue) return '';
  const { field = '', msg = '' } = issue;
  const letter = (idx: string | number) => String.fromCharCode(65 + Number(idx));

  if (field === 'question') return /Công thức/.test(msg) ? 'Công thức còn ô trống.' : /mô tả/.test(msg) ? 'Ảnh chưa có mô tả.' : 'Chưa nhập câu hỏi.';
  if (field === 'front') return /Công thức/.test(msg) ? 'Công thức còn ô trống.' : /mô tả/.test(msg) ? 'Ảnh chưa có mô tả.' : 'Chưa nhập mặt trước.';
  if (field === 'back') return /Công thức/.test(msg) ? 'Công thức còn ô trống.' : /mô tả/.test(msg) ? 'Ảnh chưa có mô tả.' : 'Chưa nhập mặt sau.';
  if (field === 'term') {
    if (/trùng/i.test(msg)) return 'Từ vựng bị trùng.';
    return 'Chưa nhập từ vựng.';
  }
  if (field === 'definition') return 'Chưa nhập nghĩa.';
  if (field === 'example') {
    if (/Cloze|forms/i.test(msg)) return 'Ví dụ chưa chứa từ vựng (bỏ qua Cloze).';
    return /Công thức/.test(msg) ? 'Công thức còn ô trống.' : /mô tả/.test(msg) ? 'Ảnh chưa có mô tả.' : msg;
  }

  const cm = /^choices\[(\d+)\]$/.exec(field);
  if (cm) {
    const L = letter(cm[1]);
    if (/trùng với lựa chọn (\d+)/.test(msg)) {
      const other = RegExp.$1;
      return `Hai lựa chọn trùng nhau (${letter(Number(other) - 1)} và ${L}).`;
    }
    if (/Công thức/.test(msg)) return `Lựa chọn ${L}: công thức còn ô trống.`;
    if (/mô tả/.test(msg)) return `Lựa chọn ${L}: ảnh chưa có mô tả.`;
    return `Lựa chọn ${L} đang trống.`;
  }

  const am = /^answer\[(\d+)\]$/.exec(field);
  if (am) {
    if (/regex/i.test(msg)) return msg.replace(/^Biểu thức regex ở đáp án \d+ không hợp lệ:\s*/i, 'Regex không hợp lệ: ');
    const numMatch = /\("([^"]+)"\) không đọc được thành số/.exec(msg);
    if (numMatch) return `Không đọc được số "${numMatch[1]}".`;
    if (/Công thức/.test(msg)) return 'Công thức còn ô trống.';
    return `Đáp án ${Number(am[1]) + 1} đang trống.`;
  }

  if (field === 'answer') {
    if (/Cần ít nhất 1 đáp án/.test(msg)) return 'Chưa nhập đáp án chấp nhận.';
    return 'Chưa chọn đáp án đúng.';
  }
  if (field === 'choices') return 'Cần ít nhất 2 lựa chọn.';
  if (field === 'tolerance') return 'Sai số cho phép phải là số không âm.';
  if (/Thiếu mô tả cho ảnh/.test(msg)) return 'Ảnh chưa có mô tả.';
  if (/Công thức còn ô trống/.test(msg)) return 'Công thức còn ô trống.';
  return msg;
}

export function validateDeck(deck: any, { assets }: { assets?: any } = {}) {
  const errors: string[] = [], warnings: string[] = [], items: any[] = [];
  if (!isObj(deck)) return { errors: ['Nội dung bộ thẻ không phải đối tượng JSON ({ "meta": …, "items": […] }).'], warnings, items };

  const meta = deck.meta;
  if (!isObj(meta)) errors.push('Thiếu phần "meta" (thông tin bộ thẻ).');
  else {
    if (!nonEmpty(meta.id)) errors.push('Thiếu meta.id — mã định danh bộ thẻ (dùng để gắn tiến độ học).');
    if (meta.format !== undefined && meta.format !== 'studydeck') errors.push(`Định dạng "${meta.format}" không phải bộ thẻ studydeck.`);
    if (meta.formatVersion !== undefined) {
      if (!Number.isInteger(meta.formatVersion) || meta.formatVersion < 1) errors.push('meta.formatVersion không hợp lệ.');
      else if (meta.formatVersion > SUPPORTED_FORMAT_VERSION)
        errors.push(`Bộ thẻ này tạo bằng bản app mới hơn (định dạng phiên bản ${meta.formatVersion}, app chỉ đọc được đến ${SUPPORTED_FORMAT_VERSION}). Hãy cập nhật app.`);
    }
    if (meta.title !== undefined && !isStr(meta.title)) warnings.push('meta.title phải là chuỗi.');
    else if (!nonEmpty(meta.title)) warnings.push('Bộ thẻ chưa có tiêu đề (meta.title).');
    if (meta.description !== undefined) {
      if (!isStr(meta.description)) warnings.push('meta.description phải là chuỗi.');
      else if (meta.description.length > 200) warnings.push('Mô tả bộ thẻ (meta.description) không nên vượt quá 200 ký tự.');
    }
  }
  if (!Array.isArray(deck.items)) { errors.push('Thiếu danh sách "items" (các câu hỏi / thẻ).'); return { errors, warnings, items }; }

  const effectiveKind = kindOf(deck);
  const deckKind = (isObj(meta) && DECK_KINDS.includes(meta.kind))
    ? meta.kind
    : (effectiveKind === 'vocab' ? 'vocab' : undefined);
  const firstIndex = new Map<string, number>(), dups = new Map<string, number[]>();
  const seenTerms = new Map<string, number>();
  deck.items.forEach((it: any, index: number) => {
    const id = isObj(it) && nonEmpty(it.id) ? it.id : null;
    const itIssues = validateItem(it, { deckKind, assets });
    items.push({ index, id, issues: itIssues });
    if (id !== null) {
      if (firstIndex.has(id)) dups.set(id, (dups.get(id) ?? [firstIndex.get(id)!]).concat(index));
      else firstIndex.set(id, index);
    }
    if (isObj(it) && ('term' in it || it.type === 'vocab') && nonEmpty(it.term)) {
      const norm = normalizeTerm(it.term);
      if (seenTerms.has(norm)) {
        const firstTermIdx = seenTerms.get(norm)!;
        warnings.push(`Từ vựng "${it.term}" (mục thứ ${index + 1}) bị trùng với mục thứ ${firstTermIdx + 1}.`);
        itIssues.push({
          level: 'warn',
          field: 'term',
          msg: `Từ vựng "${it.term}" bị trùng với mục thứ ${firstTermIdx + 1}.`,
        });
      } else {
        seenTerms.set(norm, index);
      }
    }
  });
  for (const [id, idx] of dups)
    errors.push(`Trùng id "${id}" ở các mục thứ ${idx.map(i => i + 1).join(', ')} — mỗi mục phải có id riêng.`);
  if (deck.items.length === 0) warnings.push('Bộ thẻ chưa có mục nào.');

  const mismatched = mismatchedItems(deck.items, effectiveKind);
  if (mismatched.length > 0) {
    warnings.push(formatMismatchWarning(deck.items, effectiveKind));
  }
  return { errors, warnings, items };
}

