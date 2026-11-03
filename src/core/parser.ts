// src/core/parser.ts — deckText (deck.json trong gói) → { ok, deck, issues[] }. Hàm thuần, chạy ở main.
// Lỗi cấp bộ thẻ (JSON hỏng, thiếu meta.id/items, id trùng, formatVersion quá mới) → ok:false + error tiếng Việt.
// Lỗi cấp item → bỏ qua item đó, ghi vào issues (kèm id, vị trí, lý do); các item còn lại vẫn học được.
// GĐ2B: kiểm tra ảnh tham chiếu (![..](path), image, answerImage, choices[].image) → cảnh báo nếu thiếu/sai đuôi/>5MB.
// GĐ4: parseImport nhập từ CSV, TSV, Quizlet, Markdown vocab, Markdown quiz.
import { validateDeck, validateItem, hasError } from './validate.js';
import { imageRefs } from './deckmodel.js';
import { inferKind, isValidKind, mismatchedItems, formatMismatchWarning } from './deckkinds.js';
import { stableVocabId, normalizeTerm, utf8Encode } from './hash.js';

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const MAX_IMG_SIZE = 5 * 1024 * 1024;

// vị trí lỗi JSON → "dòng X, cột Y"
function jsonErrorLocation(text: string, err: any): { line: number; column: number } | null {
  const lc = /line (\d+) column (\d+)/.exec(err?.message || '');
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(err?.message || '');
  if (!pos) return null;
  const before = text.slice(0, Number(pos[1]));
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

const failDeck = (error: string): any => ({ ok: false, error, issues: [{ level: 'error', msg: error }] });

export function parseDeck(deckText: string, { assets }: any = {}): any {
  if (typeof deckText !== 'string') return failDeck('Không đọc được nội dung bộ thẻ (deck.json).');
  const text = deckText.replace(/^\uFEFF/, '');
  if (!text.trim()) return failDeck('deck.json rỗng.');

  let raw: any;
  try { raw = JSON.parse(text); } catch (e: any) {
    const loc = jsonErrorLocation(text, e);
    let msg = 'deck.json bị hỏng (sai cú pháp JSON)' + (loc ? ` ở dòng ${loc.line}, cột ${loc.column}` : '') + '.';
    if (/escape|\\/i.test(e.message) || (loc && /\\/.test(text.split('\n')[loc.line - 1] ?? '')))
      msg += ' Lưu ý: trong JSON, dấu \\ của LaTeX phải viết thành \\\\ (vd \\\\frac).';
    return failDeck(msg);
  }

  const v = validateDeck(raw);
  if (v.errors.length) return { ok: false, error: v.errors.join('\n'), issues: v.errors.map(msg => ({ level: 'error', msg })) };

  // Lọc tạm cảnh báo lệch loại cấp raw để tính lại chính xác trên danh sách mục hợp lệ sau khi lọc
  const issues: any[] = v.warnings
    .filter(msg => !msg.includes('nằm trong bộ'))
    .map(msg => ({ level: 'warn', msg }));
  const items: any[] = [];
  for (const { index, id, issues: its } of v.items) {
    const where = { index, itemId: id };
    if (hasError(its)) {
      const reasons = its.filter((i: any) => i.level === 'error').map((i: any) => i.msg).join(' ');
      issues.push({ level: 'error', ...where, skipped: true, msg: `Bỏ qua mục ${id ? `"${id}"` : `thứ ${index + 1}`}: ${reasons}` });
      continue;
    }
    for (const i of its) issues.push({ level: i.level, ...where, field: i.field, msg: i.msg });

    const rawItem = raw.items[index];
    items.push(rawItem);

    // Kiểm tra ảnh tham chiếu trong item (GĐ2B)
    const refs = imageRefs(rawItem);
    for (const ref of refs) {
      if (!IMG_EXT.test(ref)) {
        issues.push({
          level: 'warn',
          ...where,
          field: 'image',
          msg: `Ảnh "${ref}" có định dạng không được hỗ trợ (chỉ nhận png, jpg, jpeg, gif, webp, svg).`,
        });
      } else if (assets) {
        const data = assets.get(ref);
        if (!data) {
          issues.push({
            level: 'warn',
            ...where,
            field: 'image',
            msg: `Không tìm thấy ảnh "${ref}" trong gói bộ thẻ.`,
          });
        } else if (data.length > MAX_IMG_SIZE) {
          issues.push({
            level: 'warn',
            ...where,
            field: 'image',
            msg: `Ảnh "${ref}" vượt quá dung lượng cho phép (> 5 MB).`,
          });
        }
      }
    }
  }

  // Tự điền meta mặc định nếu thiếu
  const meta = { ...(raw.meta ?? {}) };
  if (!meta.title) meta.title = meta.id;
  if (!meta.lang) meta.lang = 'vi';
  if (!meta.created) meta.created = Date.now();
  if (!meta.updated) meta.updated = Date.now();

  // Xác định loại bộ thẻ (meta.kind) theo quy tắc GĐ3B:
  // Nếu có khai báo và hợp lệ ('qa' | 'quiz' | 'vocab') thì giữ nguyên, ngược lại tự suy từ các item hợp lệ
  if (!isValidKind(meta.kind)) {
    meta.kind = inferKind(items.length ? items : raw.items);
  }

  // Cảnh báo nhẹ khi có mục hợp lệ lệch loại với meta.kind (không bỏ qua mục)
  const mismatched = mismatchedItems(items, meta.kind);
  if (mismatched.length > 0) {
    issues.push({
      level: 'warn',
      mismatch: true,
      count: mismatched.length,
      itemIds: mismatched.map(it => it.id),
      msg: formatMismatchWarning(items, meta.kind),
    });
  }

  return {
    ok: true,
    deck: { ...raw, meta, items },
    issues,
    total: raw.items.length,
    skipped: raw.items.length - items.length,
  };
}

// ── B. Bộ phân tích nhập văn bản hàng loạt (CSV, TSV, Quizlet, Markdown) ────

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_IMPORT_ITEMS = 5000;

const KNOWN_COLUMNS: Record<string, string> = {
  term: 'term', word: 'term', 'từ': 'term', 'tu': 'term', vocab: 'term',
  definition: 'definition', meaning: 'definition', 'nghĩa': 'definition', 'nghia': 'definition',
  phonetic: 'phonetic', 'phiên âm': 'phonetic', 'phien am': 'phonetic', ipa: 'phonetic',
  pos: 'pos', partofspeech: 'pos', 'từ loại': 'pos', 'tu loai': 'pos',
  example: 'example', sentence: 'example', 'ví dụ': 'example', 'vi du': 'example',
  forms: 'forms', 'dạng từ': 'forms', 'dang tu': 'forms',
  synonyms: 'synonyms', 'từ đồng nghĩa': 'synonyms', 'tu dong nghia': 'synonyms',
  tags: 'tags', topic: 'tags', 'chủ đề': 'tags', 'chu de': 'tags', 'nhãn': 'tags', 'nhan': 'tags',
  image: 'image', 'ảnh': 'image', 'anh': 'image',
  audio: 'audio', 'âm thanh': 'audio', 'am thanh': 'audio',
};

// Phân tích các ô theo chuẩn RFC 4180
export function parseDelimitedRows(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const c = text[i];
    if (insideQuotes) {
      if (c === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          currentCell += '"';
          i += 2;
          continue;
        } else {
          insideQuotes = false;
          i++;
          continue;
        }
      } else {
        currentCell += c;
        i++;
        continue;
      }
    } else {
      if (c === '"') {
        insideQuotes = true;
        i++;
        continue;
      }
      if (c === delimiter) {
        currentRow.push(currentCell);
        currentCell = '';
        i++;
        continue;
      }
      if (c === '\r') {
        if (i + 1 < len && text[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentCell);
        currentCell = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      }
      if (c === '\n') {
        currentRow.push(currentCell);
        currentCell = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
        continue;
      }
      currentCell += c;
      i++;
    }
  }

  if (currentCell !== '' || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

// Tự nhận dấu phân cách (tab > ; > ,)
export function detectDelimiter(text: string): string {
  const clean = text.replace(/"(?:[^"]|"")*"/g, '');
  const lines = clean.split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 30);
  if (!lines.length) return '\t';

  let tabs = 0;
  let semicolons = 0;
  let commas = 0;

  for (const line of lines) {
    tabs += (line.match(/\t/g) || []).length;
    semicolons += (line.match(/;/g) || []).length;
    commas += (line.match(/,/g) || []).length;
  }

  if (tabs > 0 && tabs >= semicolons && tabs >= commas) return '\t';
  if (semicolons > 0 && semicolons >= commas) return ';';
  if (commas > 0) return ',';
  return '\t';
}

