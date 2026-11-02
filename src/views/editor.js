// src/views/editor.js — Màn hình soạn thảo bộ thẻ (Deck Editor, GĐ2C).
// Bố cục 3 khu vực: Danh sách mục (trái) | Form soạn thảo (giữa) | Xem trước thời gian thực (phải).
import { h, shorten, fileName } from './dom.js';
import { makeRich, assetUrl, toPlain } from '../core/richtext.js';
import { buildQuestion } from '../core/builder.js';
import { gradeText, gradeChoices } from '../core/grader.js';
import { validateItem, validateDeck, hasError } from '../core/validate.js';
import {
  newItemId, newItem, addItem, removeItems, duplicateItem,
  moveItem, updateItem, changeType, imageRefs, unusedAssets, createHistory, newDeckId,
} from '../core/deckmodel.js';

const TYPE_NAMES = {
  single: 'Trắc nghiệm 1 đáp án',
  multi: 'Trắc nghiệm nhiều đáp án',
  fill: 'Điền đáp án',
  command: 'Gõ lệnh',
  card: 'Thẻ lật',
  vocab: 'Từ vựng',
};

const LATEX_SYMBOLS = [
  { label: 'Phân số', code: '\\frac{a}{b}' },
  { label: 'Căn', code: '\\sqrt{x}' },
  { label: 'Mũ', code: 'x^{2}' },
  { label: 'Chỉ số', code: 'x_{i}' },
  { label: 'Tích phân', code: '\\int_{a}^{b} x\\,dx' },
  { label: 'Tổng', code: '\\sum_{i=1}^{n}' },
  { label: 'Giới hạn', code: '\\lim_{x \\to 0}' },
  { label: '±', code: '\\pm' },
  { label: '≠', code: '\\neq' },
  { label: '≤', code: '\\le' },
  { label: '≥', code: '\\ge' },
  { label: '≈', code: '\\approx' },
  { label: '→', code: '\\to' },
  { label: '⇒', code: '\\Rightarrow' },
  { label: '∞', code: '\\infty' },
  { label: 'π', code: '\\pi' },
  { label: 'α', code: '\\alpha' },
  { label: 'β', code: '\\beta' },
  { label: 'θ', code: '\\theta' },
  { label: 'λ', code: '\\lambda' },
  { label: '∈', code: '\\in' },
  { label: '⊂', code: '\\subset' },
];

