// src/views/editor/form/index.js — Orchestrator chính điều phối form soạn thảo
import { h } from '../../dom.js';
import { detectItemType, kindOf, allowedTypes, kindLabel, itemTypeLabel } from '../../../core/deckkinds.js';
import { createMarkdownField } from '../fields/mdfield.js';
import { createChipListField } from '../fields/chips.js';
import { computeVisibleIssues, updateValidationUI as updateValidationUIDOM } from './validation.js';
import { renderHeader } from './header.js';
import { renderVocabSection } from './sections/vocab.js';
import { renderCardSection } from './sections/card.js';
import { renderQuestionSection } from './sections/question.js';

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
  let openHeaderPopover = null;
  let showTechId = false;

  const headerHost = h('div', { class: 'form-header-sticky' });
  const bodyHost = h('div', { class: 'form-inner' });
  container.replaceChildren(headerHost, bodyHost);

  document.addEventListener('click', () => {
    if (openHeaderPopover) {
      openHeaderPopover = null;
      renderHeaderFn();
    }
  });

  // Helper functions
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
    if (path.startsWith('translations.')) {
      const parts = path.split('.');
      const langKey = parts[1];
      const fieldKey = parts[2];
      const nextTranslations = { ...(item.translations || {}) };
      nextTranslations[langKey] = { ...(nextTranslations[langKey] || {}), [fieldKey]: val };
      onPatchItem({ translations: nextTranslations }, meta);
      return;
    }
    onPatchItem({ [path]: val }, meta);
  }

  function computeVisibleIssuesLocal() {
    return computeVisibleIssues({
      getItem,
      getAssets,
      isItemTouched,
      getTouchedFields,
    });
  }

  function updateValidationUI() {
    renderHeaderFn();
    const { visibleByGroup } = computeVisibleIssuesLocal();
    updateValidationUIDOM(bodyHost, visibleByGroup);
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

  function renderHeaderFn() {
    renderHeader({
      headerHost,
      getDeck,
      getItem,
      computeVisibleIssues: computeVisibleIssuesLocal,
      openHeaderPopover,
      showTechId,
      mobileTab,
      onNavigatePrev,
      onNavigateNext,
      onDuplicate,
      onDelete,
      onChangeMobileTab,
      setOpenHeaderPopover: v => {
        openHeaderPopover = v;
        renderHeaderFn();
      },
      setShowTechId: v => {
        showTechId = v;
        renderHeaderFn();
      },
      focusFieldByPath,
    });
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

    renderHeaderFn();

    const t = detectItemType(item) || 'single';
    const isMC = t === 'single' || t === 'multi';
    const deckKind = kindOf(deck);
    const allowedSet = new Set(allowedTypes(deckKind));
    const isCurrentMismatched = !allowedSet.has(t);

    // Type selector
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

    // Optional fields state
    const hasExplanation = Boolean((item.explanation || '').trim()) || manuallyOpened.has('explanation');
    const hasImage = Boolean((item.image || '').trim()) || manuallyOpened.has('image');
    const hasAnswerImage = Boolean((item.answerImage || '').trim()) || manuallyOpened.has('answerImage');
    const hasTopic = Boolean((item.topic || '').trim()) || manuallyOpened.has('topic');
    const hasTags = Boolean(item.tags?.length) || manuallyOpened.has('tags');
    const hasAnswerDisplay = (t === 'fill' || t === 'command')
      && (Boolean((item.answerDisplay || '').trim()) || manuallyOpened.has('answerDisplay'));
    const hasForms = Boolean(item.forms?.length) || manuallyOpened.has('forms');
    const hasSynonyms = Boolean(item.synonyms?.length) || manuallyOpened.has('synonyms');

    // Context cho các section
    const ctx = {
      deckKey,
      rich,
      getItem,
      getRecentSnippets,
      onRecordRecentSnippet,
      onPatchItem,
      markFieldTouched,
      updateValidationUI,
      rerender: render,
      focusFieldByPath,
      applyPathValue,
      captureCursor,
      manuallyOpened,
      hasImage,
      hasAnswerImage,
      hasForms,
      hasSynonyms,
      onUploadFile,
      onPickImageDialog,
      mdFieldProps: {
        rich,
        getRecentSnippets,
        onRecordRecentSnippet,
        onApplyValue: (p, v, meta) => {
          applyPathValue(p, v, meta);
          updateValidationUI();
        },
        onUploadFile,
        onPickImageDialog,
        onSetActiveHelper: onSetActiveTextarea,
        captureCursor,
      },
      imageSlotProps: {
        deckKey,
        getAssets,
        onPatchItem,
        onMarkTouched: markFieldTouched,
        onUpdateValidationUI: updateValidationUI,
        onRerenderForm: render,
        onUploadFile,
        onPickImageDialog,
        captureCursor,
      },
    };

    // Render theo type
    if (t === 'vocab') {
      mainNodes.push(...renderVocabSection({ item, ctx }));
    } else if (t === 'card') {
      mainNodes.push(...renderCardSection({ item, ctx }));
    } else {
      mainNodes.push(...renderQuestionSection({ item, isMC, ctx }));
    }

    // Optional: Answer Display (cho Điền / Lệnh)
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

    // Optional: Explanation
    if (hasExplanation) {
      mainNodes.push(
        createMarkdownField({
          label: 'Giải thích',
          path: 'explanation',
          validateGroup: 'explanation',
          value: item.explanation || '',
          placeholder: 'Giải thích chi tiết hiện ra sau khi người học trả lời…',
          minRows: 2,
          ...ctx.mdFieldProps,
          onCollapse: () => {
            manuallyOpened.delete('explanation');
            onPatchItem({ explanation: '' });
            render();
          },
        })
      );
    }

    // Optional: Topic
    const existingTopics = [...new Set((deck.items || []).map(i => i.topic).filter(Boolean))];
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

    // Optional: Tags
    const existingTags = [...new Set((deck.items || []).flatMap(i => i.tags || []).filter(Boolean))];
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

    // Add chips for optional fields
    const addChips = [];
    if (t === 'vocab') {
      if (!hasForms) addChips.push({ key: 'forms', label: '+ Biến thể (Forms)', focusPath: 'forms' });
      if (!hasSynonyms) addChips.push({ key: 'synonyms', label: '+ Từ đồng nghĩa', focusPath: 'synonyms' });
      if (!hasImage) addChips.push({ key: 'image', label: '+ Ảnh minh hoạ', focusPath: 'image' });
      if (!hasTopic) addChips.push({ key: 'topic', label: '+ Chủ đề', focusPath: 'topic' });
      if (!hasTags) addChips.push({ key: 'tags', label: '+ Nhãn', focusPath: 'tags' });
    } else {
      if (!hasExplanation) addChips.push({ key: 'explanation', label: '+ Giải thích', focusPath: 'explanation' });
      if (t !== 'card' && !hasImage) addChips.push({ key: 'image', label: '+ Ảnh kèm đề', focusPath: 'image' });
      if (t !== 'card' && !hasAnswerImage) addChips.push({ key: 'answerImage', label: '+ Ảnh kèm đáp án', focusPath: 'answerImage' });
      if ((t === 'fill' || t === 'command') && !hasAnswerDisplay) addChips.push({ key: 'answerDisplay', label: '+ Hiển thị đáp án đẹp', focusPath: 'answerDisplay' });
      if (!hasTopic) addChips.push({ key: 'topic', label: '+ Chủ đề', focusPath: 'topic' });
      if (!hasTags) addChips.push({ key: 'tags', label: '+ Nhãn', focusPath: 'tags' });
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

    // Phần bản dịch đa ngôn ngữ (Translations)
    if (t !== 'translate') {
      const translations = item.translations || {};
      const transLangs = Object.keys(translations);
      const transNodes = [];

      for (const langKey of transLangs) {
        const tr = translations[langKey] || {};
        const qField = (t === 'card') ? 'front' : ((t === 'vocab') ? 'term' : 'question');
        const qLabel = (t === 'card') ? 'Mặt trước' : ((t === 'vocab') ? 'Thuật ngữ' : 'Câu hỏi');
        const ansField = (t === 'card') ? 'back' : ((t === 'vocab') ? 'Định nghĩa' : null);
        const ansLabel = (t === 'card') ? 'Mặt sau' : ((t === 'vocab') ? 'Định nghĩa' : null);

        transNodes.push(
          h('div', { class: 'panel', style: 'margin-top: 10px; padding: 12px; border-left: 3px solid var(--c-primary, #3b82f6);' },
            h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' },
              h('span', { style: 'font-weight: 700; font-size: 13px;' }, `🌐 Bản dịch: ${langKey.toUpperCase()}`),
              h('button', {
                type: 'button',
                class: 'ux-btn xs ghost danger-hover',
                title: 'Xoá bản dịch này',
                onclick: () => {
                  const nextTr = { ...translations };
                  delete nextTr[langKey];
                  onPatchItem({ translations: nextTr });
                  render();
                }
              }, '✕ Xoá')
            ),
            createMarkdownField({
              label: `${qLabel} (${langKey.toUpperCase()})`,
              path: `translations.${langKey}.${qField}`,
              value: tr[qField] || '',
              placeholder: `Nhập bản dịch ${qLabel.toLowerCase()}…`,
              rich,
              onInput: val => applyPathValue(`translations.${langKey}.${qField}`, val),
              onFocusPath: focusFieldByPath,
              onPickImageDialog,
              onSetActiveTextarea,
            }),
            ansField ? createMarkdownField({
              label: `${ansLabel} (${langKey.toUpperCase()})`,
              path: `translations.${langKey}.${ansField}`,
              value: tr[ansField] || '',
              placeholder: `Nhập bản dịch ${ansLabel.toLowerCase()}…`,
              rich,
              onInput: val => applyPathValue(`translations.${langKey}.${ansField}`, val),
              onFocusPath: focusFieldByPath,
              onPickImageDialog,
              onSetActiveTextarea,
            }) : null,
            createMarkdownField({
              label: `Giải thích (${langKey.toUpperCase()})`,
              path: `translations.${langKey}.explanation`,
              value: tr.explanation || '',
              placeholder: 'Nhập bản dịch giải thích (tuỳ chọn)…',
              rich,
              onInput: val => applyPathValue(`translations.${langKey}.explanation`, val),
              onFocusPath: focusFieldByPath,
              onPickImageDialog,
              onSetActiveTextarea,
            })
          )
        );
      }

      mainNodes.push(
        h('div', { class: 'form-translations-section', style: 'margin-top: 16px;' },
          h('div', { style: 'display: flex; align-items: center; justify-content: space-between;' },
            h('span', { style: 'font-size: 13px; font-weight: 600; color: var(--c-text-muted);' }, 'Bản dịch đa ngôn ngữ'),
            h('button', {
              type: 'button',
              class: 'ux-btn xs ghost',
              onclick: () => {
                const langInput = window.prompt('Nhập mã ngôn ngữ mới (vd: vi, en, ja, fr):');
                if (!langInput) return;
                const cleanLang = langInput.trim().toLowerCase();
                if (!cleanLang) return;
                const nextTr = { ...(item.translations || {}) };
                if (!nextTr[cleanLang]) {
                  nextTr[cleanLang] = {};
                  onPatchItem({ translations: nextTr });
                  const currentDeck = getDeck();
                  if (currentDeck && currentDeck.meta) {
                    const deckLangs = Array.isArray(currentDeck.meta.lang)
                      ? [...currentDeck.meta.lang]
                      : (typeof currentDeck.meta.lang === 'string' ? [currentDeck.meta.lang] : ['vi']);
                    if (!deckLangs.includes(cleanLang)) {
                      deckLangs.push(cleanLang);
                      currentDeck.meta.lang = deckLangs;
                      currentDeck.meta.formatVersion = 2;
                    }
                  }
                  render();
                }
              }
            }, '+ Thêm bản dịch')
          ),
          ...transNodes
        )
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
      const path = item.type === 'card' ? 'front' : (item.type === 'vocab' || item.term !== undefined ? 'term' : 'question');
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
          // ignore cho các input không hỗ trợ setSelectionRange
        }
      }
    },
  };
}

