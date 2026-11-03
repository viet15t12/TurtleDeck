// src/app/drafts.js — Kiểm tra và hiển thị modal khôi phục bản nháp chưa lưu

import { h } from '../views/dom.js';
import { notify } from '../views/notify.js';
import { applyResult } from './entries.js';
import { render } from './runtime.js';
import { state } from './state.js';

const api = window.api;

export async function showDraftRecovery() {
  const drafts = await api.listDrafts?.().catch(() => []);
  if (drafts && drafts.length > 0) {
    const draft = drafts[0];
    const draftTimeStr = draft.mtime ? new Date(draft.mtime).toLocaleString('vi-VN') : '';
    state.modal = h(
      'div',
      { class: 'modal-backdrop' },
      h(
        'div',
        { class: 'modal-dialog', style: 'max-width: 520px;' },
        h('h2', { style: 'margin-top: 0;' }, '📝 Khôi phục bản nháp chưa lưu'),
        h(
          'p',
          null,
          `Tìm thấy bản nháp được tự động lưu lúc ${draftTimeStr} cho bộ thẻ "${draft.metaId || 'Chưa đặt tên'}".`
        ),
        h(
          'p',
          { class: 'color-muted', style: 'font-size: 13px;' },
          'Có thể ứng dụng đã bị tắt đột ngột trước khi kịp bấm Lưu.'
        ),
        h(
          'div',
          { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 24px; gap: 10px;' },
          h(
            'button',
            {
              type: 'button',
              class: 'ux-btn ghost',
              onclick: async () => {
                state.modal = null;
                await api.deleteDraft?.(draft.metaId);
                render();
              },
            },
            'Bỏ qua & Xoá nháp'
          ),
          h(
            'button',
            {
              type: 'button',
              class: 'ux-btn primary',
              onclick: async () => {
                state.modal = null;
                const r = await api.loadDraft?.(draft.draftId);
                if (r && r.ok) {
                  const entry = applyResult({
                    ok: true,
                    deckKey: r.deckKey,
                    path: null,
                    deckText: r.deckText,
                    deck: r.deck,
                    issues: [],
                    assetCount: r.assetCount || 0,
                  });
                  notify(`Đã khôi phục bản nháp "${r.deck.meta.title}".`, 'success');
                  state.route = { name: 'editor', uid: entry.uid };
                } else {
                  notify('Không thể nạp bản nháp: ' + (r?.error || 'Lỗi'), 'error');
                }
                render();
              },
            },
            'Khôi phục và mở Editor'
          )
        )
      )
    );
    render();
  }
}

