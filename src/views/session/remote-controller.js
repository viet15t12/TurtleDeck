// src/views/session/remote-controller.js — Đồng bộ 2 chiều giữa Desktop Session và Mobile Controller
import { invokeTyped, onEvent } from '../../platform/tauri-api.js';

let unlistenAction = null;
let unlistenConnected = null;

/**
 * Khởi tạo đồng bộ Remote Controller cho phiên học hiện tại
 * @param {object} ctx - Context của session (chứa session, render, submitCurrent, nextQuestion...)
 * @returns {() => void} Hàm dọn dẹp khi thoát session
 */
export function setupRemoteController(ctx) {
  teardownRemoteController();

  // Đăng ký lắng nghe lệnh từ điện thoại
  unlistenAction = onEvent('remote-action', (action) => {
    handleRemoteAction(action, ctx);
  });

  // Khi có điện thoại vừa kết nối, tự động phát lại câu hỏi hiện tại ngay lập tức
  unlistenConnected = onEvent('remote-client-connected', () => {
    broadcastCurrentSession(ctx);
  });

  // Gửi trạng thái ban đầu
  broadcastCurrentSession(ctx);

  return teardownRemoteController;
}

export function teardownRemoteController() {
  if (unlistenAction) {
    unlistenAction();
    unlistenAction = null;
  }
  if (unlistenConnected) {
    unlistenConnected();
    unlistenConnected = null;
  }
}

/**
 * Xử lý lệnh nhận được từ điện thoại
 */
export function handleRemoteAction(actionObj, ctx) {
  if (!ctx || !ctx.session) return;
  const session = ctx.session;
  const q = session.questions[session.index];
  if (!q) return;

  const action = actionObj?.action;
  const payload = actionObj?.payload || {};

  switch (action) {
    case 'SELECT_CHOICE': {
      if (session.submitted) {
        // Đã trả lời rồi thì bấm nút bất kỳ có thể là sang câu tiếp
        ctx.nextQuestion();
        return;
      }
      const optionId = payload.optionId; // 'A', 'B', 'C', 'D'
      const letterIndex = ['A', 'B', 'C', 'D'].indexOf(optionId);

      if (q.choices && letterIndex >= 0 && letterIndex < q.choices.length) {
        const choice = q.choices[letterIndex];
        const val = typeof choice === 'object' && choice !== null ? choice.text || choice.id : choice;

        if (q.kind === 'multi') {
          session.userAnswer = session.userAnswer || [];
          if (!session.userAnswer.includes(val)) {
            session.userAnswer.push(val);
          }
        } else {
          session.userAnswer = val;
        }

        // Tự động submit sau khi chọn câu trắc nghiệm đơn
        if (q.kind === 'single' || !q.kind) {
          ctx.submitCurrent();
        } else {
          ctx.render();
        }
      }
      break;
    }

    case 'SUBMIT': {
      if (!session.submitted) {
        ctx.submitCurrent();
      }
      break;
    }

    case 'FLIP': {
      if (q.kind === 'card' || !session.submitted) {
        session.cardFlipped = true;
        ctx.render();
      }
      break;
    }

    case 'RATE_SRS': {
      const rating = Number(payload.rating) || 3;
      ctx.submitCurrent(rating);
      ctx.nextQuestion();
      break;
    }

    case 'NEXT': {
      ctx.nextQuestion();
      break;
    }

    case 'PREV': {
      if (session.index > 0) {
        session.index--;
        session.submitted = false;
        session.cardFlipped = false;
        ctx.render();
      }
      break;
    }

    default:
      console.log('Remote action không xác định:', action);
  }
}

/**
 * Đóng gói và phát sóng trạng thái session hiện tại đến mobile
 */
export function broadcastCurrentSession(ctx) {
  if (!ctx || !ctx.session) {
    invokeTyped('remote:broadcast', { remoteState: { session_active: false }, session_active: false });
    return;
  }

  const session = ctx.session;
  if (session.index >= session.questions.length) {
    // Đã hoàn thành toàn bộ bài
    const ended = {
      session_active: false,
      mode: ctx.config?.mode || 'srs',
      index: session.questions.length,
      total: session.questions.length,
    };
    invokeTyped('remote:broadcast', { remoteState: ended, ...ended });
    return;
  }

  const q = session.questions[session.index];
  if (!q) return;

  const choices = (q.choices || []).map((c, idx) => {
    const letter = ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
    const text = typeof c === 'object' && c !== null ? c.text || c.id : String(c);
    const isSelected = Array.isArray(session.userAnswer)
      ? session.userAnswer.includes(text) || session.userAnswer.includes(c?.id)
      : session.userAnswer === text || session.userAnswer === c?.id;

    let isCorrect = null;
    if (session.submitted) {
      if (Array.isArray(q.answers)) {
        isCorrect = q.answers.includes(text) || q.answers.includes(c?.id);
      } else if (q.answers !== undefined) {
        isCorrect = q.answers === text || q.answers === c?.id;
      }
    }

    return {
      id: letter,
      text: text && text.length > 30 ? text.slice(0, 30) + '…' : text,
      selected: !!isSelected,
      is_correct: isCorrect,
    };
  });

  // Lời giải thích hoặc đáp án chi tiết
  let explanation = q.explanation || '';
  if (!explanation && q.kind === 'card' && q.back) {
    explanation = q.back;
  } else if (!explanation && q.answerDisplay) {
    explanation = `Đáp án đúng: <strong>${q.answerDisplay}</strong>`;
  }

  const payload = {
    session_active: true,
    mode: ctx.config?.mode || 'srs',
    index: session.index,
    total: session.questions.length,
    kind: q.kind || 'single',
    prompt_summary: q.prompt ? q.prompt.slice(0, 80) : '',
    choices,
    submitted: !!session.submitted,
    card_flipped: !!session.cardFlipped,
    explanation: explanation || null,
    is_correct: session.grade ? !!session.grade.correct : null,
  };

  invokeTyped('remote:broadcast', { remoteState: payload, ...payload }).catch((err) => {
    console.debug('Không thể broadcast remote state:', err);
  });
}
