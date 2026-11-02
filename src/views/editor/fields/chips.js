// src/views/editor/fields/chips.js — Ô nhập danh sách chip (dùng cho Đáp án chấp nhận §6.3 và Nhãn §6.1)
import { h } from '../../dom.js';

export function createChipListField({
  label,
  hint,
  path,
  validateGroup,
  values = [],
  suggestions = [],
  placeholder = 'Nhập rồi nhấn Enter…',
  mono = false,
  splitComma = false,
  keepAtLeastOneEmpty = false,
  onChangeValues,
  onLiveInput,
  onBlurValidate,
  onCollapse,
  onFocusPath,
}) {
  const cleanValues = values.map(v => String(v ?? '').trim()).filter(Boolean);
  const datalistId = suggestions.length ? `datalist-${path}-${Math.random().toString(36).slice(2, 7)}` : null;

  function commitList(nextClean) {
    const finalArr = keepAtLeastOneEmpty && nextClean.length === 0 ? [''] : nextClean;
    onChangeValues(finalArr);
  }

  function addRawText(raw) {
    const parts = splitComma
      ? String(raw || '').split(/[\r\n,]+/)
      : String(raw || '').split(/\r?\n/);
    const toAdd = parts.map(s => s.trim()).filter(Boolean);
    if (!toAdd.length) return false;
    const next = [...cleanValues];
    for (const item of toAdd) {
      if (!next.includes(item)) next.push(item);
    }
    commitList(next);
    return true;
  }

  const inputEl = h('input', {
    type: 'text',
    class: `tag-inline-input ${mono ? 'font-mono' : ''}`,
    list: datalistId || undefined,
    placeholder: cleanValues.length ? 'Nhập thêm rồi nhấn Enter…' : placeholder,
    'data-path': path,
    'data-validate-input': validateGroup || undefined,
    oninput: () => {
      if (onLiveInput) onLiveInput(inputEl.value, cleanValues);
    },
    onpaste: ev => {
      const clip = ev.clipboardData?.getData('text/plain') || '';
      if (clip.includes('\n') || (splitComma && clip.includes(','))) {
        ev.preventDefault();
        if (addRawText(clip) && onFocusPath) {
          onFocusPath(path);
        }
      }
    },
    onkeydown: ev => {
      if (ev.key === 'Enter' || (splitComma && ev.key === ',')) {
        ev.preventDefault();
        if (addRawText(inputEl.value)) {
          if (onFocusPath) onFocusPath(path);
        } else {
          inputEl.value = '';
        }
      } else if (ev.key === 'Backspace' && inputEl.value === '' && cleanValues.length > 0) {
        ev.preventDefault();
        commitList(cleanValues.slice(0, -1));
        if (onFocusPath) onFocusPath(path);
      }
    },
    onblur: () => {
      if (inputEl.value.trim()) {
        addRawText(inputEl.value);
      }
      if (onBlurValidate && validateGroup) {
        onBlurValidate(validateGroup);
      }
    },
  });

  const chipNodes = cleanValues.map((val, idx) =>
    h('span', {
      class: `tag-pill ${mono ? 'font-mono' : ''}`,
      title: 'Bấm để sửa biến thể này',
      onclick: ev => {
        ev.stopPropagation();
        // Bấm vào chip: đưa giá trị xuống ô nhập để sửa nhanh
        const remaining = cleanValues.filter((_, i) => i !== idx);
        commitList(remaining);
        queueMicrotask(() => {
          const newInp = document.querySelector(`[data-path="${path}"]`);
          if (newInp) {
            newInp.value = val;
            newInp.focus();
            newInp.select();
          }
        });
      },
    },
      val,
      h('button', {
        type: 'button',
        title: 'Xoá',
        onclick: ev => {
          ev.stopPropagation();
          commitList(cleanValues.filter((_, i) => i !== idx));
        },
      }, '✕'))
  );

  return h('div', { class: 'form-field' },
    h('div', { class: 'form-label-row' },
      h('label', { class: 'form-label' }, label),
      hint ? h('span', { class: 'form-label-hint' }, hint) : null,
      !cleanValues.length && onCollapse ? h('button', {
        type: 'button',
        class: 'ux-btn ghost sm',
        style: 'height: 22px; padding: 0 6px;',
        onclick: onCollapse,
      }, '✕ Ẩn') : null),
    h('div', {
      class: 'tags-chip-box',
      'data-validate-input': validateGroup || undefined,
      onclick: () => inputEl.focus(),
    },
      ...chipNodes,
      inputEl),
    datalistId ? h('datalist', { id: datalistId }, suggestions.map(s => h('option', { value: s }))) : null,
    validateGroup ? h('div', { 'data-validate-group': validateGroup }) : null);
}

