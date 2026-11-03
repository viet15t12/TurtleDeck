// src/views/settings/sections/learning.js — Mục cài đặt Nhịp độ học mới và các bước nhắc ngắn hạn

import { h } from '../../dom.js';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../../../core/planner.js';
import { DEFAULT_LEARN_STEPS } from '../../../core/srs.js';

export function createLearningSection({ form, showError, onSubmit, onCancel }) {
  const newCardsInput = h('input', {
    type: 'number',
    class: 'ux-input',
    style: 'width: 100%;',
    min: '0',
    max: '9999',
    step: '1',
    value: form.newCardsVal,
    oninput: ev => {
      form.newCardsVal = ev.target.value;
      showError('');
    },
  });

  const stepsInput = h('input', {
    type: 'text',
    class: 'ux-input',
    style: 'width: 100%;',
    placeholder: 'Ví dụ: 1, 10',
    value: form.stepsVal,
    oninput: ev => {
      form.stepsVal = ev.target.value;
      showError('');
    },
  });

  const element = h(
    'div',
    { class: 'panel settings-panel', style: 'margin-top: 24px;' },
    h('h2', null, 'Nhịp độ học mới & các bước nhắc ngắn'),
    h(
      'div',
      { class: 'settings-grid' },
      h(
        'div',
        { class: 'form-group settings-field' },
        h('label', null, 'Số thẻ mới tối đa mỗi ngày'),
        newCardsInput,
        h(
          'p',
          { class: 'muted settings-help' },
          'Giới hạn số lượng mục mới được đưa vào phiên "Ôn hôm nay" mỗi ngày (tính theo ngày địa phương). Các mục đã đến hạn ôn tập luôn được hiển thị đầy đủ.'
        )
      ),
      h(
        'div',
        { class: 'form-group settings-field' },
        h('label', null, 'Các bước nhắc lại ngắn hạn (phút)'),
        stepsInput,
        h(
          'p',
          { class: 'muted settings-help' },
          'Thời gian chờ (phút) giữa các bước học ngắn trong phiên trước khi mục đó chuyển sang lịch ôn tập dài hạn theo ngày (mặc định: 1, 10 phút).'
        )
      )
    ),
    h(
      'div',
      { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 16px;' },
      h('button', { type: 'button', class: 'ux-btn ghost', onclick: onCancel }, 'Huỷ'),
      h('button', { type: 'button', class: 'ux-btn primary', onclick: onSubmit }, 'Lưu cài đặt')
    )
  );

  return {
    element,
    newCardsInput,
    stepsInput,
    reset() {
      form.newCardsVal = String(DEFAULT_NEW_CARDS_PER_DAY);
      form.stepsVal = DEFAULT_LEARN_STEPS.join(', ');
      newCardsInput.value = form.newCardsVal;
      stepsInput.value = form.stepsVal;
    },
  };
}
