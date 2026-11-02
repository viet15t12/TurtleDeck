// src/views/session.js — Màn hình phiên học & kết quả (GĐ3B Lượt 2).
// - Nhãn dạng tiếng Việt (Thẻ, Trắc nghiệm, Điền, Lệnh), không lộ chữ kỹ thuật (card/fill/SRS/Again).
// - Thanh tiến độ chia đoạn theo câu (xanh = đúng, đỏ = sai, viền nổi = câu hiện tại).
// - Thoát (Esc): chỉ hỏi xác nhận khi đã trả lời >= 1 câu ("Tiến độ đã được lưu theo từng câu...").
// - Thẻ lật: nút lớn "Hiện đáp án (Space)", hiệu ứng lật ~150ms, 4 nút chấm tiếng Việt kèm thời gian dự kiến & phím 1-4.
// - Phản hồi Điền/Lệnh: hai cột "Bạn trả lời" và "Đáp án đúng" (mỗi đáp án là một chip), thông báo thời gian hỏi lại tự nhiên.
// - Trắc nghiệm: sau khi nộp đánh dấu xanh + ✓ cho đáp án đúng, đỏ + ✗ cho lựa chọn sai đã chọn.
// - Màn Kết quả: vòng tròn tỉ lệ đúng SVG, thời gian, thông báo thẻ kế tiếp đến hạn, danh sách câu sai bấm xem lại, nút Học lại câu sai & Về trang chủ.
// - Học thử từ Editor (persist:false): dải "Học thử — không lưu tiến độ" ở đầu màn.

import { h } from './dom.js';
import { makeRich, assetUrl } from '../core/richtext.js';
import { buildSessionQuestions } from '../core/builder.js';
import { gradeText, gradeChoices } from '../core/grader.js';
import { itemTypeLabel } from '../core/deckkinds.js';
import {
  DAY,
  MINUTE,
  RATING,
  cardKey,
  newCard,
  ratingFromGrade,
  previewIntervalLabel,
} from '../core/srs.js';
import { planSession, reinsertWrong } from '../core/planner.js';
import { renderResult, formatNextIntervalText } from './result.js';
import { attachImageHandlers } from './components/lightbox.js';

let activeCleanup = null;

const choiceText = c => typeof c === 'string' ? c : [c?.text, c?.image ? `[ảnh ${c.image}]` : ''].filter(Boolean).join(' ');

