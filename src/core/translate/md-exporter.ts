// src/core/translate/md-exporter.ts — Xuất kết quả bài làm dịch câu ra Markdown
// Trách nhiệm duy nhất: Định dạng dữ liệu và bài làm thành tài liệu Markdown (.md) có cấu trúc Heading để người chấm dễ đọc và ghi điểm.

import type { TranslateItem, TranslateEvaluationResult } from './types.js';

export interface ExportSubmissionItem {
  item: TranslateItem;
  userAnswer: string;
  evaluation: TranslateEvaluationResult;
}

export interface ExportDeckMetadata {
  title?: string;
  studentName?: string;
  submittedAt?: string | number;
}

/**
 * Xuất danh sách bài làm dịch câu ra định dạng Markdown thân thiện với người chấm.
 */
export function exportTranslateToMarkdown(
  submissions: ExportSubmissionItem[],
  meta: ExportDeckMetadata = {}
): string {
  const title = meta.title || 'Bài tập Dịch câu có sử dụng từ gợi ý';
  const student = meta.studentName || 'Học viên';
  const dateStr = typeof meta.submittedAt === 'number'
    ? new Date(meta.submittedAt).toLocaleString('vi-VN')
    : meta.submittedAt || new Date().toLocaleString('vi-VN');

  const total = submissions.length;
  const l1Count = submissions.filter(s => s.evaluation.layer1.passed).length;
  const l2Count = submissions.filter(s => s.evaluation.layer2.passed).length;
  const l3Count = submissions.filter(s => s.evaluation.layer3.passed).length;
  const reviewCount = submissions.filter(s => s.evaluation.status === 'needs_review').length;

  const lines: string[] = [];

  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- **Học viên:** ${student}`);
  lines.push(`- **Thời gian nộp:** ${dateStr}`);
  lines.push(`- **Tổng số câu:** ${total}`);
  lines.push(`- **Tổng hợp tự động:**`);
  lines.push(`  - Sử dụng từ gợi ý (Tầng 1): ${l1Count}/${total}`);
  lines.push(`  - Đúng cấu trúc ngữ pháp (Tầng 2): ${l2Count}/${total}`);
  lines.push(`  - Khớp tuyệt đối đáp án mẫu (Tầng 3): ${l3Count}/${total}`);
  if (reviewCount > 0) {
    lines.push(`  - Số câu cần người chấm thẩm định: ${reviewCount}/${total}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  submissions.forEach((sub, index) => {
    const { item, userAnswer, evaluation } = sub;
    const qNum = index + 1;
    const kwDisplay = item.pos ? `${item.keyword} (${item.pos})` : item.keyword;

    lines.push(`### Câu ${qNum}: [${kwDisplay}]`);
    lines.push('');
    lines.push(`- **Đề bài (Tiếng Việt):** ${item.vi}`);
    lines.push(`- **Từ gợi ý (Anchor):** \`${item.keyword}\``);
    if (item.pattern) {
      lines.push(`- **Mẫu cấu trúc yêu cầu:** \`${item.pattern}\``);
    }
    lines.push(`- **Bài làm của học viên:** *${userAnswer || '(Để trống)'}*`);
    lines.push('');
    lines.push('**Kết quả kiểm tra tự động:**');
    lines.push(`- [${evaluation.layer1.passed ? 'x' : ' '}] Dùng từ gợi ý (Phát hiện: \`${evaluation.layer1.detectedForm || 'Không'}\`)`);
    if (item.pattern) {
      lines.push(`- [${evaluation.layer2.passed ? 'x' : ' '}] Khớp cấu trúc ngữ pháp yêu cầu`);
    }
    lines.push(`- [${evaluation.layer3.passed ? 'x' : ' '}] Khớp nguyên văn đáp án mẫu`);
    lines.push('');
    lines.push('**Đáp án mẫu tham khảo:**');
    item.answers.forEach((ans, aIdx) => {
      lines.push(`  ${aIdx + 1}. ${ans}`);
    });
    if (item.explanation) {
      lines.push(`- *Giải thích:* ${item.explanation}`);
    }
    lines.push('');

    // Khung chấm điểm cho giáo viên
    const defaultScore = evaluation.layer3.passed ? '10/10' : (evaluation.status === 'needs_review' ? ' [   ] / 10' : ' [   ] / 10');
    lines.push(`- **Điểm:** ${defaultScore}`);
    lines.push('- **Nhận xét của người chấm:**');
    lines.push('  > ');
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

