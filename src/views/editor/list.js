// src/views/editor/list.js — Cột Danh sách mục có ảo hoá, tìm kiếm bỏ dấu, chip lọc, kéo thả, context menu (§5)
import { h } from '../dom.js';
import { toPlain } from '../../core/richtext.js';
import { validateItem, hasError, friendlyIssue } from '../../core/validate.js';
import { stripAccents, isBlankNewItem } from '../../core/deckmodel.js';
import { kindOf, allowedTypes, detectItemType, itemType } from '../../core/deckkinds.js';

const ROW_H = 56;
const TYPE_BADGE = {
  single: 'TN',
  multi: 'TN',
  fill: 'ĐIỀN',
  command: 'LỆNH',
  card: 'THẺ',
  vocab: 'TỪ',
};

const TYPE_GROUP_OPTIONS = [
  { key: 'mc', label: 'Trắc nghiệm', types: ['single', 'multi'], match: t => t === 'single' || t === 'multi' },
  { key: 'fill', label: 'Điền', types: ['fill'], match: t => t === 'fill' },
  { key: 'command', label: 'Lệnh', types: ['command'], match: t => t === 'command' },
  { key: 'card', label: 'Thẻ', types: ['card'], match: t => t === 'card' },
  { key: 'vocab', label: 'Từ vựng', types: ['vocab'], match: t => t === 'vocab' },
];

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

