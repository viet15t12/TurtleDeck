// src/views/session/question/index.js — Bộ phân phối render phần thân câu hỏi theo kind

import { renderChoicesQuestion } from './choices.js';
import { renderTextInputQuestion } from './text-input.js';
import { renderListenQuestion } from './listen.js';
import { renderFlashcardQuestion } from './flashcard.js';

export function renderQuestionBody(ctx, q) {
  if (q.kind === 'single' || q.kind === 'multi') {
    return renderChoicesQuestion(ctx, q);
  }
  if (q.kind === 'fill' || q.kind === 'command') {
    return renderTextInputQuestion(ctx, q);
  }
  if (q.kind === 'listen') {
    return renderListenQuestion(ctx, q);
  }
  if (q.kind === 'card') {
    return renderFlashcardQuestion(ctx, q);
  }
  return null;
}

