// src/app.js — Điểm vào chính của renderer: khởi tạo trạng thái, router, IPC events và bootstrap UI

import { setLearnSteps } from './core/srs.js';
import { fileName } from './views/dom.js';
import { notify } from './views/notify.js';
import { initGlobalShortcuts } from './shortcuts.js';
import { state, newEntry } from './app/state.js';
import { setRenderer, render } from './app/runtime.js';
import { createActions } from './app/actions/index.js';
import { createRouter } from './app/router.js';
import { registerEvents } from './app/events.js';
import { showDraftRecovery } from './app/drafts.js';
import { applyResult } from './app/entries.js';

const api = window.api;
const root = document.querySelector('#app');

const actions = createActions({ state });
setRenderer(createRouter({ state, actions, root }));

// bấm ra ngoài thì đóng mọi menu thả xuống
document.addEventListener('click', () => {
  document.querySelectorAll('.menu, .ux-popover[data-dropdown]').forEach(m => {
    m.hidden = true;
  });
});

// Khởi động: đọc settings + progress, tự nạp lại các bộ thẻ đã mở lần trước
async function init() {
  initGlobalShortcuts(actions);
  registerEvents(actions);

  const [loadedSettings, loadedProgress] = await Promise.all([
    api.loadSettings(),
    api.loadProgress(),
  ]);

  if (loadedSettings && typeof loadedSettings === 'object') {
    state.settings = { ...state.settings, ...loadedSettings };
    setLearnSteps(state.settings.learnSteps);
  }

  if (loadedProgress && typeof loadedProgress === 'object') {
    state.progress = {
      version: 1,
      cards: loadedProgress.cards || {},
      meta: loadedProgress.meta || {},
      log: Array.isArray(loadedProgress.log) ? loadedProgress.log : [],
    };
  }

  const paths = state.settings.decks || [];
  state.entries = paths.map(p => newEntry({ path: p, status: 'loading' }));
  render();

  if (paths.length) {
    const results = await api.openDecks(paths);
    results.forEach((r, i) => applyResult(r, state.entries[i]));
    const missing = state.entries.filter(e => e.status === 'missing');
    if (missing.length) {
      notify(
        `${missing.length} bộ thẻ không còn tồn tại: ${missing.map(e => fileName(e.path)).join(', ')}. Bấm "Gỡ" để bỏ khỏi danh sách.`,
        'warn',
        0
      );
    }
    render();
  }

  // Quét thư viện thư mục
  await actions.scanLibrary();

  // Kiểm tra bản nháp Editor chưa lưu còn sót (do sự cố bất ngờ)
  await showDraftRecovery();

  // Báo cho main process biết renderer đã sẵn sàng nhận file mở từ ngoài
  api.notifyReady?.();
}

init().catch(e => notify('Không khởi động được: ' + (e?.message || e), 'error'));
