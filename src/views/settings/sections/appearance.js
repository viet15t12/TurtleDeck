// src/views/settings/sections/appearance.js — Mục cài đặt Giao diện (Theme) & Thư mục thư viện

import { h } from '../../dom.js';
import { notify } from '../../notify.js';
import { applyTheme } from '../theme.js';

export function createAppearanceSection({ form, actions }) {
  const themeSelect = h(
    'select',
    {
      class: 'ux-select',
      style: 'width: 100%;',
      onchange: ev => {
        form.themeVal = ev.target.value;
        applyTheme(form.themeVal);
      },
    },
    h('option', { value: 'system', selected: form.themeVal === 'system' }, 'Theo hệ thống (System)'),
    h('option', { value: 'light', selected: form.themeVal === 'light' }, 'Giao diện Sáng (Light)'),
    h('option', { value: 'dark', selected: form.themeVal === 'dark' }, 'Giao diện Tối (Dark)')
  );

  const libraryDirDisplay = h('input', {
    type: 'text',
    class: 'ux-input font-mono',
    style: 'width: 100%;',
    readOnly: true,
    value: form.libraryDirVal || 'Đang tải…',
  });

  window.api?.getLibraryDir?.().then(dir => {
    form.libraryDirVal = dir;
    libraryDirDisplay.value = dir;
  });

  const element = h(
    'div',
    { class: 'panel settings-panel' },
    h('h2', null, 'Giao diện & Thư viện bộ thẻ'),
    h(
      'div',
      { class: 'settings-grid' },
      h(
        'div',
        { class: 'form-group settings-field' },
        h('label', null, 'Chế độ giao diện (Theme)'),
        themeSelect,
        h('p', { class: 'muted settings-help' }, 'Chọn giao diện Sáng, Tối hoặc tự động theo thiết lập hệ điều hành.')
      ),
      h(
        'div',
        { class: 'form-group settings-field' },
        h('label', null, 'Thư mục Thư viện bộ thẻ'),
        h(
          'div',
          { style: 'display: flex; gap: 8px;' },
          libraryDirDisplay,
          h(
            'button',
            {
              type: 'button',
              class: 'ux-btn',
              onclick: async () => {
                const picked = await window.api?.pickLibraryDir?.();
                if (picked) {
                  form.libraryDirVal = picked;
                  libraryDirDisplay.value = picked;
                  notify('Đã đổi thư mục Thư viện thành: ' + picked, 'success');
                  if (actions.scanLibrary) actions.scanLibrary();
                }
              },
            },
            'Chọn…'
          )
        ),
        h(
          'p',
          { class: 'muted settings-help' },
          'Ứng dụng tự động quét các file .sdeck trong thư mục này và chia nhóm theo các thư mục con.'
        )
      )
    )
  );

  return {
    element,
    reset() {
      form.themeVal = 'system';
      applyTheme('system');
      themeSelect.value = 'system';
    },
  };
}

