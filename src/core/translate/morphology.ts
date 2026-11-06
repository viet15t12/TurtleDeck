// src/core/translate/morphology.ts — Xử lý biến thể từ vựng và mỏ neo (Layer 1)
// Trách nhiệm duy nhất: Phân tích hình thái từ (morphology) và kiểm tra sự xuất hiện của từ gợi ý.

import type { Layer1KeywordResult } from './types.js';

/**
 * Tách bỏ chú thích từ loại trong từ gợi ý, ví dụ: "prevent (v)" -> "prevent"
 */
export function extractRawKeyword(keyword: string): string {
  return String(keyword || '')
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .toLowerCase();
}

/**
 * Sinh các biến thể hình thái cơ bản của từ tiếng Anh (s/es, ed/d, ing, ...)
 */
export function generateWordForms(keyword: string, pos?: string): string[] {
  const stem = extractRawKeyword(keyword);
  if (!stem) return [];

  const forms = new Set<string>([stem]);
  const p = (pos || '').toLowerCase();

  // Động từ (Verb)
  if (p.includes('v') || !pos) {
    // Ngôi thứ 3 số ít
    if (stem.endsWith('y') && !/[aeiou]y$/i.test(stem)) {
      forms.add(stem.slice(0, -1) + 'ies');
    } else if (/(s|sh|ch|x|z|o)$/i.test(stem)) {
      forms.add(stem + 'es');
    } else {
      forms.add(stem + 's');
    }

    // Quá khứ & Phân từ (-ed)
    if (stem.endsWith('e')) {
      forms.add(stem + 'd');
    } else if (stem.endsWith('y') && !/[aeiou]y$/i.test(stem)) {
      forms.add(stem.slice(0, -1) + 'ied');
    } else if (/[^aeiou][aeiou][^aeiouwy]$/i.test(stem) && stem.length <= 5) {
      forms.add(stem + stem.slice(-1) + 'ed'); // Gấp đôi phụ âm (vd: stop -> stopped)
    } else {
      forms.add(stem + 'ed');
    }

    // V-ing
    if (stem.endsWith('ie')) {
      forms.add(stem.slice(0, -2) + 'ying'); // lie -> lying
    } else if (stem.endsWith('e') && !stem.endsWith('ee')) {
      forms.add(stem.slice(0, -1) + 'ing');
    } else if (/[^aeiou][aeiou][^aeiouwy]$/i.test(stem) && stem.length <= 5) {
      forms.add(stem + stem.slice(-1) + 'ing'); // stop -> stopping
    } else {
      forms.add(stem + 'ing');
    }
  }

  // Danh từ (Noun)
  if (p.includes('n')) {
    if (stem.endsWith('y') && !/[aeiou]y$/i.test(stem)) {
      forms.add(stem.slice(0, -1) + 'ies');
    } else if (/(s|sh|ch|x|z)$/i.test(stem)) {
      forms.add(stem + 'es');
    } else {
      forms.add(stem + 's');
    }
  }

  return Array.from(forms);
}

/**
 * Kiểm tra xem câu làm bài có chứa từ gợi ý hoặc bất kỳ biến thể hợp lệ nào hay không.
 */
export function checkKeyword(
  sentence: string,
  keyword: string,
  acceptableForms?: string[],
  pos?: string
): Layer1KeywordResult {
  const rawKeyword = extractRawKeyword(keyword);
  const forms = Array.isArray(acceptableForms) && acceptableForms.length > 0
    ? Array.from(new Set([rawKeyword, ...acceptableForms.map(f => f.trim().toLowerCase())]))
    : generateWordForms(rawKeyword, pos);

  const cleanSentence = String(sentence || '').toLowerCase();

  for (const form of forms) {
    if (!form) continue;
    // Tìm nguyên từ bằng regex word-boundary \b
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(cleanSentence)) {
      return {
        passed: true,
        detectedForm: form,
        expectedKeyword: keyword,
        formsChecked: forms,
      };
    }
  }

  return {
    passed: false,
    expectedKeyword: keyword,
    formsChecked: forms,
  };
}

