// src/views/components/lightbox.js — Lightbox xem ảnh phóng to (Esc hoặc bấm ngoài để đóng) và gắn xử lý ảnh.
import { h } from '../dom.js';

export function showLightbox(src, alt) {
  const backdrop = h('div', { class: 'lightbox-backdrop' },
    h('div', { class: 'lightbox-box' },
      h('button', { class: 'lightbox-close', title: 'Đóng (Esc)', onclick: close }, '✕'),
      h('img', { class: 'lightbox-img', src, alt: alt || 'Ảnh' }),
      alt ? h('div', { class: 'lightbox-caption' }, alt) : null));

  function close() {
    window.removeEventListener('keydown', onEsc, true);
    backdrop.remove();
  }

  function onEsc(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  backdrop.onclick = e => {
    if (e.target === backdrop) close();
  };

  window.addEventListener('keydown', onEsc, true);
  document.body.append(backdrop);
}

export function attachImageHandlers(container) {
  if (!container) return;
  container.querySelectorAll('img.rich-img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.onclick = ev => {
      ev.stopPropagation();
      showLightbox(img.src, img.alt);
    };
    img.onerror = () => {
      const missing = document.createElement('span');
      missing.className = 'img-missing';
      missing.textContent = `[Không tìm thấy ảnh: ${img.alt || img.getAttribute('src') || ''}]`;
      img.replaceWith(missing);
    };
  });
}

