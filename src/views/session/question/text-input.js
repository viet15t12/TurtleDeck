// src/views/session/question/text-input.js — Dựng ô nhập văn bản cho dạng câu hỏi Điền và Lệnh

import { h } from '../../dom.js';

export function renderTextInputQuestion(ctx, q) {
  const { session } = ctx;
  const isCmd = q.kind === 'command';
  let inputClass = 'ux-input answer-input';
  if (isCmd) inputClass += ' font-mono';
  if (session.submitted) {
    inputClass += session.grade?.ok
      ? session.grade.near
        ? ' input-near'
        : ' input-correct'
      : ' input-wrong';
  }

  return h(
    'div',
    { class: 'input-area' },
    isCmd ? h('span', { class: 'cmd-prompt' }, '$') : null,
    h('input', {
      type: 'text',
      class: inputClass,
      placeholder: isCmd ? 'Nhập lệnh (vd: lspci)...' : 'Nhập câu trả lời...',
      value: session.userAnswer || '',
      disabled: session.submitted,
      autofocus: true,
      oninput: ev => {
        session.userAnswer = ev.target.value;
      },
    })
  );
}

