// src/views/session.js — màn hình phiên học & kết quả (single, multi, fill, command, card).
import { h, fileName } from './dom.js';
import { makeRich } from '../core/richtext.js';
import { buildSessionQuestions } from '../core/builder.js';
import { gradeText, gradeChoices } from '../core/grader.js';

let activeCleanup = null;

const choiceText = c => typeof c === 'string' ? c : [c?.text, c?.image ? `[ảnh ${c.image}]` : ''].filter(Boolean).join(' ');

// Tạo phần tử chứa HTML đã qua DOMPurify
function richEl(tag, attrs, htmlContent) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  el.innerHTML = htmlContent;
  return el;
}

export function renderSession(root, { entry, config = {} }, actions) {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  const rich = makeRich(entry.deckKey);
  const questions = buildSessionQuestions(entry.deck.items, {
    count: config.count,
    shuffle: Boolean(config.shuffle),
    itemIds: config.itemIds,
  });

  if (!questions.length) {
    root.replaceChildren(
      h('div', { class: 'empty' },
        h('h2', null, 'Không có câu hỏi nào để học'),
        h('p', { class: 'muted' }, 'Bộ thẻ không có câu hỏi hợp lệ hoặc danh sách câu cần học rỗng.'),
        h('div', { class: 'toolbar', style: 'margin-top: 16px;' },
          h('button', { class: 'btn primary', onclick: () => actions.openDeckView(entry) }, '← Quay lại bộ thẻ')))
    );
    return;
  }

  const session = {
    index: 0,
    questions,
    userAnswer: null, // single: index, multi: array of indices, fill/command: string, card: boolean
    submitted: false,
    cardFlipped: false,
    grade: null, // { ok, near }
    history: [], // { question, userAnswer, grade }
  };

  function currentQ() {
    return session.questions[session.index];
  }

  function initAnswerForCurrent() {
    const q = currentQ();
    session.submitted = false;
    session.grade = null;
    session.cardFlipped = false;
    if (q.kind === 'multi') {
      session.userAnswer = [];
    } else if (q.kind === 'fill' || q.kind === 'command') {
      session.userAnswer = '';
    } else {
      session.userAnswer = null;
    }
  }

  initAnswerForCurrent();

  // ── Chấm điểm & Nộp bài ──────────────────────────────────────────────────

  function submitCurrent() {
    if (session.submitted) return;
    const q = currentQ();

    if (q.kind === 'single') {
      if (session.userAnswer === null) return;
      session.grade = gradeChoices([session.userAnswer], q.answers);
    } else if (q.kind === 'multi') {
      session.grade = gradeChoices(session.userAnswer || [], q.answers);
    } else if (q.kind === 'fill' || q.kind === 'command') {
      const inputVal = typeof session.userAnswer === 'string' ? session.userAnswer : '';
      session.grade = gradeText(inputVal, q.answers, q.match, { tolerance: q.tolerance });
    } else if (q.kind === 'card') {
      session.grade = { ok: Boolean(session.userAnswer), near: false };
    }

    session.submitted = true;
    session.history.push({
      question: q,
      userAnswer: session.userAnswer,
      grade: session.grade,
    });

    render();
  }

  function nextQuestion() {
    if (session.index < session.questions.length - 1) {
      session.index++;
      initAnswerForCurrent();
      render();
    } else {
      session.index = session.questions.length; // Chuyển sang màn hình kết quả
      render();
    }
  }

  // ── Xử lý phím tắt ────────────────────────────────────────────────────────

  function onKeyDown(ev) {
    // Nếu đang ở màn hình kết quả
    if (session.index >= session.questions.length) {
      if (ev.key === 'Enter') {
        const wrongItems = session.history.filter(h => !h.grade.ok);
        if (wrongItems.length) {
          actions.startSession(entry, { ...config, itemIds: wrongItems.map(h => h.question.id) });
        } else {
          actions.openDeckView(entry);
        }
      }
      return;
    }

    const q = currentQ();
    const inInput = ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA');

    if (session.submitted) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        nextQuestion();
      }
      return;
    }

    // Chưa nộp bài
    if (q.kind === 'single') {
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
    } else if (q.kind === 'multi') {
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
        ev.preventDefault();
        submitCurrent();
      }
    } else if (q.kind === 'fill' || q.kind === 'command') {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submitCurrent();
      }
    } else if (q.kind === 'card') {
      if (!session.cardFlipped) {
        if (ev.code === 'Space' || ev.key === ' ' || ev.key === 'Enter') {
          ev.preventDefault();
          session.cardFlipped = true;
          render();
        }
      } else {
        if (ev.key === '1') {
          ev.preventDefault();
          session.userAnswer = false;
          submitCurrent();
        } else if (ev.key === '2' || ev.key === 'Enter') {
          ev.preventDefault();
          session.userAnswer = true;
          submitCurrent();
        }
      }
    }
  }

  window.addEventListener('keydown', onKeyDown);
  activeCleanup = () => window.removeEventListener('keydown', onKeyDown);

  // ── Render màn hình kết quả ───────────────────────────────────────────────

  function renderResultView() {
    const total = session.history.length;
    const correct = session.history.filter(h => h.grade.ok && !h.grade.near).length;
    const near = session.history.filter(h => h.grade.ok && h.grade.near).length;
    const wrong = session.history.filter(h => !h.grade.ok).length;
    const pct = Math.round(((correct + near) / total) * 100);
    const wrongItems = session.history.filter(h => !h.grade.ok);

    root.replaceChildren(
      h('div', { class: 'session-container' },
        h('header', { class: 'page-head' },
          h('div', null,
            h('p', { class: 'eyebrow' }, 'KẾT QUẢ PHIÊN HỌC'),
            h('h1', null, entry.deck.meta.title))),
        h('div', { class: 'result-card panel' },
          h('div', { class: 'score-summary' },
            h('div', { class: 'score-big' }, `${pct}%`),
            h('div', { class: 'score-breakdown' },
              h('p', { class: 'score-text' }, `Đạt ${correct + near}/${total} câu`),
              h('div', { class: 'badges-row' },
                h('span', { class: 'badge ok' }, `✓ Đúng: ${correct}`),
                near ? h('span', { class: 'badge warn' }, `≈ Gần đúng: ${near}`) : null,
                h('span', { class: 'badge error' }, `✕ Sai: ${wrong}`)))),
          pct === 100
            ? h('div', { class: 'success-banner' }, '🎉 Xuất sắc! Bạn đã trả lời đúng toàn bộ câu hỏi.')
            : null,
          h('div', { class: 'result-actions toolbar' },
            wrongItems.length
              ? h('button', {
                  class: 'btn primary',
                  onclick: () => actions.startSession(entry, { ...config, itemIds: wrongItems.map(h => h.question.id) }),
                }, `Học lại câu sai (${wrongItems.length})`)
              : null,
            h('button', {
              class: wrongItems.length ? 'btn' : 'btn primary',
              onclick: () => actions.startSession(entry, config),
            }, 'Học lại toàn bộ'),
            h('button', { class: 'btn ghost', onclick: () => actions.openDeckView(entry) }, 'Về bộ thẻ'),
            h('button', { class: 'btn ghost', onclick: actions.home }, 'Về Home'))),
        wrongItems.length ? h('div', { class: 'wrong-list panel' },
          h('h2', null, `Chi tiết các câu cần lưu ý (${wrongItems.length})`),
          h('div', { class: 'wrong-items' }, wrongItems.map((item, idx) => {
            const q = item.question;
            let ansDisplay = '';
            if (q.kind === 'single' || q.kind === 'multi') {
              ansDisplay = q.answers.map(i => choiceText(q.choices[i])).join(' · ');
            } else if (q.kind === 'card') {
              ansDisplay = q.back;
            } else {
              ansDisplay = q.answerDisplay || q.answers.join(' | ');
            }

            return h('div', { class: 'wrong-item-box' },
              h('div', { class: 'wrong-item-head' },
                h('span', { class: 'chip' }, `#${idx + 1}`),
                q.topic ? h('span', { class: 'chip' }, q.topic) : null),
              richEl('div', { class: 'wrong-item-prompt' }, rich.html(q.prompt)),
              h('div', { class: 'wrong-item-detail' },
                item.userAnswer !== null && item.userAnswer !== undefined && q.kind !== 'card'
                  ? h('p', { class: 'user-ans' },
                      h('span', { class: 'muted' }, 'Bạn chọn/nhập: '),
                      h('span', { class: 'error-text' },
                        q.kind === 'single'
                          ? choiceText(q.choices[item.userAnswer])
                          : q.kind === 'multi'
                            ? (item.userAnswer || []).map(i => choiceText(q.choices[i])).join(' · ') || '(để trống)'
                            : String(item.userAnswer || '(để trống)')))
                  : null,
                h('p', { class: 'correct-ans' },
                  h('span', { class: 'muted' }, 'Đáp án đúng: '),
                  h('strong', null, ansDisplay))),
              q.explanation
                ? richEl('div', { class: 'explanation-box' }, rich.html(q.explanation))
                : null);
          }))) : null)
    );
  }

  // ── Render nội dung câu hỏi ───────────────────────────────────────────────

  function renderQuestionBody(q) {
    if (q.kind === 'single' || q.kind === 'multi') {
      const isMulti = q.kind === 'multi';
      return h('div', { class: 'choices-list' },
        q.choices.map((c, i) => {
          const text = choiceText(c);
          const isSelected = isMulti
            ? (session.userAnswer || []).includes(i)
            : session.userAnswer === i;

          let stateClass = '';
          if (session.submitted) {
            const isCorrect = q.answers.includes(i);
            if (isCorrect) stateClass = 'choice-correct';
            else if (isSelected) stateClass = 'choice-wrong';
          } else if (isSelected) {
            stateClass = 'choice-selected';
          }

          return h('label', {
            class: `choice-label ${stateClass}`,
            onclick: ev => {
              if (session.submitted) return;
              if (isMulti) {
                const set = new Set(session.userAnswer || []);
                if (set.has(i)) set.delete(i);
                else set.add(i);
                session.userAnswer = [...set];
              } else {
                session.userAnswer = i;
              }
              render();
            },
          },
            h('span', { class: 'choice-key' }, `${i + 1}`),
            h('input', {
              type: isMulti ? 'checkbox' : 'radio',
              name: `question-choice-${q.id}`,
              checked: isSelected,
              disabled: session.submitted,
              tabindex: '-1',
            }),
            richEl('span', { class: 'choice-text' }, rich.inline(text)));
        }));
    }

    if (q.kind === 'fill' || q.kind === 'command') {
      const isCmd = q.kind === 'command';
      let inputClass = 'input-text answer-input';
      if (isCmd) inputClass += ' font-mono';
      if (session.submitted) {
        inputClass += session.grade?.ok
          ? (session.grade.near ? ' input-near' : ' input-correct')
          : ' input-wrong';
      }

      return h('div', { class: 'input-area' },
        isCmd ? h('span', { class: 'cmd-prompt' }, '$') : null,
        h('input', {
          type: 'text',
          class: inputClass,
          placeholder: isCmd ? 'Nhập lệnh (vd: lspci)...' : 'Nhập câu trả lời...',
          value: session.userAnswer || '',
          disabled: session.submitted,
          autofocus: true,
          oninput: ev => { session.userAnswer = ev.target.value; },
        }));
    }

    if (q.kind === 'card') {
      return h('div', { class: 'flashcard-wrap' },
        h('div', {
          class: `flashcard ${session.cardFlipped ? 'flipped' : ''}`,
          onclick: () => {
            if (!session.cardFlipped && !session.submitted) {
              session.cardFlipped = true;
              render();
            }
          },
        },
          h('div', { class: 'card-face card-front' },
            h('span', { class: 'card-badge' }, 'Mặt trước'),
            richEl('div', { class: 'card-content' }, rich.html(q.front))),
          session.cardFlipped ? h('div', { class: 'card-face card-back' },
            h('span', { class: 'card-badge' }, 'Mặt sau'),
            richEl('div', { class: 'card-content' }, rich.html(q.back))) : null),
        !session.cardFlipped
          ? h('div', { class: 'card-hint' }, 'Bấm Space hoặc chạm vào thẻ để lật xem đáp án')
          : null);
    }

    return null;
  }

  // ── Render thanh phản hồi sau khi nộp ─────────────────────────────────────

  function renderFeedback(q) {
    if (!session.submitted) return null;
    const g = session.grade || { ok: false, near: false };

    let bannerClass = 'feedback-banner ';
    let icon = '';
    let title = '';

    if (g.ok && !g.near) {
      bannerClass += 'feedback-ok';
      icon = '✓';
      title = 'Chính xác!';
    } else if (g.ok && g.near) {
      bannerClass += 'feedback-near';
      icon = '≈';
      title = 'Gần đúng (chú ý lỗi chính tả / cách viết)';
    } else {
      bannerClass += 'feedback-wrong';
      icon = '✕';
      title = 'Chưa chính xác';
    }

    let correctDisplay = null;
    if (q.kind === 'fill' || q.kind === 'command') {
      const ansText = q.answerDisplay || q.answers.join(' | ');
      correctDisplay = h('div', { class: 'correct-display' },
        h('span', { class: 'muted' }, 'Đáp án đúng: '),
        h('strong', null, ansText));
    }

    return h('div', { class: 'feedback-section' },
      h('div', { class: bannerClass },
        h('span', { class: 'feedback-icon' }, icon),
        h('span', { class: 'feedback-text' }, title)),
      correctDisplay,
      q.explanation
        ? h('div', { class: 'explanation-box' },
            h('h4', null, 'Giải thích'),
            richEl('div', { class: 'explanation-body' }, rich.html(q.explanation)))
        : null);
  }

  // ── Render chính ─────────────────────────────────────────────────────────

  function render() {
    if (session.index >= session.questions.length) {
      renderResultView();
      return;
    }

    const q = currentQ();
    const total = session.questions.length;
    const num = session.index + 1;
    const progressPct = Math.round((num / total) * 100);

    const isLast = session.index === total - 1;

    // Các nút điều khiển dưới câu hỏi
    let actionsRow = null;
    if (!session.submitted) {
      if (q.kind === 'card') {
        if (!session.cardFlipped) {
          actionsRow = h('div', { class: 'session-actions' },
            h('button', {
              class: 'btn primary',
              onclick: () => { session.cardFlipped = true; render(); },
            }, 'Lật thẻ (Space)'));
        } else {
          actionsRow = h('div', { class: 'session-actions card-eval-buttons' },
            h('button', {
              class: 'btn error-btn',
              onclick: () => { session.userAnswer = false; submitCurrent(); },
            }, '✕ Chưa nhớ (1)'),
            h('button', {
              class: 'btn primary ok-btn',
              onclick: () => { session.userAnswer = true; submitCurrent(); },
            }, '✓ Đã nhớ (2 hoặc Enter)'));
        }
      } else {
        const canSubmit = q.kind === 'multi'
          ? (session.userAnswer && session.userAnswer.length > 0)
          : q.kind === 'single'
            ? session.userAnswer !== null
            : (session.userAnswer || '').trim().length > 0;

        actionsRow = h('div', { class: 'session-actions' },
          h('button', {
            class: 'btn primary',
            disabled: !canSubmit,
            onclick: submitCurrent,
          }, 'Nộp bài (Enter)'));
      }
    } else {
      actionsRow = h('div', { class: 'session-actions' },
        h('button', {
          class: 'btn primary',
          onclick: nextQuestion,
        }, isLast ? 'Xem kết quả (Enter) →' : 'Tiếp tục (Enter) →'));
    }

    root.replaceChildren(
      h('div', { class: 'session-container' },
        // Topbar
        h('div', { class: 'session-topbar' },
          h('button', {
            class: 'btn ghost small',
            onclick: () => {
              if (window.confirm('Bạn có chắc muốn thoát phiên học hiện tại?')) {
                actions.openDeckView(entry);
              }
            },
          }, '✕ Thoát'),
          h('div', { class: 'session-deck-title' }, entry.deck.meta.title),
          h('div', { class: 'session-progress-text' }, `Câu ${num} / ${total}`)),

        // Progress bar
        h('div', { class: 'progress-bar-wrap' },
          h('div', { class: 'progress-bar-fill', style: `width: ${progressPct}%` })),

        // Question Box
        h('div', { class: 'question-card panel' },
          h('div', { class: 'question-meta' },
            h('span', { class: `chip type-${q.kind}` }, q.kind),
            q.topic ? h('span', { class: 'chip' }, q.topic) : null,
            (q.tags || []).map(t => h('span', { class: 'tag' }, t))),
          richEl('div', { class: 'question-prompt' }, rich.html(q.prompt)),
          renderQuestionBody(q),
          renderFeedback(q),
          actionsRow))
    );

    // Auto-focus input nếu là câu điền / gõ lệnh
    if (!session.submitted && (q.kind === 'fill' || q.kind === 'command')) {
      const inputEl = root.querySelector('.answer-input');
      if (inputEl) inputEl.focus();
    }
  }

  render();
}

