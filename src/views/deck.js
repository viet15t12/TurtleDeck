// src/views/deck.js — Deck View thiết kế lại theo chuẩn Apple macOS HIG (Split Layout):
// ┌──────────────────────────────────────────────────────────┐
// │ ← Về trang chủ   LPIC-1 101.1 …      [Ôn ngay][Sửa][Info]│  header cố định
// ├──────────────────────────────────────────────────────────┤
// │ [Mới 31] [Đang học 3] [Đến hạn 37] [Đã thuộc 29]         │  hàng thống kê (click để lọc)
// │ ████████████▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░                  │  thanh tiến trình (cố định)
// ├───────────────┬──────────────────────────────────────────┤
// │ CHẾ ĐỘ HỌC    │ 🔍 Tìm… [Dạng▾][Chủ đề▾][Nhãn▾][Trạng thái▾]│
// │ ▸ Ôn hôm nay  ├──────────────────────────────────────────┤
// │   (60)        │ # ★ Dạng  Nội dung        Chủ đề  Trạng thái│
// │ ▸ Luyện tập   │ 1 ☆ …                                    │
// │ ▸ Thi thử     │ 2 ☆ …                                    │  chỉ vùng này cuộn
// │               │ 3 ☆ …                                    │
// │ Bộ lọc nhanh: │ …                                        │
// │ ○ Đến hạn     │                                          │
// │ ○ Sai nhiều   │                                          │
// │ ○ Đã gắn ★    │                                          │
// └───────────────┴──────────────────────────────────────────┘

import { h, fileName } from './dom.js';
import { toPlain } from '../core/richtext.js';
import {
  KINDS,
  kindOf,
  kindLabel,
  modesFor,
  detectItemType,
  itemTypeLabel,
  mismatchedItems,
  formatMismatchWarning,
  checkModeAvailability,
} from '../core/deckkinds.js';
import { deckStats } from '../core/deckstats.js';
import { cardKey, DAY } from '../core/srs.js';
import { stripAccents, getDeckLanguages, getPrimaryLanguage } from '../core/deckmodel.js';
import { extractTags } from '../core/filters.js';
import { renderStackedBar } from './components/stackedbar.js';
import { speak, hasVoice } from '../tts.js';

const choiceText = c => typeof c === 'string' ? c : [c?.text, c?.image ? `[ảnh ${c.image}]` : ''].filter(Boolean).join(' ');

const MODE_ICONS = {
  srs: '📅',
  all: '🗂',
  practice: '🎯',
  flashcards: '🔤',
  mc: '🔘',
  write: '⌨',
  cloze: '🔲',
  listen: '🎧',
  learn: '🧠',
  match: '🧩',
  exam: '⏱️',
};

function createSearchSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('class', 'ux-search-icon');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '7');
  circle.setAttribute('cy', '7');
  circle.setAttribute('r', '4.8');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', 'M10.6 10.6L14 14');
  line.setAttribute('stroke-linecap', 'round');
  svg.append(circle, line);
  return svg;
}

// Nội dung chính + đáp án của item dạng văn bản thuần
function summarize(it, deckKind) {
  const type = detectItemType(it, deckKind) || 'vocab';
  switch (type) {
    case 'single':
    case 'multi':
      return {
        type,
        main: toPlain(it.question),
        answer: toPlain((it.answer || []).map(i => choiceText(it.choices?.[i])).join(' · ')),
      };
    case 'fill':
    case 'command':
      return {
        type,
        main: toPlain(it.question),
        answer: toPlain(it.answerDisplay || (it.answer || []).join(' · ')),
      };
    case 'card':
      return {
        type,
        main: toPlain(it.front),
        answer: toPlain(it.back),
      };
    case 'word-order':
      return {
        type,
        main: toPlain(it.prompt_vi || it.question || 'Sắp xếp từ'),
        answer: toPlain((it.answer || []).join(' ')),
      };
    default:
      return {
        type: 'vocab',
        main: toPlain(it.term),
        answer: toPlain(it.definition),
      };
  }
}

