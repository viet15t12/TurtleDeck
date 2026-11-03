// src/views/stats.js — Màn hình Thống kê học tập (Stats View, Giai đoạn 6).
import { h, fileName } from './dom.js';
import { toPlain } from '../core/richtext.js';
import {
  streak,
  reviewsPerDay,
  heatmap,
  accuracyByDeck,
  accuracyByTopic,
  leeches,
  summary,
} from '../core/stats.js';

let chartInstance = null;

// Lấy màu từ biến CSS để Chart.js tự đổi theo Light/Dark theme
function getThemeColor(varName, fallback) {
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return val || fallback;
  } catch {
    return fallback;
  }
}

export function renderStats(root, { progress, entries, settings }, actions) {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const loadedEntries = (entries || []).filter(e => e.status === 'ok' && e.deck);
  const deckList = loadedEntries.map(e => e.deck);

  let selectedDeckId = 'all'; // 'all' hoặc meta.id cụ thể
  let selectedDays = 30;     // 7 | 30 | 90 ngày

  function refreshView() {
    renderStats(root, { progress, entries, settings }, actions);
  }

  const now = Date.now();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Lọc progress theo bộ thẻ đã chọn (nếu có)
  const effectiveProgress = selectedDeckId === 'all'
    ? progress
    : {
        version: 1,
        cards: Object.fromEntries(
          Object.entries(progress?.cards || {}).filter(([k]) => k.startsWith(`${selectedDeckId}:`))
        ),
        meta: progress?.meta || {},
        log: (progress?.log || []).filter(e => e && String(e.card || '').startsWith(`${selectedDeckId}:`)),
      };

  const summ = summary(effectiveProgress, deckList, { now, tz });
  const hasLog = Array.isArray(progress?.log) && progress.log.length > 0;

  // 1. Đầu trang
  const header = h('header', { class: 'page-head' },
    h('div', null,
      h('button', { type: 'button', class: 'ux-btn ghost sm back-btn', onclick: actions.home }, '← Về trang chủ'),
      h('p', { class: 'eyebrow' }, 'THỐNG KÊ & HIỆU SUẤT'),
      h('h1', null, 'Thống kê học tập')),
    h('div', { class: 'toolbar' },
      h('button', { type: 'button', class: 'ux-btn', onclick: actions.home }, 'Về trang chủ')));

  if (!hasLog) {
    root.replaceChildren(
      header,
      h('div', { class: 'empty', style: 'padding: 48px 24px;' },
        h('div', { style: 'font-size: 40px; margin-bottom: 12px;' }, '📊'),
        h('h2', null, 'Chưa có lịch sử học tập'),
        h('p', { class: 'muted', style: 'max-width: 500px; margin: 0 auto 20px;' },
          'Bạn chưa hoàn thành lượt học nào. Hãy bắt đầu một phiên học bất kỳ để hệ thống ghi nhận tiến trình, chuỗi học và phân tích hiệu suất ghi nhớ.'),
        h('button', { type: 'button', class: 'ux-btn primary', onclick: actions.home }, 'Bắt đầu học ngay'))
    );
    root.ownerDocument.title = 'Thống kê — Turtle Deck';
    return;
  }

  // 2. Thẻ tóm tắt chỉ số
  const summaryCards = h('div', { class: 'stats-summary-grid' },
    h('div', { class: 'stats-card' },
      h('div', { class: 'stats-card-label' }, 'Chuỗi ngày học'),
      h('div', { class: 'stats-card-value', style: 'color: #f59e0b;' }, `🔥 ${summ.currentStreak}`),
      h('div', { class: 'stats-card-sub' }, `Kỷ lục dài nhất: ${summ.longestStreak} ngày`)),

    h('div', { class: 'stats-card' },
      h('div', { class: 'stats-card-label' }, 'Hôm nay'),
      h('div', { class: 'stats-card-value', style: 'color: var(--c-primary);' }, `${summ.todayCount}`),
      h('div', { class: 'stats-card-sub' }, 'Lượt ôn tập đã hoàn thành')),

    h('div', { class: 'stats-card' },
      h('div', { class: 'stats-card-label' }, 'Tỉ lệ đúng 7 ngày qua'),
      h('div', { class: 'stats-card-value ok-text' }, `${summ.accuracy7d}%`),
      h('div', { class: 'stats-card-sub' }, `Dựa trên ${summ.total7d} lượt ôn tập gần nhất`)),

    h('div', { class: 'stats-card' },
      h('div', { class: 'stats-card-label' }, 'Thẻ đang học / Đã thuộc'),
      h('div', { class: 'stats-card-value' }, `${summ.totalStudied}`),
      h('div', { class: 'stats-card-sub' }, `Trong đó ${summ.masteredCards} thẻ đã thuộc chín`)));

  // 3. Thanh bộ lọc (Deck & Khoảng thời gian)
  const deckSelect = h('select', {
    class: 'ux-select',
    style: 'min-width: 220px;',
    onchange: ev => {
      selectedDeckId = ev.target.value;
      updateChartsAndLists();
    },
  },
    h('option', { value: 'all', selected: selectedDeckId === 'all' }, 'Tất cả bộ thẻ'),
    ...loadedEntries.map(e => h('option', {
      value: e.deck.meta.id,
      selected: selectedDeckId === e.deck.meta.id,
    }, e.deck.meta.title)));

  const daysButtons = [7, 30, 90].map(d => h('button', {
    type: 'button',
    class: `ux-chip ${selectedDays === d ? 'active' : ''}`,
    onclick: () => {
      selectedDays = d;
      daysButtons.forEach((btn, idx) => {
        btn.classList.toggle('active', [7, 30, 90][idx] === d);
      });
      updateChartsAndLists();
    },
  }, `${d} ngày`));

  const filtersBar = h('div', { class: 'stats-filters-bar' },
    h('div', { class: 'stats-filters-left' },
      h('span', { class: 'muted', style: 'font-size: 13px; font-weight: 600;' }, 'Bộ thẻ:'),
      deckSelect),
    h('div', { class: 'stats-filters-right' },
      h('span', { class: 'muted', style: 'font-size: 13px; font-weight: 600;' }, 'Thời gian:'),
      h('div', { class: 'toolbar', style: 'gap: 4px;' }, ...daysButtons)));

  // 4. Biểu đồ cột số lượt/ngày (Chart.js)
  const canvasEl = h('canvas', { id: 'stats-bar-chart' });
  const chartCard = h('div', { class: 'stats-chart-card' },
    h('div', { style: 'display: flex; justify-content: space-between; align-items: center;' },
      h('h2', { style: 'margin: 0;' }, 'Số lượt ôn tập theo ngày'),
      h('div', { class: 'muted', style: 'font-size: 13px;' }, 'Xếp chồng Đúng / Sai')),
    h('div', { class: 'chart-wrapper' }, canvasEl));

  function initOrUpdateBarChart() {
    if (!window.Chart) return;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const rpd = reviewsPerDay(effectiveProgress, selectedDays, { now, tz });
    const labels = rpd.map(r => {
      const p = r.date.split('-');
      return `${p[2]}/${p[1]}`;
    });
    const correctData = rpd.map(r => r.correct);
    const incorrectData = rpd.map(r => r.incorrect);

    const okColor = getThemeColor('--c-ok', '#16a34a');
    const dangerColor = getThemeColor('--c-danger', '#dc2626');
    const textColor = getThemeColor('--c-text-muted', '#64748b');
    const gridColor = getThemeColor('--c-border', '#e2e8f0');

    chartInstance = new window.Chart(canvasEl, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Đúng',
            data: correctData,
            backgroundColor: okColor,
            borderRadius: 3,
            stack: 'stacked',
          },
          {
            label: 'Sai / Quên',
            data: incorrectData,
            backgroundColor: dangerColor,
            borderRadius: 3,
            stack: 'stacked',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'inherit', size: 12 } },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'inherit', size: 11 } },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              precision: 0,
              font: { family: 'inherit', size: 11 },
            },
          },
        },
      },
    });
  }

  // 5. Heatmap 90 ngày
  const heatmapHost = h('div');
  function renderHeatmapBlock() {
    const hm = heatmap(effectiveProgress, 90, { now, tz });
    const cells = hm.map(cell => h('div', {
      class: 'heatmap-cell',
      'data-level': String(cell.level),
      title: `${cell.date}: ${cell.count} lượt (${cell.correct} đúng, ${cell.incorrect} sai)`,
    }));

    heatmapHost.replaceChildren(
      h('div', { class: 'stats-heatmap-card' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center;' },
          h('h2', { style: 'margin: 0;' }, 'Mức độ hoạt động 90 ngày qua'),
          h('div', { class: 'muted', style: 'font-size: 13px;' }, 'Tần suất ôn tập')),
        h('div', { class: 'heatmap-grid-wrap' },
          h('div', { class: 'heatmap-grid' }, ...cells)),
        h('div', { class: 'heatmap-legend' },
          h('span', null, 'Ít'),
          h('div', { class: 'heatmap-cell heatmap-legend-cell', 'data-level': '0' }),
          h('div', { class: 'heatmap-cell heatmap-legend-cell', 'data-level': '1' }),
          h('div', { class: 'heatmap-cell heatmap-legend-cell', 'data-level': '2' }),
          h('div', { class: 'heatmap-cell heatmap-legend-cell', 'data-level': '3' }),
          h('div', { class: 'heatmap-cell heatmap-legend-cell', 'data-level': '4' }),
          h('span', null, 'Nhiều')))
    );
  }

  // 6. Tỉ lệ đúng theo bộ thẻ & theo chủ đề
  const twoColsHost = h('div', { class: 'stats-two-cols' });

  function renderAccuracyLists() {
    const accDecks = accuracyByDeck(effectiveProgress, deckList, {
      filterDeckId: selectedDeckId === 'all' ? null : selectedDeckId,
    });

    // Gom itemsLookup để tra topic
    const itemsLookup = new Map();
    for (const e of loadedEntries) {
      if (selectedDeckId !== 'all' && e.deck.meta.id !== selectedDeckId) continue;
      for (const item of (e.deck.items || [])) {
        if (item?.id) itemsLookup.set(item.id, item.topic || '');
      }
    }

    const accTopics = accuracyByTopic(effectiveProgress, {
      deckId: selectedDeckId === 'all' ? null : selectedDeckId,
      itemsLookup,
    });

    const deckCol = h('div', { class: 'panel', style: 'padding: 20px;' },
      h('h2', { style: 'margin: 0;' }, 'Tỉ lệ đúng theo bộ thẻ'),
      h('div', { class: 'accuracy-list' },
        accDecks.length
          ? accDecks.map(d => h('div', { class: 'accuracy-row' },
              h('div', { class: 'accuracy-row-info' },
                h('span', { style: 'font-weight: 600;' }, d.title),
                h('span', null, `${d.accuracy}% (${d.correct}/${d.total})`)),
              h('div', { class: 'accuracy-bar-track' },
                h('div', {
                  class: 'accuracy-bar-fill',
                  style: `width: ${d.accuracy}%; background: ${d.accuracy >= 80 ? 'var(--c-ok)' : d.accuracy >= 50 ? 'var(--c-primary)' : 'var(--c-warn)'};`,
                }))))
          : h('div', { class: 'muted', style: 'font-size: 13px;' }, 'Chưa có dữ liệu ôn tập cho bộ thẻ này.')));

    const topicCol = h('div', { class: 'panel', style: 'padding: 20px;' },
      h('h2', { style: 'margin: 0;' }, 'Tỉ lệ đúng theo chủ đề'),
      h('div', { class: 'accuracy-list' },
        accTopics.length
          ? accTopics.map(t => h('div', { class: 'accuracy-row' },
              h('div', { class: 'accuracy-row-info' },
                h('span', { style: 'font-weight: 600;' }, t.topic),
                h('span', null, `${t.accuracy}% (${t.correct}/${t.total})`)),
              h('div', { class: 'accuracy-bar-track' },
                h('div', {
                  class: 'accuracy-bar-fill',
                  style: `width: ${t.accuracy}%; background: ${t.accuracy >= 80 ? 'var(--c-ok)' : t.accuracy >= 50 ? 'var(--c-primary)' : 'var(--c-warn)'};`,
                }))))
          : h('div', { class: 'muted', style: 'font-size: 13px;' }, 'Chưa có phân loại chủ đề trong các mục đã ôn.')));

    twoColsHost.replaceChildren(deckCol, topicCol);
  }

  // 7. Bảng Thẻ khó nhớ (Leeches: lapses >= 8)
  const leechHost = h('div', { class: 'panel', style: 'padding: 20px;' });

  function renderLeechTable() {
    const leechList = leeches(effectiveProgress.cards, {
      threshold: 8,
      deckId: selectedDeckId === 'all' ? null : selectedDeckId,
    });

    if (!leechList.length) {
      leechHost.replaceChildren(
        h('h2', { style: 'margin: 0 0 8px;' }, 'Thẻ khó nhớ (Leeches)'),
        h('div', { class: 'muted', style: 'font-size: 13px;' },
          '🎉 Tuyệt vời! Hiện không có thẻ nào bị quên quá 8 lần (lapses < 8).')
      );
      return;
    }

    const rows = leechList.map((c, idx) => {
      const entry = loadedEntries.find(e => e.deck.meta.id === c.deckId);
      const item = entry?.deck?.items?.find(it => it.id === c.itemId);
      const content = item
        ? toPlain(item.question || item.front || item.term || '')
        : `Mục ID: ${c.itemId}`;

      const metaKey = `${c.deckId}:${c.itemId}`;
      const isStarred = Boolean(progress?.meta?.[metaKey]?.starred);

      const starBtn = h('button', {
        type: 'button',
        class: `star-btn ${isStarred ? 'starred' : ''}`,
        title: isStarred ? 'Bỏ gắn sao' : 'Gắn sao',
        onclick: async () => {
          if (!progress.meta) progress.meta = {};
          progress.meta[metaKey] = {
            ...(progress.meta[metaKey] || {}),
            starred: !isStarred,
          };
          await window.api.saveProgress(progress);
          renderLeechTable();
        },
      }, isStarred ? '★' : '☆');

      const editBtn = entry ? h('button', {
        type: 'button',
        class: 'ux-btn sm',
        onclick: () => actions.openEditor(entry, c.itemId),
      }, '✏ Sửa trong Editor') : null;

      return h('tr', null,
        h('td', { style: 'width: 40px;' }, String(idx + 1)),
        h('td', { style: 'width: 40px;' }, starBtn),
        h('td', { style: 'font-weight: 600;' }, content || '(Trống)'),
        h('td', { style: 'width: 180px;' }, entry?.deck?.meta?.title || c.deckId),
        h('td', { style: 'width: 140px;' },
          h('span', { class: 'leech-badge' }, `⚠ ${c.lapses} lần quên`)),
        h('td', { style: 'width: 150px;' }, editBtn));
    });

    leechHost.replaceChildren(
      h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' },
        h('h2', { style: 'margin: 0;' }, `Thẻ khó nhớ — Leech (${leechList.length})`),
        h('div', { class: 'muted', style: 'font-size: 13px;' }, 'Các thẻ bị quên từ 8 lần trở lên')),
      h('div', { class: 'leech-table-wrap' },
        h('table', { class: 'leech-table' },
          h('thead', null,
            h('tr', null,
              h('th', null, '#'),
              h('th', null, 'Sao'),
              h('th', null, 'Nội dung rút gọn'),
              h('th', null, 'Bộ thẻ'),
              h('th', null, 'Số lần quên'),
              h('th', null, 'Thao tác'))),
          h('tbody', null, ...rows)))
    );
  }

  function updateChartsAndLists() {
    initOrUpdateBarChart();
    renderHeatmapBlock();
    renderAccuracyLists();
    renderLeechTable();
  }

  root.replaceChildren(
    h('div', { class: 'stats-container' },
      header,
      summaryCards,
      filtersBar,
      chartCard,
      heatmapHost,
      twoColsHost,
      leechHost)
  );

  updateChartsAndLists();
  root.ownerDocument.title = 'Thống kê — Turtle Deck';

  // Lắng nghe theme thay đổi để tự vẽ lại màu chart
  const observer = new MutationObserver(() => {
    initOrUpdateBarChart();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

