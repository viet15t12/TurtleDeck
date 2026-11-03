// src/views/session/question/listen.js — Dựng giao diện chế độ Nghe - Gõ kèm phát âm TTS

import { h } from '../../dom.js';
import { speak } from '../../../tts.js';

export function renderListenQuestion(ctx, q) {
  const { session, settings } = ctx;
  let inputClass = 'ux-input answer-input';
  if (session.submitted) {
    inputClass += session.grade?.ok
      ? session.grade.near
        ? ' input-near'
        : ' input-correct'
      : ' input-wrong';
  }

  const playAudio = (slow = false) => {
    if (q.listenText) {
      speak(q.listenText, settings?.ttsLang || 'en-US', { rate: slow ? 0.75 : 1.0 });
    }
  };

  return h(
    'div',
    { class: 'listen-mode-box', style: 'display: flex; flex-direction: column; gap: 16px;' },
    h(
      'div',
      {
        style:
          'display: flex; align-items: center; gap: 10px; flex-wrap: wrap; background: var(--c-surface-2); padding: 10px 14px; border-radius: var(--radius-md);',
      },
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn primary',
          onclick: () => playAudio(false),
        },
        '🔊 Nghe lại (Alt+L)'
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'ux-btn',
          onclick: () => playAudio(true),
        },
        '🐢 Nghe chậm (0.75x)'
      ),
      h(
        'label',
        { style: 'margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer;' },
        h('input', {
          type: 'checkbox',
          checked: ctx.getAutoPlayAudio ? ctx.getAutoPlayAudio() : true,
          onchange: ev => {
            if (ctx.setAutoPlayAudio) ctx.setAutoPlayAudio(ev.target.checked);
          },
        }),
        'Tự động phát khi chuyển câu'
      )
    ),
    h(
      'div',
      { class: 'input-area' },
      h('input', {
        type: 'text',
        class: inputClass,
        placeholder: 'Gõ từ hoặc cụm từ bạn nghe được...',
        value: session.userAnswer || '',
        disabled: session.submitted,
        autofocus: true,
        oninput: ev => {
          session.userAnswer = ev.target.value;
        },
      })
    )
  );
}
