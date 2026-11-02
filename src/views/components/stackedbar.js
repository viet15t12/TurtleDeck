// src/views/components/stackedbar.js — Thanh tiến độ học tập dạng xếp chồng (mastered, due, learning, new).
// Dùng chung cho Home view và Deck view (§4, §5).
import { h } from '../dom.js';

export function renderStackedBar(st) {
  const total = (st?.new || 0) + (st?.learning || 0) + (st?.due || 0) + (st?.mastered || 0);
  if (total <= 0) {
    return h('div', { class: 'deck-stacked-bar empty-bar', title: 'Bộ thẻ chưa có mục hợp lệ' });
  }
  const pct = n => `${Math.max(0, (n / total) * 100).toFixed(2)}%`;
  return h('div', {
    class: 'deck-stacked-bar',
    title: `Đã thuộc: ${st.mastered} · Đến hạn: ${st.due} · Đang học: ${st.learning} · Mới: ${st.new}`,
  },
    st.mastered > 0 ? h('div', { class: 'seg seg-mastered', style: `width: ${pct(st.mastered)}` }) : null,
    st.due > 0 ? h('div', { class: 'seg seg-due', style: `width: ${pct(st.due)}` }) : null,
    st.learning > 0 ? h('div', { class: 'seg seg-learning', style: `width: ${pct(st.learning)}` }) : null,
    st.new > 0 ? h('div', { class: 'seg seg-new', style: `width: ${pct(st.new)}` }) : null);
}