export function renderEditor(root, { entry }, actions) {
  const api = window.api;
  const deckKey = entry.deckKey;
  const rich = makeRich(deckKey);

  // Sao chép deck để soạn thảo độc lập, không sửa ngay dữ liệu gốc
  let deck = JSON.parse(JSON.stringify(entry.deck || { meta: { title: 'Bộ thẻ mới' }, items: [] }));
  if (!deck.items || !deck.items.length) {
    const firstItem = newItem('single', newItemId(deck));
    deck = addItem(deck, firstItem);
  }

  const history = createHistory(deck, 100);
  let activeItemId = deck.items[0]?.id || null;
  let selectedItemIds = new Set();
  let isDirty = !entry.path; // nếu chưa có file thì coi như chưa lưu
  let searchQuery = '';
  let activeFilter = 'all'; // 'all', 'single', 'multi', 'fill', 'command', 'card', 'incomplete', 'topic:X', 'tag:X'

  // Trạng thái thử đáp án tại form
  let testAnswerInput = '';

  // Trạng thái thử đáp án tại xem trước
  let previewUserAnswer = null;
  let previewSubmitted = false;
  let previewGrade = null;
  let previewCardFlipped = false;

  // Modal / Drawer trạng thái
  let activeModal = null; // 'assets' | 'assign-topic' | 'assign-tags' | 'confirm-discard' | 'prune-confirm'
  let assetsList = [];
  let lastFocusedTextarea = null;

  // Tải danh sách ảnh trong gói
  async function refreshAssets() {
    try {
      assetsList = await api.listAssets(deckKey) || [];
    } catch {
      assetsList = [];
    }
  }
  refreshAssets();

  function activeItem() {
    return deck.items.find(it => it.id === activeItemId) || deck.items[0];
  }

  function markDirty() {
    isDirty = true;
    updateHeaderUI();
  }

  // ── Chèn ký tự / Markdown vào ô văn bản ─────────────────────────────────
  function insertAtCursor(textarea, before, after = '', placeholder = '') {
    if (!textarea) return;
    textarea.focus();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const selected = val.slice(start, end);
    const content = selected || placeholder;
    const replacement = before + content + after;

    textarea.setRangeText(replacement, start, end, 'end');
    if (!selected && placeholder) {
      textarea.setSelectionRange(start + before.length, start + before.length + placeholder.length);
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertImageMarkdown(textarea, imgPath) {
    if (!textarea) return;
    textarea.focus();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const template = `![mô tả](${imgPath})`;
    textarea.setRangeText(template, start, end, 'end');
    // Đặt con trỏ vào phần 'mô tả' để người dùng gõ alt
    textarea.setSelectionRange(start + 2, start + 7);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // Xử lý kéo thả và dán ảnh vào textarea
  function setupImageInputs(textarea) {
    textarea.addEventListener('focus', () => { lastFocusedTextarea = textarea; });

    textarea.addEventListener('dragover', ev => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
      textarea.classList.add('drag-over');
    });

    textarea.addEventListener('dragleave', () => {
      textarea.classList.remove('drag-over');
    });

    textarea.addEventListener('drop', async ev => {
      ev.preventDefault();
      textarea.classList.remove('drag-over');
      const files = Array.from(ev.dataTransfer.files || []).filter(f => f.type.startsWith('image/'));
      if (!files.length) return;

      for (const file of files) {
        try {
          const buf = await file.arrayBuffer();
          const r = await api.addImageBytes(deckKey, file.name, new Uint8Array(buf));
          if (r.ok) {
            insertImageMarkdown(textarea, r.path);
            await refreshAssets();
          } else {
            alert('Không thể thêm ảnh: ' + (r.error || 'Ảnh không hợp lệ'));
          }
        } catch (e) {
          alert('Lỗi thêm ảnh: ' + e.message);
        }
      }
    });

    textarea.addEventListener('paste', async ev => {
      const items = Array.from(ev.clipboardData?.items || []);
      const imgItem = items.find(it => it.type.startsWith('image/'));
      if (imgItem) {
        ev.preventDefault();
        const file = imgItem.getAsFile();
        if (!file) return;
        try {
          const buf = await file.arrayBuffer();
          const r = await api.addImageBytes(deckKey, 'clipboard.png', new Uint8Array(buf));
          if (r.ok) {
            insertImageMarkdown(textarea, r.path);
            await refreshAssets();
          } else {
            alert('Không thể dán ảnh: ' + (r.error || 'Ảnh không hợp lệ'));
          }
        } catch (e) {
          alert('Lỗi dán ảnh: ' + e.message);
        }
      }
    });
  }

  // ── Lưu bộ thẻ ──────────────────────────────────────────────────────────
  async function saveDeck(saveAs = false) {
    const assetsMap = new Map(assetsList.map(a => [a.name, a]));
    const unused = unusedAssets(deck, assetsMap);
    let prune = true;

    if (unused.length > 0) {
      const pruneChoice = window.confirm(
        `Bộ thẻ có ${unused.length} ảnh không còn được dùng trong câu hỏi nào.\n\n` +
        `Bấm "OK" để dọn dẹp (giúp file gọn nhẹ hơn).\nBấm "Cancel" để vẫn giữ các ảnh này trong file.`
      );
      prune = pruneChoice;
    }

    if (saveAs) {
      // Bản sao nhận meta.id mới
      deck.meta.id = newDeckId(deck.meta.title);
    }

    const deckText = JSON.stringify(deck, null, 2);
    const r = await api.saveDeck(deckKey, deckText, { saveAs, pruneUnused: prune });

    if (r?.canceled) return false;
    if (!r?.ok) {
      alert('Không lưu được: ' + (r?.error || 'Lỗi không xác định'));
      return false;
    }

    isDirty = false;
    entry.path = r.path;
    entry.deck = r.deck;
    entry.deckText = r.deckText;
    entry.issues = r.issues;
    entry.assetCount = r.assetCount;
    await refreshAssets();
    updateHeaderUI();
    renderList();
    renderPreview();
    return true;
  }

  // Xác nhận thoát nếu chưa lưu
  async function confirmLeave(nextAction) {
    if (!isDirty) {
      nextAction();
      return;
    }
    const leave = window.confirm(
      'Bộ thẻ có thay đổi chưa lưu. Bạn có chắc muốn rời khỏi mà không lưu?'
    );
    if (leave) {
      nextAction();
    }
  }

  // ── Khung giao diện chính (3 khu vực) ───────────────────────────────────
  const headerContainer = h('header', { class: 'editor-header page-head' });
  const listContainer = h('aside', { class: 'editor-list-panel' });
  const formContainer = h('main', { class: 'editor-form-panel' });
  const previewContainer = h('section', { class: 'editor-preview-panel' });
  const modalContainer = h('div', { class: 'editor-modal-host' });

  const layout = h('div', { class: 'editor-layout' },
    listContainer,
    formContainer,
    previewContainer);

  root.replaceChildren(headerContainer, layout, modalContainer);

  // ── 1. Header (Thanh trên) ──────────────────────────────────────────────
  function updateHeaderUI() {
    const titleInput = h('input', {
      type: 'text',
      class: 'editor-title-input',
      value: deck.meta.title || '',
      title: 'Bấm để sửa tên bộ thẻ',
      oninput: ev => {
        deck.meta.title = ev.target.value;
        history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
        markDirty();
        document.title = `Soạn: ${deck.meta.title} — Study App`;
      },
    });

    const statusBadge = isDirty
      ? h('span', { class: 'badge unsaved' }, '● chưa lưu')
      : h('span', { class: 'badge ok' }, '✓ Đã lưu');

    const undoBtn = h('button', {
      class: 'btn small ghost',
      title: 'Hoàn tác (Ctrl+Z)',
      disabled: !history.canUndo(),
      onclick: () => {
        deck = history.undo();
        activeItemId = deck.items.find(i => i.id === activeItemId) ? activeItemId : deck.items[0]?.id;
        markDirty();
        renderList();
        renderForm();
        renderPreview();
      },
    }, '↶ Undo');

    const redoBtn = h('button', {
      class: 'btn small ghost',
      title: 'Làm lại (Ctrl+Y)',
      disabled: !history.canRedo(),
      onclick: () => {
        deck = history.redo();
        activeItemId = deck.items.find(i => i.id === activeItemId) ? activeItemId : deck.items[0]?.id;
        markDirty();
        renderList();
        renderForm();
        renderPreview();
      },
    }, '↷ Redo');

    const saveBtn = h('button', {
      class: 'btn primary small',
      title: 'Lưu vào file .sdeck (Ctrl+S)',
      onclick: () => saveDeck(false),
    }, 'Lưu (Ctrl+S)');

    const saveAsBtn = h('button', {
      class: 'btn small',
      title: 'Lưu thành file .sdeck khác (cấp mã bộ thẻ mới)',
      onclick: () => saveDeck(true),
    }, 'Lưu thành bản sao…');

    const backBtn = h('button', {
      class: 'btn ghost back',
      onclick: () => confirmLeave(() => actions.openDeckView(entry)),
    }, '← Về bộ thẻ');

    headerContainer.replaceChildren(
      h('div', { class: 'editor-head-left' },
        backBtn,
        titleInput,
        statusBadge),
      h('div', { class: 'editor-head-right toolbar' },
        undoBtn,
        redoBtn,
        saveBtn,
        saveAsBtn)
    );
  }

  // ── 2. Danh sách mục (Khu vực trái) ──────────────────────────────────────
  let draggedItemIndex = null;

  function renderList() {
    const allTopics = [...new Set(deck.items.map(it => it.topic).filter(Boolean))];
    const allTags = [...new Set(deck.items.flatMap(it => it.tags || []).filter(Boolean))];

    // Lọc danh sách
    const filteredItems = deck.items.filter((it, idx) => {
      // Tìm kiếm
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = toPlain(it.question || it.front || it.term || '').toLowerCase();
        const topic = (it.topic || '').toLowerCase();
        const tags = (it.tags || []).join(' ').toLowerCase();
        if (!text.includes(q) && !topic.includes(q) && !tags.includes(q)) return false;
      }
      // Bộ lọc
      if (activeFilter === 'incomplete') {
        const issues = validateItem(it, { assets: new Map(assetsList.map(a => [a.name, a])) });
        return issues.length > 0;
      }
      if (activeFilter.startsWith('type-')) {
        return it.type === activeFilter.slice(5);
      }
      if (activeFilter.startsWith('topic:')) {
        return it.topic === activeFilter.slice(6);
      }
      if (activeFilter.startsWith('tag:')) {
        return (it.tags || []).includes(activeFilter.slice(4));
      }
      return true;
    });

    // Thanh tìm kiếm & lọc
    const searchInput = h('input', {
      type: 'search',
      class: 'input-text small',
      placeholder: '🔍 Tìm mục...',
      value: searchQuery,
      oninput: ev => {
        searchQuery = ev.target.value;
        renderList();
      },
    });

    const filterSelect = h('select', {
      class: 'form-control small',
      value: activeFilter,
      onchange: ev => {
        activeFilter = ev.target.value;
        renderList();
      },
    },
      h('option', { value: 'all' }, 'Tất cả dạng'),
      h('option', { value: 'incomplete' }, '⚠ Chưa hoàn chỉnh'),
      h('option', { value: 'type-single' }, 'Trắc nghiệm 1 đáp án'),
      h('option', { value: 'type-multi' }, 'Trắc nghiệm nhiều đáp án'),
      h('option', { value: 'type-fill' }, 'Điền đáp án'),
      h('option', { value: 'type-command' }, 'Gõ lệnh'),
      h('option', { value: 'type-card' }, 'Thẻ lật'),
      allTopics.length ? h('optgroup', { label: 'Chủ đề' },
        allTopics.map(t => h('option', { value: `topic:${t}` }, `Chủ đề: ${t}`))) : null,
      allTags.length ? h('optgroup', { label: 'Thẻ tag' },
        allTags.map(t => h('option', { value: `tag:${t}` }, `Tag: ${t}`))) : null
    );
    filterSelect.value = activeFilter;

    // Thanh thao tác hàng loạt khi có chọn nhiều mục
    let bulkToolbar = null;
    if (selectedItemIds.size > 0) {
      bulkToolbar = h('div', { class: 'bulk-toolbar' },
        h('span', { class: 'bulk-count' }, `Đã chọn ${selectedItemIds.size}`),
        h('button', {
          class: 'btn small error',
          onclick: () => {
            if (confirm(`Xoá ${selectedItemIds.size} mục đã chọn?`)) {
              deck = removeItems(deck, [...selectedItemIds]);
              selectedItemIds.clear();
              if (!deck.items.length) {
                deck = addItem(deck, newItem('single', newItemId(deck)));
              }
              activeItemId = deck.items[0]?.id;
              history.push(JSON.parse(JSON.stringify(deck)));
              markDirty();
              renderList();
              renderForm();
              renderPreview();
            }
          },
        }, 'Xoá'),
        h('button', {
          class: 'btn small ghost',
          onclick: () => {
            const topic = prompt('Nhập tên chủ đề gán cho các mục đã chọn:');
            if (topic !== null) {
              for (const id of selectedItemIds) {
                deck = updateItem(deck, id, it => ({ ...it, topic: topic.trim() }));
              }
              history.push(JSON.parse(JSON.stringify(deck)));
              markDirty();
              renderList();
              renderForm();
            }
          },
        }, 'Gán topic'),
        h('button', {
          class: 'btn small ghost',
          onclick: () => {
            const tag = prompt('Nhập thẻ tag muốn gán:');
            if (tag && tag.trim()) {
              const t = tag.trim();
              for (const id of selectedItemIds) {
                deck = updateItem(deck, id, it => ({
                  ...it,
                  tags: [...new Set([...(it.tags || []), t])],
                }));
              }
              history.push(JSON.parse(JSON.stringify(deck)));
              markDirty();
              renderList();
              renderForm();
            }
          },
        }, 'Gán tag')
      );
    }

    // Danh sách các thẻ/mục
    const itemListEl = h('ul', { class: 'editor-items-list' },
      filteredItems.map(it => {
        const idx = deck.items.indexOf(it);
        const isActive = it.id === activeItemId;
        const isSelected = selectedItemIds.has(it.id);
        const issues = validateItem(it, { assets: new Map(assetsList.map(a => [a.name, a])) });
        const isBad = issues.length > 0;
        const errCount = issues.filter(i => i.level === 'error').length;
        const warnCount = issues.filter(i => i.level === 'warn').length;

        const summaryText = toPlain(it.question || it.front || it.term || 'Chưa có nội dung');

        const row = h('li', {
          class: `editor-item-row ${isActive ? 'active' : ''} ${isBad ? 'item-bad' : ''}`,
          draggable: true,
          onclick: ev => {
            if (ev.target.type === 'checkbox') return;
            activeItemId = it.id;
            previewUserAnswer = null;
            previewSubmitted = false;
            previewGrade = null;
            renderList();
            renderForm();
            renderPreview();
          },
          ondragstart: ev => {
            draggedItemIndex = idx;
            ev.dataTransfer.effectAllowed = 'move';
            row.classList.add('dragging');
          },
          ondragover: ev => {
            ev.preventDefault();
            ev.dataTransfer.dropEffect = 'move';
            row.classList.add('drag-target');
          },
          ondragleave: () => {
            row.classList.remove('drag-target');
          },
          ondrop: ev => {
            ev.preventDefault();
            row.classList.remove('drag-target');
            if (draggedItemIndex !== null && draggedItemIndex !== idx) {
              deck = moveItem(deck, draggedItemIndex, idx);
              history.push(JSON.parse(JSON.stringify(deck)));
              markDirty();
              renderList();
            }
          },
          ondragend: () => {
            row.classList.remove('dragging');
            draggedItemIndex = null;
          },
        },
          h('span', { class: 'drag-handle', title: 'Kéo để sắp xếp' }, '⠿'),
          h('input', {
            type: 'checkbox',
            checked: isSelected,
            onclick: ev => {
              ev.stopPropagation();
              if (ev.target.checked) selectedItemIds.add(it.id);
              else selectedItemIds.delete(it.id);
              renderList();
            },
          }),
          isBad ? h('span', {
            class: 'issue-mark',
            title: issues.map(i => `${i.level === 'error' ? '✕' : '⚠'} ${i.msg}`).join('\n'),
          }, errCount ? '✕' : '⚠') : null,
          h('div', { class: 'item-summary' },
            h('span', { class: 'summary-text' }, shorten(summaryText, 45)),
            h('div', { class: 'summary-badges' },
              h('span', { class: `chip small type-${it.type || 'single'}` },
                it.type ? (it.type === 'single' ? '1 đáp án' : it.type === 'multi' ? 'Nhiều đáp án' : it.type === 'fill' ? 'Điền' : it.type === 'command' ? 'Lệnh' : it.type === 'card' ? 'Thẻ' : it.type) : 'single'),
              it.topic ? h('span', { class: 'chip small muted' }, it.topic) : null))
        );

        return row;
      })
    );

    // Menu Thêm mục mới
    const addMenu = h('div', { class: 'menu', hidden: true },
      h('button', { class: 'menu-item', onclick: () => { addMenu.hidden = true; addNewItem('single'); } }, 'Trắc nghiệm 1 đáp án'),
      h('button', { class: 'menu-item', onclick: () => { addMenu.hidden = true; addNewItem('multi'); } }, 'Trắc nghiệm nhiều đáp án'),
      h('button', { class: 'menu-item', onclick: () => { addMenu.hidden = true; addNewItem('fill'); } }, 'Điền đáp án'),
      h('button', { class: 'menu-item', onclick: () => { addMenu.hidden = true; addNewItem('command'); } }, 'Gõ lệnh'),
      h('button', { class: 'menu-item', onclick: () => { addMenu.hidden = true; addNewItem('card'); } }, 'Thẻ lật')
    );

    function addNewItem(type) {
      const nextId = newItemId(deck);
      const created = newItem(type, nextId);
      const curIdx = deck.items.findIndex(it => it.id === activeItemId);
      deck = addItem(deck, created, curIdx >= 0 ? curIdx + 1 : -1);
      activeItemId = nextId;
      history.push(JSON.parse(JSON.stringify(deck)));
      markDirty();
      renderList();
      renderForm();
      renderPreview();
    }

    // Danh sách nút chân trang danh sách
    const listFooter = h('div', { class: 'editor-list-footer' },
      h('div', { class: 'toolbar small-gap' },
        h('div', { class: 'menu-wrap' },
          h('button', {
            class: 'btn small primary',
            onclick: ev => { ev.stopPropagation(); addMenu.hidden = !addMenu.hidden; },
          }, '+ Thêm ▾'),
          addMenu),
        h('button', {
          class: 'btn small ghost',
          title: 'Nhân đôi mục đang chọn',
          onclick: () => {
            if (!activeItemId) return;
            deck = duplicateItem(deck, activeItemId);
            const curIdx = deck.items.findIndex(it => it.id === activeItemId);
            if (curIdx >= 0 && deck.items[curIdx + 1]) {
              activeItemId = deck.items[curIdx + 1].id;
            }
            history.push(JSON.parse(JSON.stringify(deck)));
            markDirty();
            renderList();
            renderForm();
            renderPreview();
          },
        }, 'Nhân đôi'),
        h('button', {
          class: 'btn small ghost error',
          title: 'Xoá mục đang chọn',
          onclick: () => {
            if (!activeItemId) return;
            if (deck.items.length <= 1) {
              alert('Bộ thẻ phải có ít nhất 1 câu hỏi.');
              return;
            }
            deck = removeItems(deck, activeItemId);
            activeItemId = deck.items[0]?.id;
            history.push(JSON.parse(JSON.stringify(deck)));
            markDirty();
            renderList();
            renderForm();
            renderPreview();
          },
        }, 'Xoá')),
      h('div', { class: 'assets-trigger-row' },
        h('button', {
          class: 'btn small ghost btn-assets',
          onclick: () => openAssetManager(),
        }, `Ảnh trong bộ (${assetsList.length}) ▸`))
    );

    listContainer.replaceChildren(
      h('div', { class: 'editor-list-header' },
        searchInput,
        filterSelect,
        bulkToolbar),
      itemListEl,
      listFooter
    );
  }

  // ── 3. Thanh công cụ Markdown & Bảng ký hiệu LaTeX ───────────────────────
  function createMarkdownToolbar(textarea) {
    let paletteOpen = false;

    const paletteEl = h('div', { class: 'latex-palette', hidden: true },
      LATEX_SYMBOLS.map(sym => h('button', {
        class: 'latex-sym-btn',
        title: sym.code,
        onclick: ev => {
          ev.preventDefault();
          insertAtCursor(textarea, sym.code);
        },
      }, sym.label)));

    const tb = h('div', { class: 'md-toolbar' },
      h('button', { class: 'tb-btn', title: 'In đậm (**text**)', onclick: () => insertAtCursor(textarea, '**', '**', 'văn bản') }, 'B'),
      h('button', { class: 'tb-btn italic', title: 'In nghiêng (*text*)', onclick: () => insertAtCursor(textarea, '*', '*', 'văn bản') }, 'I'),
      h('button', { class: 'tb-btn code', title: 'Mã (`code`)', onclick: () => insertAtCursor(textarea, '`', '`', 'mã') }, '</>'),
      h('button', { class: 'tb-btn', title: 'Công thức trong dòng ($...$)', onclick: () => insertAtCursor(textarea, '$', '$', 'công thức') }, '$'),
      h('button', { class: 'tb-btn', title: 'Công thức khối ($$...$$)', onclick: () => insertAtCursor(textarea, '$$\n', '\n$$', 'công thức') }, '$$'),
      h('button', {
        class: 'tb-btn',
        title: 'Chèn ảnh vào vị trí con trỏ',
        onclick: async () => {
          const res = await api.addImages(deckKey);
          if (res?.length) {
            for (const r of res) {
              if (r.ok) {
                insertImageMarkdown(textarea, r.path);
              } else {
                alert('Không thể chèn ảnh: ' + (r.error || 'Lỗi'));
              }
            }
            await refreshAssets();
          }
        },
      }, '🖼 Chèn ảnh'),
      h('button', {
        class: 'tb-btn sym-toggle',
        title: 'Bảng ký hiệu LaTeX hay dùng',
        onclick: () => {
          paletteOpen = !paletteOpen;
          paletteEl.hidden = !paletteOpen;
        },
      }, 'Σ Ký hiệu LaTeX ▾'),
      paletteEl);

    return tb;
  }

  // ── 4. Form soạn thảo (Khu vực giữa) ─────────────────────────────────────
  function renderForm() {
    const item = activeItem();
    if (!item) {
      formContainer.replaceChildren(h('div', { class: 'empty' }, 'Chưa chọn mục nào.'));
      return;
    }

    const itemIssues = validateItem(item, { assets: new Map(assetsList.map(a => [a.name, a])) });
    const issueMap = new Map();
    for (const is of itemIssues) {
      if (!issueMap.has(is.field)) issueMap.set(is.field, []);
      issueMap.get(is.field).push(is);
    }

    function fieldIssueView(field) {
      const list = issueMap.get(field);
      if (!list || !list.length) return null;
      return h('div', { class: 'field-issues' },
        list.map(i => h('span', { class: `issue-tag ${i.level}` },
          `${i.level === 'error' ? '✕' : '⚠'} ${i.msg}`)));
    }

    // Chọn dạng câu hỏi (chuyển đổi giữ dữ liệu tối đa)
    const typeSelect = h('select', {
      class: 'form-control type-select',
      value: item.type || 'single',
      onchange: ev => {
        const newType = ev.target.value;
        deck = updateItem(deck, item.id, it => changeType(it, newType));
        history.push(JSON.parse(JSON.stringify(deck)));
        markDirty();
        renderList();
        renderForm();
        renderPreview();
      },
    },
      h('option', { value: 'single' }, 'Trắc nghiệm 1 đáp án'),
      h('option', { value: 'multi' }, 'Trắc nghiệm nhiều đáp án'),
      h('option', { value: 'fill' }, 'Điền đáp án'),
      h('option', { value: 'command' }, 'Gõ lệnh'),
      h('option', { value: 'card' }, 'Thẻ lật')
    );
    typeSelect.value = item.type || 'single';

    // Ô soạn Đề bài / Câu hỏi
    const questionTextarea = h('textarea', {
      class: 'form-control font-mono md-input',
      rows: 4,
      placeholder: item.type === 'card' ? 'Nội dung mặt trước (Markdown / LaTeX)...' : 'Nội dung câu hỏi (Markdown / LaTeX)...',
      value: item.type === 'card' ? (item.front || '') : (item.question || ''),
      oninput: ev => {
        const val = ev.target.value;
        if (item.type === 'card') item.front = val;
        else item.question = val;
        history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
        markDirty();
        renderPreview();
      },
    });
    setupImageInputs(questionTextarea);

    // Phần riêng cho từng dạng
    let typeSpecificSection = null;

    if (item.type === 'single' || item.type === 'multi') {
      const isMulti = item.type === 'multi';
      const choices = item.choices || [];
      const answers = item.answer || [];

      const choicesListEl = h('div', { class: 'form-choices-list' },
        choices.map((c, idx) => {
          const isObj = c && typeof c === 'object';
          const text = isObj ? (c.text ?? '') : String(c ?? '');
          const imgPath = isObj ? (c.image ?? '') : '';
          const isCorrect = answers.includes(idx);

          const textInput = h('input', {
            type: 'text',
            class: 'input-text choice-input',
            placeholder: `Lựa chọn ${idx + 1}...`,
            value: text,
            oninput: ev => {
              const val = ev.target.value;
              if (isObj) c.text = val;
              else choices[idx] = val;
              history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
              markDirty();
              renderPreview();
            },
          });

          const toggleCorrect = () => {
            if (isMulti) {
              const set = new Set(item.answer || []);
              if (set.has(idx)) set.delete(idx);
              else set.add(idx);
              item.answer = [...set].sort((a, b) => a - b);
            } else {
              item.answer = [idx];
            }
            history.push(JSON.parse(JSON.stringify(deck)));
            markDirty();
            renderForm();
            renderPreview();
          };

          const imgBtn = h('button', {
            class: `btn small ${imgPath ? 'primary' : 'ghost'}`,
            title: imgPath ? `Ảnh: ${imgPath}` : 'Gắn ảnh vào lựa chọn này',
            onclick: async () => {
              if (imgPath) {
                if (confirm(`Gỡ ảnh khỏi lựa chọn ${idx + 1}?`)) {
                  if (isObj) {
                    delete c.image;
                    if (!c.text) choices[idx] = '';
                  }
                  history.push(JSON.parse(JSON.stringify(deck)));
                  markDirty();
                  renderForm();
                  renderPreview();
                }
              } else {
                const res = await api.addImages(deckKey);
                if (res?.length && res[0].ok) {
                  const p = res[0].path;
                  choices[idx] = { text, image: p };
                  history.push(JSON.parse(JSON.stringify(deck)));
                  markDirty();
                  await refreshAssets();
                  renderForm();
                  renderPreview();
                }
              }
            },
          }, imgPath ? '🖼 Có ảnh' : '🖼');

          const removeBtn = choices.length > 2 ? h('button', {
            class: 'btn small ghost error',
            title: 'Xoá lựa chọn này',
            onclick: () => {
              choices.splice(idx, 1);
              // Cập nhật lại chỉ số answer
              item.answer = (item.answer || [])
                .filter(a => a !== idx)
                .map(a => a > idx ? a - 1 : a);
              if (!item.answer.length && choices.length) item.answer = [0];
              history.push(JSON.parse(JSON.stringify(deck)));
              markDirty();
              renderForm();
              renderPreview();
            },
          }, '✕') : null;

          return h('div', { class: `choice-edit-row ${isCorrect ? 'is-correct' : ''}` },
            h('input', {
              type: isMulti ? 'checkbox' : 'radio',
              name: `correct-choice-${item.id}`,
              checked: isCorrect,
              title: isMulti ? 'Đánh dấu đáp án đúng' : 'Đánh dấu đáp án đúng duy nhất',
              onchange: toggleCorrect,
            }),
            textInput,
            imgBtn,
            removeBtn,
            fieldIssueView(`choices[${idx}]`));
        })
      );

      const addChoiceBtn = h('button', {
        class: 'btn small ghost',
        onclick: () => {
          choices.push('');
          history.push(JSON.parse(JSON.stringify(deck)));
          markDirty();
          renderForm();
          renderPreview();
        },
      }, '+ Thêm lựa chọn');

      typeSpecificSection = h('div', { class: 'form-group' },
        h('label', null, 'Danh sách lựa chọn (tích chọn đáp án đúng):'),
        choicesListEl,
        addChoiceBtn,
        fieldIssueView('choices'),
        fieldIssueView('answer'));
    } else if (item.type === 'fill' || item.type === 'command') {
      const answers = Array.isArray(item.answer) ? item.answer : [''];

      const answersListEl = h('div', { class: 'form-answers-list' },
        answers.map((ans, idx) => {
          const ansInput = h('input', {
            type: 'text',
            class: 'input-text font-mono answer-text-input',
            placeholder: `Đáp án chấp nhận ${idx + 1}...`,
            value: ans,
            oninput: ev => {
              answers[idx] = ev.target.value;
              history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
              markDirty();
              renderPreview();
            },
          });

          const removeBtn = answers.length > 1 ? h('button', {
            class: 'btn small ghost error',
            title: 'Xoá đáp án này',
            onclick: () => {
              answers.splice(idx, 1);
              history.push(JSON.parse(JSON.stringify(deck)));
              markDirty();
              renderForm();
              renderPreview();
            },
          }, '✕') : null;

          return h('div', { class: 'answer-edit-row' },
            ansInput,
            removeBtn,
            fieldIssueView(`answer[${idx}]`));
        })
      );

      const addAnsBtn = h('button', {
        class: 'btn small ghost',
        onclick: () => {
          answers.push('');
          history.push(JSON.parse(JSON.stringify(deck)));
          markDirty();
          renderForm();
          renderPreview();
        },
      }, '+ Thêm đáp án chấp nhận');

      const matchSelect = h('select', {
        class: 'form-control small',
        value: item.match || 'normalized',
        onchange: ev => {
          item.match = ev.target.value;
          history.push(JSON.parse(JSON.stringify(deck)));
          markDirty();
          renderForm();
          renderPreview();
        },
      },
        h('option', { value: 'normalized' }, 'Chuẩn hoá (không phân biệt hoa/thường, khoảng trắng, dung sai gõ nhầm)'),
        h('option', { value: 'exact' }, 'Chính xác từng ký tự (exact)'),
        h('option', { value: 'regex' }, 'Biểu thức chính quy (Regular Expression)'),
        h('option', { value: 'number' }, 'Số học / phân số (number & dung sai)'),
        h('option', { value: 'latex' }, 'Công thức toán (latex)')
      );
      matchSelect.value = item.match || 'normalized';

      let toleranceRow = null;
      if (item.match === 'number') {
        toleranceRow = h('div', { class: 'form-group' },
          h('label', null, 'Dung sai (tolerance, vd 0.001):'),
          h('input', {
            type: 'number',
            step: 'any',
            class: 'input-text small',
            value: item.tolerance !== undefined ? item.tolerance : 0,
            oninput: ev => {
              item.tolerance = Number(ev.target.value);
              history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
              markDirty();
              renderPreview();
            },
          }),
          fieldIssueView('tolerance'));
      }

      const displayInput = h('input', {
        type: 'text',
        class: 'input-text',
        placeholder: 'Đáp án hiển thị đẹp sau khi trả lời (Markdown/LaTeX tuỳ chọn)...',
        value: item.answerDisplay || '',
        oninput: ev => {
          item.answerDisplay = ev.target.value;
          history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
          markDirty();
          renderPreview();
        },
      });

      // Ô "Thử đáp án" chạy trực tiếp grader
      const testResultBadge = h('span', { class: 'test-grader-result' });
      function runTestGrader(val) {
        if (!val.trim()) {
          testResultBadge.textContent = '';
          testResultBadge.className = 'test-grader-result';
          return;
        }
        const g = gradeText(val, answers, item.match || 'normalized', { tolerance: item.tolerance });
        if (g.ok && !g.near) {
          testResultBadge.className = 'badge ok';
          testResultBadge.textContent = '✓ Đúng';
        } else if (g.ok && g.near) {
          testResultBadge.className = 'badge warn';
          testResultBadge.textContent = '≈ Gần đúng (chấp nhận)';
        } else {
          testResultBadge.className = 'badge error';
          testResultBadge.textContent = '✕ Sai';
        }
      }

      const testInputEl = h('input', {
        type: 'text',
        class: 'input-text',
        placeholder: 'Gõ thử đáp án để kiểm tra regex / dung sai...',
        value: testAnswerInput,
        oninput: ev => {
          testAnswerInput = ev.target.value;
          runTestGrader(testAnswerInput);
        },
      });

      typeSpecificSection = h('div', { class: 'form-section-stack' },
        h('div', { class: 'form-group' },
          h('label', null, 'Đáp án chấp nhận:'),
          answersListEl,
          addAnsBtn,
          fieldIssueView('answer')),
        h('div', { class: 'form-group' },
          h('label', null, 'Kiểu chấm đáp án (match):'),
          matchSelect,
          fieldIssueView('match')),
        toleranceRow,
        h('div', { class: 'form-group' },
          h('label', null, 'Hiển thị đáp án đẹp (answerDisplay tuỳ chọn):'),
          displayInput),
        h('div', { class: 'form-group test-grader-box' },
          h('label', null, '🧪 Thử đáp án (chạy đúng bộ chấm grader):'),
          h('div', { class: 'test-row' }, testInputEl, testResultBadge)));
    } else if (item.type === 'card') {
      const backTextarea = h('textarea', {
        class: 'form-control font-mono md-input',
        rows: 4,
        placeholder: 'Nội dung mặt sau (Markdown / LaTeX)...',
        value: item.back || '',
        oninput: ev => {
          item.back = ev.target.value;
          history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
          markDirty();
          renderPreview();
        },
      });
      setupImageInputs(backTextarea);

      typeSpecificSection = h('div', { class: 'form-group' },
        h('label', null, 'Mặt sau thẻ (back):'),
        createMarkdownToolbar(backTextarea),
        backTextarea,
        fieldIssueView('back'));
    }

    // Trường chung: Ảnh đính kèm (image, answerImage)
    function imagePickerRow(label, prop) {
      const cur = item[prop] || '';
      return h('div', { class: 'form-group' },
        h('label', null, `${label}:`),
        h('div', { class: 'img-picker-row' },
          h('input', {
            type: 'text',
            class: 'input-text small font-mono',
            placeholder: 'img/ten-anh.png',
            value: cur,
            oninput: ev => {
              item[prop] = ev.target.value.trim();
              history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
              markDirty();
              renderPreview();
            },
          }),
          h('button', {
            class: 'btn small',
            onclick: async () => {
              const res = await api.addImages(deckKey);
              if (res?.length && res[0].ok) {
                item[prop] = res[0].path;
                history.push(JSON.parse(JSON.stringify(deck)));
                markDirty();
                await refreshAssets();
                renderForm();
                renderPreview();
              }
            },
          }, 'Chọn ảnh…'),
          cur ? h('button', {
            class: 'btn small ghost error',
            title: 'Gỡ ảnh',
            onclick: () => {
              delete item[prop];
              history.push(JSON.parse(JSON.stringify(deck)));
              markDirty();
              renderForm();
              renderPreview();
            },
          }, '✕') : null),
        fieldIssueView(prop));
    }

    // Trường chung: Giải thích (explanation)
    const explanationTextarea = h('textarea', {
      class: 'form-control font-mono md-input',
      rows: 2,
      placeholder: 'Giải thích chi tiết (hiển thị sau khi người học trả lời)...',
      value: item.explanation || '',
      oninput: ev => {
        item.explanation = ev.target.value;
        history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
        markDirty();
        renderPreview();
      },
    });
    setupImageInputs(explanationTextarea);

    // Trường chung: Chủ đề (topic)
    const topicInput = h('input', {
      type: 'text',
      class: 'input-text',
      placeholder: 'Tên chủ đề (vd: Giai-tich, Dia-ly)...',
      value: item.topic || '',
      oninput: ev => {
        item.topic = ev.target.value.trim();
        history.push(JSON.parse(JSON.stringify(deck)), { isTyping: true });
        markDirty();
        renderList();
      },
    });

    // Trường chung: Thẻ tags (chip input)
    const tags = item.tags || [];
    const tagsContainer = h('div', { class: 'chips-editor' },
      tags.map((t, idx) => h('span', { class: 'chip tag-chip' },
        t,
        h('button', {
          class: 'chip-remove',
          onclick: () => {
            tags.splice(idx, 1);
            if (!tags.length) delete item.tags;
            history.push(JSON.parse(JSON.stringify(deck)));
            markDirty();
            renderForm();
          },
        }, '✕'))),
      h('input', {
        type: 'text',
        class: 'chip-input',
        placeholder: '+ Thêm tag (gõ và bấm Enter)...',
        onkeydown: ev => {
          if (ev.key === 'Enter' || ev.key === ',') {
            ev.preventDefault();
            const val = ev.target.value.trim();
            if (val && !tags.includes(val)) {
              if (!item.tags) item.tags = [];
              item.tags.push(val);
              ev.target.value = '';
              history.push(JSON.parse(JSON.stringify(deck)));
              markDirty();
              renderForm();
            }
          }
        },
      })
    );

    formContainer.replaceChildren(
      h('div', { class: 'form-head' },
        h('div', { class: 'form-group' },
          h('label', null, 'Dạng câu hỏi:'),
          typeSelect),
        h('span', { class: 'chip muted id-chip' }, `ID: ${item.id}`)),
      h('div', { class: 'form-group' },
        h('label', null, item.type === 'card' ? 'Mặt trước thẻ (front):' : 'Câu hỏi (question):'),
        createMarkdownToolbar(questionTextarea),
        questionTextarea,
        fieldIssueView(item.type === 'card' ? 'front' : 'question')),
      typeSpecificSection,
      imagePickerRow('Ảnh mặt trước / đề bài (image)', 'image'),
      imagePickerRow('Ảnh mặt sau / đáp án (answerImage)', 'answerImage'),
      h('div', { class: 'form-group' },
        h('label', null, 'Giải thích (explanation tuỳ chọn):'),
        createMarkdownToolbar(explanationTextarea),
        explanationTextarea,
        fieldIssueView('explanation')),
      h('div', { class: 'form-row-2col' },
        h('div', { class: 'form-group' },
          h('label', null, 'Chủ đề (topic):'),
          topicInput),
        h('div', { class: 'form-group' },
          h('label', null, 'Thẻ phân loại (tags):'),
          tagsContainer))
    );
  }

  // ── 5. Xem trước thời gian thực (Khu vực phải) ───────────────────────────
  function renderPreview() {
    const item = activeItem();
    if (!item) {
      previewContainer.replaceChildren(h('div', { class: 'empty' }, 'Chưa chọn mục để xem trước.'));
      return;
    }

    const issues = validateItem(item, { assets: new Map(assetsList.map(a => [a.name, a])) });
    const hasErr = hasError(issues);
    const q = buildQuestion(item);

    // Header của vùng xem trước
    const previewHead = h('div', { class: 'preview-head' },
      h('span', { class: 'preview-label' }, 'XEM TRƯỚC THỜI GIAN THỰC'),
      hasErr ? h('span', { class: 'badge error' }, '⚠ Chưa hoàn chỉnh (sẽ bị bỏ qua khi học)')
        : issues.length ? h('span', { class: 'badge warn' }, `⚠ ${issues.length} cảnh báo`)
        : h('span', { class: 'badge ok' }, '✓ Hợp lệ'));

    if (!q) {
      previewContainer.replaceChildren(
        previewHead,
        h('div', { class: 'empty' }, 'Câu hỏi chưa đủ thông tin để hiển thị.')
      );
      return;
    }

    // Component giao diện hiển thị câu hỏi (dùng chung đúng richtext.js & css như session)
    function richEl(tag, attrs, htmlContent) {
      const el = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs || {})) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
      el.innerHTML = htmlContent;
      return el;
    }

    // Nội dung câu hỏi / flashcard
    let bodyEl = null;

    if (q.kind === 'single' || q.kind === 'multi') {
      const isMulti = q.kind === 'multi';
      const hasImages = q.choices.some(c => c && typeof c === 'object' && c.image);
      const isMultiCol = hasImages || q.choices.length >= 4;

      bodyEl = h('div', { class: `choices-list ${isMultiCol ? 'choices-multi-col' : ''}` },
        q.choices.map((c, i) => {
          const isObj = c && typeof c === 'object';
          const text = isObj ? (c.text ?? '') : String(c ?? '');
          const imgUrl = isObj && c.image ? assetUrl(c.image, deckKey) : null;

          const isSelected = isMulti
            ? (previewUserAnswer || []).includes(i)
            : previewUserAnswer === i;

          let stateClass = '';
          if (previewSubmitted) {
            const isCorrect = q.answers.includes(i);
            if (isCorrect) stateClass = 'choice-correct';
            else if (isSelected) stateClass = 'choice-wrong';
          } else if (isSelected) {
            stateClass = 'choice-selected';
          }

          return h('label', {
            class: `choice-label ${stateClass}`,
            onclick: () => {
              if (previewSubmitted) return;
              if (isMulti) {
                const set = new Set(previewUserAnswer || []);
                if (set.has(i)) set.delete(i);
                else set.add(i);
                previewUserAnswer = [...set];
              } else {
                previewUserAnswer = i;
              }
              renderPreview();
            },
          },
            h('span', { class: 'choice-key' }, `${i + 1}`),
            h('input', {
              type: isMulti ? 'checkbox' : 'radio',
              name: `preview-choice-${q.id}`,
              checked: isSelected,
              disabled: previewSubmitted,
            }),
            h('div', { class: 'choice-content' },
              imgUrl ? h('img', { class: 'rich-img choice-img', src: imgUrl, alt: text || `Lựa chọn ${i + 1}` }) : null,
              text ? richEl('span', { class: 'choice-text' }, rich.inline(text)) : null));
        })
      );
    } else if (q.kind === 'fill' || q.kind === 'command') {
      const isCmd = q.kind === 'command';
      let inputClass = 'input-text answer-input';
      if (isCmd) inputClass += ' font-mono';
      if (previewSubmitted) {
        inputClass += previewGrade?.ok
          ? (previewGrade.near ? ' input-near' : ' input-correct')
          : ' input-wrong';
      }

      bodyEl = h('div', { class: 'input-area' },
        isCmd ? h('span', { class: 'cmd-prompt' }, '$') : null,
        h('input', {
          type: 'text',
          class: inputClass,
          placeholder: isCmd ? 'Gõ lệnh (vd: rpm -qa)...' : 'Gõ đáp án...',
          value: previewUserAnswer || '',
          disabled: previewSubmitted,
          oninput: ev => { previewUserAnswer = ev.target.value; },
          onkeydown: ev => {
            if (ev.key === 'Enter') {
              ev.preventDefault();
              submitPreviewAnswer();
            }
          },
        }));
    } else if (q.kind === 'card') {
      const frontImgUrl = q.image ? assetUrl(q.image, deckKey) : null;
      const backImgUrl = q.answerImage ? assetUrl(q.answerImage, deckKey) : null;

      bodyEl = h('div', { class: 'flashcard-wrap' },
        h('div', {
          class: `flashcard ${previewCardFlipped ? 'flipped' : ''}`,
          onclick: () => {
            previewCardFlipped = !previewCardFlipped;
            renderPreview();
          },
        },
          h('div', { class: 'card-face card-front' },
            h('span', { class: 'card-badge' }, 'Mặt trước'),
            richEl('div', { class: 'card-content' }, rich.html(q.front)),
            frontImgUrl ? h('img', { class: 'rich-img card-img', src: frontImgUrl, alt: 'Hình ảnh mặt trước' }) : null),
          previewCardFlipped ? h('div', { class: 'card-face card-back' },
            h('span', { class: 'card-badge' }, 'Mặt sau'),
            richEl('div', { class: 'card-content' }, rich.html(q.back)),
            backImgUrl ? h('img', { class: 'rich-img card-img', src: backImgUrl, alt: 'Hình ảnh mặt sau' }) : null) : null),
        h('div', { class: 'card-hint' }, 'Bấm vào thẻ để lật qua lại giữa hai mặt'));
    }

    // Xử lý nộp thử câu trả lời
    function submitPreviewAnswer() {
      if (q.kind === 'single') {
        if (previewUserAnswer === null) return;
        previewGrade = gradeChoices([previewUserAnswer], q.answers);
      } else if (q.kind === 'multi') {
        previewGrade = gradeChoices(previewUserAnswer || [], q.answers);
      } else if (q.kind === 'fill' || q.kind === 'command') {
        previewGrade = gradeText(previewUserAnswer || '', q.answers, q.match, { tolerance: q.tolerance });
      }
      previewSubmitted = true;
      renderPreview();
    }

    // Thanh phản hồi kết quả sau khi thử
    let feedbackEl = null;
    if (previewSubmitted && previewGrade) {
      feedbackEl = h('div', { class: `feedback-banner ${previewGrade.ok ? (previewGrade.near ? 'near' : 'correct') : 'wrong'}` },
        h('div', { class: 'feedback-title' },
          previewGrade.ok ? (previewGrade.near ? '≈ Gần đúng (chấp nhận)' : '✓ Chính xác!') : '✕ Chưa đúng!'),
        q.explanation ? richEl('div', { class: 'explanation-box' }, rich.html(q.explanation)) : null,
        h('button', {
          class: 'btn small ghost',
          onclick: () => {
            previewSubmitted = false;
            previewGrade = null;
            previewUserAnswer = null;
            renderPreview();
          },
        }, 'Thử lại'));
    }

    // Nút "Thử trả lời"
    const tryBtn = (!previewSubmitted && q.kind !== 'card') ? h('button', {
      class: 'btn primary small',
      onclick: submitPreviewAnswer,
    }, 'Thử trả lời') : null;

    const mainImgUrl = q.image ? assetUrl(q.image, deckKey) : null;

    previewContainer.replaceChildren(
      previewHead,
      h('div', { class: 'preview-card session-card' },
        q.kind !== 'card' ? richEl('div', { class: 'question-prompt' }, rich.html(q.prompt)) : null,
        (mainImgUrl && q.kind !== 'card') ? h('img', { class: 'rich-img', src: mainImgUrl, alt: 'Hình ảnh' }) : null,
        bodyEl,
        tryBtn,
        feedbackEl)
    );
  }

  // ── 6. Trình quản lý ảnh (Asset Manager Modal) ───────────────────────────
  function openAssetManager() {
    activeModal = 'assets';
    renderAssetManagerModal();
  }

  function closeAssetManager() {
    activeModal = null;
    modalContainer.replaceChildren();
  }

  async function renderAssetManagerModal() {
    await refreshAssets();
    const assetsMap = new Map(assetsList.map(a => [a.name, a]));
    const unused = unusedAssets(deck, assetsMap);

    // Tính số lần xuất hiện của mỗi ảnh trong deck
    const usageCounts = new Map();
    for (const a of assetsList) usageCounts.set(a.name, 0);
    for (const it of deck.items) {
      for (const ref of imageRefs(it)) {
        if (usageCounts.has(ref)) {
          usageCounts.set(ref, (usageCounts.get(ref) || 0) + 1);
        }
      }
    }

    const gridEl = h('div', { class: 'assets-grid' },
      assetsList.length ? assetsList.map(asset => {
        const count = usageCounts.get(asset.name) || 0;
        const sizeKb = Math.round(asset.size / 1024);
        const isUnused = count === 0;

        return h('div', { class: `asset-card ${isUnused ? 'unused' : ''}` },
          h('div', { class: 'asset-thumb-wrap' },
            h('img', {
              class: 'asset-thumb-img',
              src: `asset://${deckKey}/${asset.name}`,
              alt: asset.name,
              onerror: ev => { ev.target.style.display = 'none'; },
            })),
          h('div', { class: 'asset-card-info' },
            h('span', { class: 'asset-card-name', title: asset.name }, fileName(asset.name)),
            h('span', { class: 'asset-card-size muted' }, `${sizeKb} KB`),
            h('span', { class: `asset-usage ${isUnused ? 'warn' : ''}` },
              isUnused ? 'Không dùng' : `Dùng ở ${count} mục`),
            h('div', { class: 'asset-card-actions' },
              h('button', {
                class: 'btn small ghost',
                title: 'Chèn ảnh này vào ô soạn thảo đang chọn',
                onclick: () => {
                  if (lastFocusedTextarea) {
                    insertImageMarkdown(lastFocusedTextarea, asset.name);
                    closeAssetManager();
                  } else {
                    alert('Hãy đặt con trỏ vào ô soạn thảo trước khi chèn.');
                  }
                },
              }, 'Chèn'),
              isUnused ? h('button', {
                class: 'btn small ghost error',
                title: 'Xoá ảnh không dùng này khỏi gói',
                onclick: async () => {
                  await api.removeAsset(deckKey, asset.name);
                  await refreshAssets();
                  markDirty();
                  renderAssetManagerModal();
                  renderList();
                },
              }, 'Xoá') : null)));
      }) : h('div', { class: 'empty' }, 'Gói bộ thẻ chưa có ảnh nào.')
    );

    const dialogEl = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === dialogEl) closeAssetManager(); } },
      h('div', { class: 'modal-dialog modal-large' },
        h('div', { class: 'modal-head' },
          h('h2', null, `Quản lý hình ảnh trong bộ thẻ (${assetsList.length} ảnh)`),
          h('button', { class: 'btn ghost small', onclick: closeAssetManager }, '✕')),
        h('div', { class: 'toolbar small-gap', style: 'margin-bottom: 16px;' },
          h('button', {
            class: 'btn primary small',
            onclick: async () => {
              const res = await api.addImages(deckKey);
              if (res?.length) {
                await refreshAssets();
                markDirty();
                renderAssetManagerModal();
                renderList();
              }
            },
          }, '+ Thêm ảnh mới…'),
          unused.length ? h('button', {
            class: 'btn error small',
            onclick: async () => {
              if (confirm(`Xoá ${unused.length} ảnh không còn được dùng?`)) {
                for (const p of unused) await api.removeAsset(deckKey, p);
                await refreshAssets();
                markDirty();
                renderAssetManagerModal();
                renderList();
              }
            },
          }, `Dọn sạch ${unused.length} ảnh không dùng`) : null),
        gridEl,
        h('div', { class: 'modal-foot toolbar', style: 'justify-content: flex-end; margin-top: 16px;' },
          h('button', { class: 'btn', onclick: closeAssetManager }, 'Đóng'))));

    modalContainer.replaceChildren(dialogEl);
  }

  // ── Phím tắt toàn cục Editor ─────────────────────────────────────────────
  function onGlobalKeyDown(ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 's') {
      ev.preventDefault();
      saveDeck(false);
      return;
    }

    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
      if (ev.shiftKey) {
        // Redo
        ev.preventDefault();
        if (history.canRedo()) {
          deck = history.redo();
          markDirty();
          renderList();
          renderForm();
          renderPreview();
        }
      } else {
        // Undo
        ev.preventDefault();
        if (history.canUndo()) {
          deck = history.undo();
          markDirty();
          renderList();
          renderForm();
          renderPreview();
        }
      }
      return;
    }

    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) {
      ev.preventDefault();
      if (history.canRedo()) {
        deck = history.redo();
        markDirty();
        renderList();
        renderForm();
        renderPreview();
      }
      return;
    }
  }

  window.addEventListener('keydown', onGlobalKeyDown);

  // Bảo vệ khi đóng cửa sổ app nếu chưa lưu
  window.onbeforeunload = () => {
    if (isDirty) {
      return 'Bạn có thay đổi chưa lưu!';
    }
  };

  // Khởi tạo các vùng hiển thị
  document.title = `Soạn: ${deck.meta.title} — Study App`;
  updateHeaderUI();
  renderList();
  renderForm();
  renderPreview();
}
