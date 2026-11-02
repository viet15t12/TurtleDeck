// src/core/parser.js — deckText (deck.json trong gói) → { ok, deck, issues[] }. Hàm thuần, chạy ở main.
// Lỗi cấp bộ thẻ (JSON hỏng, thiếu meta.id/items, id trùng, formatVersion quá mới) → ok:false + error tiếng Việt.
// Lỗi cấp item → bỏ qua item đó, ghi vào issues (kèm id, vị trí, lý do); các item còn lại vẫn học được.
// GĐ4 sẽ bổ sung các định dạng nhập CSV/TSV/Quizlet/Markdown.
import { validateDeck, itemType, hasError } from './validate.js';

// vị trí lỗi JSON → "dòng X, cột Y"
function jsonErrorLocation(text, err) {
  const lc = /line (\d+) column (\d+)/.exec(err.message);
  if (lc) return { line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(err.message);
  if (!pos) return null;
  const before = text.slice(0, Number(pos[1]));
  const lines = before.split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

const failDeck = error => ({ ok: false, error, issues: [{ level: 'error', msg: error }] });

export function parseDeck(deckText) {
  if (typeof deckText !== 'string') return failDeck('Không đọc được nội dung bộ thẻ (deck.json).');
  const text = deckText.replace(/^\uFEFF/, '');
  if (!text.trim()) return failDeck('deck.json rỗng.');

  let raw;
  try { raw = JSON.parse(text); } catch (e) {
    const loc = jsonErrorLocation(text, e);
    let msg = 'deck.json bị hỏng (sai cú pháp JSON)' + (loc ? ` ở dòng ${loc.line}, cột ${loc.column}` : '') + '.';
    if (/escape|\\/i.test(e.message) || (loc && /\\/.test(text.split('\n')[loc.line - 1] ?? '')))
      msg += ' Lưu ý: trong JSON, dấu \\ của LaTeX phải viết thành \\\\ (vd \\\\frac).';
    return failDeck(msg);
  }

  const v = validateDeck(raw);
  if (v.errors.length) return { ok: false, error: v.errors.join('\n'), issues: v.errors.map(msg => ({ level: 'error', msg })) };

  const issues = v.warnings.map(msg => ({ level: 'warn', msg }));
  const items = [];
  for (const { index, id, issues: its } of v.items) {
    const where = { index, itemId: id };
    if (hasError(its)) {
      const reasons = its.filter(i => i.level === 'error').map(i => i.msg).join(' ');
      issues.push({ level: 'error', ...where, skipped: true, msg: `Bỏ qua mục ${id ? `"${id}"` : `thứ ${index + 1}`}: ${reasons}` });
      continue;
    }
    for (const i of its) issues.push({ level: i.level, ...where, field: i.field, msg: i.msg });
    items.push(raw.items[index]);
  }

  const meta = { ...raw.meta };
  if (typeof meta.title !== 'string' || !meta.title.trim()) meta.title = meta.id;
  if (!['vocab', 'qa', 'quiz'].includes(meta.kind))
    meta.kind = raw.items.length && raw.items.every(it => itemType(it) === 'vocab') ? 'vocab' : 'quiz';

  return {
    ok: true,
    deck: { ...raw, meta, items },
    issues,
    total: raw.items.length,
    skipped: raw.items.length - items.length,
  };
}

