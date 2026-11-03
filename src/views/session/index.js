// src/views/session/index.js — Màn hình phiên học & kết quả (ghép các module con)

import { h } from '../dom.js';
import { makeRich, assetUrl } from '../../core/richtext.js';
import { itemTypeLabel } from '../../core/deckkinds.js';
import { cardKey, newCard } from '../../core/srs.js';
import { renderResult } from '../result.js';
import { attachImageHandlers } from '../components/lightbox.js';
import { speak } from '../../tts.js';
import { setShortcutScope } from '../../shortcuts.js';
import { richEl } from './answer-chips.js';
import { catLabels } from './labels.js';
import { createQuestions } from './build-questions.js';
import { renderEmptySession } from './empty-view.js';
import { createSessionState, resetForQuestion } from './session-state.js';
import { submitCurrentQuestion, overrideAsCorrect } from './submit.js';
import { getItemMeta, setItemStarred, setItemNote } from './item-meta.js';
import { createKeyHandler } from './keyboard.js';
import { renderSegmentedProgressBar } from './progress-bar.js';
import { renderQuestionBody } from './question/index.js';
import { renderFeedback } from './feedback/index.js';
import { renderActionsRow } from './actions-row.js';

let activeCleanup = null;

export function disposeSession() {
  if (activeCleanup) {
    activeCleanup();
    activeCleanup = null;
  }
}

export function renderSession(root, { entry, config = {}, progress, settings, onRecordReview }, actions) {
  disposeSession();

  const persist = config.persist !== false;
  const isSrsMode = config.mode === 'srs';
  const deckId = entry.deck.meta?.id || 'deck';
  const learnSteps = settings?.learnSteps;
  const rich = makeRich(entry.deckKey);

  const questions = createQuestions({ entry, config, progress, settings });

  const trialBanner = !persist
    ? h(
        'div',
        { class: 'trial-banner', role: 'status' },
        h('span', { class: 'trial-banner-dot' }, '●'),
        h('span', null, 'Học thử — không lưu tiến độ')
      )
    : null;

  if (!questions.length) {
    renderEmptySession(root, { trialBanner, isSrsMode, entry, actions });
    return;
  }

  let autoPlayAudio = true;
  const session = createSessionState(questions);

  function currentQ() {
    return session.questions[session.index];
  }

  function currentCardState(q) {
    const key = cardKey(deckId, q.id, q.direction || 'fwd');
    return progress?.cards?.[key] || q.card || newCard();
  }

  function initAnswerForCurrent() {
    const q = currentQ();
    resetForQuestion(session, q);
    if (q.kind === 'listen' && autoPlayAudio && q.listenText) {
      setTimeout(() => {
        speak(q.listenText, settings?.ttsLang || 'en-US');
      }, 150);
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

  function submitCurrent(explicitRating) {
    submitCurrentQuestion(
      session,
      {
        deckId,
        persist,
        learnSteps,
        progress,
        onRecordReview,
      },
      explicitRating
    );
    render();
  }

  function handleOverride() {
    overrideAsCorrect(session, {
      deckId,
      persist,
      learnSteps,
      progress,
    });
    render();
  }

  function getCurrentMetaWrapper() {
    const q = currentQ();
    if (!q) return { starred: false, note: '' };
    return getItemMeta(progress, deckId, q.id);
  }

  function toggleStar() {
    const q = currentQ();
    if (!q) return;
    const metaItem = getCurrentMetaWrapper();
    setItemStarred(progress, deckId, q.id, !metaItem.starred);
    render();
  }

  function saveNote(newNote) {
    const q = currentQ();
    if (!q) return;
    setItemNote(progress, deckId, q.id, newNote);
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

  // Tạo Context dùng chung cho mọi module con
  const ctx = {
    session,
    render,
    entry,
    config,
    progress,
    settings,
    learnSteps,
    rich,
    currentCardState,
    submitCurrent,
    handleOverride,
    getCurrentMeta: getCurrentMetaWrapper,
    toggleStar,
    saveNote,
    nextQuestion,
    requestExit,
    actions,
    getAutoPlayAudio: () => autoPlayAudio,
    setAutoPlayAudio: v => {
      autoPlayAudio = v;
    },
  };

  const onKeyDown = createKeyHandler(ctx);
  window.addEventListener('keydown', onKeyDown);
  activeCleanup = () => {
    window.removeEventListener('keydown', onKeyDown);
    setShortcutScope('home');
  };

  function renderResultView() {
    setShortcutScope('result');
    renderResult(
      root,
      {
        entry,
        config,
        history: session.history,
        progress,
        settings,
        isTrial: !persist,
      },
      actions
    );
  }

  function render() {
    if (session.index >= session.questions.length) {
      renderResultView();
      return;
    }

    const q = currentQ();
    const total = session.questions.length;
    const num = session.index + 1;

    const { actionsRow, shortcutFooter } = renderActionsRow(ctx, q);
    const questionImgUrl = q.image && q.kind !== 'card' ? assetUrl(q.image, entry.deckKey) : null;

    root.replaceChildren(
      h(
        'div',
        { class: 'session-container' },
        trialBanner,
        // Topbar
        h(
          'div',
          { class: 'session-topbar' },
          h(
            'button',
            {
              type: 'button',
              class: 'ux-btn ghost sm',
              onclick: requestExit,
            },
            '✕ Thoát (Esc)'
          ),
          h('div', { class: 'session-deck-title' }, entry.deck.meta.title),
          h('div', { class: 'session-progress-text' }, `Câu ${num} / ${total}`)
        ),

        // Thanh tiến độ chia đoạn
        renderSegmentedProgressBar(session, total),

        // Khung câu hỏi
        h(
          'div',
          { class: 'question-card panel' },
          h(
            'div',
            { class: 'question-meta' },
            h('span', { class: `chip type-badge type-${q.kind}` }, itemTypeLabel(q.kind)),
            q.category ? h('span', { class: `badge srs-cat-${q.category}` }, catLabels[q.category] || q.category) : null,
            q.retry ? h('span', { class: 'badge warn' }, '↻ Ôn lại câu sai') : null,
            q.topic ? h('span', { class: 'chip' }, q.topic) : null,
            (q.tags || []).map(t => h('span', { class: 'tag' }, t))
          ),
          q.kind !== 'card' ? richEl('div', { class: 'question-prompt' }, rich.html(q.prompt)) : null,
          q.kind !== 'card' && questionImgUrl
            ? h('div', { class: 'question-img-wrap' }, h('img', { class: 'rich-img', src: questionImgUrl, alt: 'Hình ảnh câu hỏi' }))
            : null,
          renderQuestionBody(ctx, q),
          renderFeedback(ctx, q),
          actionsRow,
          shortcutFooter
        )
      )
    );

    setShortcutScope('session', {
      onToggleStar: toggleStar,
      onEscape: requestExit,
      onKeyDown,
    });

    attachImageHandlers(root);

    // Auto-focus input nếu là câu điền / gõ lệnh / nghe-gõ
    if (!session.submitted && (q.kind === 'fill' || q.kind === 'command' || q.kind === 'listen')) {
      const inputEl = root.querySelector('.answer-input');
      if (inputEl) inputEl.focus();
    }
  }

  render();
}