// Xác định trạng thái học của từng mục
function getItemStudyStatus(deckId, item, progress, now) {
  const cards = progress?.cards || {};
  const key = cardKey(deckId, item.id, 'fwd');
  const c = cards[key] || cards[item.id] || null;
  const metaKey = `${deckId}:${item.id}`;
  const isStarred = Boolean(progress?.meta?.[metaKey]?.starred) || item.starred === true;
  const lapses = Number(c?.lapses || 0);
  const isLeech = lapses >= 8;
  const isErrorProne = lapses >= 1;

  if (isLeech) {
    return { key: 'leech', label: `⚠ Leech (${lapses} lần quên)`, cls: 'status-error', isStarred, isLeech: true, isErrorProne };
  }
  if (isStarred) {
    return { key: 'starred', label: '★ Đã sao', cls: 'status-starred', isStarred, isLeech: false, isErrorProne };
  }
  if (isErrorProne) {
    return { key: 'error-prone', label: `⚠ Sai ${lapses} lần`, cls: 'status-error', isStarred, isLeech: false, isErrorProne };
  }
  if (!c || c.state === 'new') {
    return { key: 'new', label: 'Mới', cls: 'status-new', isStarred, isLeech: false, isErrorProne };
  }
  if (c.state === 'learning' || c.state === 'relearning') {
    return { key: 'learning', label: 'Đang học', cls: 'status-learning', isStarred, isLeech: false, isErrorProne };
  }
  if (c.state === 'review') {
    if ((c.due || 0) <= now) {
      return { key: 'due', label: 'Đến hạn', cls: 'status-due', isStarred, isLeech: false, isErrorProne };
    }
    const diffDays = Math.max(1, Math.ceil((c.due - now) / DAY));
    const dueText = diffDays === 1 ? 'Ôn · đến hạn mai' : `Ôn · còn ${diffDays} ngày`;
    return { key: 'mastered', label: dueText, cls: 'status-mastered', isStarred, isLeech: false, isErrorProne };
  }
  return { key: 'new', label: 'Mới', cls: 'status-new', isStarred, isLeech: false, isErrorProne };
}

function renderCollapsibleIssues(issues) {
  if (!issues || !issues.length) return null;
  const sorted = [...issues].sort((a, b) => (a.level === 'error' ? 0 : 1) - (b.level === 'error' ? 0 : 1));
  const errCount = sorted.filter(i => i.level === 'error' || i.skipped).length;
  const warnCount = sorted.length - errCount;
  const parts = [];
  if (errCount > 0) parts.push(`${errCount} mục lỗi bị bỏ qua`);
  if (warnCount > 0) parts.push(`${warnCount} cảnh báo`);

  return h('details', { class: 'deck-issues-collapse' },
    h('summary', { class: 'deck-issues-summary' },
      h('span', { class: 'issue-icon' }, '⚠'),
      h('span', { style: 'font-weight: 600;' }, `Cảnh báo / mục cần lưu ý (${parts.join(', ')})`),
      h('span', { class: 'muted', style: 'margin-left: auto; font-size: 12px;' }, 'Bấm để xem chi tiết ▾')),
    h('ul', { class: 'issues', style: 'margin-top: 8px;' }, sorted.map(i =>
      h('li', { class: `issue ${i.level}` },
        h('span', { class: 'issue-icon' }, i.level === 'error' ? '✕' : '⚠'),
        h('span', null, i.msg)))));
}