// Tự nhận định dạng nhập
export function detectImportFormat(text: string, opts: any = {}): string {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (trimmed.startsWith('## Q ') || /\n##\s+Q\s+/m.test(trimmed)) {
    return 'md-quiz';
  }
  if (trimmed.startsWith('## ') || /\n##\s+[^|#\n]+/m.test(trimmed)) {
    if (/^-\s*[a-zA-Z0-9_-]+\s*:/m.test(trimmed) || trimmed.includes('|')) {
      return 'md-vocab';
    }
  }
  if (opts.cardSep && opts.cardSep !== '\n') {
    return 'quizlet';
  }
  const delim = detectDelimiter(trimmed);
  if (delim === '\t') {
    return opts.termSep && opts.termSep !== '\t' ? 'quizlet' : 'tsv';
  }
  return 'csv';
}

// Nhập CSV / TSV
function parseCSVImport(text: string, delimiter: string, { hasSourceDir = false }: any = {}): any {
  const rows = parseDelimitedRows(text, delimiter);
  const issues: any[] = [];
  const items: any[] = [];
  const seenTerms = new Set<string>();
  let warnedAudio = false;

  const validRows: { rowIdx: number; cells: string[] }[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const isRowEmpty = row.every(cell => !cell || cell.trim() === '');
    if (!isRowEmpty) {
      validRows.push({ rowIdx: r + 1, cells: row });
    }
  }

  if (validRows.length === 0) {
    return { format: delimiter === '\t' ? 'tsv' : 'csv', items: [], issues: [{ level: 'error', msg: 'Tập tin không có dữ liệu dòng nào.' }] };
  }

  const firstRow = validRows[0].cells;
  let headerMap: Record<string, number> | null = null;
  const matchedCols = firstRow.map(c => KNOWN_COLUMNS[c.trim().toLowerCase()] || null);
  const hasTermCol = matchedCols.includes('term');
  const allKnown = matchedCols.every((col, idx) => col !== null || firstRow[idx].trim() === '');

  if (hasTermCol && allKnown) {
    headerMap = {};
    matchedCols.forEach((colName, idx) => {
      if (colName && headerMap) headerMap[colName] = idx;
    });
    validRows.shift();
  }

  for (const { rowIdx, cells } of validRows) {
    if (headerMap && cells.length !== firstRow.length) {
      issues.push({
        level: 'warn',
        row: rowIdx,
        msg: `Dòng ${rowIdx} có ${cells.length} ô (so với ${firstRow.length} ô ở tiêu đề).`,
      });
    }

    let term = '';
    let definition = '';
    let phonetic = '';
    let pos = '';
    let example = '';
    let forms: string[] = [];
    let synonyms: string[] = [];
    let tags: string[] = [];
    let image = '';
    let hasAudioCell = false;

    if (headerMap) {
      term = headerMap.term !== undefined ? (cells[headerMap.term] || '').trim() : '';
      definition = headerMap.definition !== undefined ? (cells[headerMap.definition] || '').trim() : '';
      phonetic = headerMap.phonetic !== undefined ? (cells[headerMap.phonetic] || '').trim() : '';
      pos = headerMap.pos !== undefined ? (cells[headerMap.pos] || '').trim().toLowerCase() : '';
      example = headerMap.example !== undefined ? (cells[headerMap.example] || '').trim() : '';
      if (headerMap.forms !== undefined && cells[headerMap.forms]) {
        forms = cells[headerMap.forms].split(/[;|]/).map(s => s.trim()).filter(Boolean);
      }
      if (headerMap.synonyms !== undefined && cells[headerMap.synonyms]) {
        synonyms = cells[headerMap.synonyms].split(/[;|]/).map(s => s.trim()).filter(Boolean);
      }
      if (headerMap.tags !== undefined && cells[headerMap.tags]) {
        tags = cells[headerMap.tags].split(/[;|]/).map(s => s.trim()).filter(Boolean);
      }
      image = headerMap.image !== undefined ? (cells[headerMap.image] || '').trim() : '';
      if (headerMap.audio !== undefined && (cells[headerMap.audio] || '').trim()) {
        hasAudioCell = true;
      }
    } else {
      term = (cells[0] || '').trim();
      definition = (cells[1] || '').trim();
      phonetic = (cells[2] || '').trim();
      example = (cells[3] || '').trim();
    }

    if (!term) {
      issues.push({ level: 'error', row: rowIdx, msg: `Dòng ${rowIdx}: thiếu từ vựng (term).` });
      continue;
    }
    if (!definition) {
      issues.push({ level: 'error', row: rowIdx, msg: `Dòng ${rowIdx}: từ vựng "${term}" thiếu nghĩa (definition).` });
      continue;
    }

    if (hasAudioCell && !warnedAudio) {
      issues.push({ level: 'warn', msg: 'Chưa hỗ trợ audio trong gói bộ thẻ ở giai đoạn này.' });
      warnedAudio = true;
    }

    if (image && !hasSourceDir) {
      issues.push({
        level: 'warn',
        row: rowIdx,
        field: 'image',
        msg: `Từ "${term}": cần nhập từ file để lấy ảnh "${image}".`,
      });
    }

    const norm = normalizeTerm(term);
    if (seenTerms.has(norm)) {
      issues.push({
        level: 'warn',
        row: rowIdx,
        msg: `Từ vựng "${term}" bị trùng trong lần nhập này (đã giữ mục đầu tiên, bỏ qua dòng ${rowIdx}).`,
      });
      continue;
    }
    seenTerms.add(norm);

    const item: any = {
      id: stableVocabId(term),
      type: 'vocab',
      term,
      definition,
    };
    if (phonetic) item.phonetic = phonetic;
    if (pos) item.pos = pos;
    if (example) item.example = example;
    if (forms.length) item.forms = forms;
    if (synonyms.length) item.synonyms = synonyms;
    if (tags.length) item.tags = tags;
    if (image) item.image = image;

    const vIssues = validateItem(item, { deckKind: 'vocab' });
    if (hasError(vIssues)) {
      const errMsgs = vIssues.filter(i => i.level === 'error').map(i => i.msg).join('; ');
      issues.push({ level: 'error', row: rowIdx, itemId: item.id, msg: `Dòng ${rowIdx} ("${term}") không hợp lệ: ${errMsgs}` });
      continue;
    }
    for (const vi of vIssues) {
      issues.push({ level: vi.level, row: rowIdx, itemId: item.id, field: vi.field, msg: `Dòng ${rowIdx} ("${term}"): ${vi.msg}` });
    }

    items.push(item);
  }

  return { format: delimiter === '\t' ? 'tsv' : 'csv', items, issues };
}

