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
import { translateText } from '../../core/translate/quick-translate.js';
import { getDeckLanguages, getPrimaryLanguage, getItemForLanguage } from '../../core/deckmodel.js';
import { buildQuestion, applyQuestionSpacing } from '../../core/builder.js';

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

  const deckLangs = getDeckLanguages(entry.deck.meta, entry.deck.items);
  const primaryLang = getPrimaryLanguage(entry.deck.meta, entry.deck.items);
  let activeLangs = Array.isArray(config.selectedLangs) && config.selectedLangs.length > 0
    ? config.selectedLangs.map(s => String(s).trim().toLowerCase())
    : [...deckLangs];
  let langMenuOpen = false;

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

  function toggleLanguage(langToToggle) {
    const l = langToToggle.toLowerCase();
    if (activeLangs.includes(l)) {
      if (activeLangs.length <= 1) return; // Không bỏ nếu chỉ còn 1 ngôn ngữ
      activeLangs = activeLangs.filter(x => x !== l);
      // Loại bỏ các thẻ chưa học của ngôn ngữ đó
      const answered = session.questions.slice(0, session.index + 1);
      const remaining = session.questions.slice(session.index + 1).filter(q => {
        if (q.kind === 'translate') return true;
        const qLang = (q.lang || primaryLang).toLowerCase();
        return qLang !== l;
      });
      session.questions = answered.concat(remaining);
    } else {
      activeLangs.push(l);
      // Chèn các thẻ của ngôn ngữ mới vào hàng đợi còn lại
      const answeredCardIds = new Set(session.history.map(h => h.question?.id));
      const currentCardIds = new Set(session.questions.map(q => q.id));
      const validItems = (entry.deck.items || []);
      const newQuestions = [];
      for (const item of validItems) {
        if (item.type === 'translate') continue; // translate đã có sẵn
        const itL = getItemForLanguage(item, l, primaryLang);
        if (itL && !answeredCardIds.has(itL.cardId) && !currentCardIds.has(itL.cardId)) {
          const q = buildQuestion(itL, config);
          if (q) {
            q.id = itL.cardId;
            q.itemId = item.id;
            q.rootId = item.id;
            q.lang = l;
            newQuestions.push(q);
          }
        }
      }
      if (newQuestions.length > 0) {
        const answered = session.questions.slice(0, session.index + 1);
        const remaining = session.questions.slice(session.index + 1).concat(newQuestions);
        const spaced = applyQuestionSpacing(remaining, 5);
        session.questions = answered.concat(spaced);
      }
    }
    config.selectedLangs = [...activeLangs];
    render();
  }

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

  async function toggleTranslate() {
    const q = currentQ();
    if (!q) return;

    if (session.translation?.visible) {
      session.translation.visible = false;
      render();
      return;
    }

    const currentIndex = session.index;
    session.translation.visible = true;

    if (session.translation.forIndex === currentIndex && session.translation.text) {
      render();
      return;
    }

    session.translation.loading = true;
    session.translation.error = null;
    session.translation.forIndex = currentIndex;
    render();

    try {
      const textToTranslate = q.kind === 'card'
        ? (session.cardFlipped ? `${q.front || ''}\n---\n${q.back || ''}` : (q.front || ''))
        : (q.prompt || '');

      const translated = await translateText(textToTranslate, { from: 'auto', to: 'vi' });

      if (session.index === currentIndex) {
        session.translation.loading = false;
        session.translation.text = translated;
        session.translation.error = null;
        render();
      }
    } catch (_err) {
      if (session.index === currentIndex) {
        session.translation.loading = false;
        session.translation.error = 'Không thể kết nối máy chủ dịch. Vui lòng kiểm tra kết nối mạng.';
        render();
      }
    }
  }

  function renderTranslationBox() {
    if (!session.translation?.visible) return null;

    const tr = session.translation;

    if (tr.loading) {
      return h(
        'div',
        { class: 'question-translation-box loading' },
        h('span', { class: 'translate-spinner' }, '⏳'),
        h('span', { class: 'translate-loading-text' }, 'Đang dịch câu hỏi sang tiếng Việt...')
      );
    }

    if (tr.error) {
      return h(
        'div',
        { class: 'question-translation-box error' },
        h('span', { class: 'translate-error-icon' }, '⚠️'),
        h('span', { class: 'translate-error-text' }, tr.error),
        h(
          'button',
          {
            type: 'button',
            class: 'ux-btn xs ghost translate-retry-btn',
            onclick: () => {
              session.translation.forIndex = -1;
              session.translation.visible = false;
              toggleTranslate();
            },
          },
          'Thử lại'
        )
      );
    }

    if (tr.text) {
      return h(
        'div',
        { class: 'question-translation-box' },
        h(
          'div',
          { class: 'translation-header' },
          h('span', { class: 'translation-label' }, '🌐 Bản dịch (Google)'),
          h(
            'button',
            {
              type: 'button',
              class: 'translation-close-btn',
              title: 'Ẩn bản dịch (Alt+T)',
              onclick: () => {
                session.translation.visible = false;
                render();
              },
            },
            '✕'
          )
        ),
        h('div', { class: 'translation-content' }, tr.text)
      );
    }

    return null;
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
    toggleTranslate,
    getAutoPlayAudio: () => autoPlayAudio,
    setAutoPlayAudio: v => {
      autoPlayAudio = v;
    },
  };

  const onKeyDown = createKeyHandler(ctx);
  window.addEventListener('keydown', onKeyDown);
  const closeLangMenu = () => {
    if (langMenuOpen) {
      langMenuOpen = false;
      render();
    }
  };
  window.addEventListener('click', closeLangMenu);
  activeCleanup = () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('click', closeLangMenu);
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
          deckLangs.length > 1 ? h('div', { class: 'session-lang-menu-wrapper', style: 'position: relative; display: inline-block;' },
            h('button', {
              type: 'button',
              class: 'ux-btn xs ghost',
              style: 'font-weight: 600;',
              title: 'Bật/tắt ngôn ngữ trong phiên học',
              onclick: ev => {
                ev.stopPropagation();
                langMenuOpen = !langMenuOpen;
                render();
              }
            }, `🌐 ${activeLangs.map(x => x.toUpperCase()).join('+')} ▾`),
            langMenuOpen ? h('div', {
              class: 'session-lang-popover panel',
              style: 'position: absolute; right: 0; top: 100%; z-index: 100; min-width: 150px; padding: 8px; margin-top: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 6px;',
              onclick: ev => ev.stopPropagation()
            },
              h('div', { style: 'font-size: 11px; font-weight: 700; color: var(--c-text-muted); text-transform: uppercase;' }, 'Ngôn ngữ ôn tập'),
              ...deckLangs.map(dl => {
                const isActive = activeLangs.includes(dl);
                return h('label', { style: 'display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;' },
                  h('input', {
                    type: 'checkbox',
                    checked: isActive,
                    disabled: isActive && activeLangs.length <= 1,
                    onchange: () => toggleLanguage(dl)
                  }),
                  h('span', null, dl.toUpperCase())
                );
              })
            ) : null
          ) : null,
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
            q.lang ? h('span', { class: 'chip lang-badge', style: 'font-weight: bold; background: var(--c-primary-soft, rgba(59,130,246,0.1)); color: var(--c-primary, #3b82f6);' }, q.lang.toUpperCase()) : null,
            q.category ? h('span', { class: `badge srs-cat-${q.category}` }, catLabels[q.category] || q.category) : null,
            q.retry ? h('span', { class: 'badge warn' }, '↻ Ôn lại câu sai') : null,
            q.topic ? h('span', { class: 'chip' }, q.topic) : null,
            (q.tags || []).map(t => h('span', { class: 'tag' }, t)),
            h(
              'button',
              {
                type: 'button',
                class: `ux-btn xs ghost translate-toggle-btn ${session.translation?.visible ? 'active' : ''}`,
                title: 'Dịch câu hỏi sang tiếng Việt (Alt+T hoặc phím T)',
                onclick: toggleTranslate,
              },
              session.translation?.visible ? '🌐 Ẩn dịch (Alt+T)' : '🌐 Dịch (Alt+T)'
            )
          ),
          q.kind !== 'card' ? richEl('div', { class: 'question-prompt' }, rich.html(q.prompt)) : null,
          renderTranslationBox(),
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

