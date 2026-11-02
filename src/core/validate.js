// src/core/validate.js — kiểm tra item / bộ thẻ. Hàm thuần, dùng chung cho parser (main) và Editor (GĐ2C).
// validateItem trả danh sách vấn đề [{ level: 'error' | 'warn', field, msg }]; item có 'error' bị bỏ qua khi học.

export const ITEM_TYPES = ['single', 'multi', 'fill', 'command', 'card'];
export const DECK_KINDS = ['vocab', 'qa', 'quiz'];
export const MATCH_MODES = ['normalized', 'exact', 'regex', 'number', 'latex'];
export const SUPPORTED_FORMAT_VERSION = 1;

const TYPE_LABEL = {
  single: 'trắc nghiệm 1 đáp án', multi: 'trắc nghiệm nhiều đáp án',
  fill: 'điền đáp án', command: 'gõ lệnh', card: 'thẻ lật', vocab: 'từ vựng',
};

const isStr = v => typeof v === 'string';
const nonEmpty = v => isStr(v) && v.trim() !== '';
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

// số dạng "1/3", "0,5", "1e-3", "-2.5" (cùng quy tắc với grader GĐ2B)
export function parseNumber(s) {
  s = String(s).trim().replace(',', '.');
  const f = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (f) return Number(f[1]) / Number(f[2]);
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// Dạng của item: type khai báo; không có type mà có term (hoặc deck vocab) → 'vocab'; ngược lại null
export function itemType(item, deckKind) {
  if (!isObj(item)) return null;
  if (item.type !== undefined) return item.type;
  if ('term' in item || deckKind === 'vocab') return 'vocab';
  return null;
}

// Khoá so sánh lựa chọn trùng: text + image
const choiceKey = c => isStr(c) ? `${c.trim()}\u0000` : `${(c.text ?? '').trim()}\u0000${(c.image ?? '').trim()}`;

function checkChoices(item, type, add) {
  const { choices, answer } = item;
  if (!Array.isArray(choices)) { add('error', 'choices', 'Thiếu danh sách lựa chọn (choices).'); return; }
  if (choices.length < 2) add('error', 'choices', 'Cần ít nhất 2 lựa chọn.');
  const seen = new Map();
  choices.forEach((c, i) => {
    const ok = isStr(c) ? nonEmpty(c)
      : isObj(c) && (c.text === undefined || isStr(c.text)) && (c.image === undefined || isStr(c.image))
        && (nonEmpty(c.text) || nonEmpty(c.image));
    if (!ok) { add('error', `choices[${i}]`, `Lựa chọn ${i + 1} rỗng hoặc sai dạng (phải là chữ hoặc {text, image}).`); return; }
    const k = choiceKey(c);
    if (seen.has(k)) add('error', `choices[${i}]`, `Lựa chọn ${i + 1} trùng với lựa chọn ${seen.get(k) + 1}.`);
    else seen.set(k, i);
  });

  if (!Array.isArray(answer)) { add('error', 'answer', 'Thiếu đáp án đúng (answer phải là danh sách chỉ số lựa chọn, vd [1]).'); return; }
  if (answer.length === 0) { add('error', 'answer', 'Chưa đánh dấu đáp án đúng.'); return; }
  const bad = answer.filter(a => !Number.isInteger(a) || a < 0 || a >= choices.length);
  if (bad.length) add('error', 'answer', `Đáp án ${bad.map(String).join(', ')} nằm ngoài danh sách lựa chọn (chỉ số tính từ 0 đến ${choices.length - 1}).`);
  if (new Set(answer).size !== answer.length) add('error', 'answer', 'Đáp án bị lặp lại.');
  if (type === 'single' && answer.length !== 1) add('error', 'answer', `Câu một đáp án phải có đúng 1 đáp án đúng (đang có ${answer.length}).`);
}

function checkTextAnswers(item, add) {
  const { answer } = item;
  const match = item.match ?? 'normalized';
  if (!MATCH_MODES.includes(match)) add('error', 'match', `Kiểu chấm "${match}" không hợp lệ (dùng: ${MATCH_MODES.join(', ')}).`);
  if (!Array.isArray(answer) || answer.length === 0) { add('error', 'answer', 'Cần ít nhất 1 đáp án chấp nhận (answer là danh sách chuỗi).'); return; }
  answer.forEach((a, i) => {
    if (!nonEmpty(a)) { add('error', `answer[${i}]`, `Đáp án ${i + 1} rỗng hoặc không phải chuỗi.`); return; }
    if (match === 'regex') {
      try { new RegExp(a); } catch (e) { add('error', `answer[${i}]`, `Biểu thức regex ở đáp án ${i + 1} không hợp lệ: ${e.message}`); }
    }
    if (match === 'number' && Number.isNaN(parseNumber(a))) add('error', `answer[${i}]`, `Đáp án ${i + 1} ("${a}") không đọc được thành số.`);
  });
  if (item.tolerance !== undefined && !(typeof item.tolerance === 'number' && Number.isFinite(item.tolerance) && item.tolerance >= 0))
    add('error', 'tolerance', 'Dung sai (tolerance) phải là số không âm.');
}

export function validateItem(item, { deckKind } = {}) {
  const out = [];
  const add = (level, field, msg) => out.push({ level, field, msg });
  if (!isObj(item)) { add('error', '', 'Mục không phải đối tượng JSON.'); return out; }

  if (item.id === undefined || item.id === null || item.id === '') add('error', 'id', 'Thiếu id.');
  else if (!nonEmpty(item.id)) add('error', 'id', 'id phải là chuỗi khác rỗng.');

  const type = itemType(item, deckKind);
  if (type === null) { add('error', 'type', `Thiếu dạng câu hỏi (type: ${ITEM_TYPES.join(' / ')}).`); return out; }
  if (type !== 'vocab' && !ITEM_TYPES.includes(type)) { add('error', 'type', `Dạng câu hỏi "${type}" không hỗ trợ (dùng: ${ITEM_TYPES.join(', ')}).`); return out; }

  const need = (field, label) => { if (!nonEmpty(item[field])) add('error', field, `Thiếu ${label} (${field}).`); };
  switch (type) {
    case 'single': case 'multi': need('question', 'câu hỏi'); checkChoices(item, type, add); break;
    case 'fill': case 'command': need('question', 'câu hỏi'); checkTextAnswers(item, add); break;
    case 'card': need('front', 'mặt trước'); need('back', 'mặt sau'); break;
    case 'vocab': need('term', 'từ'); need('definition', 'nghĩa'); break;
  }

  // trường chung tuỳ chọn: sai kiểu là lỗi (tránh làm hỏng màn hình học)
  for (const f of ['topic', 'explanation', 'image', 'answerImage', 'answerDisplay', 'phonetic', 'pos', 'example'])
    if (item[f] !== undefined && !isStr(item[f])) add('error', f, `Trường ${f} phải là chuỗi.`);
  for (const f of ['tags', 'forms', 'synonyms'])
    if (item[f] !== undefined && !(Array.isArray(item[f]) && item[f].every(isStr))) add('error', f, `Trường ${f} phải là danh sách chuỗi.`);
  return out;
}

export const hasError = issues => issues.some(i => i.level === 'error');
export const typeLabel = t => TYPE_LABEL[t] ?? String(t);

// Kiểm tra toàn bộ deck (đối tượng đã JSON.parse).
// Trả { errors: string[] (lỗi cấp bộ thẻ, deck không dùng được), warnings: string[], items: [{ index, id, issues }] }
export function validateDeck(deck) {
  const errors = [], warnings = [], items = [];
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
    if (meta.kind !== undefined && !DECK_KINDS.includes(meta.kind))
      warnings.push(`Loại bộ thẻ "${meta.kind}" không hợp lệ (dùng: ${DECK_KINDS.join(', ')}).`);
  }
  if (!Array.isArray(deck.items)) { errors.push('Thiếu danh sách "items" (các câu hỏi / thẻ).'); return { errors, warnings, items }; }

  const deckKind = isObj(meta) ? meta.kind : undefined;
  const firstIndex = new Map(), dups = new Map();
  deck.items.forEach((it, index) => {
    const id = isObj(it) && nonEmpty(it.id) ? it.id : null;
    items.push({ index, id, issues: validateItem(it, { deckKind }) });
    if (id === null) return;
    if (firstIndex.has(id)) dups.set(id, (dups.get(id) ?? [firstIndex.get(id)]).concat(index));
    else firstIndex.set(id, index);
  });
  for (const [id, idx] of dups)
    errors.push(`Trùng id "${id}" ở các mục thứ ${idx.map(i => i + 1).join(', ')} — mỗi mục phải có id riêng.`);
  if (deck.items.length === 0) warnings.push('Bộ thẻ chưa có mục nào.');
  return { errors, warnings, items };
}

