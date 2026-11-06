// src/core/translate/types.ts — Định nghĩa kiểu dữ liệu cho bài tập dịch câu với từ gợi ý (.sdeck v1)
import type { BaseItem } from '../types/item.types.js';

export interface TranslateItem extends BaseItem {
  type: 'translate';
  vi: string;                          // Câu tiếng Việt (Source sentence)
  keyword: string;                     // Từ gợi ý / mỏ neo (Target keyword)
  pos?: string;                        // Từ loại (v, n, adj, phr...)
  pattern?: string;                    // Cấu trúc ngữ pháp bắt buộc dưới dạng Regex (vd: prevent\s+\w+\s+from\s+\w+ing)
  answers: string[];                   // Các câu tiếng Anh mẫu chấp nhận được
  acceptableForms?: string[];          // Danh sách các biến thể hợp lệ của keyword (nếu không có, tự sinh morphology)
}

export interface Layer1KeywordResult {
  passed: boolean;
  detectedForm?: string;
  expectedKeyword: string;
  formsChecked: string[];
}

export interface Layer2PatternResult {
  passed: boolean;
  patternApplied?: string;
  reason?: string;
}

export interface Layer3AnswerResult {
  passed: boolean;
  matchedAnswer?: string;
  normalizedInput: string;
}

export type TranslateStatus = 'correct' | 'needs_review' | 'incorrect';

export interface TranslateEvaluationResult {
  status: TranslateStatus;
  score: number;                       // 0 đến 100
  layer1: Layer1KeywordResult;
  layer2: Layer2PatternResult;
  layer3: Layer3AnswerResult;
  feedback: string;
}

export interface AIGradingConfig {
  baseUrl: string;                     // Ví dụ: https://api.openai.com/v1 hoặc http://localhost:11434/v1
  apiKey?: string;
  model: string;                       // Ví dụ: gpt-4o-mini, deepseek-chat, llama3
  timeoutMs?: number;
}

export interface AIGradingRequest {
  vi: string;
  keyword: string;
  userAnswer: string;
  pattern?: string;
  answers: string[];
}

export interface AIGradingResult {
  usesKeyword: boolean;
  patternOk: boolean;
  grammarScore: number;                // Thang 10
  meaningScore: number;                // Thang 10
  feedback: string;
  suggestedSentence?: string;
}

