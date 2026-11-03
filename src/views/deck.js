// src/views/deck.js — Deck view (GĐ3B Lượt 2): huy hiệu loại, 4 ô số thống kê, thẻ Chế độ học theo loại,
// khối cảnh báo thu gọn, bảng mục có tìm kiếm & lọc (Dạng/Chủ đề/Trạng thái), bấm dòng mở Editor tại đúng mục.
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
import { stripAccents } from '../core/deckmodel.js';
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

// Nội dung chính + đáp án của item dạng văn bản thuần (toPlain)
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
    default:
      return {
        type: 'vocab',
        main: toPlain(it.term),
        answer: toPlain(it.definition),
      };
  }
}

// Xác định trạng thái học của từng mục để hiển thị và lọc trên bảng
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
  if (!issues.length) return null;
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
    h('ul', { class: 'issues', style: 'margin-top: 10px;' }, sorted.map(i =>
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

  const rawIssues = entry.issues || [];
  const mismatched = mismatchedItems(entry.deck);
  const hasMismatchInIssues = rawIssues.some(i => i.mismatch || (i.msg && i.msg.includes('nằm trong bộ')));
  const issues = (!hasMismatchInIssues && mismatched.length > 0)
    ? [...rawIssues, { level: 'warn', mismatch: true, msg: formatMismatchWarning(entry.deck) }]
    : rawIssues;

  const st = deckStats(entry.deck, progress, settings, now);
  const dueToday = st.due + st.learning;
  const totalToday = dueToday + st.newLeftToday;
  const totalValid = st.new + st.learning + st.due + st.mastered;
  const modes = modesFor(kind);

  // 1. Đầu trang: huy hiệu loại, tên, mô tả, nút Sửa bộ thẻ
  const headerEl = h('header', { class: 'page-head deck-view-head' },
    h('div', { class: 'deck-view-title-block' },
      h('button', { type: 'button', class: 'ux-btn ghost sm back-btn', onclick: actions.home }, '← Về trang chủ'),
      h('div', { class: 'deck-view-badges' },
        h('span', { class: 'ux-kind-badge', 'data-kind': kind }, kInfo?.icon || '📝', kindLabel(kind)),
        entry.path ? null : h('span', { class: 'badge unsaved' }, '● chưa lưu'),
        entry.assetCount ? h('span', { class: 'ux-chip', style: 'cursor: default;' }, `🖼 ${entry.assetCount} ảnh`) : null),
      h('h1', { class: 'deck-view-h1' }, meta.title),
      meta.description ? h('p', { class: 'deck-view-desc muted' }, meta.description) : null),
    h('div', { class: 'toolbar' },
      h('button', {
        type: 'button',
        class: 'ux-btn primary',
        onclick: () => actions.openEditor(entry),
      }, '✏ Sửa bộ thẻ'),
      actions.openDeckInfoModal ? h('button', {
        type: 'button',
        class: 'ux-btn',
        onclick: () => actions.openDeckInfoModal(entry),
      }, 'ℹ Thông tin') : null,
      entry.path ? null : h('button', {
        type: 'button',
        class: 'ux-btn',
        onclick: () => actions.saveAs(entry),
      }, '💾 Lưu thành .sdeck…'),
      h('button', {
        type: 'button',
        class: 'ux-btn ghost danger-hover',
        onclick: () => actions.remove(entry),
      }, 'Gỡ khỏi danh sách')));

  // 2. Bốn ô số thống kê (Mới, Đang học, Đến hạn, Đã thuộc) + thanh phân bổ
  const statsSection = h('section', { class: 'deck-stats-panel panel' },
    h('div', { class: 'deck-stat-boxes' },
      h('div', { class: 'deck-stat-box' },
        h('div', { class: 'deck-stat-label' }, 'Mới'),
        h('div', { class: 'deck-stat-num num-new' }, String(st.new)),
        h('div', { class: 'deck-stat-sub muted' }, `Hạn mức hôm nay: ${st.newLeftToday}`)),
      h('div', { class: 'deck-stat-box' },
        h('div', { class: 'deck-stat-label' }, 'Đang học'),
        h('div', { class: 'deck-stat-num num-learning' }, String(st.learning)),
        h('div', { class: 'deck-stat-sub muted' }, 'Trong các bước nhắc ngắn')),
      h('div', { class: 'deck-stat-box' },
        h('div', { class: 'deck-stat-label' }, 'Đến hạn'),
        h('div', { class: `deck-stat-num ${st.due > 0 ? 'num-due' : ''}` }, String(st.due)),
        h('div', { class: 'deck-stat-sub muted' }, st.due > 0 ? 'Cần ôn tập ngay' : 'Không có thẻ trễ hạn')),
      h('div', { class: 'deck-stat-box' },
        h('div', { class: 'deck-stat-label' }, 'Đã thuộc'),
        h('div', { class: 'deck-stat-num num-mastered' }, String(st.mastered)),
        h('div', { class: 'deck-stat-sub muted' }, `Tổng ${totalValid} mục hợp lệ`))),
    renderStackedBar(st));

  // 3. Thẻ "Chế độ học" theo loại (biểu tượng + mô tả + số mục áp dụng)
  const modesSection = h('section', { class: 'deck-modes-section' },
    h('h2', { class: 'section-label' }, 'Chế độ học'),
    h('div', { class: 'deck-modes-grid' },
      ...modes.map(m => {
        const isSrs = m.id === 'srs';
        const icon = MODE_ICONS[m.id] || '▶';
        const avail = checkModeAvailability(m.id, entry.deck, {
          hasVoice: hasVoice(settings?.ttsLang || 'en-US'),
        });

        let countBadgeText = isSrs
          ? (totalToday > 0 ? `${totalToday} mục cần ôn hôm nay` : 'Hôm nay đã xong ✓')
          : `${totalValid} mục áp dụng`;

        const disabled = !avail.available || totalValid === 0;
        if (!avail.available) {
          countBadgeText = avail.reason;
        }
        const isPrimaryCard = isSrs && totalToday > 0;

        return h('button', {
          type: 'button',
          class: `deck-mode-card ${isPrimaryCard ? 'primary-mode' : ''} ${disabled ? 'disabled-mode' : ''}`,
          disabled,
          title: avail.reason || '',
          onclick: () => {
            if (disabled) return;
            if (m.id === 'srs') actions.startSrsSession(entry);
            else if (m.id === 'learn') actions.startLearnSession(entry);
            else if (m.id === 'match') actions.startMatchSession(entry);
            else if (m.id === 'exam') actions.openSessionSetup(entry, { defaultMode: 'exam' });
            else if (m.id === 'all' || (m.id === 'flashcards' && kind !== 'vocab')) {
              actions.startSession(entry, { mode: m.id, count: items.length, shuffle: false, persist: true });
            } else {
              actions.openSessionSetup(entry, { defaultMode: m.id });
            }
          },
        },
          h('div', { class: 'deck-mode-card-top' },
            h('span', { class: 'deck-mode-icon' }, icon),
            h('span', { class: `ux-chip ${isPrimaryCard ? 'active' : ''} ${!avail.available ? 'warn' : ''}` }, countBadgeText)),
          h('div', { class: 'deck-mode-title' }, m.label),
          h('div', { class: 'deck-mode-desc muted' }, m.description));
      })));

  // 4. Bảng mục có tìm kiếm và lọc theo Dạng / Chủ đề / Nhãn / Trạng thái, bấm dòng mở Editor tại đúng mục đó
  let searchQuery = '';
  let filterType = 'all';
  let filterTopic = 'all';
  let filterTag = 'all';
  let filterStatus = 'all';

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

  const tableHost = h('div');
  const countLabelEl = h('span', { class: 'muted', style: 'font-size: 13px; font-weight: 400; margin-left: 8px;' });

  const searchInput = h('input', {
    type: 'text',
    class: 'ux-input ux-search-input',
    placeholder: 'Tìm nội dung, chủ đề, nhãn…',
    oninput: ev => {
      searchQuery = ev.target.value;
      clearSearchBtn.hidden = !searchQuery;
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
      renderTableBody();
    },
  },
    h('option', { value: 'all' }, 'Tất cả nhãn'),
    ...distinctTags.map(tg => h('option', { value: tg }, `Nhãn: #${tg}`))) : null;

  const statusSelect = h('select', {
    class: 'ux-select',
    'aria-label': 'Lọc theo trạng thái học',
    onchange: ev => {
      filterStatus = ev.target.value;
      renderTableBody();
    },
  },
    h('option', { value: 'all' }, 'Tất cả trạng thái'),
    h('option', { value: 'new' }, 'Trạng thái: Mới'),
    h('option', { value: 'learning' }, 'Trạng thái: Đang học'),
    h('option', { value: 'due' }, 'Trạng thái: Đến hạn'),
    h('option', { value: 'mastered' }, 'Trạng thái: Đã thuộc'),
    h('option', { value: 'error-prone' }, 'Trạng thái: ⚠ Sai nhiều'),
    h('option', { value: 'leech' }, 'Trạng thái: ⚠ Thẻ khó nhớ (Leech)'),
    h('option', { value: 'starred' }, 'Trạng thái: ★ Đã sao'));

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

    countLabelEl.textContent = filtered.length === items.length
      ? `(${items.length} mục — bấm vào dòng để sửa)`
      : `(Hiển thị ${filtered.length} / ${items.length} mục — bấm vào dòng để sửa)`;

    if (!items.length) {
      tableHost.replaceChildren(
        h('div', { class: 'empty', style: 'padding: 28px;' },
          h('p', { style: 'font-weight: 600; margin: 0 0 6px;' }, 'Bộ thẻ chưa có mục nào.'),
          h('p', { class: 'muted', style: 'margin: 0 0 14px; font-size: 13px;' }, 'Mở trình soạn để thêm câu hỏi hoặc thẻ mới.'),
          h('button', { type: 'button', class: 'ux-btn primary sm', onclick: () => actions.openEditor(entry) }, '✏ Mở trình soạn'))
      );
      return;
    }

    if (!filtered.length) {
      tableHost.replaceChildren(
        h('div', { class: 'empty', style: 'padding: 24px;' },
          h('p', { class: 'muted', style: 'margin: 0 0 10px;' }, 'Không có mục nào khớp với bộ lọc hiện tại.'),
          h('button', {
            type: 'button',
            class: 'ux-btn sm',
            onclick: () => {
              searchQuery = '';
              filterType = 'all';
              filterTopic = 'all';
              filterTag = 'all';
              filterStatus = 'all';
              searchInput.value = '';
              clearSearchBtn.hidden = true;
              typeSelect.value = 'all';
              if (topicSelect) topicSelect.value = 'all';
              if (tagSelect) tagSelect.value = 'all';
              statusSelect.value = 'all';
              renderTableBody();
            },
          }, 'Xoá bộ lọc'))
      );
      return;
    }

    tableHost.replaceChildren(
      h('div', { class: 'table-wrap' },
        h('table', { class: 'items deck-items-table' },
          h('thead', null, h('tr', null,
            h('th', { class: 'num' }, '#'),
            h('th', { style: 'width: 40px;' }, '★'),
            h('th', { style: 'width: 120px;' }, 'Dạng'),
            h('th', null, 'Nội dung'),
            h('th', { style: 'width: 150px;' }, 'Chủ đề'),
            h('th', { style: 'width: 160px;' }, 'Nhãn'),
            h('th', { style: 'width: 150px;' }, 'Trạng thái'))),
          h('tbody', null, filtered.map(r => {
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
                await window.api.saveProgress(progress);
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
              h('td', { style: 'text-align: center; width: 40px;' }, starBtn),
              h('td', null, h('span', { class: `chip type-badge type-${r.type}` }, r.typeLabel)),
              h('td', null,
                h('div', { class: 'item-cell-main line-clamp-2', style: 'display: flex; align-items: center; gap: 6px;' },
                  h('span', null, r.main || '(Chưa có nội dung)'),
                  r.item.term ? h('button', {
                    type: 'button',
                    class: 'ux-btn ghost sm',
                    style: 'padding: 0 4px; height: 20px; font-size: 11px; flex-shrink: 0;',
                    title: 'Phát âm (Web Speech TTS)',
                    onclick: ev => {
                      ev.stopPropagation();
                      speak(r.item.term, settings?.ttsLang || 'en-US');
                    },
                  }, '🔊') : null),
                r.answer ? h('div', { class: 'item-cell-ans muted line-clamp-1' }, `→ ${r.answer}`) : null),
              h('td', null, r.topic ? h('span', { class: 'ux-chip', style: 'cursor: pointer;' }, r.topic) : h('span', { class: 'muted' }, '—')),
              h('td', null, r.tags.length ? r.tags.map(t => h('span', { class: 'tag' }, t)) : h('span', { class: 'muted' }, '—')),
              h('td', null, h('span', { class: `item-status-pill ${r.status.cls}` }, r.status.label))
            );
          }))
        )
      )
    );
  }

  renderTableBody();

  const itemsPanel = h('section', { class: 'panel' },
    h('div', { class: 'deck-table-head' },
      h('h2', { style: 'margin: 0;' }, 'Danh sách mục', countLabelEl),
      h('div', { class: 'deck-table-filters' },
        searchWrap,
        typeSelect,
        topicSelect,
        tagSelect,
        statusSelect)),
    tableHost);

  root.replaceChildren(
    headerEl,
    statsSection,
    modesSection,
    renderCollapsibleIssues(issues),
    itemsPanel
  );

  root.ownerDocument.title = `${meta.title} — ${fileName(entry.path) || 'Turtle Deck'}`;
}
