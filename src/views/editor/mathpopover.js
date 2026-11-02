// src/views/editor/mathpopover.js — Popover chèn & sửa công thức toán học hiển thị bằng KaTeX (§7.2, §13.1)
import { h } from '../dom.js';
import { SNIPPETS, SNIPPET_TABS, filterSnippets } from '../../core/snippets.js';

let currentPopover = null;

export function closeMathPopover() {
  if (currentPopover) {
    currentPopover.close();
    currentPopover = null;
  }
}

// Chuẩn hoá chuỗi LaTeX mẫu để render nút KaTeX đẹp mắt (thay ▢ bằng \square, thêm cơ số cho ^{▢}, _{▢})
function previewableLatex(latex) {
  let s = String(latex || '');
  if (s.startsWith('^') || s.startsWith('_')) {
    s = `\\square${s}`;
  }
  return s.replace(/▢/g, '\\square');
}

function createSearchIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('class', 'ux-search-icon');
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '7');
  c.setAttribute('cy', '7');
  c.setAttribute('r', '4.8');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M10.6 10.6L14 14');
  p.setAttribute('stroke-linecap', 'round');
  svg.append(c, p);
  return svg;
}

/**
 * Mở Popover công thức nổi bên dưới `anchorEl` (không đẩy nội dung trang).
 *
 * @param {object} opts
 * @param {HTMLElement} opts.anchorEl - Nút ƒx hoặc ô nhập để neo vị trí
 * @param {object} opts.rich - Bộ render `makeRich(deckKey)`
 * @param {object|null} opts.enclosingMath - Kết quả `findEnclosingMath(text, pos)` nếu con trỏ đang trong công thức
 * @param {boolean} [opts.defaultBlock=false] - Mở mặc định ở chế độ Khối riêng ($$...$$)
 * @param {string[]} [opts.recentIds=[]] - Danh sách id ký hiệu dùng gần đây (tối đa 8)
 * @param {function} opts.onRecordRecent - `(snippetId) => void`
 * @param {function} opts.onInsertSnippet - `(latex, { block }) => void` (giữ popover mở)
 * @param {function} opts.onCommitCustom - `(latex, { block, replaceEnclosing }) => void` (chèn/sửa và đóng popover)
 * @param {function} opts.onRestoreFocus - `() => void` (trả con trỏ về ô đang soạn khi đóng)
 */
