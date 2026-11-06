// src/core/translate/llm-grader.ts — Chấm điểm bằng LLM qua chuẩn OpenAI-Compatible API
// Trách nhiệm duy nhất: Tạo prompt, gửi request đến bất kỳ endpoint LLM nào và chuẩn hóa JSON phản hồi.

import type { AIGradingConfig, AIGradingRequest, AIGradingResult } from './types.js';

export const SYSTEM_PROMPT = `Bạn là chuyên gia khảo thí ngôn ngữ tiếng Anh. Nhiệm vụ của bạn là thẩm định bài dịch tiếng Việt sang tiếng Anh của người học có sử dụng từ gợi ý bắt buộc.
Hãy trả về DUY NHẤT một đối tượng JSON (không bọc trong markdown block, không kèm lời dẫn) với đúng cấu trúc sau:
{
  "usesKeyword": boolean,
  "patternOk": boolean,
  "grammarScore": number,
  "meaningScore": number,
  "feedback": "Nhận xét ngắn gọn bằng tiếng Việt về ngữ pháp, thì và cách dùng từ",
  "suggestedSentence": "Câu hoàn chỉnh tối ưu nhất"
}`;

/**
 * Xây dựng user prompt cho LLM
 */
export function buildUserPrompt(req: AIGradingRequest): string {
  return [
    `Đề bài tiếng Việt: "${req.vi}"`,
    `Từ gợi ý bắt buộc (Keyword): "${req.keyword}"`,
    req.pattern ? `Cấu trúc yêu cầu: "${req.pattern}"` : null,
    `Đáp án mẫu: ${JSON.stringify(req.answers)}`,
    `Bài làm của học viên: "${req.userAnswer}"`,
    '',
    'Hãy thẩm định xem học viên có dùng từ gợi ý không, ngữ pháp đúng chưa, ý nghĩa sát chưa, và cho điểm thang 10.',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Bóc tách và parse kết quả JSON trả về từ LLM một cách an toàn
 */
export function parseLLMResponse(rawText: string): AIGradingResult {
  let cleaned = String(rawText || '').trim();

  // Bỏ markdown code fence nếu LLM tự ý thêm ```json ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      usesKeyword: Boolean(parsed.usesKeyword),
      patternOk: Boolean(parsed.patternOk),
      grammarScore: Math.min(10, Math.max(0, Number(parsed.grammarScore) || 0)),
      meaningScore: Math.min(10, Math.max(0, Number(parsed.meaningScore) || 0)),
      feedback: String(parsed.feedback || '').trim(),
      suggestedSentence: parsed.suggestedSentence ? String(parsed.suggestedSentence).trim() : undefined,
    };
  } catch {
    return {
      usesKeyword: false,
      patternOk: false,
      grammarScore: 0,
      meaningScore: 0,
      feedback: `Không thể đọc phản hồi từ AI: ${rawText.slice(0, 100)}...`,
    };
  }
}

/**
 * Gửi yêu cầu chấm điểm tới bất kỳ API nào tuân thủ chuẩn OpenAI Chat Completions.
 */
export async function gradeWithLLM(
  req: AIGradingRequest,
  config: AIGradingConfig,
  fetchFn: typeof fetch = fetch
): Promise<AIGradingResult> {
  const url = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.apiKey && config.apiKey.trim()) {
    headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
  }

  const payload = {
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(req) },
    ],
    temperature: 0.1,
  };

  const res = await fetchFn(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: config.timeoutMs ? AbortSignal.timeout(config.timeoutMs) : undefined,
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`AI API error (${res.status}): ${errorText || res.statusText}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return parseLLMResponse(content);
}