export function renderDeck(root, entry, actions, { progress, settings } = {}) {
  const now = Date.now();
  const { meta, items } = entry.deck;
  const deckId = meta?.id || 'deck';
  const kind = kindOf(entry.deck);
  const kInfo = KINDS[kind];

  const deckLangs = getDeckLanguages(entry.deck.meta, entry.deck.items);
  const primaryLang = getPrimaryLanguage(entry.deck.meta, entry.deck.items);

  let savedLangs = null;
  if (deckLangs.length > 1) {
    try {
      const raw = localStorage.getItem(`turtle_deck_lang_${deckId}`);
      if (raw) savedLangs = JSON.parse(raw);
    } catch {}
    if (!Array.isArray(savedLangs) || savedLangs.length === 0) {
      savedLangs = [...deckLangs];
    }
    savedLangs = savedLangs.filter(l => deckLangs.includes(l));
    if (savedLangs.length === 0) savedLangs = [primaryLang];
  } else {
    savedLangs = [primaryLang];
  }

  function countCardsForLangs(langs) {
    let total = 0;
    const valid = (entry.deck.items || []).filter(it => it && it.id);
    for (const it of valid) {
      if (it.type === 'translate') {
        if (langs.length > 0) total++;
      } else {
        for (const l of langs) {
          if (l === primaryLang) total++;
          else if (it.translations && it.translations[l]) total++;
        }
      }
    }
    return total;
  }

  const rawIssues = entry.issues || [];
  const mismatched = mismatchedItems(entry.deck);
  const hasMismatchInIssues = rawIssues.some(i => i.mismatch || (i.msg && i.msg.includes('nằm trong bộ')));
  const issues = (!hasMismatchInIssues && mismatched.length > 0)
    ? [...rawIssues, { level: 'warn', mismatch: true, msg: formatMismatchWarning(entry.deck) }]
    : rawIssues;

  const st = deckStats(entry.deck, progress, { ...settings, selectedLangs: savedLangs }, now);
  const dueToday = st.due + st.learning;
  const totalToday = dueToday + st.newLeftToday;
  const totalValid = countCardsForLangs(savedLangs);
  const modes = modesFor(kind);

  // Đếm nhanh số lượng theo các nhóm đặc biệt
  const countStarred = items.filter(it => {
    const metaKey = `${deckId}:${it.id}`;
    return Boolean(progress?.meta?.[metaKey]?.starred) || it.starred === true;
  }).length;

  const countLeechOrError = items.filter(it => {
    const key = cardKey(deckId, it.id, 'fwd');
    const c = progress?.cards?.[key] || progress?.cards?.[it.id];
    return Number(c?.lapses || 0) >= 1;
  }).length;

  // Hàm khởi chạy nhanh phiên học khuyến nghị
  function startPrimaryStudy() {
    const sessionOpts = deckLangs.length > 1 ? { selectedLangs: savedLangs } : {};
    if (dueToday > 0 || totalToday > 0) {
      actions.startSrsSession(entry, sessionOpts);
    } else {
      actions.openSessionSetup(entry, { defaultMode: 'practice', ...sessionOpts });
    }
  }

  // Quản lý bộ lọc bảng
  let searchQuery = '';
  let filterType = 'all';
  let filterTopic = 'all';
  let filterTag = 'all';
  let filterStatus = 'all';
  let currentPage = 1;
  let pageSize = 50; // Mặc định 50 mục / trang để bảng gọn nhẹ và cuộn nhanh

  // 1. Header cố định (Fixed Header Bar)
  const langChipsEl = deckLangs.length > 1 ? h('div', {
    style: 'display: flex; align-items: center; gap: 4px; margin-left: 8px; flex-wrap: wrap;',
    title: 'Bấm để bật/tắt ngôn ngữ ôn tập',
  },
    ...deckLangs.map(l => {
      const isChecked = savedLangs.includes(l);
      const lCount = countCardsForLangs([l]);
      return h('button', {
        type: 'button',
        class: `ux-chip sm ${isChecked ? 'active' : ''}`,
        style: `cursor: pointer; padding: 2px 8px; font-size: 11px; font-weight: ${isChecked ? '600' : 'normal'}; border: 1px solid ${isChecked ? 'var(--c-primary)' : 'var(--c-border)'}; background: ${isChecked ? 'var(--c-primary-soft)' : 'transparent'}; color: ${isChecked ? 'var(--c-primary)' : 'inherit'}; border-radius: 9999px;`,
        onclick: () => {
          let next;
          if (isChecked) {
            if (savedLangs.length <= 1) return;
            next = savedLangs.filter(x => x !== l);
          } else {
            next = [...savedLangs, l];
          }
          try { localStorage.setItem(`turtle_deck_lang_${deckId}`, JSON.stringify(next)); } catch {}
          actions.openDeckView(entry);
        },
      }, `${l.toUpperCase()} (${lCount})`);
    })
  ) : null;

  const headerEl = h('header', { class: 'deck-header-bar' },
    h('div', { class: 'deck-header-left' },
      h('button', {
        type: 'button',
        class: 'ux-btn ghost sm back-btn',
        onclick: actions.home,
        title: 'Về trang chủ',
      }, '← Về trang chủ'),
      h('div', { class: 'deck-header-title-wrap' },
        h('div', { class: 'deck-header-badges' },
          h('span', { class: 'ux-kind-badge', 'data-kind': kind }, kInfo?.icon || '📝', kindLabel(kind)),
          entry.path ? null : h('span', { class: 'badge unsaved' }, '● chưa lưu'),
          entry.assetCount ? h('span', { class: 'ux-chip', style: 'cursor: default;' }, `🖼 ${entry.assetCount} ảnh`) : null,
          langChipsEl
        ),
        h('h1', { class: 'deck-header-h1', title: meta.title }, meta.title),
        meta.description ? h('p', { class: 'deck-header-desc', title: meta.description }, meta.description) : null
      )
    ),
    h('div', { class: 'deck-header-actions' },
      h('button', {
        type: 'button',
        class: 'ux-btn primary deck-header-cta',
        onclick: startPrimaryStudy,
      }, `▶ Ôn ngay (${totalToday > 0 ? totalToday : totalValid})`),
      h('button', {
        type: 'button',
        class: 'ux-btn sm',
        onclick: () => actions.openEditor(entry),
      }, '✏ Sửa bộ thẻ'),
      actions.openDeckInfoModal ? h('button', {
        type: 'button',
        class: 'ux-btn sm',
        onclick: () => actions.openDeckInfoModal(entry),
      }, 'ℹ Thông tin') : null,
      entry.path ? null : h('button', {
        type: 'button',
        class: 'ux-btn sm',
        onclick: () => actions.saveAs(entry),
      }, '💾 Lưu .sdeck…'),
      h('button', {
        type: 'button',
        class: 'ux-btn ghost sm danger-hover',
        onclick: () => actions.remove(entry),
      }, 'Gỡ')
    )
  );

  // 2. Hàng thống kê cố định (Fixed Stats Strip + Progress Bar) - Bấm ô để lọc trực tiếp
  const statBoxElements = new Map();

  function updateFilterState(newStatus) {
    filterStatus = newStatus;
    currentPage = 1;
    if (statusSelect) statusSelect.value = newStatus;

    // Cập nhật trạng thái active trên các ô thống kê
    for (const [key, el] of statBoxElements.entries()) {
      el.classList.toggle('active-filter', filterStatus === key);
    }

    // Cập nhật trạng thái active trên sidebar
    sidebarFilterItems.forEach(item => {
      item.el.classList.toggle('active', filterStatus === item.key);
    });

    renderTableBody();
  }

  function createStatBox(label, count, numCls, sub, statusKey) {
    const el = h('div', {
      class: 'deck-stat-box',
      role: 'button',
      tabindex: '0',
      title: `Bấm để lọc danh sách câu hỏi: ${label}`,
      onclick: () => {
        // Toggle nếu bấm lại vào ô đang lọc
        const next = filterStatus === statusKey ? 'all' : statusKey;
        updateFilterState(next);
      },
    },
      h('div', { class: 'deck-stat-label-wrap' },
        h('span', { class: 'deck-stat-label' }, label),
        h('span', { class: 'deck-stat-filter-hint' }, 'Lọc ▾')),
      h('div', { class: `deck-stat-num ${numCls}` }, String(count)),
      h('div', { class: 'deck-stat-sub' }, sub));

    statBoxElements.set(statusKey, el);
    return el;
  }

  const statsRowEl = h('section', { class: 'deck-stats-strip' },
    h('div', { class: 'deck-stat-boxes' },
      createStatBox('Mới', st.new, 'num-new', `Hạn mức hôm nay: ${st.newLeftToday}`, 'new'),
      createStatBox('Đang học', st.learning, 'num-learning', 'Các bước nhắc ngắn', 'learning'),
      createStatBox('Đến hạn', st.due, st.due > 0 ? 'num-due' : '', st.due > 0 ? 'Cần ôn tập ngay' : 'Không trễ hạn', 'due'),
      createStatBox('Đã thuộc', st.mastered, 'num-mastered', `Tổng ${totalValid} mục`, 'mastered')
    ),
    renderStackedBar(st)
  );

  // 3. Chuẩn bị dữ liệu bảng
  const preparedRows = items.map((it, idx) => {
    const s = summarize(it, kind);
    const typeLbl = itemTypeLabel(s.type);
    const status = getItemStudyStatus(deckId, it, progress, now);
    const topic = it.topic || '';
    const tags = Array.isArray(it.tags) ? it.tags : [];
    const searchBlob = stripAccents(`${s.main} ${s.answer} ${topic} ${tags.join(' ')} ${typeLbl}`);
    return {
      item: it,
      index: idx + 1,
      type: s.type,
      typeLabel: typeLbl,
      main: s.main,
      answer: s.answer,
      topic,
      tags,
      status,
      searchBlob,
    };
  });

  const distinctTypeLabels = [...new Set(preparedRows.map(r => r.typeLabel))];
  const distinctTopics = [...new Set(preparedRows.map(r => r.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const distinctTags = extractTags(items);

  // 4. Cột trái: CHẾ ĐỘ HỌC & BỘ LỌC NHANH
  const sidebarFilterItems = [];

  function createFilterItem(label, count, dotClass, key) {
    const el = h('button', {
      type: 'button',
      class: `deck-sidebar-filter-item ${filterStatus === key ? 'active' : ''}`,
      onclick: () => updateFilterState(key),
    },
      h('span', { style: 'display: flex; align-items: center;' },
        h('span', { class: `deck-filter-dot ${dotClass}` }),
        label
      ),
      h('span', { class: 'muted', style: 'font-size: 11px;' }, String(count))
    );
    sidebarFilterItems.push({ key, el });
    return el;
  }

  const sidebarEl = h('aside', { class: 'deck-sidebar' },
    // A. CHẾ ĐỘ HỌC
    h('div', null,
      h('div', { class: 'deck-sidebar-section-title' }, 'Chế độ học'),
      h('div', { class: 'deck-sidebar-modes' },
        ...modes.map(m => {
          const isSrs = m.id === 'srs';
          const icon = MODE_ICONS[m.id] || '▶';
          const avail = checkModeAvailability(m.id, entry.deck, {
            hasVoice: hasVoice(settings?.ttsLang || 'en-US'),
          });

          let badgeText = isSrs
            ? (totalToday > 0 ? `${totalToday}` : 'Xong ✓')
            : `${totalValid}`;

          const disabled = !avail.available || totalValid === 0;
          if (!avail.available) badgeText = '—';
          const isPrimary = isSrs && totalToday > 0;

          return h('button', {
            type: 'button',
            class: `deck-sidebar-mode-btn ${isPrimary ? 'primary-mode' : ''}`,
            disabled,
            title: avail.reason || m.description,
            onclick: () => {
              if (disabled) return;
              const sessionOpts = deckLangs.length > 1 ? { selectedLangs: savedLangs } : {};
              if (m.id === 'srs') actions.startSrsSession(entry, sessionOpts);
              else if (m.id === 'learn') actions.startLearnSession(entry, sessionOpts);
              else if (m.id === 'match') actions.startMatchSession(entry, sessionOpts);
              else if (m.id === 'exam') actions.openSessionSetup(entry, { defaultMode: 'exam', ...sessionOpts });
              else if (m.id === 'all' || (m.id === 'flashcards' && kind !== 'vocab')) {
                actions.startSession(entry, { mode: m.id, count: totalValid, shuffle: false, persist: true, ...sessionOpts });
              } else {
                actions.openSessionSetup(entry, { defaultMode: m.id, ...sessionOpts });
              }
            },
          },
            h('div', { class: 'deck-sidebar-mode-left' },
              h('span', { class: 'deck-sidebar-mode-icon' }, icon),
              h('span', { class: 'deck-sidebar-mode-label' }, m.label)
            ),
            h('span', { class: `ux-chip sm ${isPrimary ? 'active' : ''} ${!avail.available ? 'warn' : ''}` }, badgeText)
          );
        })
      )
    ),

    h('div', { class: 'deck-sidebar-divider' }),

    // B. BỘ LỌC NHANH
    h('div', null,
      h('div', { class: 'deck-sidebar-section-title' },
        h('span', null, 'Bộ lọc nhanh'),
        filterStatus !== 'all' ? h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          style: 'padding: 0 4px; font-size: 10px; height: 18px;',
          onclick: () => updateFilterState('all'),
        }, 'Xoá lọc') : null
      ),
      h('div', { class: 'deck-sidebar-filters' },
        createFilterItem('Tất cả mục', items.length, 'dot-all', 'all'),
        createFilterItem('Đến hạn cần ôn', st.due, 'dot-due', 'due'),
        createFilterItem('Sai nhiều / Leech', countLeechOrError, 'dot-error', 'error-prone'),
        createFilterItem('Đã gắn sao ★', countStarred, 'dot-starred', 'starred'),
        createFilterItem('Đang học', st.learning, 'dot-learning', 'learning'),
        createFilterItem('Đã thuộc', st.mastered, 'dot-mastered', 'mastered'),
        createFilterItem('Chưa học (Mới)', st.new, 'dot-new', 'new')
      )
    )
  );

  // 5. Cột phải: NGÂN HÀNG CÂU HỎI (Vùng cuộn độc lập)
  const countLabelEl = h('span', { class: 'muted', style: 'font-size: 12px; font-weight: 500;' });
  const tableContainerEl = h('div', { class: 'deck-table-container' });
  const tableHost = h('div');
  tableContainerEl.append(tableHost);

  const searchInput = h('input', {
    type: 'text',
    class: 'ux-input ux-search-input',
    placeholder: 'Tìm nội dung, chủ đề, nhãn…',
    oninput: ev => {
      searchQuery = ev.target.value;
      clearSearchBtn.hidden = !searchQuery;
      currentPage = 1;
      renderTableBody();
    },
  });

  const clearSearchBtn = h('button', {
    type: 'button',
    class: 'ux-search-clear',
    hidden: true,
    title: 'Xoá tìm kiếm',
    onclick: () => {
      searchQuery = '';
      searchInput.value = '';
      clearSearchBtn.hidden = true;
      currentPage = 1;
      renderTableBody();
      searchInput.focus();
    },
  }, '✕');

  const searchWrap = h('div', { class: 'ux-search-wrap deck-table-search' });
  searchWrap.append(createSearchSvg(), searchInput, clearSearchBtn);

  const typeSelect = h('select', {
    class: 'ux-select',
    'aria-label': 'Lọc theo dạng mục',
    onchange: ev => {
      filterType = ev.target.value;
      currentPage = 1;
      renderTableBody();
    },
  },
    h('option', { value: 'all' }, 'Tất cả dạng'),
    ...distinctTypeLabels.map(lbl => h('option', { value: lbl }, `Dạng: ${lbl}`)));

  const topicSelect = distinctTopics.length > 0 ? h('select', {
    class: 'ux-select',
    'aria-label': 'Lọc theo chủ đề',
    onchange: ev => {
      filterTopic = ev.target.value;
      currentPage = 1;
      renderTableBody();
    },
  },
    h('option', { value: 'all' }, 'Tất cả chủ đề'),
    ...distinctTopics.map(tp => h('option', { value: tp }, `Chủ đề: ${tp}`))) : null;

  const tagSelect = distinctTags.length > 0 ? h('select', {
    class: 'ux-select',
    'aria-label': 'Lọc theo nhãn',
    onchange: ev => {
      filterTag = ev.target.value;
      currentPage = 1;
      renderTableBody();
    },
  },
    h('option', { value: 'all' }, 'Tất cả nhãn'),
    ...distinctTags.map(tg => h('option', { value: tg }, `Nhãn: #${tg}`))) : null;

  const statusSelect = h('select', {
    class: 'ux-select',
    'aria-label': 'Lọc theo trạng thái học',
    onchange: ev => {
      updateFilterState(ev.target.value);
    },
  },
    h('option', { value: 'all' }, 'Tất cả trạng thái'),
    h('option', { value: 'due' }, 'Trạng thái: Đến hạn'),
    h('option', { value: 'error-prone' }, 'Trạng thái: ⚠ Sai nhiều'),
    h('option', { value: 'leech' }, 'Trạng thái: ⚠ Thẻ khó (Leech)'),
    h('option', { value: 'starred' }, 'Trạng thái: ★ Đã sao'),
    h('option', { value: 'learning' }, 'Trạng thái: Đang học'),
    h('option', { value: 'mastered' }, 'Trạng thái: Đã thuộc'),
    h('option', { value: 'new' }, 'Trạng thái: Mới'));

  function renderTableBody() {
    const qNorm = stripAccents(searchQuery.trim());
    const filtered = preparedRows.filter(r => {
      if (filterType !== 'all' && r.typeLabel !== filterType) return false;
      if (filterTopic !== 'all' && r.topic !== filterTopic) return false;
      if (filterTag !== 'all' && !r.tags.includes(filterTag)) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'starred' && !r.status.isStarred) return false;
        if (filterStatus === 'leech' && !r.status.isLeech) return false;
        if (filterStatus === 'error-prone' && !r.status.isErrorProne) return false;
        if (filterStatus !== 'starred' && filterStatus !== 'leech' && filterStatus !== 'error-prone' && r.status.key !== filterStatus) return false;
      }
      if (qNorm && !r.searchBlob.includes(qNorm)) return false;
      return true;
    });

    const totalFiltered = filtered.length;
    const effectivePageSize = pageSize === 'all' ? totalFiltered : Number(pageSize);
    const totalPages = effectivePageSize > 0 ? Math.max(1, Math.ceil(totalFiltered / effectivePageSize)) : 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * effectivePageSize;
    const endIdx = pageSize === 'all' ? totalFiltered : Math.min(startIdx + effectivePageSize, totalFiltered);
    const pageRows = pageSize === 'all' ? filtered : filtered.slice(startIdx, endIdx);

    countLabelEl.textContent = totalFiltered === items.length
      ? `${items.length} mục`
      : `${totalFiltered} / ${items.length} mục`;

    if (!items.length) {
      tableHost.replaceChildren(
        h('div', { class: 'empty', style: 'padding: 40px;' },
          h('p', { style: 'font-weight: 600; margin: 0 0 6px;' }, 'Bộ thẻ chưa có mục nào.'),
          h('p', { class: 'muted', style: 'margin: 0 0 14px; font-size: 13px;' }, 'Mở trình soạn để thêm câu hỏi hoặc thẻ mới.'),
          h('button', { type: 'button', class: 'ux-btn primary sm', onclick: () => actions.openEditor(entry) }, '✏ Mở trình soạn'))
      );
      paginationHost.replaceChildren();
      return;
    }

    if (!filtered.length) {
      tableHost.replaceChildren(
        h('div', { class: 'empty', style: 'padding: 36px;' },
          h('p', { class: 'muted', style: 'margin: 0 0 12px;' }, 'Không có mục nào khớp với bộ lọc hiện tại.'),
          h('button', {
            type: 'button',
            class: 'ux-btn sm',
            onclick: () => {
              searchQuery = '';
              filterType = 'all';
              filterTopic = 'all';
              filterTag = 'all';
              searchInput.value = '';
              clearSearchBtn.hidden = true;
              typeSelect.value = 'all';
              if (topicSelect) topicSelect.value = 'all';
              if (tagSelect) tagSelect.value = 'all';
              updateFilterState('all');
            },
          }, 'Xoá tất cả bộ lọc'))
      );
      paginationHost.replaceChildren();
      return;
    }

    // Bảng dữ liệu câu hỏi
    tableHost.replaceChildren(
      h('table', { class: 'items deck-items-table' },
        h('thead', null, h('tr', null,
          h('th', { class: 'num' }, '#'),
          h('th', { style: 'width: 36px;' }, '★'),
          h('th', { style: 'width: 110px;' }, 'Dạng'),
          h('th', null, 'Nội dung câu hỏi / thuật ngữ'),
          h('th', { style: 'width: 140px;' }, 'Chủ đề'),
          h('th', { style: 'width: 140px;' }, 'Nhãn'),
          h('th', { style: 'width: 130px;' }, 'Trạng thái'))),
        h('tbody', null, pageRows.map(r => {
          const metaKey = `${deckId}:${r.item.id}`;
          const isStarred = Boolean(progress?.meta?.[metaKey]?.starred);
          const starBtn = h('button', {
            type: 'button',
            class: `star-btn ${isStarred ? 'starred' : ''}`,
            title: isStarred ? 'Bỏ gắn sao' : 'Gắn sao mục này',
            onclick: async ev => {
              ev.stopPropagation();
              if (!progress.meta) progress.meta = {};
              if (!progress.meta[metaKey]) progress.meta[metaKey] = { starred: false, note: '' };
              progress.meta[metaKey].starred = !isStarred;
              if (window.api?.saveProgress) await window.api.saveProgress(progress);
              renderTableBody();
            },
          }, isStarred ? '★' : '☆');

          return h('tr', {
            class: 'deck-item-tr',
            tabindex: '0',
            role: 'button',
            title: 'Bấm để mở trình soạn tại mục này',
            onclick: () => actions.openEditor(entry, r.item.id),
            onkeydown: ev => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                actions.openEditor(entry, r.item.id);
              }
            },
          },
            h('td', { class: 'num' }, r.index),
            h('td', { style: 'text-align: center; width: 36px;' }, starBtn),
            h('td', null, h('span', { class: `chip type-badge type-${r.type}` }, r.typeLabel)),
            h('td', null,
              h('div', { class: 'item-cell-main line-clamp-2', style: 'display: flex; align-items: center; gap: 6px;' },
                h('span', null, r.main || '(Chưa có nội dung)'),
                r.item.term ? h('button', {
                  type: 'button',
                  class: 'ux-btn ghost sm',
                  style: 'padding: 0 4px; height: 18px; font-size: 11px; flex-shrink: 0;',
                  title: 'Phát âm (TTS)',
                  onclick: ev => {
                    ev.stopPropagation();
                    speak(r.item.term, settings?.ttsLang || 'en-US');
                  },
                }, '🔊') : null),
              r.answer ? h('div', { class: 'item-cell-ans line-clamp-1' }, `→ ${r.answer}`) : null),
            h('td', null, r.topic ? h('span', { class: 'ux-chip sm', style: 'cursor: pointer;' }, r.topic) : h('span', { class: 'muted' }, '—')),
            h('td', null, r.tags.length ? r.tags.map(t => h('span', { class: 'tag' }, t)) : h('span', { class: 'muted' }, '—')),
            h('td', null, h('span', { class: `item-status-pill ${r.status.cls}` }, r.status.label))
          );
        }))
      )
    );

    // Thanh phân trang (Pagination Footer)
    paginationHost.replaceChildren(
      h('div', { class: 'deck-pagination-bar' },
        h('div', { style: 'display: flex; align-items: center; gap: 8px;' },
          h('span', null, `Hiển thị ${totalFiltered > 0 ? startIdx + 1 : 0}–${endIdx} trong ${totalFiltered} mục`),
          h('div', { class: 'deck-page-size-selector' },
            h('span', { style: 'margin-left: 8px; margin-right: 2px;' }, 'Mỗi trang:'),
            ...[25, 50, 100, 'all'].map(sz => h('button', {
              type: 'button',
              class: `deck-page-size-btn ${pageSize === sz ? 'active' : ''}`,
              onclick: () => {
                pageSize = sz;
                currentPage = 1;
                renderTableBody();
              },
            }, sz === 'all' ? 'Tất cả' : String(sz))))
        ),
        totalPages > 1 ? h('div', { class: 'deck-page-nav' },
          h('button', {
            type: 'button',
            class: 'ux-btn ghost sm deck-page-btn',
            disabled: currentPage <= 1,
            onclick: () => {
              if (currentPage > 1) {
                currentPage--;
                renderTableBody();
                tableContainerEl.scrollTop = 0;
              }
            },
          }, '◀ Trước'),
          h('span', { style: 'font-weight: 600; padding: 0 4px;' }, `Trang ${currentPage} / ${totalPages}`),
          h('button', {
            type: 'button',
            class: 'ux-btn ghost sm deck-page-btn',
            disabled: currentPage >= totalPages,
            onclick: () => {
              if (currentPage < totalPages) {
                currentPage++;
                renderTableBody();
                tableContainerEl.scrollTop = 0;
              }
            },
          }, 'Sau ▶')) : null
      )
    );
  }

  const paginationHost = h('div');

  const mainContentEl = h('main', { class: 'deck-main-content' },
    h('div', { class: 'deck-main-toolbar' },
      searchWrap,
      h('div', { class: 'deck-table-filters' },
        typeSelect,
        topicSelect,
        tagSelect,
        statusSelect,
        countLabelEl
      )
    ),
    tableContainerEl,
    paginationHost
  );

  renderTableBody();

  // 6. Split layout: Cột trái (Chế độ học + Lọc nhanh) + Cột phải (Ngân hàng câu hỏi)
  const splitLayoutEl = h('div', { class: 'deck-split-layout' },
    sidebarEl,
    mainContentEl
  );

  // 7. Lắp ráp toàn bộ vào .deck-view-container (Không để lại bất kỳ giá trị null nào)
  const containerEl = h('div', { class: 'deck-view-container' },
    ...[
      headerEl,
      renderCollapsibleIssues(issues),
      statsRowEl,
      splitLayoutEl,
    ].filter(Boolean)
  );

  root.replaceChildren(containerEl);
  root.ownerDocument.title = `${meta.title} — ${fileName(entry.path) || 'Turtle Deck'}`;
}
