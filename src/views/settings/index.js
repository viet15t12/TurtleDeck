// src/views/settings/index.js — Điểm vào chính của màn hình Cài đặt (ghép các section)

import { h } from '../dom.js';
import { fromSettings, validateSettingsForm } from './form-state.js';
import { createAppearanceSection } from './sections/appearance.js';
import { createLearningSection } from './sections/learning.js';
import { createTtsSection } from './sections/tts.js';
import { createBackupSection } from './sections/backup.js';
import { createResetProgressSection } from './sections/reset-progress.js';

export function renderSettings(root, { settings, progress, entries }, actions) {
  const form = fromSettings(settings);
  const errorBox = h('div', { class: 'ux-field-msg error', style: 'margin-bottom: 12px;', hidden: true });

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = !msg;
  }

  function handleSave(ev) {
    if (ev) ev.preventDefault();
    const res = validateSettingsForm(form);
    if (!res.ok) {
      showError(res.error);
      if (res.field === 'newCards') learningSection.newCardsInput.focus();
      else if (res.field === 'steps') learningSection.stepsInput.focus();
      return;
    }
    actions.saveSettings(res.value);
  }

  const appearanceSection = createAppearanceSection({ form, actions });
  const learningSection = createLearningSection({
    form,
    showError,
    onSubmit: handleSave,
    onCancel: actions.home,
  });
  const ttsSection = createTtsSection({ form });
  const backupSection = createBackupSection({
    actions,
    onReloadProgress: newProg => {
      if (actions.reloadProgress) actions.reloadProgress(newProg);
      else renderSettings(root, { settings, progress: newProg, entries }, actions);
    },
  });
  const resetProgressSection = createResetProgressSection({ progress, entries, actions });

  function handleReset() {
    appearanceSection.reset();
    learningSection.reset();
    ttsSection.reset();
    showError('');
  }

  root.replaceChildren(
    h(
      'header',
      { class: 'page-head' },
      h(
        'div',
        null,
        h('button', { type: 'button', class: 'ux-btn ghost sm back-btn', onclick: actions.home }, '← Về trang chủ'),
        h('p', { class: 'eyebrow' }, 'CÀI ĐẶT HỆ THỐNG'),
        h('h1', null, 'Cài đặt & Dữ liệu học tập')
      ),
      h(
        'div',
        { class: 'toolbar' },
        h('button', { type: 'button', class: 'ux-btn', onclick: handleReset }, 'Khôi phục mặc định'),
        h('button', { type: 'button', class: 'ux-btn primary', onclick: handleSave }, 'Lưu cài đặt')
      )
    ),
    appearanceSection.element,
    learningSection.element,
    ttsSection.element,
    backupSection.element,
    resetProgressSection.element
  );

  root.ownerDocument.title = 'Cài đặt — Turtle Deck';
}

