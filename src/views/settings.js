// src/views/settings.js — Màn hình Cài đặt (GĐ3 / GĐ3B: số thẻ mới/ngày, các bước nhắc ngắn).
// Dùng chung tokens.css + controls.css, ngôn ngữ tiếng Việt thân thiện, không lộ thuật ngữ kỹ thuật.
import { h } from './dom.js';
import { parseLearnSteps, DEFAULT_LEARN_STEPS } from '../core/srs.js';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../core/planner.js';

export function renderSettings(root, { settings }, actions) {
  let newCardsVal = String(settings?.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY);
  let stepsVal = Array.isArray(settings?.learnSteps) && settings.learnSteps.length
    ? settings.learnSteps.join(', ')
    : DEFAULT_LEARN_STEPS.join(', ');
  let errorMsg = '';

  const errorBox = h('div', { class: 'ux-field-msg error', style: 'margin-bottom: 12px;', hidden: true });

  const newCardsInput = h('input', {
    type: 'number',
    class: 'ux-input',
    style: 'width: 100%;',
    min: '0',
    max: '9999',
    step: '1',
    value: newCardsVal,
    oninput: ev => {
      newCardsVal = ev.target.value;
      errorBox.hidden = true;
    },
  });

  const stepsInput = h('input', {
    type: 'text',
    class: 'ux-input',
    style: 'width: 100%;',
    placeholder: 'Ví dụ: 1, 10',
    value: stepsVal,
    oninput: ev => {
      stepsVal = ev.target.value;
      errorBox.hidden = true;
    },
  });

  function showError(msg) {
    errorMsg = msg;
    errorBox.textContent = errorMsg;
    errorBox.hidden = !msg;
  }

  function handleSave(ev) {
    if (ev) ev.preventDefault();
    const numNew = Number(newCardsVal.trim());
    if (newCardsVal.trim() === '' || !Number.isFinite(numNew) || numNew < 0) {
      showError('Số thẻ mới mỗi ngày phải là số nguyên không âm (ví dụ: 20).');
      newCardsInput.focus();
      return;
    }

    const rawSteps = stepsVal.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (!rawSteps.length || rawSteps.some(n => !Number.isFinite(n) || n <= 0)) {
      showError('Các bước nhắc ngắn phải là danh sách số phút lớn hơn 0, cách nhau bởi dấu phẩy (ví dụ: 1, 10).');
      stepsInput.focus();
      return;
    }

    const cleanSteps = parseLearnSteps(rawSteps);
    actions.saveSettings({
      newCardsPerDay: Math.floor(numNew),
      learnSteps: cleanSteps,
    });
  }

  function handleReset() {
    newCardsVal = String(DEFAULT_NEW_CARDS_PER_DAY);
    stepsVal = DEFAULT_LEARN_STEPS.join(', ');
    newCardsInput.value = newCardsVal;
    stepsInput.value = stepsVal;
    showError('');
  }

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null,
        h('button', { type: 'button', class: 'ux-btn ghost sm back-btn', onclick: actions.home }, '← Về trang chủ'),
        h('p', { class: 'eyebrow' }, 'CÀI ĐẶT HỆ THỐNG'),
        h('h1', null, 'Cài đặt lịch ôn tập')),
      h('div', { class: 'toolbar' },
        h('button', { type: 'button', class: 'ux-btn', onclick: handleReset }, 'Khôi phục mặc định'),
        h('button', { type: 'button', class: 'ux-btn primary', onclick: handleSave }, 'Lưu cài đặt'))),

    h('form', { class: 'panel settings-panel', onsubmit: handleSave },
      h('h2', null, 'Nhịp độ học mới & các bước nhắc ngắn'),
      errorBox,
      h('div', { class: 'settings-grid' },
        h('div', { class: 'form-group settings-field' },
          h('label', null, 'Số thẻ mới tối đa mỗi ngày'),
          newCardsInput,
          h('p', { class: 'muted settings-help' },
            'Giới hạn số lượng mục mới được đưa vào phiên "Ôn hôm nay" mỗi ngày (tính theo ngày địa phương). Các mục đã đến hạn ôn tập luôn được hiển thị đầy đủ.')),
        h('div', { class: 'form-group settings-field' },
          h('label', null, 'Các bước nhắc lại ngắn hạn (phút)'),
          stepsInput,
          h('p', { class: 'muted settings-help' },
            'Thời gian chờ (phút) giữa các bước học ngắn trong phiên trước khi mục đó chuyển sang lịch ôn tập dài hạn theo ngày (mặc định: 1, 10 phút).'))),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 16px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: actions.home }, 'Huỷ'),
        h('button', { type: 'submit', class: 'ux-btn primary' }, 'Lưu cài đặt')))
  );

  root.ownerDocument.title = 'Cài đặt — Study App';
}
