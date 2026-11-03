// src/app/progress.js — Xử lý ghi nhận đánh giá câu hỏi và đồng bộ progress

import { recordReview } from '../core/srs.js';
import { notify } from '../views/notify.js';
import { state } from './state.js';

const api = window.api;

export function handleRecordReview(args) {
  const res = recordReview(state.progress, {
    ...args,
    learnSteps: args?.learnSteps ?? state.settings.learnSteps,
  });
  if (res.persisted) {
    state.progress = res.progress;
    api.saveProgress(state.progress).then(r => {
      if (r && r.ok === false) notify('Không lưu được tiến độ: ' + r.error, 'error');
    }).catch(e => {
      notify('Lỗi lưu tiến độ: ' + (e?.message || e), 'error');
    });
  }
  return res;
}

