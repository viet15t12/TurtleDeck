// src/views/session/question/word-order.js — Dựng giao diện bài tập Sắp xếp từ (Word Order / Sentence Builder)

import { h } from '../../dom.js';
import { speak } from '../../../tts.js';
import { richEl } from '../answer-chips.js';

export function renderWordOrderQuestion(ctx, q) {
  const { session, render, rich, settings } = ctx;
  const bank = Array.isArray(q.bank) ? q.bank : [];
  const placedIds = Array.isArray(session.userAnswer) ? session.userAnswer : [];
  const placedSet = new Set(placedIds);
  const locked = Boolean(session.submitted);

  const tokenById = new Map(bank.map(t => [t.id, t]));

  const hasPromptVi = typeof q.prompt_vi === 'string' && q.prompt_vi.trim().length > 0;
  const audioText = typeof q.audio === 'string' && q.audio.trim() ? q.audio.trim() : null;

  let dragSrcIndex = null;

  const mascotRow = (hasPromptVi || audioText)
    ? h(
        'div',
        { class: 'wo-mascot-row' },
        h('div', { class: 'wo-mascot', 'aria-hidden': 'true' }, '🐢'),
        h(
          'div',
          { class: 'wo-bubble' },
          hasPromptVi ? richEl('div', { class: 'wo-bubble-text' }, rich.inline(q.prompt_vi)) : null,
          audioText
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'ux-btn xs ghost wo-audio-btn',
                  title: 'Nghe phát âm',
                  onclick: () => speak(audioText, settings?.ttsLang || 'en-US'),
                },
                '🔊 Nghe'
              )
            : null
        )
      )
    : null;

  const answerAreaClass = [
    'wo-answer-area',
    locked ? (session.grade?.ok ? 'wo-area-correct' : 'wo-area-wrong') : '',
  ]
    .filter(Boolean)
    .join(' ');

  const answerArea = h(
    'div',
    {
      class: answerAreaClass,
      role: 'region',
      'aria-label': 'Vùng trả lời',
    },
    placedIds.length === 0
      ? h('span', { class: 'wo-answer-placeholder' }, 'Bấm vào các thẻ từ bên dưới để ghép câu…')
      : placedIds.map((id, idx) => {
          const token = tokenById.get(id);
          if (!token) return null;
          const tileCls = [
            'wo-tile',
            'wo-tile-placed',
            locked ? (session.grade?.ok ? 'wo-tile-correct' : 'wo-tile-wrong') : '',
          ]
            .filter(Boolean)
            .join(' ');

          return h(
            'button',
            {
              type: 'button',
              class: tileCls,
              disabled: locked,
              draggable: !locked,
              title: locked ? token.text : 'Bấm để bỏ từ này (hoặc kéo để đổi vị trí)',
              onclick: () => {
                if (locked) return;
                session.userAnswer = placedIds.filter(pid => pid !== id);
                render();
              },
              ondragstart: ev => {
                if (locked) return;
                dragSrcIndex = idx;
                ev.dataTransfer.effectAllowed = 'move';
                ev.dataTransfer.setData('text/plain', String(idx));
              },
              ondragover: ev => {
                if (locked) return;
                ev.preventDefault();
                ev.dataTransfer.dropEffect = 'move';
              },
              ondrop: ev => {
                if (locked) return;
                ev.preventDefault();
                const from = dragSrcIndex !== null ? dragSrcIndex : Number(ev.dataTransfer.getData('text/plain'));
                const to = idx;
                dragSrcIndex = null;
                if (!Number.isInteger(from) || from === to || from < 0 || from >= placedIds.length) return;
                const next = [...placedIds];
                const [moved] = next.splice(from, 1);
                next.splice(to, 0, moved);
                session.userAnswer = next;
                render();
              },
            },
            token.text
          );
        })
  );

  const wordBank = h(
    'div',
    {
      class: 'wo-bank',
      role: 'group',
      'aria-label': 'Ngân hàng từ',
    },
    bank.map((token, idx) => {
      const isUsed = placedSet.has(token.id);
      if (isUsed) {
        // Ô xám rỗng giữ đúng kích thước và vị trí cũ để bố cục ngân hàng không bị xô lệch
        return h(
          'span',
          {
            class: 'wo-tile wo-tile-placeholder',
            'aria-hidden': 'true',
          },
          h('span', { class: 'wo-tile-ghost-text' }, token.text)
        );
      }

      const keyNum = idx < 9 ? idx + 1 : null;
      return h(
        'button',
        {
          type: 'button',
          class: 'wo-tile wo-tile-bank',
          disabled: locked,
          onclick: () => {
            if (locked || placedSet.has(token.id)) return;
            session.userAnswer = [...placedIds, token.id];
            render();
          },
        },
        keyNum !== null ? h('span', { class: 'wo-tile-key' }, String(keyNum)) : null,
        h('span', { class: 'wo-tile-text' }, token.text)
      );
    })
  );

  return h('div', { class: 'wo-container' }, mascotRow, answerArea, wordBank);
}

