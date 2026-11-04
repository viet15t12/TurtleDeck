// src/views/learn.js — Dựng và điều phối giao diện chế độ Học thích ứng theo các bậc thành thạo (Learn mode).
import { h } from './dom.js';
import {
  initLearnQueue,
  pickNext,
  nextStage,
  buildLearnQuestion,
  graduateToSRS,
} from '../core/learnplanner.js';
import { renderMarkdown, renderInlineMarkdown } from '../core/richtext.js';
import { gradeText, gradeChoices } from '../core/grader.js';

const STAGE_LABELS = {
  preview: 'Xem trước',
  'mc-en-vi': 'Trắc nghiệm EN → VI',
  'mc-vi-en': 'Trắc nghiệm VI → EN',
  'write-vi-en': 'Gõ từ VI → EN',
  cloze: 'Điền chỗ trống',
  'cloze-fallback': 'Gõ từ',
  question: 'Câu hỏi',
  retest: 'Kiểm tra lại',
};

export function renderLearn(root, { entry, progress = {}, onSaveProgress = () => {} }, actions) {
  root.innerHTML = '';
  const deck = entry.deck;
  const deckId = deck?.meta?.id || 'deck';
  const kind = deck?.meta?.kind || 'vocab';

  const allItems = (deck.items || []).filter(it => it && typeof it === 'object');
  const queue = initLearnQueue(allItems, { deckKind: kind });
  const totalItemsCount = allItems.length;

  let graduatedCount = 0;
  let lastItemId = null;
  let currentEntry = null;
  let currentQ = null;

  const page = h('div', { class: 'learn-page' });
  root.append(page);

  function nextTurn() {
    page.innerHTML = '';
    if (queue.length === 0) {
      renderCompletedView();
      return;
    }

    currentEntry = pickNext(queue, lastItemId);
    lastItemId = currentEntry.itemId;
    currentQ = buildLearnQuestion(currentEntry, allItems);

    renderHeader();
    renderQuestionCard();
  }

  function renderHeader() {
    const pct = totalItemsCount > 0 ? Math.round((graduatedCount / totalItemsCount) * 100) : 0;
    const header = h('header', { class: 'learn-header' },
      h('div', { style: 'display: flex; align-items: center; gap: 12px;' },
        h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          onclick: () => actions.openDeckView(entry),
        }, '← Thoát'),
        h('h1', { style: 'font-size: 20px; font-weight: 700; margin: 0;' }, deck.meta.title)
      ),
      h('div', { style: 'display: flex; align-items: center; gap: 16px;' },
        h('span', { class: 'muted', style: 'font-size: 14px;' }, `Thành thạo: ${graduatedCount} / ${totalItemsCount} (${pct}%)`),
        h('div', { class: 'learn-meter-bar' },
          h('div', { class: 'learn-meter-segment', style: `width: ${pct}%;` })
        )
      )
    );
    page.append(header);
  }

  function renderQuestionCard() {
    const stageKey = currentQ.stage || 'preview';
    const cardEl = h('div', { class: 'learn-card' },
      h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;' },
        h('span', { class: 'learn-stage-badge' }, STAGE_LABELS[stageKey] || stageKey),
        h('span', { class: 'muted', style: 'font-size: 13px;' }, `Bậc ${currentEntry.mastery + 1} / ${currentEntry.stages.length}`)
      )
    );

    if (stageKey === 'preview') {
      const content = h('div', { class: 'learn-preview-content' },
        h('div', { class: 'learn-preview-term' }, currentQ.prompt),
        currentQ.phonetic ? h('div', { class: 'muted' }, currentQ.phonetic) : null,
        h('div', { class: 'learn-preview-def' }, currentQ.definition),
        currentQ.example ? h('div', { class: 'learn-preview-example' }, currentQ.example) : null,
        h('div', { style: 'margin-top: 24px;' },
          h('button', {
            type: 'button',
            class: 'ux-btn primary',
            onclick: () => onAnswer(true),
          }, 'Đã hiểu — Tiếp tục →')
        )
      );
      cardEl.append(content);
      page.append(cardEl);
      return;
    }

    const promptEl = h('div', { style: 'font-size: 18px; font-weight: 600; margin-bottom: 20px;' });
    promptEl.innerHTML = renderMarkdown(currentQ.prompt, entry.deckKey);
    cardEl.append(promptEl);

    if (currentQ.choices && Array.isArray(currentQ.choices)) {
      const choicesGrid = h('div', { style: 'display: grid; gap: 10px;' });
      currentQ.choices.forEach((c, idx) => {
        const text = typeof c === 'string' ? c : c?.text || '';
        const btn = h('button', {
          type: 'button',
          class: 'ux-btn ghost',
          style: 'text-align: left; padding: 14px 18px; font-size: 15px; border: 1px solid var(--c-border);',
          onclick: () => {
            const correctAns = currentQ.answers || (currentQ.answer !== undefined ? [currentQ.answer] : []);
            const isOk = gradeChoices([idx], correctAns).ok;
            onAnswer(isOk, text, currentQ.choices[correctAns[0]] || '');
          },
        });
        btn.innerHTML = renderInlineMarkdown(text, entry.deckKey);
        choicesGrid.append(btn);
      });
      cardEl.append(choicesGrid);
    } else {
      const inputEl = h('input', {
        type: 'text',
        class: 'ux-input',
        style: 'width: 100%; max-width: 450px; font-size: 16px; padding: 10px 14px;',
        placeholder: 'Gõ đáp án vào đây...',
        onkeydown: ev => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            submitText();
          }
        },
      });
      const submitBtn = h('button', {
        type: 'button',
        class: 'ux-btn primary',
        style: 'margin-top: 12px;',
        onclick: submitText,
      }, 'Kiểm tra');

      function submitText() {
        const val = inputEl.value.trim();
        if (!val) return;
        const mode = currentQ.match || 'normalized';
        const isOk = gradeText(val, currentQ.answers || [], mode).ok;
        onAnswer(isOk, val, (currentQ.answers || []).join(' | '));
      }

      cardEl.append(h('div', null, inputEl, h('div', null, submitBtn)));
      setTimeout(() => inputEl.focus(), 50);
    }

    page.append(cardEl);
  }

  function onAnswer(isCorrect, userAns, correctAns) {
    page.querySelector('.learn-card')?.remove();

    const nxt = nextStage(currentEntry, isCorrect);
    let graduated = false;

    if (nxt === null) {
      graduated = true;
      graduatedCount++;
      const srsRes = graduateToSRS(currentEntry, progress, { deckId });
      progress = srsRes.progress;
      onSaveProgress(progress);
    } else {
      queue.push(currentEntry);
    }

    const feedbackEl = h('div', { class: `learn-card ${isCorrect ? 'learn-feedback correct' : 'learn-feedback wrong'}` },
      h('div', null,
        h('h3', { style: 'margin: 0 0 6px;' }, isCorrect ? '✓ Chính xác!' : '✗ Chưa chính xác'),
        !isCorrect && correctAns ? h('p', { style: 'margin: 0;' }, `Đáp án đúng: ${correctAns}`) : null,
        graduated ? h('p', { style: 'margin: 6px 0 0; font-weight: 600;' }, '★ Đã đạt mức thành thạo cao nhất và chuyển vào SRS!') : null
      ),
      h('button', {
        type: 'button',
        class: 'ux-btn primary',
        onclick: nextTurn,
      }, 'Tiếp tục →')
    );

    page.append(feedbackEl);
    feedbackEl.querySelector('button')?.focus();
  }

  function renderCompletedView() {
    const done = h('div', { class: 'match-gameover' },
      h('div', { class: 'match-gameover-icon' }, '🏆'),
      h('h2', null, 'Chúc mừng bạn!'),
      h('p', { class: 'muted' }, `Bạn đã hoàn thành mức thành thạo cao nhất cho toàn bộ ${totalItemsCount} mục.`),
      h('p', { class: 'muted' }, 'Các thẻ đã được cập nhật vào lịch ôn tập SRS dài hạn.'),
      h('div', { class: 'toolbar', style: 'margin-top: 20px; gap: 12px;' },
        h('button', {
          type: 'button',
          class: 'ux-btn',
          onclick: () => actions.openDeckView(entry),
        }, 'Về bộ thẻ')
      )
    );
    page.append(done);
  }

  nextTurn();
}

