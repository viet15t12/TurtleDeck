// src/core/grader.js — chấm điểm câu hỏi (hàm thuần, ES module, không phụ thuộc DOM).
import { parseNumber } from './validate.js';

export const norm = s => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');

export function lev(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

// returns { ok: boolean, near: boolean }
export function gradeText(input, answers, mode = 'normalized', options = {}) {
  const rawInput = String(input ?? '');
  const ansList = (Array.isArray(answers) ? answers : [answers]).map(a => String(a ?? ''));

  if (mode === 'exact') {
    return { ok: ansList.includes(rawInput), near: false };
  }

  if (mode === 'regex') {
    const x = norm(rawInput);
    const ok = ansList.some(r => {
      try {
        return new RegExp(r).test(x);
      } catch {
        return false;
      }
    });
    return { ok, near: false };
  }

  if (mode === 'number') {
    const x = parseNumber(rawInput);
    const tol = options?.tolerance ?? 1e-9;
    const ok = !Number.isNaN(x) && ansList.some(a => {
      const na = parseNumber(a);
      return !Number.isNaN(na) && Math.abs(na - x) <= tol;
    });
    return { ok, near: false };
  }

  // normalized (mặc định)
  const x = norm(rawInput).toLowerCase();
  const list = ansList.map(a => norm(a).toLowerCase());

  if (list.includes(x)) {
    return { ok: true, near: false };
  }

  if (!x) {
    return { ok: false, near: false };
  }

  // Dung sai Levenshtein: từ dài cho phép sai 1-2 ký tự (gần đúng)
  for (const a of list) {
    const len = Math.max(x.length, a.length);
    const maxD = len >= 9 ? 2 : len >= 5 ? 1 : 0;
    if (maxD > 0 && lev(a, x) <= maxD) {
      return { ok: true, near: true };
    }
  }

  return { ok: false, near: false };
}

// returns { ok: boolean, near: boolean }
export function gradeChoices(selected, correct) {
  const normList = arr => [...new Set((arr || []).map(Number))].sort((x, y) => x - y);
  const a = normList(selected).join(',');
  const b = normList(correct).join(',');
  return { ok: a === b, near: false };
}

