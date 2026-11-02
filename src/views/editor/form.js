// src/views/editor/form.js — Vùng soạn câu hỏi/thẻ chuẩn UX v2 Lượt 2 (§6.1–6.4, §7, §8, §9, §13)
import { h } from '../dom.js';
import { validateItem, friendlyIssue } from '../../core/validate.js';
import { isBlankNewItem } from '../../core/deckmodel.js';
import { kindOf, allowedTypes, detectItemType, kindLabel, itemTypeLabel } from '../../core/deckkinds.js';
import { createMarkdownField } from './fields/mdfield.js';
import { createImageSlot } from './fields/imageslot.js';
import { createChoicesSection } from './fields/choices.js';
import { createChipListField } from './fields/chips.js';
import { createFillCommandSection } from './fields/graderbox.js';

function mapIssueFieldToPath(field, item) {
  if (!field) return item?.type === 'card' ? 'front' : 'question';
  const cm = /^choices\[(\d+)\]$/.exec(field);
  if (cm) return `choices.${cm[1]}`;
  if (/^answer\[\d+\]$/.test(field)) return 'answers.0';
  if (field === 'question') return item?.type === 'card' ? 'front' : 'question';
  if (field === 'choices') return 'choices.0';
  if (field === 'answer' || field === 'answers') {
    return (item?.type === 'single' || item?.type === 'multi') ? 'choices.0' : 'answers.0';
  }
  return field;
}

function normalizeIssueGroup(field) {
  if (/^answer\[\d+\]$/.test(field)) return 'answer';
  return field || 'question';
}

