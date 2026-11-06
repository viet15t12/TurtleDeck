// src/core/translate/sentence-normalizer.ts — Chuẩn hóa câu tiếng Anh & so khớp Layer 3
// Trách nhiệm duy nhất: Chuẩn hóa câu (dấu câu, hoa thường, từ co rút) và so khớp đáp án mẫu.

import type { Layer3AnswerResult } from './types.js';

const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "can't": 'cannot',
  "won't": 'will not',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "hadn't": 'had not',
  "wouldn't": 'would not',
  "couldn't": 'could not',
  "shouldn't": 'should not',
  "isn't": 'is not',
  "aren't": 'are not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "it's": 'it is',
  "that's": 'that is',
  "what's": 'what is',
  "there's": 'there is',
  "they're": 'they are',
  "we're": 'we are',
  "you're": 'you are',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'll": 'i will',
  "you'll": 'you will',
  "he'll": 'he will',
  "she'll": 'she will',
  "we'll": 'we will',
  "they'll": 'they will',
};

/**
 * Chuẩn hóa một câu tiếng Anh:
 * - Chữ thường
 * - Mở rộng co rút (I'm -> I am, don't -> do not)
 * - Loại bỏ dấu câu (. , ! ? ; : " ' `)
 * - Gộp nhiều khoảng trắng thành 1 khoảng trắng đơn
 */
export function normalizeSentence(text: string): string {
  let s = String(text || '').trim().toLowerCase();

  // Chuẩn hóa dấu nháy đơn
  s = s.replace(/[\u2018\u2019`]/g, "'");

  // Mở rộng contractions
  for (const [shortForm, fullForm] of Object.entries(CONTRACTIONS)) {
    const escaped = shortForm.replace("'", "\\'");
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    s = s.replace(re, fullForm);
  }

  // Loại bỏ dấu câu
  s = s.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'–—]/g, ' ');

  // Gộp khoảng trắng
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

/**
 * So khớp câu nộp bài với danh sách các câu tiếng Anh chấp nhận được.
 */
export function checkAnswerList(input: string, acceptableAnswers: string[]): Layer3AnswerResult {
  const normalizedInput = normalizeSentence(input);
  if (!normalizedInput) {
    return {
      passed: false,
      normalizedInput,
    };
  }

  const list = Array.isArray(acceptableAnswers) ? acceptableAnswers : [];

  for (const ans of list) {
    const normalizedAns = normalizeSentence(ans);
    if (normalizedInput === normalizedAns) {
      return {
        passed: true,
        matchedAnswer: ans,
        normalizedInput,
      };
    }
  }

  return {
    passed: false,
    normalizedInput,
  };
}

