// src/views/session/empty-view.js — Render màn hình trống khi không có câu hỏi nào để học

import { h } from '../dom.js';

export function renderEmptySession(root, { trialBanner, isSrsMode, entry, actions }) {
  root.replaceChildren(
    h(
      'div',
      { class: 'session-container' },
      trialBanner,
      h(
        'div',
        { class: 'empty' },
        h('h2', null, isSrsMode ? '🎉 Bạn đã hoàn thành lịch ôn hôm nay!' : 'Không có mục nào để học'),
        h(
          'p',
          { class: 'muted' },
          isSrsMode
            ? 'Hiện không còn thẻ nào đến hạn ôn tập hoặc thẻ mới trong hạn mức hôm nay. Bạn có thể quay lại vào ngày mai hoặc chọn luyện tập tự do.'
            : 'Bộ thẻ không có mục hợp lệ hoặc danh sách mục cần học đang trống.'
        ),
        h(
          'div',
          { class: 'toolbar', style: 'justify-content: center; margin-top: 16px;' },
          isSrsMode
            ? h(
                'button',
                {
                  type: 'button',
                  class: 'ux-btn primary',
                  onclick: () => actions.openSessionSetup(entry),
                },
                'Luyện tập tự do'
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              class: isSrsMode ? 'ux-btn' : 'ux-btn primary',
              onclick: () => actions.openDeckView(entry),
            },
            '← Quay lại bộ thẻ'
          ),
          h('button', { type: 'button', class: 'ux-btn ghost', onclick: actions.home }, 'Về trang chủ')
        )
      )
    )
  );
}