export function createFormPane({
  container,
  deckKey,
  rich,
  getDeck,
  getItem,
  getAssets,
  getRecentSnippets,
  onRecordRecentSnippet,
  isItemTouched,
  getTouchedFields,
  markFieldTouched,
  onPatchItem,
  onChangeType,
  onNavigatePrev,
  onNavigateNext,
  onDuplicate,
  onDelete,
  onUploadFile,
  onPickImageDialog,
  onSetActiveTextarea,
  mobileTab,
  onChangeMobileTab,
}) {
  let currentRenderedItemId = null;
  const manuallyOpened = new Set();
  let openHeaderPopover = null; // 'issues' | 'more' | null
  let showTechId = false;

  const headerHost = h('div', { class: 'form-header-sticky' });
  const bodyHost = h('div', { class: 'form-inner' });
  container.replaceChildren(headerHost, bodyHost);

  document.addEventListener('click', () => {
    if (openHeaderPopover) {
      openHeaderPopover = null;
      renderHeader();
    }
  });

  function captureCursor(el, path) {
    if (!el) return null;
    const item = getItem();
    if (!item) return null;
    return {
      itemId: item.id,
      path,
      selStart: typeof el.selectionStart === 'number' ? el.selectionStart : 0,
      selEnd: typeof el.selectionEnd === 'number' ? el.selectionEnd : 0,
    };
  }

  function applyPathValue(path, val, meta = {}) {
    const item = getItem();
    if (!item) return;
    if (path.startsWith('choices.')) {
      const idx = Number(path.split('.')[1]);
      const nextChoices = [...(item.choices || [])];
      const cur = nextChoices[idx];
      if (cur && typeof cur === 'object') {
        nextChoices[idx] = { ...cur, text: val };
      } else {
        nextChoices[idx] = val;
      }
      onPatchItem({ choices: nextChoices }, meta);
      return;
    }
    if (path.startsWith('answers.')) {
      const idx = Number(path.split('.')[1]);
      const nextAnswers = [...(Array.isArray(item.answer) ? item.answer : [''])];
      nextAnswers[idx] = val;
      onPatchItem({ answer: nextAnswers }, meta);
      return;
    }
    onPatchItem({ [path]: val }, meta);
  }

  function computeVisibleIssues() {
    const item = getItem();
    if (!item) return { allIssues: [], visibleByGroup: new Map(), headerIssues: [] };
    const assetsMap = new Map((getAssets() || []).map(a => [a.name, a]));
    const allIssues = validateItem(item, { assets: assetsMap });
    const itemTouched = isItemTouched(item.id);
    const touchedSet = getTouchedFields(item.id);
    const blank = isBlankNewItem(item);

    if (blank && !itemTouched && touchedSet.size === 0) {
      return { allIssues, visibleByGroup: new Map(), headerIssues: [] };
    }

    const visibleByGroup = new Map();
    const headerIssues = [];

    for (const iss of allIssues) {
      const rawField = iss.field || 'question';
      const group = normalizeIssueGroup(rawField);
      const isFieldChecked =
        itemTouched
        || touchedSet.has(rawField)
        || touchedSet.has(group)
        || (rawField.startsWith('choices[') && touchedSet.has('choices'))
        || touchedSet.has('*');

      if (isFieldChecked) {
        headerIssues.push(iss);
        if (!visibleByGroup.has(rawField)) visibleByGroup.set(rawField, []);
        visibleByGroup.get(rawField).push(iss);
        if (group !== rawField) {
          if (!visibleByGroup.has(group)) visibleByGroup.set(group, []);
          visibleByGroup.get(group).push(iss);
        }
      }
    }
    return { allIssues, visibleByGroup, headerIssues };
  }

  function updateValidationUI() {
    renderHeader();
    const { visibleByGroup } = computeVisibleIssues();

    bodyHost.querySelectorAll('[data-validate-group]').forEach(slot => {
      const group = slot.getAttribute('data-validate-group');
      const list = visibleByGroup.get(group) || [];
      slot.replaceChildren(
        ...list.map(iss =>
          h('div', { class: `ux-field-msg ${iss.level === 'error' ? 'error' : 'warn'}` },
            friendlyIssue(iss))
        )
      );
    });

    bodyHost.querySelectorAll('[data-validate-input]').forEach(inp => {
      const group = inp.getAttribute('data-validate-input');
      const list = visibleByGroup.get(group) || [];
      const hasErr = list.some(i => i.level === 'error');
      const hasWarn = !hasErr && list.some(i => i.level === 'warn');
      inp.classList.toggle('has-error', hasErr);
      inp.classList.toggle('has-warn', hasWarn);
    });
  }

  function focusFieldByPath(path) {
    queueMicrotask(() => {
      const target = bodyHost.querySelector(`[data-path="${path}"]`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        target.focus();
      }
    });
  }

  function renderHeader() {
    const deck = getDeck();
    const item = getItem();
    if (!item) {
      headerHost.replaceChildren();
      return;
    }
    const items = deck.items || [];
    const idx = items.findIndex(i => i.id === item.id);
    const total = items.length;
    const { headerIssues } = computeVisibleIssues();

    const issuesPopover = openHeaderPopover === 'issues' && headerIssues.length ? h('div', {
      class: 'ux-popover',
      style: 'min-width: 260px;',
      onclick: ev => ev.stopPropagation(),
    },
      h('div', { style: 'padding: 4px 10px; font-size: 11px; color: var(--c-text-muted); font-weight: 600;' },
        'Bấm để nhảy tới trường cần sửa'),
      headerIssues.map(iss => h('button', {
        type: 'button',
        class: 'ux-popover-item',
        onclick: () => {
          openHeaderPopover = null;
          renderHeader();
          focusFieldByPath(mapIssueFieldToPath(iss.field, item));
        },
      },
        h('span', { style: `color: ${iss.level === 'error' ? 'var(--c-danger)' : 'var(--c-warn)'}; font-weight: 700;` },
          iss.level === 'error' ? '●' : '▲'),
        h('span', null, friendlyIssue(iss))))) : null;

    const morePopover = openHeaderPopover === 'more' ? h('div', {
      class: 'ux-popover align-right',
      style: 'min-width: 210px;',
      onclick: ev => ev.stopPropagation(),
    },
      h('button', {
        type: 'button',
        class: 'ux-popover-item',
        onclick: () => { openHeaderPopover = null; renderHeader(); onDuplicate(); },
      }, 'Nhân đôi mục (Ctrl+D)'),
      h('button', {
        type: 'button',
        class: 'ux-popover-item danger',
        onclick: () => { openHeaderPopover = null; renderHeader(); onDelete(); },
      }, 'Xoá mục này'),
      h('div', { class: 'ux-popover-sep' }),
      h('button', {
        type: 'button',
        class: 'ux-popover-item',
        onclick: () => {
          showTechId = !showTechId;
          renderHeader();
        },
      }, showTechId ? '▾ Thông tin kỹ thuật' : '▸ Thông tin kỹ thuật'),
      showTechId ? h('div', {
        style: 'padding: 4px 10px 6px; font-size: 11px; font-family: var(--font-mono); color: var(--c-text-muted); user-select: text;',
      }, `Mã mục: ${item.id}`) : null) : null;

    const mobileTabsEl = onChangeMobileTab ? h('div', { class: 'form-mobile-tabs' },
      h('div', { class: 'ux-segmented sm' },
        h('button', {
          type: 'button',
          class: `ux-seg-btn ${mobileTab !== 'preview' ? 'active' : ''}`,
          onclick: () => onChangeMobileTab('form'),
        }, 'Soạn'),
        h('button', {
          type: 'button',
          class: `ux-seg-btn ${mobileTab === 'preview' ? 'active' : ''}`,
          onclick: () => onChangeMobileTab('preview'),
        }, 'Xem trước'))) : null;

    headerHost.replaceChildren(
      h('div', { class: 'form-nav-group' },
        h('button', {
          type: 'button',
          class: 'ux-icon-btn',
          disabled: idx <= 0,
          title: 'Mục trước (Alt+↑)',
          onclick: onNavigatePrev,
        }, '◀'),
        h('span', null, `Mục ${idx + 1}/${total}`),
        h('button', {
          type: 'button',
          class: 'ux-icon-btn',
          disabled: idx >= total - 1,
          title: 'Mục tiếp theo (Alt+↓)',
          onclick: onNavigateNext,
        }, '▶')),

      h('div', { style: 'display: flex; align-items: center; gap: 8px; position: relative;' },
        headerIssues.length ? h('div', { style: 'position: relative;' },
          h('button', {
            type: 'button',
            class: `ux-chip ${headerIssues.some(i => i.level === 'error') ? 'danger' : 'warn'}`,
            onclick: ev => {
              ev.stopPropagation();
              openHeaderPopover = openHeaderPopover === 'issues' ? null : 'issues';
              renderHeader();
            },
          }, `⚠ ${headerIssues.length} vấn đề`),
          issuesPopover) : null,
        mobileTabsEl),

      h('div', { style: 'position: relative;' },
        h('button', {
          type: 'button',
          class: 'ux-icon-btn',
          title: 'Tác vụ khác',
          onclick: ev => {
            ev.stopPropagation();
            openHeaderPopover = openHeaderPopover === 'more' ? null : 'more';
            renderHeader();
          },
        }, '⋮'),
        morePopover)
    );
  }

  function render() {
    const deck = getDeck();
    const item = getItem();
    if (!item) {
      headerHost.replaceChildren();
      bodyHost.replaceChildren(h('div', { class: 'empty muted' }, 'Chọn hoặc thêm một mục để bắt đầu soạn.'));
      return;
    }

    if (currentRenderedItemId !== item.id) {
      currentRenderedItemId = item.id;
      manuallyOpened.clear();
    }

    renderHeader();

    const t = detectItemType(item) || 'single';
    const isMC = t === 'single' || t === 'multi';
    const deckKind = kindOf(deck);
    const allowedSet = new Set(allowedTypes(deckKind));
    const isCurrentMismatched = !allowedSet.has(t);

    // Thanh chọn dạng theo allowedTypes của loại bộ thẻ, cộng thêm dạng của mục đang chọn nếu nó lệch loại (§6.1, GĐ3B §2.2 quy tắc 4)
    const allTypeOptions = [
      { key: 'single', types: ['single', 'multi'], active: isMC, label: 'Trắc nghiệm' },
      { key: 'fill', types: ['fill'], active: t === 'fill', label: 'Điền' },
      { key: 'command', types: ['command'], active: t === 'command', label: 'Lệnh' },
      { key: 'card', types: ['card'], active: t === 'card', label: 'Thẻ' },
      { key: 'vocab', types: ['vocab'], active: t === 'vocab', label: 'Từ vựng' },
    ];
    const visibleTypeOptions = allTypeOptions.filter(
      opt => opt.types.some(tp => allowedSet.has(tp)) || opt.active
    );

    const typeSeg = h('div', { class: 'form-field' },
      h('div', { class: 'ux-segmented', style: 'width: 100%;' },
        visibleTypeOptions.map(opt => h('button', {
          type: 'button',
          class: `ux-seg-btn ${opt.active ? 'active' : ''}`,
          style: 'flex: 1;',
          onclick: () => {
            if (!opt.active) onChangeType(opt.key);
          },
        }, opt.active && isCurrentMismatched ? `${opt.label} ⚠` : opt.label))),
      isCurrentMismatched
        ? h('div', { class: 'ux-field-msg warn' },
            `⚠ Mục này có dạng "${itemTypeLabel(t)}", lệch với loại bộ thẻ "${kindLabel(deckKind)}". Bạn vẫn sửa được hoặc bấm dạng khác ở trên để chuyển đổi.`)
        : null);

    const mainNodes = [typeSeg];

    // Trạng thái các trường tuỳ chọn
    const hasExplanation = Boolean((item.explanation || '').trim()) || manuallyOpened.has('explanation');
    const hasImage = Boolean((item.image || '').trim()) || manuallyOpened.has('image');
    const hasAnswerImage = Boolean((item.answerImage || '').trim()) || manuallyOpened.has('answerImage');
    const hasTopic = Boolean((item.topic || '').trim()) || manuallyOpened.has('topic');
    const hasTags = Boolean(item.tags?.length) || manuallyOpened.has('tags');
    const hasAnswerDisplay = (t === 'fill' || t === 'command')
      && (Boolean((item.answerDisplay || '').trim()) || manuallyOpened.has('answerDisplay'));

    if (t === 'card') {
      // §6.4 Thẻ: Hai khối trực quan như hai mặt thẻ (Mặt trước và Mặt sau, mỗi khối có ô Markdown và một ô ảnh kèm)
      const frontBlock = h('div', { class: 'card-editor-face' },
        createMarkdownField({
          label: 'Mặt trước',
          path: 'front',
          validateGroup: 'front',
          value: item.front || '',
          placeholder: 'Nhập câu hỏi, thuật ngữ hoặc nội dung mặt trước…',
          minRows: 3,
          rich,
          getRecentSnippets,
          onRecordRecentSnippet,
          onApplyValue: (p, v, meta) => {
            applyPathValue(p, v, meta);
            updateValidationUI();
          },
          onBlurValidate: grp => {
            markFieldTouched(grp);
            updateValidationUI();
          },
          onUploadFile,
          onPickImageDialog,
          onSetActiveHelper: onSetActiveTextarea,
          captureCursor,
        }),
        createImageSlot({
          label: 'Ảnh kèm đề (Mặt trước)',
          field: 'image',
          altField: 'imageAlt',
          value: item.image || '',
          altValue: item.imageAlt,
          deckKey,
          getAssets,
          onPatchItem,
          onMarkTouched: markFieldTouched,
          onUpdateValidationUI: updateValidationUI,
          onRerenderForm: render,
          onUploadFile,
          onPickImageDialog,
          captureCursor,
        }));

      const backBlock = h('div', { class: 'card-editor-face' },
        createMarkdownField({
          label: 'Mặt sau',
          path: 'back',
          validateGroup: 'back',
          value: item.back || '',
          placeholder: 'Nhập câu trả lời, công thức hoặc giải nghĩa ở mặt sau…',
          minRows: 3,
          rich,
          getRecentSnippets,
          onRecordRecentSnippet,
          onApplyValue: (p, v, meta) => {
            applyPathValue(p, v, meta);
            updateValidationUI();
          },
          onBlurValidate: grp => {
            markFieldTouched(grp);
            updateValidationUI();
          },
          onUploadFile,
          onPickImageDialog,
          onSetActiveHelper: onSetActiveTextarea,
          captureCursor,
        }),
        createImageSlot({
          label: 'Ảnh kèm đáp án (Mặt sau)',
          field: 'answerImage',
          altField: 'answerImageAlt',
          value: item.answerImage || '',
          altValue: item.answerImageAlt,
          deckKey,
          getAssets,
          onPatchItem,
          onMarkTouched: markFieldTouched,
          onUpdateValidationUI: updateValidationUI,
          onRerenderForm: render,
          onUploadFile,
          onPickImageDialog,
          captureCursor,
        }));

      mainNodes.push(frontBlock, backBlock);
    } else {
      // Câu hỏi chính (Trắc nghiệm / Điền / Lệnh)
      mainNodes.push(
        createMarkdownField({
          label: 'Câu hỏi',
          path: 'question',
          validateGroup: 'question',
          value: item.question || '',
          placeholder: 'Nhập nội dung câu hỏi (gõ $ để viết công thức, Ctrl+M mở bảng ký hiệu)…',
          minRows: 3,
          rich,
          getRecentSnippets,
          onRecordRecentSnippet,
          onApplyValue: (p, v, meta) => {
            applyPathValue(p, v, meta);
            updateValidationUI();
          },
          onBlurValidate: grp => {
            markFieldTouched(grp);
            updateValidationUI();
          },
          onUploadFile,
          onPickImageDialog,
          onSetActiveHelper: onSetActiveTextarea,
          captureCursor,
        })
      );

      if (isMC) {
        mainNodes.push(
          createChoicesSection({
            deckKey,
            rich,
            getItem,
            getRecentSnippets,
            onRecordRecentSnippet,
            onPatchItem,
            onApplyPathValue: applyPathValue,
            onMarkFieldTouched: markFieldTouched,
            onUpdateValidationUI: updateValidationUI,
            onRerenderForm: render,
            onFocusPath: focusFieldByPath,
            onPickImageDialog,
            onUploadFile,
            captureCursor,
          })
        );
      } else if (t === 'fill' || t === 'command') {
        mainNodes.push(
          createFillCommandSection({
            getItem,
            onPatchItem,
            onMarkFieldTouched: markFieldTouched,
            onUpdateValidationUI: updateValidationUI,
            onRerenderForm: render,
            onFocusPath: focusFieldByPath,
            captureCursor,
          })
        );
      }

      if (hasImage) {
        mainNodes.push(
          createImageSlot({
            label: 'Ảnh kèm đề',
            field: 'image',
            altField: 'imageAlt',
            value: item.image || '',
            altValue: item.imageAlt,
            deckKey,
            getAssets,
            onPatchItem,
            onMarkTouched: markFieldTouched,
            onUpdateValidationUI: updateValidationUI,
            onRerenderForm: render,
            onUploadFile,
            onPickImageDialog,
            onCollapse: () => {
              manuallyOpened.delete('image');
              onPatchItem({ image: '', imageAlt: undefined });
              render();
            },
            captureCursor,
          })
        );
      }

      if (hasAnswerImage) {
        mainNodes.push(
          createImageSlot({
            label: 'Ảnh kèm đáp án',
            field: 'answerImage',
            altField: 'answerImageAlt',
            value: item.answerImage || '',
            altValue: item.answerImageAlt,
            deckKey,
            getAssets,
            onPatchItem,
            onMarkTouched: markFieldTouched,
            onUpdateValidationUI: updateValidationUI,
            onRerenderForm: render,
            onUploadFile,
            onPickImageDialog,
            onCollapse: () => {
              manuallyOpened.delete('answerImage');
              onPatchItem({ answerImage: '', answerImageAlt: undefined });
              render();
            },
            captureCursor,
          })
        );
      }
    }

    if (hasAnswerDisplay) {
      mainNodes.push(
        h('div', { class: 'form-field' },
          h('div', { class: 'form-label-row' },
            h('label', { class: 'form-label' }, 'Hiển thị đáp án đẹp'),
            h('button', {
              type: 'button',
              class: 'ux-btn ghost sm',
              style: 'height: 22px; padding: 0 6px;',
              onclick: () => {
                manuallyOpened.delete('answerDisplay');
                onPatchItem({ answerDisplay: '' });
                render();
              },
            }, '✕ Ẩn')),
          h('input', {
            type: 'text',
            class: 'ux-input',
            placeholder: 'Chuỗi Markdown/LaTeX hiển thị sau khi trả lời (vd: $\\frac{1}{3}$)…',
            value: item.answerDisplay || '',
            'data-path': 'answerDisplay',
            'data-validate-input': 'answerDisplay',
            oninput: ev => {
              onPatchItem(
                { answerDisplay: ev.target.value },
                { mergeKey: 'answerDisplay', cursor: captureCursor(ev.target, 'answerDisplay') }
              );
              updateValidationUI();
            },
            onblur: () => {
              markFieldTouched('answerDisplay');
              updateValidationUI();
            },
          }),
          h('div', { 'data-validate-group': 'answerDisplay' }))
      );
    }

    if (hasExplanation) {
      mainNodes.push(
        createMarkdownField({
          label: 'Giải thích',
          path: 'explanation',
          validateGroup: 'explanation',
          value: item.explanation || '',
          placeholder: 'Giải thích chi tiết hiện ra sau khi người học trả lời…',
          minRows: 2,
          rich,
          getRecentSnippets,
          onRecordRecentSnippet,
          onApplyValue: (p, v, meta) => {
            applyPathValue(p, v, meta);
            updateValidationUI();
          },
          onBlurValidate: grp => {
            markFieldTouched(grp);
            updateValidationUI();
          },
          onUploadFile,
          onPickImageDialog,
          onSetActiveHelper: onSetActiveTextarea,
          onCollapse: () => {
            manuallyOpened.delete('explanation');
            onPatchItem({ explanation: '' });
            render();
          },
          captureCursor,
        })
      );
    }

    // Datalist gợi ý Chủ đề và Nhãn có sẵn trong bộ thẻ
    const existingTopics = [...new Set((deck.items || []).map(i => i.topic).filter(Boolean))];
    const existingTags = [...new Set((deck.items || []).flatMap(i => i.tags || []).filter(Boolean))];

    if (hasTopic) {
      const listId = 'editor-topics-datalist';
      mainNodes.push(
        h('div', { class: 'form-field' },
          h('div', { class: 'form-label-row' },
            h('label', { class: 'form-label' }, 'Chủ đề'),
            !item.topic ? h('button', {
              type: 'button',
              class: 'ux-btn ghost sm',
              style: 'height: 22px; padding: 0 6px;',
              onclick: () => {
                manuallyOpened.delete('topic');
                render();
              },
            }, '✕ Ẩn') : null),
          h('input', {
            type: 'text',
            class: 'ux-input',
            list: listId,
            placeholder: 'Nhập hoặc chọn chủ đề (vd: Chương 1, Mạng máy tính)…',
            value: item.topic || '',
            'data-path': 'topic',
            oninput: ev => {
              onPatchItem(
                { topic: ev.target.value },
                { mergeKey: 'topic', cursor: captureCursor(ev.target, 'topic') }
              );
            },
          }),
          h('datalist', { id: listId }, existingTopics.map(tp => h('option', { value: tp }))))
      );
    }

    if (hasTags) {
      mainNodes.push(
        createChipListField({
          label: 'Nhãn',
          hint: 'Nhấn Enter hoặc dấu phẩy để thêm nhãn',
          path: 'tags',
          values: item.tags || [],
          suggestions: existingTags,
          placeholder: 'Gõ nhãn rồi nhấn Enter hoặc dấu phẩy…',
          splitComma: true,
          onChangeValues: nextTags => {
            onPatchItem({ tags: nextTags });
            render();
          },
          onCollapse: () => {
            manuallyOpened.delete('tags');
            render();
          },
          onFocusPath: focusFieldByPath,
        })
      );
    }

    // Hàng chip "+ Thêm" cho các trường tuỳ chọn chưa mở (§6.1)
    const addChips = [];
    if (!hasExplanation) {
      addChips.push({ key: 'explanation', label: '+ Giải thích', focusPath: 'explanation' });
    }
    if (t !== 'card' && !hasImage) {
      addChips.push({ key: 'image', label: '+ Ảnh kèm đề', focusPath: 'image' });
    }
    if (t !== 'card' && !hasAnswerImage) {
      addChips.push({ key: 'answerImage', label: '+ Ảnh kèm đáp án', focusPath: 'answerImage' });
    }
    if ((t === 'fill' || t === 'command') && !hasAnswerDisplay) {
      addChips.push({ key: 'answerDisplay', label: '+ Hiển thị đáp án đẹp', focusPath: 'answerDisplay' });
    }
    if (!hasTopic) {
      addChips.push({ key: 'topic', label: '+ Chủ đề', focusPath: 'topic' });
    }
    if (!hasTags) {
      addChips.push({ key: 'tags', label: '+ Nhãn', focusPath: 'tags' });
    }

    if (addChips.length) {
      mainNodes.push(
        h('div', { class: 'form-add-chips' },
          addChips.map(ch => h('button', {
            type: 'button',
            class: 'ux-chip',
            onclick: () => {
              manuallyOpened.add(ch.key);
              render();
              focusFieldByPath(ch.focusPath);
            },
          }, ch.label)))
      );
    }

    bodyHost.replaceChildren(...mainNodes);
    updateValidationUI();
  }

  return {
    render,
    updateValidationUI,
    focusFieldByPath,
    focusPrimaryField() {
      const item = getItem();
      if (!item) return;
      const path = item.type === 'card' ? 'front' : 'question';
      focusFieldByPath(path);
    },
    restoreCursor(cursor) {
      if (!cursor || !cursor.path) return;
      const el = bodyHost.querySelector(`[data-path="${cursor.path}"]`);
      if (!el) return;
      el.focus();
      if (typeof el.setSelectionRange === 'function' && typeof cursor.selStart === 'number') {
        try {
          el.setSelectionRange(cursor.selStart, cursor.selEnd ?? cursor.selStart);
        } catch {
          // một số input[type=number] không hỗ trợ setSelectionRange
        }
      }
    },
  };
}
