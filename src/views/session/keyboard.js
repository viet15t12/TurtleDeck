// src/views/session/keyboard.js — Trình xử lý phím tắt theo từng dạng câu hỏi trong phiên học

import { RATING } from '../../core/srs.js';
import { speak } from '../../tts.js';

export function createKeyHandler(ctx) {
  const { session, render, submitCurrent, nextQuestion, requestExit, actions, entry, config, settings } = ctx;

  function handleSingle(ev, q) {
    const num = parseInt(ev.key, 10);
    if (num >= 1 && num <= q.choices.length) {
      ev.preventDefault();
      session.userAnswer = num - 1;
      render();
      return;
    }
    if (ev.key === 'Enter' && session.userAnswer !== null) {
      ev.preventDefault();
      submitCurrent();
    }
  }

  function handleMulti(ev, q) {
    const num = parseInt(ev.key, 10);
    if (num >= 1 && num <= q.choices.length) {
      ev.preventDefault();
      const idx = num - 1;
      const set = new Set(session.userAnswer || []);
      if (set.has(idx)) set.delete(idx);
      else set.add(idx);
      session.userAnswer = [...set];
      render();
      return;
    }
    if (ev.key === 'Enter') {
      if (!session.userAnswer || session.userAnswer.length === 0) return;
      ev.preventDefault();
      submitCurrent();
    }
  }

  function handleText(ev) {
    if (ev.key === 'Enter') {
      const val = (session.userAnswer || '').trim();
      if (!val) return;
      ev.preventDefault();
      submitCurrent();
    }
  }

  function handleCard(ev) {
    if (!session.cardFlipped) {
      if (ev.code === 'Space' || ev.key === ' ' || ev.key === 'Enter') {
        ev.preventDefault();
        session.cardFlipped = true;
        render();
      }
    } else {
      if (ev.key === '1') {
        ev.preventDefault();
        submitCurrent(RATING.AGAIN);
      } else if (ev.key === '2') {
        ev.preventDefault();
        submitCurrent(RATING.HARD);
      } else if (ev.key === '3' || ev.key === 'Enter' || ev.code === 'Space' || ev.key === ' ') {
        ev.preventDefault();
        submitCurrent(RATING.GOOD);
      } else if (ev.key === '4') {
        ev.preventDefault();
        submitCurrent(RATING.EASY);
      }
    }
  }

  return function onKeyDown(ev) {
    if (ev.repeat) {
      return;
    }

    if (typeof document !== 'undefined' && document.querySelector('.lightbox-backdrop')) {
      return;
    }

    if (ev.key === 'Escape') {
      ev.preventDefault();
      requestExit();
      return;
    }

    // Đang ở màn hình kết quả
    if (session.index >= session.questions.length) {
      if (ev.key === 'Enter') {
        const wrongIds = [...new Set(session.history.filter(h => !h.grade.ok).map(h => h.question.id))];
        if (wrongIds.length) {
          actions.startSession(entry, { ...config, mode: 'custom', itemIds: wrongIds });
        } else {
          actions.home();
        }
      }
      return;
    }

    const q = session.questions[session.index];

    // Phím tắt Alt+L để nghe lại phát âm (cho Listen mode, Flashcard hoặc câu có từ vựng)
    if (ev.altKey && (ev.key === 'l' || ev.key === 'L')) {
      ev.preventDefault();
      const t = q?.listenText || q?.rawItem?.term || (q?.kind === 'card' ? q?.rawItem?.term || q?.front : null);
      if (t) speak(t, settings?.ttsLang || 'en-US');
      return;
    }

    if (session.submitted) {
      if (ev.key === 'Enter' || (q.kind === 'card' && (ev.code === 'Space' || ev.key === ' '))) {
        ev.preventDefault();
        nextQuestion();
      }
      return;
    }

    // Chặn phím Enter/Space nếu câu hỏi mới vừa chuyển chưa đầy 150ms (tránh sự kiện phím từ câu trước lọt sang)
    if (session.questionStartedAt && Date.now() - session.questionStartedAt < 150) {
      if (ev.key === 'Enter' || ev.code === 'Space' || ev.key === ' ') {
        return;
      }
    }

    // Chưa nộp bài
    if (q.kind === 'single') {
      handleSingle(ev, q);
    } else if (q.kind === 'multi') {
      handleMulti(ev, q);
    } else if (q.kind === 'fill' || q.kind === 'command' || q.kind === 'listen') {
      handleText(ev);
    } else if (q.kind === 'card') {
      handleCard(ev);
    }
  };
}