export function openMathPopover({
  anchorEl,
  rich,
  enclosingMath = null,
  defaultBlock = false,
  recentIds = [],
  onRecordRecent,
  onInsertSnippet,
  onCommitCustom,
  onRestoreFocus,
}) {
  closeMathPopover();

  let activeTab = SNIPPET_TABS[0];
  let searchQuery = '';
  let isBlockMode = enclosingMath ? enclosingMath.mode === 'block' : Boolean(defaultBlock);
  let customLatex = enclosingMath ? enclosingMath.latex : '';
  let recentList = [...(recentIds || [])].slice(0, 8);

  const rect = anchorEl ? anchorEl.getBoundingClientRect() : { left: 200, bottom: 140, top: 110 };
  const popW = 390;
  const popMaxH = 460;
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - popW - 16));
  const spaceBelow = window.innerHeight - rect.bottom - 12;
  const top = spaceBelow >= 320
    ? rect.bottom + 6
    : Math.max(12, rect.top - Math.min(popMaxH, rect.top - 16));

  const gridHost = h('div', { class: 'math-pop-grid' });
  const tabsHost = h('div', { class: 'math-pop-tabs' });
  const recentHost = h('div', { class: 'math-pop-recent-wrap' });
  const customPreviewEl = h('div', { class: 'math-pop-live-preview' });

  function renderKatexButton(snippet) {
    const katexSpan = document.createElement('span');
    katexSpan.className = 'math-pop-btn-katex';
    const tex = previewableLatex(snippet.latex);
    katexSpan.innerHTML = rich ? rich.inline(`$${tex}$`) : snippet.latex;

    return h('button', {
      type: 'button',
      class: 'math-pop-btn',
      title: `${snippet.name}\n${snippet.latex}`,
      onmousedown: ev => ev.preventDefault(), // giữ nguyên selection/focus logic
      onclick: () => {
        if (onRecordRecent) onRecordRecent(snippet.id);
        recentList = [snippet.id, ...recentList.filter(id => id !== snippet.id)].slice(0, 8);
        renderRecent();
        onInsertSnippet(snippet.latex, { block: isBlockMode });
      },
    }, katexSpan);
  }

  function renderRecent() {
    const items = recentList
      .map(id => SNIPPETS.find(s => s.id === id))
      .filter(Boolean);
    if (!items.length || searchQuery.trim()) {
      recentHost.replaceChildren();
      recentHost.hidden = true;
      return;
    }
    recentHost.hidden = false;
    recentHost.replaceChildren(
      h('div', { class: 'math-pop-subhead' }, 'Dùng gần đây'),
      h('div', { class: 'math-pop-recent-row' }, items.map(renderKatexButton))
    );
  }

  function renderTabs() {
    if (searchQuery.trim()) {
      tabsHost.hidden = true;
      return;
    }
    tabsHost.hidden = false;
    tabsHost.replaceChildren(
      ...SNIPPET_TABS.map(tab => h('button', {
        type: 'button',
        class: `math-pop-tab ${activeTab === tab ? 'active' : ''}`,
        onmousedown: ev => ev.preventDefault(),
        onclick: () => {
          activeTab = tab;
          renderTabs();
          renderGrid();
        },
      }, tab))
    );
  }

  function renderGrid() {
    const list = filterSnippets(searchQuery, activeTab);
    if (!list.length) {
      gridHost.replaceChildren(
        h('div', { class: 'muted', style: 'grid-column: 1 / -1; padding: 14px 8px; text-align: center; font-size: 12px;' },
          'Không tìm thấy ký hiệu phù hợp.')
      );
      return;
    }
    gridHost.replaceChildren(...list.map(renderKatexButton));
  }

  function updateCustomPreview() {
    const trimmed = customLatex.trim();
    if (!trimmed) {
      customPreviewEl.innerHTML = '<span class="muted" style="font-size: 12px;">Xem trước công thức trực tiếp…</span>';
      return;
    }
    const tex = trimmed.replace(/▢/g, '\\square');
    customPreviewEl.innerHTML = isBlockMode
      ? rich.html(`$$\n${tex}\n$$`)
      : rich.inline(`$${tex}$`);
  }

  const searchInput = h('input', {
    type: 'text',
    class: 'ux-input sm ux-search-input',
    placeholder: 'Tìm ký hiệu: phân số, alpha, tích phân…',
    oninput: ev => {
      searchQuery = ev.target.value;
      renderRecent();
      renderTabs();
      renderGrid();
    },
    onkeydown: ev => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        close(true);
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        const matches = filterSnippets(searchQuery, activeTab);
        if (matches.length > 0 && searchQuery.trim()) {
          const first = matches[0];
          if (onRecordRecent) onRecordRecent(first.id);
          onInsertSnippet(first.latex, { block: isBlockMode });
        }
        close(true);
      }
    },
  });

  const customInput = h('textarea', {
    class: 'ux-textarea font-mono math-pop-custom-input',
    rows: '2',
    placeholder: 'Nhập mã LaTeX riêng (vd: \\frac{a+b}{2})…',
    value: customLatex,
    oninput: ev => {
      customLatex = ev.target.value;
      updateCustomPreview();
    },
    onkeydown: ev => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        close(true);
      } else if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        if (customLatex.trim()) {
          onCommitCustom(customLatex.trim(), {
            block: isBlockMode,
            replaceEnclosing: Boolean(enclosingMath),
          });
        }
        close(true);
      }
    },
  });

  let modeSegEl = null;
  function renderModeSeg() {
    const nextSeg = h('div', { class: 'ux-segmented sm' },
      h('button', {
        type: 'button',
        class: `ux-seg-btn ${!isBlockMode ? 'active' : ''}`,
        onmousedown: ev => ev.preventDefault(),
        onclick: () => {
          isBlockMode = false;
          renderModeSeg();
          updateCustomPreview();
        },
      }, 'Trong dòng ($…$)'),
      h('button', {
        type: 'button',
        class: `ux-seg-btn ${isBlockMode ? 'active' : ''}`,
        onmousedown: ev => ev.preventDefault(),
        onclick: () => {
          isBlockMode = true;
          renderModeSeg();
          updateCustomPreview();
        },
      }, 'Khối riêng ($$…$$)'));
    if (modeSegEl) modeSegEl.replaceWith(nextSeg);
    modeSegEl = nextSeg;
    return nextSeg;
  }

  const popEl = h('div', {
    class: 'math-popover',
    style: `left: ${left}px; top: ${top}px; width: ${popW}px;`,
    onclick: ev => ev.stopPropagation(),
  },
    h('div', { class: 'math-pop-head' },
      h('span', { class: 'math-pop-title' }, 'Chèn công thức toán'),
      renderModeSeg(),
      h('button', {
        type: 'button',
        class: 'ux-icon-btn sm',
        title: 'Đóng (Esc)',
        onclick: () => close(true),
      }, '✕')),

    h('div', { class: 'ux-search-wrap' },
      createSearchIcon(),
      searchInput),

    recentHost,
    tabsHost,
    gridHost,

    h('div', { class: 'math-pop-custom-box' },
      h('div', { class: 'math-pop-subhead' },
        enclosingMath ? 'Sửa công thức tại con trỏ' : 'Soạn công thức riêng'),
      customInput,
      customPreviewEl,
      h('div', { style: 'display: flex; justify-content: space-between; align-items: center; gap: 8px;' },
        h('span', { class: 'muted', style: 'font-size: 11px;' }, 'Mẹo: bấm Tab trong ô soạn để nhảy qua các ô ▢'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary sm',
          onclick: () => {
            if (customLatex.trim()) {
              onCommitCustom(customLatex.trim(), {
                block: isBlockMode,
                replaceEnclosing: Boolean(enclosingMath),
              });
            }
            close(true);
          },
        }, enclosingMath ? 'Cập nhật (Ctrl+Enter)' : 'Chèn (Ctrl+Enter)'))));

  function onOutsideMouseDown(ev) {
    if (!popEl.contains(ev.target) && (!anchorEl || !anchorEl.contains(ev.target))) {
      close(false);
    }
  }

  function onWindowKeyDown(ev) {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      close(true);
    }
  }

  function close(restoreFocus = false) {
    document.removeEventListener('mousedown', onOutsideMouseDown, true);
    window.removeEventListener('keydown', onWindowKeyDown, true);
    popEl.remove();
    if (currentPopover?.el === popEl) currentPopover = null;
    if (restoreFocus && onRestoreFocus) {
      onRestoreFocus();
    }
  }

  document.addEventListener('mousedown', onOutsideMouseDown, true);
  window.addEventListener('keydown', onWindowKeyDown, true);

  renderRecent();
  renderTabs();
  renderGrid();
  updateCustomPreview();
  document.body.append(popEl);

  currentPopover = { el: popEl, close };

  queueMicrotask(() => {
    if (enclosingMath) {
      customInput.focus();
      customInput.select();
    } else {
      searchInput.focus();
    }
  });
}