const RATING_VN_LABELS = {
  1: 'Quên',
  2: 'Khó',
  3: 'Tốt',
  4: 'Dễ',
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

// Tạo danh sách chip đáp án chấp nhận (không nối bằng dấu |)
function buildAcceptedAnswerChips(q, rich) {
  const chips = [];
  const seen = new Set();
  if (q.answerDisplay && String(q.answerDisplay).trim()) {
    const disp = String(q.answerDisplay).trim();
    seen.add(disp);
    chips.push(richEl('span', { class: 'answer-chip correct-chip' }, rich.inline(disp)));
  }
  for (const ans of (q.answers || [])) {
    const s = String(ans ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    chips.push(richEl('span', { class: 'answer-chip correct-chip' }, rich.inline(s)));
  }
  return chips;
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

  const trialBanner = !persist
    ? h('div', { class: 'trial-banner', role: 'status' },
        h('span', { class: 'trial-banner-dot' }, '●'),
        h('span', null, 'Học thử — không lưu tiến độ'))
    : null;

  if (!questions.length) {
    root.replaceChildren(
      h('div', { class: 'session-container' },
        trialBanner,
        h('div', { class: 'empty' },
          h('h2', null, isSrsMode ? '🎉 Bạn đã hoàn thành lịch ôn hôm nay!' : 'Không có mục nào để học'),
          h('p', { class: 'muted' },
            isSrsMode
              ? 'Hiện không còn thẻ nào đến hạn ôn tập hoặc thẻ mới trong hạn mức hôm nay. Bạn có thể quay lại vào ngày mai hoặc chọn luyện tập tự do.'
              : 'Bộ thẻ không có mục hợp lệ hoặc danh sách mục cần học đang trống.'),
          h('div', { class: 'toolbar', style: 'justify-content: center; margin-top: 16px;' },
            isSrsMode
              ? h('button', { type: 'button', class: 'ux-btn primary', onclick: () => actions.openSessionSetup(entry) }, 'Luyện tập tự do')
              : null,
            h('button', { type: 'button', class: isSrsMode ? 'ux-btn' : 'ux-btn primary', onclick: () => actions.openDeckView(entry) }, '← Quay lại bộ thẻ'),
            h('button', { type: 'button', class: 'ux-btn ghost', onclick: actions.home }, 'Về trang chủ'))))
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
    nextIntervalText: '',
    questionStartedAt: Date.now(),
    history: [], // { question, userAnswer, grade, rating, ms, qIndex }
    slotResults: new Map(), // index -> boolean (true = đúng, false = sai)
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
    session.nextIntervalText = '';
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

  // Thoát phiên học (chỉ hỏi khi đã trả lời >= 1 câu)
  function requestExit() {
    if (session.history.length >= 1 && session.index < session.questions.length) {
      const msg = persist
        ? 'Tiến độ đã được lưu theo từng câu. Bạn có muốn thoát phiên học ngay bây giờ?'
        : 'Bạn đang ở chế độ Học thử (không lưu tiến độ). Bạn có muốn thoát phiên học ngay bây giờ?';
      if (!window.confirm(msg)) return;
    }
    actions.openDeckView(entry);
  }

  // ── Chấm điểm & Nộp bài ───────────────────────────────────────────────────

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
    const prevCard = currentCardState(q);
    session.nextIntervalText = previewIntervalLabel(prevCard, rating, now, { learnSteps });

    // Cập nhật tiến độ và ghi log (bỏ qua nếu persist === false khi Học thử từ Editor)
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
      if (res?.card) {
        q.card = res.card;
        session.nextIntervalText = formatNextIntervalText(res.card, now);
      }
    }

    session.slotResults.set(session.index, Boolean(session.grade.ok));

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

  // ── Render màn hình kết quả (Result view) ─────────────────────────────────

  function renderResultView() {
    renderResult(root, {
      entry,
      config,
      history: session.history,
      progress,
      isTrial: !persist,
    }, actions);
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
          let statusMark = null;
          if (session.submitted) {
            const isCorrect = q.answers.includes(i);
            if (isCorrect) {
              stateClass = 'choice-correct';
              statusMark = h('span', { class: 'choice-mark mark-ok', title: 'Đáp án đúng' }, '✓');
            } else if (isSelected) {
              stateClass = 'choice-wrong';
              statusMark = h('span', { class: 'choice-mark mark-wrong', title: 'Lựa chọn sai' }, '✗');
            }
          } else if (isSelected) {
            stateClass = 'choice-selected';
          }

          return h('div', {
            class: `choice-label ${stateClass}`,
            role: isMulti ? 'checkbox' : 'radio',
            'aria-checked': isSelected,
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
              text ? richEl('span', { class: 'choice-text' }, rich.inline(text)) : null),
            statusMark);
        }));
    }

    if (q.kind === 'fill' || q.kind === 'command') {
      const isCmd = q.kind === 'command';
      let inputClass = 'ux-input answer-input';
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
            h('span', { class: 'card-badge card-badge-back' }, 'Mặt sau · Đáp án'),
            richEl('div', { class: 'card-content' }, rich.html(q.back)),
            backImgUrl ? h('img', { class: 'rich-img card-img', src: backImgUrl, alt: 'Hình ảnh mặt sau' }) : null) : null));
    }

    return null;
  }

  // ── Render thanh phản hồi sau khi nộp ─────────────────────────────────────

  function renderFeedback(q) {
    if (!session.submitted) return null;
    const g = session.grade || { ok: false, near: false };
    const waitText = session.nextIntervalText || '1 phút';

    let bannerClass = 'feedback-banner ';
    let icon = '';
    let title = '';

    if (q.kind === 'card' && g.rating) {
      if (g.rating === RATING.AGAIN) {
        bannerClass += 'feedback-wrong';
        icon = '↻';
        title = `Đã chọn: ${RATING_VN_LABELS[g.rating]} — Sẽ hỏi lại sau ~${waitText}`;
      } else {
        bannerClass += 'feedback-ok';
        icon = '✓';
        title = `Đã chọn: ${RATING_VN_LABELS[g.rating]} — Hỏi lại sau ${waitText}`;
      }
    } else if (g.ok && !g.near) {
      bannerClass += 'feedback-ok';
      icon = '✓';
      title = `Chính xác! — Hỏi lại sau ${waitText}`;
    } else if (g.ok && g.near) {
      bannerClass += 'feedback-near';
      icon = '≈';
      const standardAns = q.answerDisplay || (q.answers && q.answers[0]) || '';
      title = `Gần đúng — chú ý chính tả: ${standardAns} · Hỏi lại sau ${waitText}`;
    } else {
      bannerClass += 'feedback-wrong';
      icon = '✕';
      title = `Chưa chính xác — Sẽ hỏi lại sau ~${waitText}`;
    }

    // Phản hồi hai cột cho Điền / Lệnh: "Bạn trả lời" và "Đáp án đúng" (mỗi đáp án chấp nhận là 1 chip)
    let compareGrid = null;
    if (q.kind === 'fill' || q.kind === 'command') {
      const userText = String(session.userAnswer || '').trim() || '(để trống)';
      const userChipCls = g.ok ? (g.near ? 'near-chip' : 'correct-chip') : 'wrong-chip';
      const acceptedChips = buildAcceptedAnswerChips(q, rich);

      compareGrid = h('div', { class: 'feedback-compare-grid' },
        h('div', { class: 'feedback-compare-col' },
          h('div', { class: 'feedback-col-label' }, 'Bạn trả lời'),
          h('div', { class: 'answer-chips-wrap' },
            h('span', { class: `answer-chip ${userChipCls} ${q.kind === 'command' ? 'font-mono' : ''}` }, userText))),
        h('div', { class: 'feedback-compare-col' },
          h('div', { class: 'feedback-col-label' }, 'Đáp án đúng'),
          h('div', { class: 'answer-chips-wrap' }, ...acceptedChips)));
    }

    const answerImgUrl = q.answerImage && q.kind !== 'card' ? assetUrl(q.answerImage, entry.deckKey) : null;

    return h('div', { class: 'feedback-section' },
      h('div', { class: bannerClass },
        h('span', { class: 'feedback-icon' }, icon),
        h('span', { class: 'feedback-text' }, title)),
      compareGrid,
      answerImgUrl ? h('div', { class: 'answer-img-wrap' },
        h('img', { class: 'rich-img', src: answerImgUrl, alt: 'Hình ảnh đáp án' })) : null,
      q.explanation
        ? h('div', { class: 'explanation-box' },
            h('h4', null, 'Giải thích'),
            richEl('div', { class: 'explanation-body' }, rich.html(q.explanation)))
        : null);
  }

  // ── Render thanh tiến độ chia đoạn theo câu ───────────────────────────────

  function renderSegmentedProgressBar(total) {
    const segs = [];
    for (let i = 0; i < total; i++) {
      let cls = 'session-seg';
      if (session.slotResults.has(i)) {
        cls += session.slotResults.get(i) ? ' seg-ok' : ' seg-wrong';
      }
      if (i === session.index) {
        cls += ' seg-current';
      }
      segs.push(h('div', { class: cls, title: `Câu ${i + 1}` }));
    }
    return h('div', { class: 'session-seg-bar', role: 'progressbar', 'aria-valuenow': session.index + 1, 'aria-valuemax': total }, ...segs);
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
    const isLast = session.index === total - 1;

    // Các nút điều khiển dưới câu hỏi
    let actionsRow = null;
    let shortcutFooter = null;

    if (!session.submitted) {
      if (q.kind === 'card') {
        if (!session.cardFlipped) {
          actionsRow = h('div', { class: 'session-actions session-actions-center' },
            h('button', {
              type: 'button',
              class: 'ux-btn primary flashcard-reveal-btn',
              onclick: () => { session.cardFlipped = true; render(); },
            }, 'Hiện đáp án (Space)'));
          shortcutFooter = h('div', { class: 'session-key-hints' }, 'Phím tắt: Space / Enter để hiện đáp án · Esc để thoát');
        } else {
          const cardState = currentCardState(q);
          const now = Date.now();
          const makeRateBtn = (rating, keyHint, label, cls) => {
            const nextLabel = previewIntervalLabel(cardState, rating, now, { learnSteps });
            return h('button', {
              type: 'button',
              class: `ux-btn srs-rate-btn ${cls}`,
              onclick: () => submitCurrent(rating),
            },
              h('span', { class: 'srs-rate-time' }, nextLabel),
              h('span', { class: 'srs-rate-title' }, `${keyHint} · ${label}`));
          };

          actionsRow = h('div', { class: 'session-actions card-eval-buttons' },
            makeRateBtn(RATING.AGAIN, '1', 'Quên', 'rate-again'),
            makeRateBtn(RATING.HARD, '2', 'Khó', 'rate-hard'),
            makeRateBtn(RATING.GOOD, '3', 'Tốt', 'rate-good'),
            makeRateBtn(RATING.EASY, '4', 'Dễ', 'rate-easy'));
          shortcutFooter = h('div', { class: 'session-key-hints' }, 'Phím tắt: 1 Quên · 2 Khó · 3 Tốt (hoặc Space) · 4 Dễ · Esc Thoát');
        }
      } else {
        const canSubmit = q.kind === 'multi'
          ? (session.userAnswer && session.userAnswer.length > 0)
          : q.kind === 'single'
            ? session.userAnswer !== null
            : (session.userAnswer || '').trim().length > 0;

        actionsRow = h('div', { class: 'session-actions' },
          h('button', {
            type: 'button',
            class: 'ux-btn primary',
            disabled: !canSubmit,
            onclick: () => submitCurrent(),
          }, 'Nộp bài (Enter)'));
        shortcutFooter = h('div', { class: 'session-key-hints' },
          (q.kind === 'single' || q.kind === 'multi')
            ? 'Phím tắt: 1–9 chọn đáp án · Enter nộp bài · Esc thoát'
            : 'Phím tắt: Enter nộp bài · Esc thoát');
      }
    } else {
      actionsRow = h('div', { class: 'session-actions' },
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: nextQuestion,
        }, isLast ? 'Xem kết quả (Enter) →' : 'Tiếp tục (Enter) →'));
      shortcutFooter = h('div', { class: 'session-key-hints' }, 'Phím tắt: Enter tiếp tục · Esc thoát');
    }

    const questionImgUrl = q.image && q.kind !== 'card' ? assetUrl(q.image, entry.deckKey) : null;
    const catLabels = { due: 'Đến hạn', learning: 'Đang học', new: 'Mục mới' };

    root.replaceChildren(
      h('div', { class: 'session-container' },
        trialBanner,
        // Topbar
        h('div', { class: 'session-topbar' },
          h('button', {
            type: 'button',
            class: 'ux-btn ghost sm',
            onclick: requestExit,
          }, '✕ Thoát (Esc)'),
          h('div', { class: 'session-deck-title' }, entry.deck.meta.title),
          h('div', { class: 'session-progress-text' }, `Câu ${num} / ${total}`)),

        // Thanh tiến độ chia đoạn
        renderSegmentedProgressBar(total),

        // Khung câu hỏi
        h('div', { class: 'question-card panel' },
          h('div', { class: 'question-meta' },
            h('span', { class: `chip type-badge type-${q.kind}` }, itemTypeLabel(q.kind)),
            q.category ? h('span', { class: `badge srs-cat-${q.category}` }, catLabels[q.category] || q.category) : null,
            q.retry ? h('span', { class: 'badge warn' }, '↻ Ôn lại câu sai') : null,
            q.topic ? h('span', { class: 'chip' }, q.topic) : null,
            (q.tags || []).map(t => h('span', { class: 'tag' }, t))),
          q.kind !== 'card' ? richEl('div', { class: 'question-prompt' }, rich.html(q.prompt)) : null,
          (q.kind !== 'card' && questionImgUrl) ? h('div', { class: 'question-img-wrap' },
            h('img', { class: 'rich-img', src: questionImgUrl, alt: 'Hình ảnh câu hỏi' })) : null,
          renderQuestionBody(q),
          renderFeedback(q),
          actionsRow,
          shortcutFooter))
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
