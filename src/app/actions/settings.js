// src/app/actions/settings.js — Các action lưu cài đặt và đặt lại tiến trình SRS

import { setLearnSteps, clearProgress } from '../../core/srs.js';
import { notify } from '../../views/notify.js';
import { render } from '../runtime.js';

const api = window.api;

export function settingsActions({ state }) {
  return {
    async reloadProgress() {
      const loadedProgress = await api.loadProgress();
      if (loadedProgress && typeof loadedProgress === 'object') {
        state.progress = {
          version: 1,
          cards: loadedProgress.cards || {},
          meta: loadedProgress.meta || {},
          log: Array.isArray(loadedProgress.log) ? loadedProgress.log : [],
        };
        render();
      }
    },

    async saveSettings(patch) {
      const r = await api.saveSettings(patch);
      if (r && r.ok === false) {
        notify('Không lưu được cài đặt: ' + r.error, 'error');
        return;
      }
      state.settings = r?.settings || { ...state.settings, ...patch };
      setLearnSteps(state.settings.learnSteps);
      notify('Đã lưu cài đặt thành công.', 'success');
      state.route = { name: 'home' };
      render();
    },

    async resetProgress(targetDeckId = 'all') {
      state.progress = clearProgress(state.progress, targetDeckId);
      const r = await api.saveProgress(state.progress);
      if (r && r.ok === false) {
        notify('Không thể lưu trạng thái đặt lại tiến trình: ' + (r.error || 'Lỗi'), 'error');
        return;
      }
      const targetEntry =
        targetDeckId && targetDeckId !== 'all'
          ? state.entries.find(e => e.deck?.meta?.id === targetDeckId)
          : null;
      if (targetEntry) {
        notify(`Đã đặt lại tiến trình của bộ thẻ "${targetEntry.deck.meta.title}".`, 'success');
      } else {
        notify('Đã đặt lại toàn bộ tiến trình học tập của tất cả bộ thẻ.', 'success');
      }
      render();
    },
  };
}
