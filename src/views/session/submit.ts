// src/views/session/submit.ts — Logic chấm điểm thuần, nộp bài và chấm lại là đúng

import type { Progress, Rating } from '../../core/types.js';
import { gradeChoices, gradeText } from '../../core/grader.js';
import { RATING, cardKey, newCard, previewIntervalLabel, ratingFromGrade } from '../../core/srs.js';
import { reinsertWrong } from '../../core/planner.js';
import { applyCardOverride, applyOverrideToProgress } from '../../core/progressio.js';
// @ts-ignore
import { formatNextIntervalText } from '../result.js';
import type { Question, SessionState } from './session-state.js';

export type UserAnswer = number | null | number[] | string | boolean;
export interface Grade {
  ok: boolean;
  near: boolean;
  rating: Rating;
  overridden?: boolean;
}

export interface SubmitDeps {
  deckId: string;
  persist: boolean;
  learnSteps?: number[];
  progress: Progress;
  onRecordReview?: (params: any) => any;
  saveProgress?: (progress: Progress) => Promise<any>;
}

export function gradeAnswer(
  q: Question,
  userAnswer: UserAnswer,
  explicitRating?: Rating
): { grade: Grade; userAnswer: UserAnswer } {
  let grade: any = null;
  let finalAnswer = userAnswer;

  if (q.kind === 'single') {
    grade = gradeChoices(userAnswer !== null ? [userAnswer as number] : [], q.answers || []);
  } else if (q.kind === 'multi') {
    grade = gradeChoices((userAnswer as number[]) || [], q.answers || []);
  } else if (q.kind === 'fill' || q.kind === 'command' || q.kind === 'listen') {
    const inputVal = typeof userAnswer === 'string' ? userAnswer : '';
    grade = gradeText(inputVal, q.answers || [], q.match || 'text', { tolerance: q.tolerance });
  } else if (q.kind === 'card') {
    const r = explicitRating ?? (userAnswer ? RATING.GOOD : RATING.AGAIN);
    finalAnswer = r !== RATING.AGAIN;
    grade = { ok: r !== RATING.AGAIN, near: false, rating: r };
  }

  const rating = ratingFromGrade(grade, explicitRating ?? grade?.rating) as Rating;
  return {
    grade: { ...grade, rating },
    userAnswer: finalAnswer,
  };
}

export function canSubmit(q: Question, userAnswer: UserAnswer): boolean {
  if (q.kind === 'multi') {
    return Array.isArray(userAnswer) && userAnswer.length > 0;
  }
  if (q.kind === 'single') {
    return userAnswer !== null;
  }
  if (q.kind === 'card') {
    return true;
  }
  return typeof userAnswer === 'string' && userAnswer.trim().length > 0;
}

export function submitCurrentQuestion(
  session: SessionState,
  deps: SubmitDeps,
  explicitRating?: Rating
): void {
  if (session.submitted) return;
  const q = session.questions[session.index];
  if (!q) return;

  const { grade, userAnswer } = gradeAnswer(q, session.userAnswer, explicitRating);
  session.userAnswer = userAnswer;
  session.grade = grade;

  const now = Date.now();
  const ms = Math.max(0, now - (session.questionStartedAt || now));

  const key = cardKey(deps.deckId, q.id, (q.direction as any) || 'fwd');
  const prevCard = deps.progress?.cards?.[key] || q.card || newCard();
  const prevState = { ...prevCard };

  session.nextIntervalText = previewIntervalLabel(prevCard, grade.rating, now, { learnSteps: deps.learnSteps });

  let reviewRes: any = null;
  if (deps.onRecordReview) {
    reviewRes = deps.onRecordReview({
      deckId: deps.deckId,
      itemId: q.id,
      direction: q.direction || 'fwd',
      rating: grade.rating,
      ms,
      now,
      learnSteps: deps.learnSteps,
      persist: deps.persist,
    });
    if (reviewRes?.card) {
      q.card = reviewRes.card;
      session.nextIntervalText = formatNextIntervalText(reviewRes.card, now);
    }
  }

  session.slotResults.set(session.index, Boolean(session.grade.ok));

  // Câu sai: chèn lại sau 3–7 câu khác trong cùng phiên (tối đa 3 lần lặp lại mỗi câu trong 1 phiên)
  if (!session.grade.ok && (q.retryCount || 0) < 3) {
    reinsertWrong(session.questions, session.index);
  }

  session.submitted = true;
  const cKey = reviewRes?.key || key;
  session.currentReviewResult = {
    prevState,
    logEntry: reviewRes?.logEntry,
    key: cKey,
  };

  session.history.push({
    question: q,
    userAnswer: session.userAnswer,
    grade: session.grade,
    rating: grade.rating,
    ms,
    prevState,
    logEntry: reviewRes?.logEntry,
    cardKey: cKey,
  });
}

export function overrideAsCorrect(session: SessionState, deps: SubmitDeps): void {
  if (!session.submitted || !session.currentReviewResult) return;
  const { prevState, logEntry, key } = session.currentReviewResult;
  const q = session.questions[session.index];
  const now = Date.now();
  const cKey = key || cardKey(deps.deckId, q.id, (q.direction as any) || 'fwd');
  const { nextCard, overrideLogEntry } = applyCardOverride(
    prevState,
    logEntry || { t: now, card: cKey, ms: 0 },
    now,
    { learnSteps: deps.learnSteps }
  );

  const nextProgress = applyOverrideToProgress(deps.progress, cKey, nextCard, overrideLogEntry);
  deps.progress.cards = nextProgress.cards;
  deps.progress.log = nextProgress.log;

  if (deps.persist) {
    window.api.saveProgress(deps.progress);
  }

  session.grade = { ok: true, near: false, rating: RATING.GOOD, overridden: true };
  session.slotResults.set(session.index, true);
  session.nextIntervalText = formatNextIntervalText(nextCard, now);
  q.card = nextCard;

  const lastHist = session.history[session.history.length - 1];
  if (lastHist) {
    lastHist.grade = session.grade;
    lastHist.rating = RATING.GOOD;
    lastHist.overridden = true;
  }

  // Xoá các lượt hỏi lại của câu này nếu có
  const curId = q.id;
  for (let i = session.questions.length - 1; i > session.index; i--) {
    if (session.questions[i].id === curId && session.questions[i].isRetry) {
      session.questions.splice(i, 1);
    }
  }
}

