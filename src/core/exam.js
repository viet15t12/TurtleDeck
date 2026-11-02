// src/core/exam.js — Khởi tạo bài thi thử, quản lý đồng hồ đếm ngược, chấm điểm và chuyển các câu sai vào SRS.
// Theo study-app.md mục 6.2 và study-app-phases.md GĐ5. Hàm thuần, ES module, không phụ thuộc DOM/Electron.

import { buildQuestion } from './builder.js';
import { gradeChoices, gradeText } from './grader.js';
import { cardKey, newCard, schedule } from './srs.js';

function shuffleItems(arr, rand = Math.random) {
  const res = [...arr];
  for (let i = res.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = res[i];
    res[i] = res[j];
    res[j] = t;
  }
  return res;
}

// Khởi tạo bài thi thử theo deck, chủ đề và số câu hỏi
export function createExam({
  deck,
  topic = 'all',
  count,
  durationMinutes = 30,
  shuffle = true,
  rand = Math.random,
  now = Date.now(),
} = {}) {
  const items = Array.isArray(deck?.items) ? deck.items : [];
  const deckId = deck?.meta?.id || 'deck';

  let filtered = items.filter(it => it && typeof it === 'object');
  if (topic && topic !== 'all') {
    filtered = filtered.filter(it => it.topic === topic);
  }

  if (shuffle) {
    filtered = shuffleItems(filtered, rand);
  }

  const maxCount = Number(count) > 0 ? Math.min(Number(count), filtered.length) : filtered.length;
  const selectedItems = filtered.slice(0, maxCount);

  const questions = selectedItems
    .map(it => {
      const q = buildQuestion(it, { mode: 'exam', allItems: items });
      return q ? { ...q, item: it } : null;
    })
    .filter(Boolean);

  return {
    deckId,
    deckTitle: deck?.meta?.title || 'Bài thi thử',
    topic,
    durationSeconds: Math.max(60, durationMinutes * 60),
    startedAt: now,
    questions,
    answers: {},
  };
}

// Tính thời gian còn lại của bài thi và kiểm tra đã hết giờ chưa
export function getExamRemainingSeconds(exam, now = Date.now()) {
  if (!exam || !exam.startedAt) return { remainingSeconds: 0, elapsedSeconds: 0, isExpired: true };
  const elapsed = Math.max(0, Math.floor((now - exam.startedAt) / 1000));
  const remaining = Math.max(0, exam.durationSeconds - elapsed);
  return {
    remainingSeconds: remaining,
    elapsedSeconds: elapsed,
    isExpired: remaining <= 0,
  };
}

// Chấm điểm bài thi thử (không hiện kết quả trong lúc làm, chỉ chấm khi nộp hoặc hết giờ)
export function gradeExam(exam, { now = Date.now() } = {}) {
  const questions = exam?.questions || [];
  const answers = exam?.answers || {};
  const timeStatus = getExamRemainingSeconds(exam, now);

  const results = questions.map((q, idx) => {
    const userAns = answers[idx];
    const type = q.kind || q.type;
    let isCorrect = false;

    if (type === 'single' || type === 'multi' || type === 'mc') {
      const selected = Array.isArray(userAns) ? userAns : (userAns !== undefined ? [userAns] : []);
      const correct = Array.isArray(q.answers) ? q.answers : (Array.isArray(q.answer) ? q.answer : []);
      isCorrect = gradeChoices(selected, correct).ok;
    } else if (type === 'fill' || type === 'command' || type === 'write') {
      const text = typeof userAns === 'string' ? userAns : '';
      const mode = q.match || (type === 'command' ? 'exact' : 'normalized');
      isCorrect = gradeText(text, q.answers || [], mode).ok;
    } else if (type === 'card' || type === 'vocab') {
      isCorrect = Boolean(userAns);
    }

    return {
      index: idx,
      question: q,
      item: q.item || null,
      userAnswer: userAns,
      isCorrect,
      explanation: q.explanation || '',
    };
  });

  const total = results.length;
  const correctCount = results.filter(r => r.isCorrect).length;
  const wrongCount = total - correctCount;
  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const passed = score >= 70;
  const wrongItems = results.filter(r => !r.isCorrect && r.item).map(r => r.item);

  return {
    total,
    correctCount,
    wrongCount,
    score,
    passed,
    isExpired: timeStatus.isExpired,
    results,
    wrongItems,
  };
}

// Đưa các câu làm sai trong bài thi vào hệ thống SRS (đặt lịch ôn lại - rating 1: Again)
export function applyExamWrongToSRS(examResults, progress = {}, { deckId = 'deck', now = Date.now() } = {}) {
  const wrongItems = examResults?.wrongItems || [];
  if (wrongItems.length === 0) return { progress, scheduledCount: 0 };

  const cards = { ...(progress.cards || {}) };
  const log = Array.isArray(progress.log) ? [...progress.log] : [];

  for (const item of wrongItems) {
    const key = cardKey(deckId, item.id, 'fwd');
    const existing = cards[key] || newCard();
    const updated = schedule(existing, 1, now);
    cards[key] = updated;
    log.push({ card: key, r: 1, t: now });
  }

  return {
    progress: {
      ...progress,
      cards,
      log,
    },
    scheduledCount: wrongItems.length,
  };
}
