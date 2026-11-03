// src/core/grader.ts — chấm điểm câu hỏi (hàm thuần, ES module, không phụ thuộc DOM).
import { parseNumber } from './validate.js';

export const norm = (s: unknown): string => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');

export function lev(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
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

export function gradeNumber(input: unknown, answers: unknown, tol = 1e-9): { ok: boolean; near: boolean } {
  const x = parseNumber(input);
  const list = Array.isArray(answers) ? answers : [answers];
  const ok = !Number.isNaN(x) && list.some((a: any) => {
    const na = parseNumber(a);
    return !Number.isNaN(na) && Math.abs(na - x) <= tol;
  });
  return { ok, near: false };
}

export const normLatex = (s: unknown): string => String(s ?? '')
  .replace(/\\left|\\right/g, '')
  .replace(/\\[dt]frac/g, '\\frac')
  .replace(/\s+/g, '');

export function gradeLatex(input: unknown, answers: unknown): { ok: boolean; near: boolean } {
  const x = normLatex(input);
  const list = Array.isArray(answers) ? answers : [answers];
  return { ok: list.some((a: any) => normLatex(a) === x), near: false };
}

export interface GradeTextOptions {
  tolerance?: number;
  [key: string]: any;
}

export function gradeText(
  input: unknown,
  answers: unknown,
  mode = 'normalized',
  options: GradeTextOptions = {}
): { ok: boolean; near: boolean } {
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
    const tol = options?.tolerance ?? 1e-9;
    return gradeNumber(rawInput, ansList, tol);
  }

  if (mode === 'latex') {
    return gradeLatex(rawInput, ansList);
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

export function gradeChoices(selected: unknown, correct: unknown): { ok: boolean; near: boolean } {
  const normList = (arr: any) => ([...new Set((arr || []).map(Number))] as number[]).sort((x: number, y: number) => x - y);
  const a = normList(selected).join(',');
  const b = normList(correct).join(',');
  return { ok: a === b, near: false };
}
