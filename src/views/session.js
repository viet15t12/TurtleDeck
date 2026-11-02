// src/views/session.js — màn hình phiên học & kết quả (single, multi, fill, command, card + SRS).
// GĐ2B: hỗ trợ KaTeX, ảnh qua asset://, choices {text, image}, answerDisplay, lightbox.
// GĐ3: tích hợp SRS (Again/Hard/Good/Easy), planner due→learning→new, chèn lại câu sai sau 3–7 câu, persist:false cho Học thử.
import { h } from './dom.js';
import { makeRich, assetUrl } from '../core/richtext.js';
import { buildSessionQuestions } from '../core/builder.js';
import { gradeText, gradeChoices } from '../core/grader.js';
import {
  RATING,
  cardKey,
  newCard,
  ratingFromGrade,
  previewIntervalLabel,
} from '../core/srs.js';
import { planSession, reinsertWrong } from '../core/planner.js';

let activeCleanup = null;

const choiceText = c => typeof c === 'string' ? c : [c?.text, c?.image ? `[ảnh ${c.image}]` : ''].filter(Boolean).join(' ');

const RATING_LABELS = {
  1: 'Quên (Again)',
  2: 'Khó (Hard)',
  3: 'Tốt (Good)',
  4: 'Dễ (Easy)',
};

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

// Lightbox xem ảnh phóng to (Esc hoặc bấm ngoài để đóng)
function showLightbox(src, alt) {
  const backdrop = h('div', { class: 'lightbox-backdrop' },
    h('div', { class: 'lightbox-box' },
      h('button', { class: 'lightbox-close', title: 'Đóng (Esc)', onclick: close }, '✕'),
      h('img', { class: 'lightbox-img', src, alt: alt || 'Ảnh' }),
      alt ? h('div', { class: 'lightbox-caption' }, alt) : null));

  function close() {
    window.removeEventListener('keydown', onEsc);
    backdrop.remove();
  }

  function onEsc(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  backdrop.onclick = e => {
    if (e.target === backdrop) close();
  };

  window.addEventListener('keydown', onEsc);
  document.body.append(backdrop);
}

// Gắn sự kiện click mở lightbox và xử lý ảnh lỗi
function attachImageHandlers(container) {
  container.querySelectorAll('img.rich-img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.onclick = ev => {
      ev.stopPropagation();
      showLightbox(img.src, img.alt);
    };
    img.onerror = () => {
      const missing = document.createElement('span');
      missing.className = 'img-missing';
      missing.textContent = `[Không tìm thấy ảnh: ${img.alt || img.getAttribute('src') || ''}]`;
      img.replaceWith(missing);
    };
  });
}

