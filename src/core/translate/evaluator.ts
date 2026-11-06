// src/core/translate/evaluator.ts — Bộ điều phối chấm điểm phân tầng (Layered Evaluator)
// Trách nhiệm duy nhất: Phối hợp 3 tầng kiểm tra (Từ neo -> Cấu trúc -> So khớp) và xuất kết quả.

import type { TranslateItem, TranslateEvaluationResult } from './types.js';
import { checkKeyword } from './morphology.js';
import { checkPattern } from './pattern-matcher.js';
import { checkAnswerList } from './sentence-normalizer.js';

export function evaluateTranslation(
  userAnswer: string,
  item: TranslateItem
): TranslateEvaluationResult {
  const input = String(userAnswer || '').trim();

  // 1. Tầng 1: Kiểm tra từ gợi ý (Anchor / Keyword)
  const l1 = checkKeyword(input, item.keyword, item.acceptableForms, item.pos);
  if (!l1.passed) {
    return {
      status: 'incorrect',
      score: 0,
      layer1: l1,
      layer2: { passed: false, reason: 'Bỏ qua do chưa dùng từ gợi ý' },
      layer3: { passed: false, normalizedInput: input },
      feedback: `Chưa sử dụng từ gợi ý bắt buộc "${item.keyword}".`,
    };
  }

  // 2. Tầng 2: Kiểm tra cấu trúc ngữ pháp (Pattern)
  const l2 = checkPattern(input, item.pattern, l1.formsChecked, l1.detectedForm);
  if (!l2.passed) {
    return {
      status: 'incorrect',
      score: 30,
      layer1: l1,
      layer2: l2,
      layer3: { passed: false, normalizedInput: input },
      feedback: `Đã dùng từ gợi ý nhưng chưa đúng cấu trúc yêu cầu: ${item.pattern || ''}.`,
    };
  }

  // 3. Tầng 3: So khớp với danh sách đáp án mẫu (Answer list)
  const l3 = checkAnswerList(input, item.answers);
  if (l3.passed) {
    return {
      status: 'correct',
      score: 100,
      layer1: l1,
      layer2: l2,
      layer3: l3,
      feedback: 'Chính xác! Câu viết hoàn toàn khớp với đáp án mẫu.',
    };
  }

  // Fallback thân thiện: Qua tầng 1 và 2 nhưng không nằm trong danh sách đáp án mẫu
  return {
    status: 'needs_review',
    score: 75,
    layer1: l1,
    layer2: l2,
    layer3: l3,
    feedback: 'Đã dùng đúng từ gợi ý và cấu trúc ngữ pháp. Hãy đối chiếu với đáp án mẫu hoặc gửi giáo viên thẩm định.',
  };
}