export function createListPane({
  container,
  getDeck,
  getAssets,
  getActiveId,
  isItemTouched,
  onSelect,
  onAddLikeCurrent,
  onAddByType,
  onDuplicate,
  onDeleteIds,
  onMoveItem,
  onChangeItemType,
  onBulkSetTopic,
  onBulkAddTag,
  onOpenAssetManager,
  onOpenBulkImport,
}) {
  let searchQuery = '';
  const selectedTypes = new Set();   // 'mc' | 'fill' | 'command' | 'card'
  const selectedTopics = new Set();
  const selectedTags = new Set();
  let filterIncomplete = false;

  let selectMode = false;
  const selectedIds = new Set();
  let lastClickedId = null;
  let openPopoverKey = null; // 'type' | 'topic' | 'tag' | 'add' | null
  let dragFromIndex = null;
  let contextMenuEl = null;

  let searchInputEl = null;
  const viewportEl = h('div', {
    class: 'list-viewport',
    tabindex: '0',
    onscroll: () => renderVirtualRows(),
  });
  const spacerEl = h('div', { class: 'list-virtual-spacer' });
  viewportEl.append(spacerEl);

  const topControlsEl = h('div', { class: 'list-top-controls' });
  const footerEl = h('div', { class: 'list-footer' });
  container.replaceChildren(topControlsEl, viewportEl, footerEl);

  let filteredList = []; // [{ item, deckIndex }]
  const renderedRows = new Map(); // itemId -> HTMLElement

  function closeContextMenu() {
    if (contextMenuEl) {
      contextMenuEl.remove();
      contextMenuEl = null;
    }
  }

  document.addEventListener('click', () => {
    closeContextMenu();
    if (openPopoverKey) {
      openPopoverKey = null;
      renderControls();
      renderFooter();
    }
  });

  function itemStatus(it) {
    const assetsMap = new Map((getAssets() || []).map(a => [a.name, a]));
    const blank = isBlankNewItem(it);
    const touched = isItemTouched(it.id);
    if (blank && !touched) {
      return { dot: 'fresh', issues: [], hasIssue: false };
    }
    const issues = validateItem(it, { assets: assetsMap });
    if (!issues.length) return { dot: null, issues: [], hasIssue: false };
    if (hasError(issues)) return { dot: 'error', issues, hasIssue: true };
    return { dot: 'warn', issues, hasIssue: true };
  }

  function computeFiltered() {
    const deck = getDeck();
    const q = stripAccents(searchQuery.trim());
    filteredList = [];

    (deck.items || []).forEach((it, deckIndex) => {
      if (q) {
        const plain = stripAccents(toPlain(it.question || it.front || it.term || '', ' [công thức] '));
        const def = stripAccents(toPlain(it.definition || it.back || '', ' '));
        const topic = stripAccents(it.topic || '');
        const tags = stripAccents((it.tags || []).join(' '));
        if (!plain.includes(q) && !def.includes(q) && !topic.includes(q) && !tags.includes(q)) return;
      }

      if (selectedTypes.size > 0) {
        const t = itemType(it);
        const matchAny = TYPE_GROUP_OPTIONS.some(opt => selectedTypes.has(opt.key) && opt.match(t));
        if (!matchAny) return;
      }

      if (selectedTopics.size > 0 && !selectedTopics.has(it.topic || '')) {
        return;
      }

      if (selectedTags.size > 0) {
        const itemTags = it.tags || [];
        if (!itemTags.some(t => selectedTags.has(t))) return;
      }

      if (filterIncomplete) {
        const st = itemStatus(it);
        if (!st.hasIssue) return;
      }

      filteredList.push({ item: it, deckIndex });
    });
  }

  function buildRowContent(rowEl, it, deckIndex) {
    const activeId = getActiveId();
    const isActive = it.id === activeId;
    const isSelected = selectedIds.has(it.id);
    const t = itemType(it);
    const badge = TYPE_BADGE[t] || 'TN';
    const rawPlain = toPlain(it.question || it.front || it.term || '', '∑').trim();
    const isEmpty = !rawPlain;
    const st = itemStatus(it);

    const subParts = [];
    if (it.term && it.definition) {
      if (it.pos) subParts.push(it.pos);
      subParts.push(toPlain(it.definition, ''));
    }
    if (it.topic) subParts.push(it.topic);
    if (it.tags?.length) subParts.push(it.tags.join(', '));

    rowEl.className = `list-row ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`;
    rowEl.dataset.id = it.id;
    rowEl.dataset.type = t === 'multi' ? 'single' : t;

    const checkbox = h('input', {
      type: 'checkbox',
      class: 'list-row-check',
      checked: isSelected,
      onclick: ev => {
        ev.stopPropagation();
        toggleSelectId(it.id, ev.target.checked);
      },
    });

    const lead = h('div', { class: 'list-row-HoverLead' },
      h('span', { class: 'list-drag-grip', title: 'Kéo để sắp xếp (Alt+Shift+↑/↓)' }, '⠿'),
      checkbox);

    const body = h('div', { class: 'list-row-body' },
      h('div', { class: `list-row-title ${isEmpty ? 'is-empty' : ''}` },
        isEmpty ? '(Chưa có nội dung)' : rawPlain),
      subParts.length ? h('div', { class: 'list-row-sub' }, subParts.join(' · ')) : null);

    const dotTitle = st.dot === 'fresh'
      ? 'Mục mới chưa nhập nội dung'
      : st.issues.map(i => friendlyIssue(i)).join('\n');

    const dotEl = st.dot
      ? h('span', { class: `list-status-dot ${st.dot}`, title: dotTitle })
      : null;

    rowEl.replaceChildren(
      lead,
      h('span', { class: 'list-type-badge' }, badge),
      body,
      dotEl
    );
  }

  function createRowElement(entry, filteredIdx) {
    const { item, deckIndex } = entry;
    const rowEl = h('div', {
      class: 'list-row',
      draggable: 'true',
      style: `top: ${filteredIdx * ROW_H}px;`,
      onclick: ev => {
        if (ev.shiftKey && lastClickedId) {
          const ids = filteredList.map(x => x.item.id);
          const a = ids.indexOf(lastClickedId);
          const b = ids.indexOf(item.id);
          if (a !== -1 && b !== -1) {
            const [start, end] = a < b ? [a, b] : [b, a];
            for (let i = start; i <= end; i++) selectedIds.add(ids[i]);
            selectMode = true;
            renderVirtualRows();
            renderFooter();
            return;
          }
        }
        if (ev.ctrlKey || ev.metaKey || selectMode) {
          toggleSelectId(item.id, !selectedIds.has(item.id));
          lastClickedId = item.id;
          return;
        }
        lastClickedId = item.id;
        onSelect(item.id);
      },
      oncontextmenu: ev => {
        ev.preventDefault();
        ev.stopPropagation();
        openRowContextMenu(ev.clientX, ev.clientY, item, deckIndex);
      },
      ondragstart: ev => {
        dragFromIndex = deckIndex;
        ev.dataTransfer.effectAllowed = 'move';
      },
      ondragover: ev => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        const rect = rowEl.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        rowEl.classList.toggle('drag-above', ev.clientY < mid);
        rowEl.classList.toggle('drag-below', ev.clientY >= mid);
      },
      ondragleave: () => {
        rowEl.classList.remove('drag-above', 'drag-below');
      },
      ondrop: ev => {
        ev.preventDefault();
        const rect = rowEl.getBoundingClientRect();
        const dropBelow = ev.clientY >= rect.top + rect.height / 2;
        rowEl.classList.remove('drag-above', 'drag-below');
        if (dragFromIndex !== null && dragFromIndex !== deckIndex) {
          let targetIdx = dropBelow ? deckIndex + 1 : deckIndex;
          if (dragFromIndex < targetIdx) targetIdx--;
          onMoveItem(dragFromIndex, targetIdx);
        }
        dragFromIndex = null;
      },
      ondragend: () => {
        rowEl.classList.remove('drag-above', 'drag-below');
        dragFromIndex = null;
      },
    });

    buildRowContent(rowEl, item, deckIndex);
    return rowEl;
  }

  function renderVirtualRows() {
    viewportEl.classList.toggle('select-mode', selectMode || selectedIds.size > 0);
    const total = filteredList.length;
    spacerEl.style.height = `${Math.max(total * ROW_H, 1)}px`;

    if (total === 0) {
      renderedRows.clear();
      spacerEl.replaceChildren(
        h('div', { class: 'empty muted', style: 'padding: 24px 12px; font-size: 13px;' },
          'Không có mục nào khớp bộ lọc.')
      );
      return;
    }

    const scrollTop = viewportEl.scrollTop;
    const viewH = viewportEl.clientHeight || 600;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_H) - 6);
    const endIdx = Math.min(total - 1, Math.ceil((scrollTop + viewH) / ROW_H) + 6);

    renderedRows.clear();
    const frag = document.createDocumentFragment();
    for (let i = startIdx; i <= endIdx; i++) {
      const entry = filteredList[i];
      const rowEl = createRowElement(entry, i);
      renderedRows.set(entry.item.id, rowEl);
      frag.append(rowEl);
    }
    spacerEl.replaceChildren(frag);
  }

  function toggleSelectId(id, on) {
    if (on) selectedIds.add(id);
    else selectedIds.delete(id);
    if (selectedIds.size === 0) selectMode = false;
    renderVirtualRows();
    renderFooter();
  }

  function openRowContextMenu(x, y, item, deckIndex) {
    closeContextMenu();
    const deck = getDeck();
    const total = deck.items.length;
    const allowedSet = new Set(allowedTypes(kindOf(deck)));
    const convertOptions = [
      { type: 'single', types: ['single', 'multi'], label: 'Trắc nghiệm' },
      { type: 'fill', types: ['fill'], label: 'Điền' },
      { type: 'command', types: ['command'], label: 'Lệnh' },
      { type: 'card', types: ['card'], label: 'Thẻ' },
    ].filter(opt => opt.types.some(tp => allowedSet.has(tp)));

    contextMenuEl = h('div', {
      class: 'ux-popover',
      style: `position: fixed; left: ${Math.min(x, window.innerWidth - 220)}px; top: ${Math.min(y, window.innerHeight - 260)}px; z-index: 300;`,
      onclick: ev => ev.stopPropagation(),
    },
      h('button', {
        class: 'ux-popover-item',
        onclick: () => { closeContextMenu(); onDuplicate(item.id); },
      }, 'Nhân đôi (Ctrl+D)'),
      convertOptions.length > 0 ? h('div', { class: 'ux-popover-sep' }) : null,
      convertOptions.length > 0 ? h('div', { style: 'padding: 4px 10px; font-size: 11px; color: var(--c-text-muted);' }, 'Chuyển dạng') : null,
      ...convertOptions.map(opt => h('button', {
        class: 'ux-popover-item',
        onclick: () => { closeContextMenu(); onChangeItemType(item.id, opt.type); },
      }, `→ ${opt.label}`)),
      h('div', { class: 'ux-popover-sep' }),
      deckIndex > 0 ? h('button', {
        class: 'ux-popover-item',
        onclick: () => { closeContextMenu(); onMoveItem(deckIndex, 0); },
      }, '⤒ Chuyển lên đầu') : null,
      deckIndex < total - 1 ? h('button', {
        class: 'ux-popover-item',
        onclick: () => { closeContextMenu(); onMoveItem(deckIndex, total - 1); },
      }, '⤓ Chuyển xuống cuối') : null,
      h('div', { class: 'ux-popover-sep' }),
      h('button', {
        class: 'ux-popover-item danger',
        onclick: () => { closeContextMenu(); onDeleteIds([item.id]); },
      }, 'Xoá mục'));

    document.body.append(contextMenuEl);
  }

  function renderControls() {
    const deck = getDeck();
    const allTopics = [...new Set((deck.items || []).map(i => i.topic).filter(Boolean))];
    const allTags = [...new Set((deck.items || []).flatMap(i => i.tags || []).filter(Boolean))];
    const incompleteCount = (deck.items || []).filter(i => itemStatus(i).hasIssue).length;

    if (!searchInputEl) {
      searchInputEl = h('input', {
        type: 'text',
        class: 'ux-input sm ux-search-input',
        placeholder: 'Tìm câu hỏi, chủ đề… (Ctrl+F)',
        value: searchQuery,
        oninput: ev => {
          searchQuery = ev.target.value;
          computeFiltered();
          renderVirtualRows();
        },
      });
    } else if (document.activeElement !== searchInputEl) {
      searchInputEl.value = searchQuery;
    }

    const searchRow = h('div', { class: 'list-search-row' },
      h('div', { class: 'ux-search-wrap' },
        createSearchSvg(),
        searchInputEl,
        searchQuery ? h('button', {
          class: 'ux-search-clear',
          title: 'Xoá tìm kiếm',
          onclick: () => {
            searchQuery = '';
            searchInputEl.value = '';
            computeFiltered();
            renderControls();
            renderVirtualRows();
          },
        }, '✕') : null),
      h('button', {
        class: `ux-btn sm ${selectMode ? 'primary' : 'ghost'}`,
        title: 'Bật/tắt chế độ chọn nhiều mục',
        onclick: () => {
          selectMode = !selectMode;
          if (!selectMode) selectedIds.clear();
          renderControls();
          renderVirtualRows();
          renderFooter();
        },
      }, 'Chọn'));

    // Chip lọc Dạng (theo allowedTypes + các dạng thực tế có trong deck)
    const allowedFilterSet = new Set(allowedTypes(kindOf(deck)));
    const existingTypes = new Set((deck.items || []).map(i => detectItemType(i)).filter(Boolean));
    const visibleTypeGroups = TYPE_GROUP_OPTIONS.filter(
      opt => opt.types.some(tp => allowedFilterSet.has(tp) || existingTypes.has(tp))
    );

    const typePopover = openPopoverKey === 'type' ? h('div', {
      class: 'ux-popover',
      onclick: ev => ev.stopPropagation(),
    },
      visibleTypeGroups.map(opt => h('label', { class: 'ux-popover-item' },
        h('input', {
          type: 'checkbox',
          checked: selectedTypes.has(opt.key),
          onchange: ev => {
            if (ev.target.checked) selectedTypes.add(opt.key);
            else selectedTypes.delete(opt.key);
            computeFiltered();
            renderControls();
            renderVirtualRows();
          },
        }),
        opt.label))) : null;

    // Chip lọc Chủ đề
    const topicPopover = openPopoverKey === 'topic' ? h('div', {
      class: 'ux-popover',
      onclick: ev => ev.stopPropagation(),
    },
      allTopics.length ? allTopics.map(tp => h('label', { class: 'ux-popover-item' },
        h('input', {
          type: 'checkbox',
          checked: selectedTopics.has(tp),
          onchange: ev => {
            if (ev.target.checked) selectedTopics.add(tp);
            else selectedTopics.delete(tp);
            computeFiltered();
            renderControls();
            renderVirtualRows();
          },
        }),
        tp)) : h('div', { class: 'muted', style: 'padding: 6px 10px; font-size: 12px;' }, 'Chưa có chủ đề nào.')) : null;

    // Chip lọc Nhãn
    const tagPopover = openPopoverKey === 'tag' ? h('div', {
      class: 'ux-popover',
      onclick: ev => ev.stopPropagation(),
    },
      allTags.length ? allTags.map(tg => h('label', { class: 'ux-popover-item' },
        h('input', {
          type: 'checkbox',
          checked: selectedTags.has(tg),
          onchange: ev => {
            if (ev.target.checked) selectedTags.add(tg);
            else selectedTags.delete(tg);
            computeFiltered();
            renderControls();
            renderVirtualRows();
          },
        }),
        tg)) : h('div', { class: 'muted', style: 'padding: 6px 10px; font-size: 12px;' }, 'Chưa có nhãn nào.')) : null;

    const filterChipsRow = h('div', { class: 'list-filter-chips' },
      h('div', { class: 'list-chip-anchor' },
        h('button', {
          class: `ux-chip ${selectedTypes.size ? 'active' : ''}`,
          onclick: ev => {
            ev.stopPropagation();
            openPopoverKey = openPopoverKey === 'type' ? null : 'type';
            renderControls();
          },
        },
          selectedTypes.size ? `Dạng (${selectedTypes.size})` : 'Dạng ▾',
          selectedTypes.size ? h('span', {
            class: 'ux-chip-clear',
            onclick: ev => {
              ev.stopPropagation();
              selectedTypes.clear();
              computeFiltered();
              renderControls();
              renderVirtualRows();
            },
          }, '✕') : null),
        typePopover),

      h('div', { class: 'list-chip-anchor' },
        h('button', {
          class: `ux-chip ${selectedTopics.size ? 'active' : ''}`,
          onclick: ev => {
            ev.stopPropagation();
            openPopoverKey = openPopoverKey === 'topic' ? null : 'topic';
            renderControls();
          },
        },
          selectedTopics.size ? `Chủ đề (${selectedTopics.size})` : 'Chủ đề ▾',
          selectedTopics.size ? h('span', {
            class: 'ux-chip-clear',
            onclick: ev => {
              ev.stopPropagation();
              selectedTopics.clear();
              computeFiltered();
              renderControls();
              renderVirtualRows();
            },
          }, '✕') : null),
        topicPopover),

      h('div', { class: 'list-chip-anchor' },
        h('button', {
          class: `ux-chip ${selectedTags.size ? 'active' : ''}`,
          onclick: ev => {
            ev.stopPropagation();
            openPopoverKey = openPopoverKey === 'tag' ? null : 'tag';
            renderControls();
          },
        },
          selectedTags.size ? `Nhãn (${selectedTags.size})` : 'Nhãn ▾',
          selectedTags.size ? h('span', {
            class: 'ux-chip-clear',
            onclick: ev => {
              ev.stopPropagation();
              selectedTags.clear();
              computeFiltered();
              renderControls();
              renderVirtualRows();
            },
          }, '✕') : null),
        tagPopover),

      h('button', {
        class: `ux-chip ${filterIncomplete ? 'warn' : ''}`,
        onclick: () => {
          filterIncomplete = !filterIncomplete;
          computeFiltered();
          renderControls();
          renderVirtualRows();
        },
      },
        `⚠ ${incompleteCount}`,
        filterIncomplete ? h('span', { class: 'ux-chip-clear' }, '✕') : null)
    );

    topControlsEl.replaceChildren(searchRow, filterChipsRow);
  }

  function renderFooter() {
    const deck = getDeck();
    const total = (deck.items || []).length;
    const warnCount = (deck.items || []).filter(i => itemStatus(i).hasIssue).length;
    const assetsCount = (getAssets() || []).length;

    if (selectedIds.size > 0) {
      footerEl.replaceChildren(
        h('div', { class: 'list-bulk-bar' },
          h('span', { class: 'list-bulk-title' }, `Đã chọn ${selectedIds.size}`),
          h('button', {
            class: 'ux-btn sm',
            onclick: () => onBulkSetTopic([...selectedIds]),
          }, 'Gán chủ đề'),
          h('button', {
            class: 'ux-btn sm',
            onclick: () => onBulkAddTag([...selectedIds]),
          }, 'Gán nhãn'),
          h('button', {
            class: 'ux-btn sm danger-hover',
            onclick: () => {
              const ids = [...selectedIds];
              selectedIds.clear();
              selectMode = false;
              onDeleteIds(ids);
            },
          }, 'Xoá'),
          h('button', {
            class: 'ux-btn sm ghost',
            onclick: () => {
              selectedIds.clear();
              selectMode = false;
              renderVirtualRows();
              renderFooter();
            },
          }, 'Bỏ chọn'))
      );
      return;
    }

    const allowedAddSet = new Set(allowedTypes(kindOf(deck)));
    const addTypeOptions = [
      { type: 'single', types: ['single', 'multi'], label: 'Trắc nghiệm' },
      { type: 'fill', types: ['fill'], label: 'Điền' },
      { type: 'command', types: ['command'], label: 'Lệnh' },
      { type: 'card', types: ['card'], label: 'Thẻ' },
      { type: 'vocab', types: ['vocab'], label: 'Từ vựng' },
    ].filter(opt => opt.types.some(tp => allowedAddSet.has(tp)));

    const addMenu = openPopoverKey === 'add' && addTypeOptions.length > 0 ? h('div', {
      class: 'ux-popover align-right',
      style: 'top: auto; bottom: calc(100% + 4px);',
      onclick: ev => ev.stopPropagation(),
    },
      addTypeOptions.map(opt => h('button', {
        class: 'ux-popover-item',
        onclick: () => {
          openPopoverKey = null;
          onAddByType(opt.type);
        },
      }, `+ ${opt.label}`))) : null;

    footerEl.replaceChildren(
      h('div', { class: 'list-add-row' },
        addTypeOptions.length > 1
          ? h('div', { class: 'ux-split-btn' },
              h('button', {
                class: 'ux-btn primary sm',
                title: 'Thêm mục mới cùng dạng, cùng chủ đề, cùng nhãn (Ctrl+Enter)',
                onclick: () => onAddLikeCurrent(),
              }, '+ Thêm mục'),
              h('button', {
                class: 'ux-btn primary sm ux-split-caret',
                title: 'Chọn dạng mục mới',
                onclick: ev => {
                  ev.stopPropagation();
                  openPopoverKey = openPopoverKey === 'add' ? null : 'add';
                  renderFooter();
                },
              }, '▾'),
              addMenu)
          : h('button', {
              class: 'ux-btn primary sm',
              style: 'width: 100%;',
              title: 'Thêm mục mới (Ctrl+Enter)',
              onclick: () => onAddLikeCurrent(),
            }, `+ Thêm mục (${addTypeOptions[0]?.label || 'Thẻ'})`)),
      h('div', { class: 'list-meta-row' },
        h('span', null, `${total} mục${warnCount ? ` · ${warnCount} ⚠` : ''}`),
        h('div', { style: 'display: flex; gap: 4px; align-items: center;' },
          onOpenBulkImport ? h('button', {
            class: 'ux-btn ghost sm',
            style: 'height: 22px; padding: 0 6px;',
            title: 'Nhập hàng loạt từ CSV / TSV / Quizlet / Markdown',
            onclick: onOpenBulkImport,
          }, 'Nhập…') : null,
          h('button', {
            class: 'ux-btn ghost sm',
            style: 'height: 22px; padding: 0 6px;',
            onclick: onOpenAssetManager,
          }, `Ảnh (${assetsCount})`)))
    );
  }

  return {
    render() {
      computeFiltered();
      renderControls();
      renderVirtualRows();
      renderFooter();
    },

    // Vá đúng 1 hàng đang hiện mà không dựng lại toàn bộ danh sách (§5, §13.2)
    patchRow(itemId) {
      const deck = getDeck();
      const idx = deck.items.findIndex(i => i.id === itemId);
      if (idx === -1) return;
      const it = deck.items[idx];
      const fEntry = filteredList.find(x => x.item.id === itemId);
      if (fEntry) fEntry.item = it;
      const rowEl = renderedRows.get(itemId);
      if (rowEl) {
        buildRowContent(rowEl, it, idx);
      }
      renderFooter();
    },

    scrollToItem(itemId) {
      const fIdx = filteredList.findIndex(x => x.item.id === itemId);
      if (fIdx === -1) return;
      const top = fIdx * ROW_H;
      const viewH = viewportEl.clientHeight || 400;
      if (top < viewportEl.scrollTop) {
        viewportEl.scrollTop = top;
      } else if (top + ROW_H > viewportEl.scrollTop + viewH) {
        viewportEl.scrollTop = top - viewH + ROW_H;
      }
      renderVirtualRows();
    },

    focusSearch() {
      if (searchInputEl) {
        searchInputEl.focus();
        searchInputEl.select();
      }
    },

    setIncompleteFilter(on) {
      filterIncomplete = Boolean(on);
      computeFiltered();
      renderControls();
      renderVirtualRows();
    },

    getSelectedIds() {
      return [...selectedIds];
    },

    isListFocused() {
      return container.contains(document.activeElement);
    },
  };
}

