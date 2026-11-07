// src/views/dom.js — tạo phần tử DOM an toàn. Chỉ dùng textContent, KHÔNG dùng innerHTML
// (Markdown/LaTeX sẽ hiển thị qua core/richtext.js từ GĐ2B).

// h('div', { class: 'x', onclick: fn, title: '…' }, 'chữ', h('span', null, '…'))
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function setChildren(el, ...children) {
  const flattened = [];
  function collect(list) {
    for (const c of list) {
      if (c === undefined || c === null || c === false) continue;
      if (Array.isArray(c)) collect(c);
      else flattened.push(c instanceof Node ? c : document.createTextNode(String(c)));
    }
  }
  collect(children);
  el.replaceChildren(...flattened);
  return el;
}

// Rút gọn nội dung để xem nhanh trong bảng (văn bản thuần, gộp xuống dòng)
export function shorten(s, max = 110) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

export const fileName = p => String(p ?? '').split(/[\\/]/).pop();