// Nhập Quizlet export
function parseQuizletImport(text: string, { termSep = '\t', cardSep = '\n', hasSourceDir = false }: any = {}): any {
  const issues: any[] = [];
  const items: any[] = [];
  const seenTerms = new Set<string>();

  const cards = cardSep === '\n'
    ? text.split(/\r?\n/)
    : text.split(cardSep);

  for (let c = 0; c < cards.length; c++) {
    const cardStr = cards[c].trim();
    if (!cardStr) continue;
    const rowIdx = c + 1;

    const sepIdx = cardStr.indexOf(termSep);
    if (sepIdx === -1) {
      issues.push({ level: 'error', row: rowIdx, msg: `Dòng ${rowIdx}: không tìm thấy dấu phân tách từ và nghĩa ("${termSep}").` });
      continue;
    }

    const term = cardStr.slice(0, sepIdx).trim();
    const definition = cardStr.slice(sepIdx + termSep.length).trim();

    if (!term) {
      issues.push({ level: 'error', row: rowIdx, msg: `Dòng ${rowIdx}: thiếu từ vựng (term).` });
      continue;
    }
    if (!definition) {
      issues.push({ level: 'error', row: rowIdx, msg: `Dòng ${rowIdx}: từ "${term}" thiếu nghĩa (definition).` });
      continue;
    }

    const norm = normalizeTerm(term);
    if (seenTerms.has(norm)) {
      issues.push({
        level: 'warn',
        row: rowIdx,
        msg: `Từ vựng "${term}" bị trùng trong lần nhập này (đã giữ mục đầu tiên, bỏ qua dòng ${rowIdx}).`,
      });
      continue;
    }
    seenTerms.add(norm);

    const item = {
      id: stableVocabId(term),
      type: 'vocab',
      term,
      definition,
    };

    const vIssues = validateItem(item, { deckKind: 'vocab' });
    if (hasError(vIssues)) {
      const errMsgs = vIssues.filter(i => i.level === 'error').map(i => i.msg).join('; ');
      issues.push({ level: 'error', row: rowIdx, itemId: item.id, msg: `Dòng ${rowIdx} ("${term}"): ${errMsgs}` });
      continue;
    }
    for (const vi of vIssues) {
      issues.push({ level: vi.level, row: rowIdx, itemId: item.id, field: vi.field, msg: `Dòng ${rowIdx} ("${term}"): ${vi.msg}` });
    }

    items.push(item);
  }

  return { format: 'quizlet', items, issues };
}

