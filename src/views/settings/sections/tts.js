// src/views/settings/sections/tts.js — Mục cài đặt Giọng đọc và phát âm Web Speech TTS

import { h } from '../../dom.js';
import { speak, getVoices } from '../../../tts.js';

export function createTtsSection({ form }) {
  const allVoices = getVoices();
  const enVoices = allVoices.filter(v => v?.lang && String(v.lang).toLowerCase().startsWith('en'));
  const displayVoices = enVoices.length ? enVoices : allVoices;

  const ttsVoiceSelect = h(
    'select',
    {
      class: 'ux-select',
      style: 'width: 100%;',
      onchange: ev => {
        form.ttsVoiceNameVal = ev.target.value;
      },
    },
    h('option', { value: '', selected: !form.ttsVoiceNameVal }, 'Mặc định theo hệ thống (Auto)'),
    ...displayVoices.map(v =>
      h('option', { value: v.name, selected: form.ttsVoiceNameVal === v.name }, `${v.name} (${v.lang})`)
    )
  );

  const element = h(
    'section',
    { class: 'panel settings-panel', style: 'margin-top: 24px;' },
    h('h2', null, 'Phát âm & Giọng đọc (Text-to-Speech)'),
    h(
      'p',
      { class: 'muted settings-help', style: 'margin-bottom: 16px;' },
      'Tùy chỉnh giọng phát âm cho bộ thẻ Từ vựng tiếng Anh (hỗ trợ các chế độ Flashcards, Trắc nghiệm, Cloze và Nghe–Gõ).'
    ),
    h(
      'div',
      { class: 'settings-grid' },
      h(
        'div',
        { class: 'form-group settings-field' },
        h('label', null, 'Giọng đọc tiếng Anh ưu tiên'),
        h(
          'div',
          { style: 'display: flex; gap: 8px; align-items: center;' },
          ttsVoiceSelect,
          h(
            'button',
            {
              type: 'button',
              class: 'ux-btn sm',
              onclick: () => {
                speak('Hello! Welcome to English vocabulary study.', form.ttsLangVal, {
                  voiceName: form.ttsVoiceNameVal,
                });
              },
            },
            '🔊 Nghe thử'
          )
        ),
        h(
          'p',
          { class: 'muted settings-help', style: 'margin-top: 8px;' },
          'Hệ thống dùng bộ tổng hợp giọng nói Web Speech của hệ điều hành. Nếu chưa phát được âm trên Linux, bạn có thể cài gói giọng đọc: `sudo dnf install speech-dispatcher espeak-ng`.'
        )
      )
    )
  );

  return {
    element,
    reset() {
      form.ttsLangVal = 'en-US';
      form.ttsVoiceNameVal = '';
      ttsVoiceSelect.value = '';
    },
  };
}
