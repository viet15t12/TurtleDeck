// src/views/components/filterbar.js — Dựng thanh công cụ lọc danh sách câu hỏi theo chủ đề, nhãn và trạng thái học.
import { h } from '../dom.js';

export function createFilterBar({
  topics = [],
  tags = [],
  currentFilters = { topic: 'all', tag: 'all', status: 'all', search: '' },
  onChange = () => {},
} = {}) {
  const state = { ...currentFilters };

  const searchInput = h('input', {
    type: 'search',
    class: 'ux-input',
    placeholder: 'Tìm kiếm câu hỏi, nội dung...',
    value: state.search || '',
    style: 'flex: 1; min-width: 200px;',
    oninput: ev => {
      state.search = ev.target.value;
      onChange({ ...state });
    },
  });

  const topicSelect = h('select', {
    class: 'ux-select',
    style: 'min-width: 140px;',
    onchange: ev => {
      state.topic = ev.target.value;
      onChange({ ...state });
    },
  },
    h('option', { value: 'all', selected: state.topic === 'all' }, 'Mọi chủ đề'),
    ...topics.map(t => h('option', { value: t, selected: state.topic === t }, t))
  );

  const tagSelect = h('select', {
    class: 'ux-select',
    style: 'min-width: 130px;',
    onchange: ev => {
      state.tag = ev.target.value;
      onChange({ ...state });
    },
  },
    h('option', { value: 'all', selected: state.tag === 'all' }, 'Mọi nhãn'),
    ...tags.map(t => h('option', { value: t, selected: state.tag === t }, `#${t}`))
  );

  const statusOptions = [
    { value: 'all', label: 'Mọi trạng thái' },
    { value: 'new', label: 'Thẻ mới' },
    { value: 'learning', label: 'Đang học' },
    { value: 'due', label: 'Đến hạn' },
    { value: 'mastered', label: 'Đã thuộc' },
    { value: 'error-prone', label: '⚠ Sai nhiều' },
    { value: 'starred', label: '★ Đã sao' },
  ];

  const statusSelect = h('select', {
    class: 'ux-select',
    style: 'min-width: 150px;',
    onchange: ev => {
      state.status = ev.target.value;
      onChange({ ...state });
    },
  },
    ...statusOptions.map(opt => h('option', { value: opt.value, selected: state.status === opt.value }, opt.label))
  );

  const resetBtn = h('button', {
    type: 'button',
    class: 'ux-btn ghost sm',
    title: 'Đặt lại bộ lọc',
    onclick: () => {
      state.topic = 'all';
      state.tag = 'all';
      state.status = 'all';
      state.search = '';
      searchInput.value = '';
      topicSelect.value = 'all';
      tagSelect.value = 'all';
      statusSelect.value = 'all';
      onChange({ ...state });
    },
  }, 'Đặt lại');

  const root = h('div', { class: 'ux-filterbar', style: 'display: flex; gap: 8px; flex-wrap: wrap; align-items: center;' },
    searchInput,
    topics.length > 0 ? topicSelect : null,
    tags.length > 0 ? tagSelect : null,
    statusSelect,
    resetBtn
  );

  return {
    el: root,
    getState: () => ({ ...state }),
  };
}

