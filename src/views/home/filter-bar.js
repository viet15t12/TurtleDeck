// src/views/home/filter-bar.js — Dựng thanh bộ lọc loại thẻ, ô tìm kiếm và sắp xếp

import { h } from '../dom.js';
import { KINDS } from '../../core/deckkinds.js';

export function createSearchSvg() {
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

export function createFilterBar(ctx) {
  const { ui, refresh } = ctx;

  const filterOptions = [
    { id: 'all', label: 'Tất cả' },
    { id: 'qa', label: `${KINDS.qa.icon} ${KINDS.qa.label}` },
    { id: 'quiz', label: `${KINDS.quiz.icon} ${KINDS.quiz.label}` },
    { id: 'vocab', label: `${KINDS.vocab.icon} ${KINDS.vocab.label}` },
  ];

  const searchInput = h('input', {
    type: 'text',
    class: 'ux-input ux-search-input',
    placeholder: 'Tìm theo tên thư mục hoặc bộ thẻ…',
    value: ui.searchQuery,
    oninput: ev => {
      ui.searchQuery = ev.target.value;
      refresh.cards();
      clearBtn.hidden = !ui.searchQuery;
    },
  });

  const clearBtn = h(
    'button',
    {
      type: 'button',
      class: 'ux-search-clear',
      title: 'Xoá tìm kiếm',
      hidden: !ui.searchQuery,
      onclick: () => {
        ui.searchQuery = '';
        searchInput.value = '';
        clearBtn.hidden = true;
        refresh.cards();
        searchInput.focus();
      },
    },
    '✕'
  );

  const searchWrap = h('div', { class: 'ux-search-wrap home-search-box', style: 'flex: 1; max-width: 320px;' });
  searchWrap.append(createSearchSvg(), searchInput, clearBtn);

  const sortSelect = h(
    'select',
    {
      class: 'ux-select',
      'aria-label': 'Sắp xếp bộ thẻ',
      onchange: ev => {
        ui.sortBy = ev.target.value;
        refresh.cards();
      },
    },
    h('option', { value: 'due', selected: ui.sortBy === 'due' }, 'Sắp xếp: Cần ôn nhất'),
    h('option', { value: 'recent', selected: ui.sortBy === 'recent' }, 'Sắp xếp: Vừa học gần đây'),
    h('option', { value: 'title', selected: ui.sortBy === 'title' }, 'Sắp xếp: Tên A→Z')
  );

  const filterBar = h(
    'div',
    { class: 'home-filter-bar' },
    h(
      'div',
      { class: 'home-filter-chips' },
      ...filterOptions.map(opt =>
        h(
          'button',
          {
            type: 'button',
            class: `ux-chip ${ui.filterKind === opt.id ? 'active' : ''}`,
            onclick: () => {
              ui.filterKind = opt.id;
              refresh.deckSection();
            },
          },
          opt.label
        )
      )
    ),
    h('div', { class: 'home-filter-right' }, searchWrap, sortSelect)
  );

  return filterBar;
}