// Nhập Markdown từ vựng
function parseMarkdownVocabImport(text: string, { hasSourceDir = false }: any = {}): any {
  const issues: any[] = [];
  const items: any[] = [];
  const seenTerms = new Set<string>();

  const lines = text.split(/\r?\n/);
  let currentItem: any = null;

  function commitCurrent() {
    if (!currentItem) return;
    const { term, rowIdx } = currentItem;
    if (!currentItem.term) {
      issues.push({ level: 'error', line: rowIdx, msg: `Dòng ${rowIdx}: thiếu từ vựng.` });
      return;
    }
    if (!currentItem.definition) {
      issues.push({ level: 'error', line: rowIdx, msg: `Dòng ${rowIdx}: từ "${term}" thiếu nghĩa.` });
      return;
    }

    const norm = normalizeTerm(term);
    if (seenTerms.has(norm)) {
      issues.push({
        level: 'warn',
        line: rowIdx,
        msg: `Từ vựng "${term}" bị trùng trong lần nhập này (đã giữ mục đầu tiên, bỏ qua dòng ${rowIdx}).`,
      });
      return;
    }
    seenTerms.add(norm);

    if (currentItem.image && !hasSourceDir) {
      issues.push({
        level: 'warn',
        line: rowIdx,
        field: 'image',
        msg: `Từ "${term}": cần nhập từ file để lấy ảnh "${currentItem.image}".`,
      });
    }

    const item: any = {
      id: stableVocabId(term),
      type: 'vocab',
      term: currentItem.term,
      definition: currentItem.definition,
    };
    if (currentItem.phonetic) item.phonetic = currentItem.phonetic;
    if (currentItem.pos) item.pos = currentItem.pos;
    if (currentItem.example) item.example = currentItem.example;
    if (currentItem.forms && currentItem.forms.length) item.forms = currentItem.forms;
    if (currentItem.synonyms && currentItem.synonyms.length) item.synonyms = currentItem.synonyms;
    if (currentItem.tags && currentItem.tags.length) item.tags = currentItem.tags;
    if (currentItem.image) item.image = currentItem.image;

    const vIssues = validateItem(item, { deckKind: 'vocab' });
    if (hasError(vIssues)) {
      const errMsgs = vIssues.filter(i => i.level === 'error').map(i => i.msg).join('; ');
      issues.push({ level: 'error', line: rowIdx, itemId: item.id, msg: `Mục "${term}" (dòng ${rowIdx}): ${errMsgs}` });
      return;
    }
    for (const vi of vIssues) {
      issues.push({ level: vi.level, line: rowIdx, itemId: item.id, field: vi.field, msg: `Mục "${term}": ${vi.msg}` });
    }

    items.push(item);
  }

  for (let l = 0; l < lines.length; l++) {
    const rawLine = lines[l];
    const trimmed = rawLine.trim();

    if (/^##\s+/.test(trimmed)) {
      commitCurrent();
      const headContent = trimmed.replace(/^##\s+/, '').trim();
      const parts = headContent.split('|');
      const term = (parts[0] || '').trim();
      const definition = (parts[1] || '').trim();
      currentItem = {
        rowIdx: l + 1,
        term,
        definition,
        phonetic: '',
        pos: '',
        example: '',
        forms: [],
        synonyms: [],
        tags: [],
        image: '',
      };
      continue;
    }

    if (!currentItem) continue;

    const bulletMatch = trimmed.match(/^-\s*([a-zA-Z0-9_\u00C0-\u1EF9 -]+)\s*:\s*(.*)$/);
    if (bulletMatch) {
      const rawKey = bulletMatch[1].trim().toLowerCase();
      const val = bulletMatch[2].trim();
      const stdKey = KNOWN_COLUMNS[rawKey];

      if (!stdKey) {
        issues.push({
          level: 'warn',
          line: l + 1,
          msg: `Dòng ${l + 1}: thuộc tính lạ "${rawKey}" bị bỏ qua.`,
        });
        continue;
      }

      if (stdKey === 'definition') {
        if (!currentItem.definition) currentItem.definition = val;
      } else if (stdKey === 'phonetic') {
        currentItem.phonetic = val;
      } else if (stdKey === 'pos') {
        currentItem.pos = val.toLowerCase();
      } else if (stdKey === 'example') {
        currentItem.example = val;
      } else if (stdKey === 'forms') {
        currentItem.forms = val.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
      } else if (stdKey === 'synonyms') {
        currentItem.synonyms = val.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
      } else if (stdKey === 'tags') {
        currentItem.tags = val.split(/[;,|]/).map(s => s.trim()).filter(Boolean);
      } else if (stdKey === 'image') {
        currentItem.image = val;
      } else if (stdKey === 'audio') {
        issues.push({ level: 'warn', line: l + 1, msg: 'Chưa hỗ trợ audio trong gói bộ thẻ.' });
      }
    } else if (trimmed && !currentItem.definition) {
      currentItem.definition = trimmed;
    }
  }

  commitCurrent();
  return { format: 'md-vocab', items, issues };
}

// Nhập Markdown quiz
function parseMarkdownQuizImport(text: string, { hasSourceDir = false }: any = {}): any {
  const issues: any[] = [];
  const items: any[] = [];
  const seenIds = new Set<string>();

  const lines = text.split(/\r?\n/);
  let currentQuestion: any = null;

  function commitQuestion() {
    if (!currentQuestion) return;
    const { id, type, headingLine, rawLines, extraProps } = currentQuestion;

    if (seenIds.has(id)) {
      issues.push({
        level: 'error',
        line: headingLine,
        itemId: id,
        msg: `Trùng id "${id}" ở dòng ${headingLine}. Mỗi câu hỏi phải có id duy nhất.`,
      });
      return;
    }
    seenIds.add(id);

    if (type === 'card') {
      issues.push({
        level: 'error',
        line: headingLine,
        itemId: id,
        msg: `Dạng "card" chưa được hỗ trợ trong Markdown quiz (mục "${id}").`,
      });
      return;
    }

    const questionLines: string[] = [];
    const choices: string[] = [];
    const answerIndices: number[] = [];
    let textAnswers: string[] = [];
    let match = 'normalized';
    let tolerance: number | undefined = undefined;
    let answerDisplay = '';
    const explanationLines: string[] = [];
    let insideExplanation = false;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('>')) {
        insideExplanation = true;
        explanationLines.push(trimmed.replace(/^>\s?/, ''));
        continue;
      }
      if (insideExplanation) {
        explanationLines.push(line);
        continue;
      }

      const choiceMatch = trimmed.match(/^-\s*\[([ xX✓✔])\]\s*(.*)$/);
      if (choiceMatch) {
        const isChecked = choiceMatch[1].trim().toLowerCase() === 'x' || choiceMatch[1] === '✓' || choiceMatch[1] === '✔';
        const choiceText = choiceMatch[2];
        choices.push(choiceText);
        if (isChecked) {
          answerIndices.push(choices.length - 1);
        }
        continue;
      }

      const propMatch = trimmed.match(/^(answer|match|tolerance|answerDisplay)\s*:\s*(.*)$/i);
      if (propMatch) {
        const key = propMatch[1].toLowerCase();
        const val = propMatch[2].trim();
        if (key === 'answer') {
          textAnswers = val.split('|').map((s: string) => s.trim()).filter(Boolean);
        } else if (key === 'match') {
          match = val.toLowerCase();
        } else if (key === 'tolerance') {
          const num = Number(val);
          if (Number.isFinite(num) && num >= 0) tolerance = num;
        } else if (key === 'answerdisplay') {
          answerDisplay = val;
        }
        continue;
      }

      questionLines.push(line);
    }

    const question = questionLines.join('\n').trim();
    const explanation = explanationLines.join('\n').trim();

    let resolvedType = type;
    if (choices.length > 0) {
      if (answerIndices.length > 1) {
        resolvedType = 'multi';
      } else if (answerIndices.length === 1 && resolvedType !== 'multi') {
        resolvedType = 'single';
      }
    }

    const item: any = {
      id,
      type: resolvedType,
      question,
    };

    if (resolvedType === 'single' || resolvedType === 'multi') {
      item.choices = choices;
      item.answer = answerIndices;
    } else if (resolvedType === 'fill' || resolvedType === 'command') {
      item.answer = textAnswers.length ? textAnswers : [''];
      item.match = match;
      if (tolerance !== undefined) item.tolerance = tolerance;
      if (answerDisplay) item.answerDisplay = answerDisplay;
    }

    if (explanation) item.explanation = explanation;
    if (extraProps.topic) item.topic = extraProps.topic;
    if (extraProps.tags) item.tags = extraProps.tags.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean);

    if (!hasSourceDir) {
      for (const ref of imageRefs(item)) {
        issues.push({
          level: 'warn',
          line: headingLine,
          itemId: id,
          field: 'image',
          msg: `Mục "${id}": cần nhập từ file để lấy ảnh "${ref}".`,
        });
      }
    }

    const vIssues = validateItem(item, { deckKind: 'quiz' });
    if (hasError(vIssues)) {
      const errMsgs = vIssues.filter(i => i.level === 'error').map(i => i.msg).join('; ');
      issues.push({ level: 'error', line: headingLine, itemId: id, msg: `Mục "${id}" (dòng ${headingLine}) không hợp lệ: ${errMsgs}` });
      return;
    }
    for (const vi of vIssues) {
      issues.push({ level: vi.level, line: headingLine, itemId: id, field: vi.field, msg: `Mục "${id}": ${vi.msg}` });
    }

    items.push(item);
  }

  for (let l = 0; l < lines.length; l++) {
    const rawLine = lines[l];
    const trimmed = rawLine.trim();

    const headingMatch = trimmed.match(/^##\s+Q\s+([^|]+)(?:\|\s*([^|]+))?(?:\|(.*))?$/i);
    if (headingMatch) {
      commitQuestion();
      const id = headingMatch[1].trim();
      const type = (headingMatch[2] || 'single').trim().toLowerCase();
      const extraStr = headingMatch[3] || '';
      const extraProps: Record<string, string> = {};
      extraStr.split('|').forEach(part => {
        const eq = part.indexOf('=');
        if (eq !== -1) {
          const k = part.slice(0, eq).trim().toLowerCase();
          const v = part.slice(eq + 1).trim();
          extraProps[k] = v;
        }
      });

      currentQuestion = {
        id,
        type,
        headingLine: l + 1,
        rawLines: [] as string[],
        extraProps,
      };
      continue;
    }

    if (currentQuestion) {
      currentQuestion.rawLines.push(rawLine);
    }
  }

  commitQuestion();
  return { format: 'md-quiz', items, issues };
}

