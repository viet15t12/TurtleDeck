// src/views/session/session-state.ts — Quản lý trạng thái vòng đời phiên học tập

import type { CardState, QuestionKind, Rating } from '../../core/types.js';

export interface Question {
  id: string;
  kind: QuestionKind;
  prompt: string;
  choices?: any[];
  answers?: any;
  answerDisplay?: string;
  match?: string;
  tolerance?: number;
  front?: string;
  back?: string;
  image?: string;
  answerImage?: string;
  listenText?: string;
  rawItem?: any;
  direction?: string;
  card?: CardState;
  retryCount?: number;
  category?: string;
  retry?: boolean;
  topic?: string;
  tags?: string[];
  explanation?: string;
  isRetry?: boolean;
  [k: string]: unknown;
}

export interface SessionHistoryItem {
  question: Question;
  userAnswer: any;
  grade: any;
  rating: Rating;
  ms: number;
  prevState?: CardState;
  logEntry?: any;
  cardKey?: string;
  overridden?: boolean;
}

export interface SessionReviewResult {
  prevState: CardState;
  logEntry?: any;
  key: string;
}

export interface SessionState {
  index: number;
  questions: Question[];
  userAnswer: any;
  submitted: boolean;
  cardFlipped: boolean;
  grade: any;
  nextIntervalText: string;
  questionStartedAt: number;
  history: SessionHistoryItem[];
  slotResults: Map<number, boolean>;
  currentReviewResult?: SessionReviewResult;
}

export function createSessionState(questions: Question[]): SessionState {
  return {
    index: 0,
    questions,
    userAnswer: null,
    submitted: false,
    cardFlipped: false,
    grade: null,
    nextIntervalText: '',
    questionStartedAt: Date.now(),
    history: [],
    slotResults: new Map(),
  };
}

export function resetForQuestion(session: SessionState, q: Question): void {
  session.submitted = false;
  session.grade = null;
  session.nextIntervalText = '';
  session.cardFlipped = false;
  session.questionStartedAt = Date.now();
  if (q.kind === 'multi') {
    session.userAnswer = [];
  } else if (q.kind === 'fill' || q.kind === 'command' || q.kind === 'listen') {
    session.userAnswer = '';
  } else {
    session.userAnswer = null;
  }
}
