// src/views/session/answer-chips.js — Tạo phần tử rich DOM và danh sách chip đáp án hợp lệ

// Tạo phần tử chứa HTML đã qua DOMPurify
export function richEl(tag, attrs, htmlContent) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  el.innerHTML = htmlContent;
  return el;
}

// Tạo danh sách chip đáp án chấp nhận (không nối bằng dấu |)
export function buildAcceptedAnswerChips(q, rich) {
  const chips = [];
  const seen = new Set();
  if (q.answerDisplay && String(q.answerDisplay).trim()) {
    const disp = String(q.answerDisplay).trim();
    seen.add(disp);
    chips.push(richEl('span', { class: 'answer-chip correct-chip' }, rich.inline(disp)));
  }
  for (const ans of q.answers || []) {
    const s = String(ans ?? '').trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    chips.push(richEl('span', { class: 'answer-chip correct-chip' }, rich.inline(s)));
  }
  return chips;
}

