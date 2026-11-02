// src/views/match.js — Dựng và điều phối giao diện chế độ Ghép thẻ (Match game).
import { h } from './dom.js';
import {
  createMatchGame,
  checkMatch,
  updateMatchRecord,
  getMatchRecord,
  formatMatchTime,
} from '../core/matchgame.js';
import { renderInlineMarkdown } from '../core/richtext.js';

export function renderMatch(root, { entry, progress = {}, onRecordMatch = () => {} }, actions) {
  root.innerHTML = '';
  const deck = entry.deck;
  const deckId = deck?.meta?.id || 'deck';

  let game = createMatchGame(deck, { maxPairs: 6 });
  let selectedTile = null;
  let isChecking = false;
  let matchedCount = 0;
  let timerId = null;
  let startTime = Date.now();
  let elapsedMs = 0;

  const currentRecord = getMatchRecord(progress, deckId);
  const recordBadge = h('div', { class: 'match-record-badge' },
    '🏆 Kỷ lục: ',
    h('span', { style: 'font-weight: 700; color: var(--c-text);' }, currentRecord ? formatMatchTime(currentRecord) : 'Chưa có')
  );

  const timerText = h('span', { style: 'font-family: var(--font-mono); font-size: 20px; font-weight: 700;' }, '0.0s');

  function startTimer() {
    startTime = Date.now();
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      elapsedMs = Date.now() - startTime;
      timerText.textContent = formatMatchTime(elapsedMs);
    }, 100);
  }

  function stopTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  const gridEl = h('div', { class: 'match-grid' });

  function renderGrid() {
    gridEl.innerHTML = '';
    game.cards.forEach(card => {
      const tileEl = h('div', {
        class: `match-tile ${card.matched ? 'matched' : ''} ${card.selected ? 'selected' : ''}`,
        onclick: () => onTileClick(card, tileEl),
      });

      if (card.image) {
        const imgEl = h('img', {
          src: `asset://${entry.deckKey}/${card.image}`,
          class: 'match-tile-img',
          alt: card.text || 'image',
        });
        tileEl.append(imgEl);
      }

      if (card.text) {
        const textSpan = h('div', { class: 'match-tile-content' });
        textSpan.innerHTML = renderInlineMarkdown(card.text, entry.deckKey);
        tileEl.append(textSpan);
      }

      card._el = tileEl;
      gridEl.append(tileEl);
    });
  }

  function onTileClick(card, el) {
    if (isChecking || card.matched || card === selectedTile) return;

    if (!selectedTile) {
      selectedTile = card;
      card.selected = true;
      el.classList.add('selected');
      return;
    }

    const firstCard = selectedTile;
    const firstEl = firstCard._el;
    const matchRes = checkMatch(firstCard, card);

    if (matchRes.ok) {
      firstCard.matched = true;
      card.matched = true;
      firstEl.classList.remove('selected');
      firstEl.classList.add('matched');
      el.classList.add('matched');
      selectedTile = null;
      matchedCount++;

      if (matchedCount >= game.pairsCount) {
        onGameWon();
      }
    } else {
      isChecking = true;
      el.classList.add('mismatch');
      firstEl.classList.add('mismatch');

      setTimeout(() => {
        firstCard.selected = false;
        firstEl.classList.remove('selected', 'mismatch');
        el.classList.remove('mismatch');
        selectedTile = null;
        isChecking = false;
      }, 500);
    }
  }

  function onGameWon() {
    stopTimer();
    const finalElapsed = Date.now() - startTime;
    const recResult = updateMatchRecord(progress, deckId, finalElapsed);
    onRecordMatch(recResult);

    gridEl.style.display = 'none';
    const winScreen = h('div', { class: 'match-gameover' },
      h('div', { class: 'match-gameover-icon' }, '🎉'),
      h('h2', null, 'Xuất sắc!'),
      h('p', { class: 'muted' }, `Bạn đã ghép đúng ${game.pairsCount} cặp thẻ.`),
      h('div', { class: 'match-time-big' }, formatMatchTime(finalElapsed)),
      recResult.isNewRecord ? h('span', { class: 'match-new-record' }, '★ KỶ LỤC MỚI!') : null,
      h('div', { class: 'toolbar', style: 'margin-top: 16px; gap: 12px;' },
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: () => {
            game = createMatchGame(deck, { maxPairs: 6 });
            matchedCount = 0;
            selectedTile = null;
            gridEl.style.display = 'grid';
            winScreen.remove();
            renderGrid();
            startTimer();
          },
        }, 'Chơi lại'),
        h('button', {
          type: 'button',
          class: 'ux-btn',
          onclick: () => actions.openDeckView(entry),
        }, 'Về bộ thẻ')
      )
    );
    page.append(winScreen);
  }

  const page = h('div', { class: 'match-page' },
    h('header', { class: 'match-header' },
      h('div', { class: 'match-header-info' },
        h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          onclick: () => { stopTimer(); actions.openDeckView(entry); },
        }, '← Thoát'),
        h('h1', { style: 'font-size: 20px; font-weight: 700; margin: 0;' }, deck.meta.title)
      ),
      h('div', { class: 'match-header-stats' },
        recordBadge,
        timerText
      )
    ),
    gridEl
  );

  root.append(page);
  renderGrid();
  startTimer();
}