export function renderSession(root, { entry, config = {}, progress, settings, onRecordReview }, actions) {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }

  const persist = config.persist !== false;
  const isSrsMode = config.mode === 'srs';
  const deckId = entry.deck.meta?.id || 'deck';
  const deckKind = entry.deck.meta?.kind;
  const learnSteps = settings?.learnSteps;
  const newCardsPerDay = settings?.newCardsPerDay;

  const rich = makeRich(entry.deckKey);

  const questions = isSrsMode
    ? planSession(entry.deck, progress, Date.now(), {
        newCardsPerDay,
        learnSteps,
        count: config.count,
      })
    : buildSessionQuestions(entry.deck.items, {
        count: config.count,
        shuffle: Boolean(config.shuffle),
        itemIds: config.itemIds,
        deckKind,
      });

  if (!questions.length) {
    root.replaceChildren(
      h('div', { class: 'session-container' },
        h('div', { class: 'empty' },
          h('h2', null, isSrsMode ? '🎉 Bạn đã hoàn thành lịch ôn hôm nay!' : 'Không có câu hỏi nào để học'),
          h('p', { class: 'muted' },
            isSrsMode
              ? 'Hiện không còn thẻ nào đến hạn ôn tập hoặc thẻ mới trong hạn mức hôm nay. Bạn có thể quay lại vào ngày mai hoặc chọn học tự do.'
              : 'Bộ thẻ không có câu hỏi hợp lệ hoặc danh sách câu cần học rỗng.'),
          h('div', { class: 'toolbar', style: 'justify-content: center; margin-top: 16px;' },
            isSrsMode
              ? h('button', { class: 'btn primary', onclick: () => actions.openSessionSetup(entry) }, 'Học tuỳ chọn')
              : null,
            h('button', { class: isSrsMode ? 'btn' : 'btn primary', onclick: () => actions.openDeckView(entry) }, '← Quay lại bộ thẻ'),
            h('button', { class: 'btn ghost', onclick: actions.home }, 'Về Home'))))
    );
    return;
  }

  const session = {
    index: 0,
    questions,
    userAnswer: null, // single: index, multi: array of indices, fill/command: string, card: boolean
    submitted: false,
    cardFlipped: false,
    grade: null, // { ok, near, rating }
    questionStartedAt: Date.now(),
    history: [], // { question, userAnswer, grade, rating, ms }
  };

  function currentQ() {
    return session.questions[session.index];
  }

  function currentCardState(q) {
    const key = cardKey(deckId, q.id, q.direction || 'fwd');
    return progress?.cards?.[key] || q.card || newCard();
  }

  function initAnswerForCurrent() {
    const q = currentQ();
    session.submitted = false;
    session.grade = null;
    session.cardFlipped = false;
    session.questionStartedAt = Date.now();
    if (q.kind === 'multi') {
      session.userAnswer = [];
    } else if (q.kind === 'fill' || q.kind === 'command') {
      session.userAnswer = '';
    } else {
      session.userAnswer = null;
    }
  }

  initAnswerForCurrent();

  // ── Chấm điểm, SRS & Nộp bài ─────────────────────────────────────────────

  function submitCurrent(explicitRating) {
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
      const r = explicitRating ?? (session.userAnswer ? RATING.GOOD : RATING.AGAIN);
      session.userAnswer = r !== RATING.AGAIN;
      session.grade = { ok: r !== RATING.AGAIN, near: false, rating: r };
    }

    const rating = ratingFromGrade(session.grade, explicitRating ?? session.grade?.rating);
    session.grade = { ...session.grade, rating };

    const now = Date.now();
    const ms = Math.max(0, now - (session.questionStartedAt || now));

    // Cập nhật tiến độ SRS và ghi log (bỏ qua nếu persist === false khi Học thử từ Editor)
    if (onRecordReview) {
      const res = onRecordReview({
        deckId,
        itemId: q.id,
        direction: q.direction || 'fwd',
        rating,
        ms,
        now,
        learnSteps,
        persist,
      });
      if (res?.card) q.card = res.card;
    }

    // Câu sai: chèn lại sau 3–7 câu khác trong cùng phiên (tối đa 3 lần lặp lại mỗi câu trong 1 phiên)
    if (!session.grade.ok && (q.retryCount || 0) < 3) {
      reinsertWrong(session.questions, session.index);
    }

    session.submitted = true;
    session.history.push({
      question: q,
      userAnswer: session.userAnswer,
      grade: session.grade,
      rating,
      ms,
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
    if (document.querySelector('.lightbox-backdrop')) {
      return; // Đang mở lightbox thì không chuyển câu
    }

    // Nếu đang ở màn hình kết quả
    if (session.index >= session.questions.length) {
      if (ev.key === 'Enter') {
        const wrongIds = [...new Set(session.history.filter(h => !h.grade.ok).map(h => h.question.id))];
        if (wrongIds.length) {
          actions.startSession(entry, { ...config, mode: 'custom', itemIds: wrongIds });
        } else {
          actions.openDeckView(entry);
        }
      }
      return;
    }

    const q = currentQ();

    if (session.submitted) {
      if (ev.key === 'Enter' || (q.kind === 'card' && (ev.code === 'Space' || ev.key === ' '))) {
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
  }

  window.addEventListener('keydown', onKeyDown);
  activeCleanup = () => window.removeEventListener('keydown', onKeyDown);

  // ── Render màn hình kết quả ───────────────────────────────────────────────

  function renderResultView() {
    const total = session.history.length;
    const correct = session.history.filter(h => h.grade.ok && !h.grade.near).length;
    const near = session.history.filter(h => h.grade.ok && h.grade.near).length;
    const wrong = session.history.filter(h => !h.grade.ok).length;
    const pct = total ? Math.round(((correct + near) / total) * 100) : 100;
    const wrongItems = session.history.filter(h => !h.grade.ok);
    const uniqueWrongIds = [...new Set(wrongItems.map(h => h.question.id))];

    root.replaceChildren(
      h('div', { class: 'session-container' },
        h('header', { class: 'page-head' },
          h('div', null,
            h('p', { class: 'eyebrow' }, 'KẾT QUẢ PHIÊN HỌC'),
            h('h1', null, entry.deck.meta.title,
              !persist ? h('span', { class: 'badge unsaved' }, 'Học thử · không lưu tiến độ') : null))),
        h('div', { class: 'result-card panel' },
          h('div', { class: 'score-summary' },
            h('div', { class: 'score-big' }, `${pct}%`),
            h('div', { class: 'score-breakdown' },
              h('p', { class: 'score-text' }, `Đạt ${correct + near}/${total} lượt trả lời`),
              h('div', { class: 'badges-row' },
                h('span', { class: 'badge ok' }, `✓ Đúng: ${correct}`),
                near ? h('span', { class: 'badge warn' }, `≈ Gần đúng: ${near}`) : null,
                h('span', { class: 'badge error' }, `✕ Sai: ${wrong}`)))),
          pct === 100
            ? h('div', { class: 'success-banner' }, '🎉 Xuất sắc! Bạn đã trả lời đúng toàn bộ câu hỏi.')
            : null,
          h('div', { class: 'result-actions toolbar' },
            uniqueWrongIds.length
              ? h('button', {
                  class: 'btn primary',
                  onclick: () => actions.startSession(entry, { ...config, mode: 'custom', itemIds: uniqueWrongIds }),
                }, `Học lại câu sai (${uniqueWrongIds.length})`)
              : null,
            h('button', {
              class: uniqueWrongIds.length ? 'btn' : 'btn primary',
              onclick: () => actions.startSession(entry, config),
            }, 'Học lại phiên này'),
            h('button', { class: 'btn ghost', onclick: () => actions.openDeckView(entry) }, 'Về bộ thẻ'),
            h('button', { class: 'btn ghost', onclick: actions.home }, 'Về Home'))),
        wrongItems.length ? h('div', { class: 'wrong-list panel' },
          h('h2', null, `Chi tiết các lượt cần lưu ý (${wrongItems.length})`),
          h('div', { class: 'wrong-items' }, wrongItems.map((item, idx) => {
            const q = item.question;
            const ansDisplay = q.answerDisplay
              ? q.answerDisplay
              : (q.kind === 'single' || q.kind === 'multi')
                ? q.answers.map(i => choiceText(q.choices[i])).join(' · ')
                : (q.kind === 'card')
                  ? q.back
                  : q.answers.join(' | ');

            return h('div', { class: 'wrong-item-box' },
              h('div', { class: 'wrong-item-head' },
                h('span', { class: 'chip' }, `#${idx + 1}`),
                q.topic ? h('span', { class: 'chip' }, q.topic) : null),
              richEl('div', { class: 'wrong-item-prompt' }, rich.html(q.prompt)),
              h('div', { class: 'wrong-item-detail' },
                item.userAnswer !== null && item.userAnswer !== undefined && q.kind !== 'card'
                  ? h('div', { class: 'user-ans' },
                      h('span', { class: 'muted' }, 'Bạn chọn/nhập: '),
                      h('span', { class: 'error-text' },
                        q.kind === 'single'
                          ? choiceText(q.choices[item.userAnswer])
                          : q.kind === 'multi'
                            ? (item.userAnswer || []).map(i => choiceText(q.choices[i])).join(' · ') || '(để trống)'
                            : String(item.userAnswer || '(để trống)')))
                  : null,
                h('div', { class: 'correct-ans' },
                  h('span', { class: 'muted' }, 'Đáp án đúng: '),
                  richEl('span', null, rich.inline(ansDisplay)))),
              q.explanation
                ? richEl('div', { class: 'explanation-box' }, rich.html(q.explanation))
                : null);
          }))) : null)
    );

    attachImageHandlers(root);
  }

  // ── Render nội dung câu hỏi ───────────────────────────────────────────────

  function renderQuestionBody(q) {
    if (q.kind === 'single' || q.kind === 'multi') {
      const isMulti = q.kind === 'multi';
      const hasImages = q.choices.some(c => c && typeof c === 'object' && c.image);
      const isMultiCol = hasImages || q.choices.length >= 4;
      return h('div', { class: `choices-list ${isMultiCol ? 'choices-multi-col' : ''}` },
        q.choices.map((c, i) => {
          const isObj = c && typeof c === 'object';
          const text = isObj ? (c.text ?? '') : String(c ?? '');
          const imgUrl = isObj && c.image ? assetUrl(c.image, entry.deckKey) : null;

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
            onclick: () => {
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
            h('div', { class: 'choice-content' },
              imgUrl ? h('img', { class: 'rich-img choice-img', src: imgUrl, alt: text || `Lựa chọn ${i + 1}` }) : null,
              text ? richEl('span', { class: 'choice-text' }, rich.inline(text)) : null));
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
      const frontImgUrl = q.image ? assetUrl(q.image, entry.deckKey) : null;
      const backImgUrl = q.answerImage ? assetUrl(q.answerImage, entry.deckKey) : null;

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
            richEl('div', { class: 'card-content' }, rich.html(q.front)),
            frontImgUrl ? h('img', { class: 'rich-img card-img', src: frontImgUrl, alt: 'Hình ảnh mặt trước' }) : null),
          session.cardFlipped ? h('div', { class: 'card-face card-back' },
            h('span', { class: 'card-badge' }, 'Mặt sau'),
            richEl('div', { class: 'card-content' }, rich.html(q.back)),
            backImgUrl ? h('img', { class: 'rich-img card-img', src: backImgUrl, alt: 'Hình ảnh mặt sau' }) : null) : null),
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

    if (q.kind === 'card' && g.rating) {
      if (g.rating === RATING.AGAIN) {
        bannerClass += 'feedback-wrong';
        icon = '↻';
        title = `Đã chọn: ${RATING_LABELS[g.rating]} — Thẻ sẽ được nhắc lại sau vài câu`;
      } else {
        bannerClass += 'feedback-ok';
        icon = '✓';
        title = `Đã chấm: ${RATING_LABELS[g.rating]}`;
      }
    } else if (g.ok && !g.near) {
      bannerClass += 'feedback-ok';
      icon = '✓';
      title = 'Chính xác! (SRS: Tốt / Good)';
    } else if (g.ok && g.near) {
      bannerClass += 'feedback-near';
      icon = '≈';
      title = 'Gần đúng — hãy chú ý lỗi chính tả / cách viết! (SRS: Tốt / Good)';
    } else {
      bannerClass += 'feedback-wrong';
      icon = '✕';
      title = 'Chưa chính xác — câu hỏi sẽ quay lại sau vài câu (SRS: Học lại / Again)';
    }

    let correctDisplay = null;
    if (q.kind === 'fill' || q.kind === 'command') {
      const ansDisplay = q.answerDisplay || q.answers.join(' | ');
      correctDisplay = h('div', { class: 'correct-display' },
        h('span', { class: 'muted' }, 'Đáp án đúng: '),
        richEl('strong', null, rich.inline(ansDisplay)));
    }

    const answerImgUrl = q.answerImage && q.kind !== 'card' ? assetUrl(q.answerImage, entry.deckKey) : null;

    return h('div', { class: 'feedback-section' },
      h('div', { class: bannerClass },
        h('span', { class: 'feedback-icon' }, icon),
        h('span', { class: 'feedback-text' }, title)),
      correctDisplay,
      answerImgUrl ? h('div', { class: 'answer-img-wrap' },
        h('img', { class: 'rich-img', src: answerImgUrl, alt: 'Hình ảnh đáp án' })) : null,
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
          const cardState = currentCardState(q);
          const now = Date.now();
          const makeRateBtn = (rating, keyHint, label, cls) => {
            const nextLabel = previewIntervalLabel(cardState, rating, now, { learnSteps });
            return h('button', {
              class: `btn srs-rate-btn ${cls}`,
              onclick: () => submitCurrent(rating),
            },
              h('span', { class: 'srs-rate-time' }, nextLabel),
              h('span', { class: 'srs-rate-title' }, `${keyHint} · ${label}`));
          };

          actionsRow = h('div', { class: 'session-actions card-eval-buttons' },
            makeRateBtn(RATING.AGAIN, '1', 'Again (Quên)', 'rate-again'),
            makeRateBtn(RATING.HARD, '2', 'Hard (Khó)', 'rate-hard'),
            makeRateBtn(RATING.GOOD, '3', 'Good (Tốt)', 'rate-good'),
            makeRateBtn(RATING.EASY, '4', 'Easy (Dễ)', 'rate-easy'));
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
            onclick: () => submitCurrent(),
          }, 'Nộp bài (Enter)'));
      }
    } else {
      actionsRow = h('div', { class: 'session-actions' },
        h('button', {
          class: 'btn primary',
          onclick: nextQuestion,
        }, isLast ? 'Xem kết quả (Enter) →' : 'Tiếp tục (Enter) →'));
    }

    const questionImgUrl = q.image && q.kind !== 'card' ? assetUrl(q.image, entry.deckKey) : null;
    const catLabels = { due: 'Đến hạn', learning: 'Đang học', new: 'Thẻ mới' };

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
          h('div', { class: 'session-deck-title' },
            entry.deck.meta.title,
            !persist ? h('span', { class: 'badge unsaved' }, 'Học thử · không lưu tiến độ') : null),
          h('div', { class: 'session-progress-text' }, `Câu ${num} / ${total}`)),

        // Progress bar
        h('div', { class: 'progress-bar-wrap' },
          h('div', { class: 'progress-bar-fill', style: `width: ${progressPct}%` })),

        // Question Box
        h('div', { class: 'question-card panel' },
          h('div', { class: 'question-meta' },
            h('span', { class: `chip type-${q.kind}` }, q.kind),
            q.category ? h('span', { class: `badge srs-cat-${q.category}` }, catLabels[q.category] || q.category) : null,
            q.retry ? h('span', { class: 'badge warn' }, '↻ Ôn lại câu sai') : null,
            q.topic ? h('span', { class: 'chip' }, q.topic) : null,
            (q.tags || []).map(t => h('span', { class: 'tag' }, t))),
          q.kind !== 'card' ? richEl('div', { class: 'question-prompt' }, rich.html(q.prompt)) : null,
          (q.kind !== 'card' && questionImgUrl) ? h('div', { class: 'question-img-wrap' },
            h('img', { class: 'rich-img', src: questionImgUrl, alt: 'Hình ảnh câu hỏi' })) : null,
          renderQuestionBody(q),
          renderFeedback(q),
          actionsRow))
    );

    attachImageHandlers(root);

    // Auto-focus input nếu là câu điền / gõ lệnh
    if (!session.submitted && (q.kind === 'fill' || q.kind === 'command')) {
      const inputEl = root.querySelector('.answer-input');
      if (inputEl) inputEl.focus();
    }
  }

  render();
}