// Hàm thuần chính: parseImport
export function parseImport(text: string, options: any = {}): any {
  if (typeof text !== 'string') {
    return { ok: false, format: 'auto', items: [], issues: [{ level: 'error', msg: 'Nội dung nhập không phải là chuỗi văn bản.' }] };
  }

  const cleanText = text.replace(/^\uFEFF/, '');
  const bytes = utf8Encode(cleanText);
  if (bytes.length > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      format: options.format || 'auto',
      items: [],
      issues: [{ level: 'error', msg: `Dung lượng văn bản nhập (${(bytes.length / (1024 * 1024)).toFixed(1)} MB) vượt quá giới hạn cho phép (tối đa 5 MB).` }],
    };
  }

  let fmt = options.format || 'auto';
  if (fmt === 'auto') {
    fmt = detectImportFormat(cleanText, options);
  }

  let result: any;
  switch (fmt) {
    case 'tsv':
      result = parseCSVImport(cleanText, '\t', options);
      break;
    case 'csv': {
      const delim = options.delimiter || detectDelimiter(cleanText);
      result = parseCSVImport(cleanText, delim === '\t' ? ',' : delim, options);
      break;
    }
    case 'quizlet':
      result = parseQuizletImport(cleanText, options);
      break;
    case 'md-vocab':
      result = parseMarkdownVocabImport(cleanText, options);
      break;
    case 'md-quiz':
      result = parseMarkdownQuizImport(cleanText, options);
      break;
    default:
      result = parseCSVImport(cleanText, '\t', options);
      break;
  }

  let { items, issues } = result;

  if (items.length > MAX_IMPORT_ITEMS) {
    issues.push({
      level: 'warn',
      msg: `Số lượng mục nhập (${items.length}) vượt quá ${MAX_IMPORT_ITEMS}. Chỉ lấy ${MAX_IMPORT_ITEMS} mục đầu tiên.`,
    });
    items = items.slice(0, MAX_IMPORT_ITEMS);
  }

  return {
    ok: items.length > 0,
    format: result.format || fmt,
    items,
    issues,
  };
}
