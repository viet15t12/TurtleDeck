// src/core/richtext.js — hiển thị Markdown + LaTeX + ảnh an toàn qua marked, KaTeX và DOMPurify (ES module).
import { Marked } from '../vendor/marked.esm.js';
import markedKatex from '../vendor/marked-katex.js';
import DOMPurify from '../vendor/purify.es.mjs';

const esc = s => String(s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;

// chỉ nhận đường dẫn tương đối trong gói deck (img/...); chặn http:, file:, data:, //...
export function assetUrl(href, deckKey) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return null;
  if (!IMG_EXT.test(href)) return null;
  return `asset://${deckKey}/${href.split('/').map(encodeURIComponent).join('/')}`;
}

function getPurifier() {
  if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
    return DOMPurify;
  }
  if (typeof DOMPurify === 'function' && typeof globalThis.window !== 'undefined') {
    return DOMPurify(globalThis.window);
  }
  return null;
}

// Fallback làm sạch HTML khi chạy trong môi trường thuần Node.js không có DOM
function sanitizeFallback(html) {
  return String(html ?? '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/href\s*=\s*["']?javascript:[^"'>\s]*/gi, '');
}

export function makeRich(deckKey) {
  const m = new Marked({ gfm: true, breaks: true });

  // KaTeX giữ mặc định an toàn (không bật trust) → \href{javascript:...} không chạy; nonStandard: true cho phép công thức trong ngoặc ($...$)
  m.use(markedKatex({ throwOnError: false, output: 'htmlAndMathml', nonStandard: true }));
  m.use({
    renderer: {
      image({ href, title, text }) {
        const src = assetUrl(href, deckKey);
        if (!src) return `<span class="img-bad">[ảnh không hợp lệ: ${esc(text)}]</span>`;
        return `<img class="rich-img" loading="lazy" src="${src}" alt="${esc(text)}"` +
               `${title ? ` title="${esc(title)}"` : ''}>`;
      },
    },
  });

  // DOMPurify mặc định chặn scheme lạ như asset: → phải cho phép tường minh
  const CFG = {
    ADD_ATTR: ['loading'],
    ALLOWED_URI_REGEXP: /^(?:asset:|#)/i,
    ADD_TAGS: ['semantics', 'annotation'],
  };

  const purifier = getPurifier();

  return {
    html: md => {
      const raw = m.parse(String(md ?? ''));
      return purifier ? purifier.sanitize(raw, CFG) : sanitizeFallback(raw);
    },
    inline: md => {
      const raw = m.parseInline(String(md ?? ''));
      return purifier ? purifier.sanitize(raw, CFG) : sanitizeFallback(raw);
    },
  };
}

// văn bản thuần cho TTS, tìm kiếm, xem trước: bỏ LaTeX, ảnh, ký hiệu Markdown
export function toPlain(md, formula = ' ') {
  return String(md ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, formula)
    .replace(/\$[^$\n]+\$/g, formula)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[`*_>#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
