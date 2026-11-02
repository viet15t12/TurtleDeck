// src/core/richtext.js — hiển thị Markdown an toàn qua marked + DOMPurify (ES module).
// GĐ2: Markdown thuần + code block, sanitize qua DOMPurify. GĐ2B sẽ bổ sung KaTeX và asset://.
import { Marked } from '../../node_modules/marked/lib/marked.esm.js';
import DOMPurify from '../../node_modules/dompurify/dist/purify.es.mjs';

const esc = s => String(s).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function getPurifier() {
  if (DOMPurify && typeof DOMPurify.sanitize === 'function') {
    return DOMPurify;
  }
  if (typeof DOMPurify === 'function' && typeof globalThis.window !== 'undefined') {
    return DOMPurify(globalThis.window);
  }
  return null;
}

export function makeRich(deckKey) {
  const m = new Marked({
    gfm: true,
    breaks: true,
  });

  const CFG = {
    ADD_ATTR: ['loading'],
    ALLOWED_URI_REGEXP: /^(?:asset:|#)/i,
  };

  const purifier = getPurifier();

  return {
    html: md => {
      const raw = m.parse(String(md ?? ''));
      return purifier ? purifier.sanitize(raw, CFG) : raw;
    },
    inline: md => {
      const raw = m.parseInline(String(md ?? ''));
      return purifier ? purifier.sanitize(raw, CFG) : raw;
    },
  };
}

// Văn bản thuần: bỏ code / markdown thừa để xem trước
export function toPlain(md) {
  return String(md ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[`*_>#~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
