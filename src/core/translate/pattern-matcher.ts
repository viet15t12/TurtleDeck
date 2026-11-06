// src/core/translate/pattern-matcher.ts — Kiểm tra cấu trúc ngữ pháp bằng Regex (Layer 2)
// Trách nhiệm duy nhất: So khớp cấu trúc cú pháp đi kèm với từ gợi ý.

import type { Layer2PatternResult } from './types.js';

/**
 * Kiểm tra xem câu làm bài có thỏa mãn cấu trúc ngữ pháp yêu cầu (pattern) không.
 * Nếu không cấu hình pattern thì mặc định là pass.
 * Tự động linh hoạt hỗ trợ các dạng chia (forms) của từ khóa nếu pattern dùng từ gốc.
 */
export function checkPattern(
  sentence: string,
  pattern?: string,
  forms?: string[],
  detectedForm?: string
): Layer2PatternResult {
  const trimmedPattern = String(pattern || '').trim();
  if (!trimmedPattern) {
    return {
      passed: true,
      reason: 'Không có ràng buộc cấu trúc riêng.',
    };
  }

  const cleanSentence = String(sentence || '').trim();

  // 1. Thử so khớp trực tiếp với pattern gốc
  try {
    const directRegex = new RegExp(trimmedPattern, 'i');
    if (directRegex.test(cleanSentence)) {
      return {
        passed: true,
        patternApplied: trimmedPattern,
        reason: 'Khớp cấu trúc yêu cầu',
      };
    }
  } catch (err: any) {
    return {
      passed: false,
      patternApplied: trimmedPattern,
      reason: `Biểu thức mẫu không hợp lệ: ${err?.message || 'Regex error'}`,
    };
  }

  // 2. Nếu trượt và có danh sách biến thể từ (forms/detectedForm), thử mở rộng stem trong pattern
  if (Array.isArray(forms) && forms.length > 0) {
    try {
      const stem = forms[0];
      if (stem && trimmedPattern.toLowerCase().includes(stem.toLowerCase())) {
        const formsGroup = `(?:${forms.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;
        const expandedPattern = trimmedPattern.replace(
          new RegExp(`\\b${stem}\\b`, 'gi'),
          formsGroup
        );
        const expandedRegex = new RegExp(expandedPattern, 'i');
        if (expandedRegex.test(cleanSentence)) {
          return {
            passed: true,
            patternApplied: expandedPattern,
            reason: `Khớp cấu trúc với biến thể từ (${detectedForm || stem})`,
          };
        }
      }
    } catch {
      // Bỏ qua lỗi mở rộng nếu có
    }
  }

  return {
    passed: false,
    patternApplied: trimmedPattern,
    reason: 'Chưa đúng mẫu cấu trúc yêu cầu',
  };
}
