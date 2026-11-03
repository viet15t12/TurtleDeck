// src/views/session/question/choices.js — Dựng danh sách lựa chọn trắc nghiệm đơn / nhiều đáp án

import { h } from '../../dom.js';
import { assetUrl } from '../../../core/richtext.js';
import { richEl } from '../answer-chips.js';

export function renderChoicesQuestion(ctx, q) {
  const { session, render, entry, rich } = ctx;
  const isMulti = q.kind === 'multi';
  const hasImages = q.choices.some(c => c && typeof c === 'object' && c.image);
  const isMultiCol = hasImages || q.choices.length >= 4;

  return h(
    'div',
    { class: `choices-list ${isMultiCol ? 'choices-multi-col' : ''}` },
    q.choices.map((c, i) => {
      const isObj = c && typeof c === 'object';
      const text = isObj ? c.text ?? '' : String(c ?? '');
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

      return h(
        'div',
        {
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
        h(
          'div',
          { class: 'choice-content' },
          imgUrl ? h('img', { class: 'rich-img choice-img', src: imgUrl, alt: text || `Lựa chọn ${i + 1}` }) : null,
          text ? richEl('span', { class: 'choice-text' }, rich.inline(text)) : null
        ),
        statusMark
      );
    })
  );
}
