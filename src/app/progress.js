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

    // Ghi trực tiếp xuống Rust Backend qua FSRS nếu có API
    if (api?.recordReview) {
      api.recordReview({
        deckId: args.deckId,
        itemId: args.itemId,
        direction: args.direction || 'fwd',
        rating: args.rating,
        elapsedMs: args.ms || 0,
      }).then(r => {
        if (r?.ok && r?.card) {
          if (!state.progress.cards) state.progress.cards = {};
          state.progress.cards[res.key] = r.card;
        }
      }).catch(e => {
        console.warn('Lỗi gọi Rust recordReview:', e);
      });
    }

    if (api?.saveProgress) {
      api.saveProgress(state.progress).then(r => {
        if (r && r.ok === false) notify('Không lưu được tiến độ: ' + r.error, 'error');
      }).catch(e => {
        notify('Lỗi lưu tiến độ: ' + (e?.message || e), 'error');
      });
    }
  }
  return res;
}

