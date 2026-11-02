// src/views/editor/form.js — Vùng soạn câu hỏi/thẻ chuẩn UX v2 (§6, §8, §9, §13.2, §13.3)
import { h, fileName } from '../dom.js';
import { validateItem, friendlyIssue } from '../../core/validate.js';
import { gradeText } from '../../core/grader.js';
import {
  isBlankNewItem,
  setCorrect,
  splitPastedChoices,
} from '../../core/deckmodel.js';

function mapIssueFieldToPath(field, item) {
  if (!field) return 'question';
  if (field === 'question') {
    if (item?.type === 'card') return 'front';
    return 'question';
  }
  if (field === 'choices') return 'choices.0';
  if (field === 'answer' || field === 'answers') {
    return (item?.type === 'single' || item?.type === 'multi') ? 'choices.0' : 'answers.0';
  }
  if (field === 'tolerance') return 'tolerance';
  if (field === 'image') return 'image';
  if (field === 'answerImage') return 'answerImage';
  return field;
}

function autoResizeTextarea(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(ta.scrollHeight, 36)}px`;
}

export function createFormPane({
  container,
  deckKey,
  getDeck,
  getItem,
  getAssets,
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
  // Tập các trường tuỳ chọn được người dùng chủ động bấm "+ Thêm" mở ra trên mục hiện tại
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

  // Chèn văn bản tại vị trí con trỏ trong textarea/input
  function insertAtCursor(el, path, before, after = '', defaultInside = '') {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const selected = el.value.slice(start, end) || defaultInside;
    const nextVal = el.value.slice(0, start) + before + selected + after + el.value.slice(end);
    const beforeCursor = captureCursor(el, path);
    el.value = nextVal;
    const newSelStart = start + before.length;
    const newSelEnd = newSelStart + selected.length;
    el.focus();
    el.setSelectionRange(newSelStart, newSelEnd);
    autoResizeTextarea(el);
    const afterCursor = captureCursor(el, path);
    applyPathValue(path, nextVal, { mergeKey: `${path}`, cursor: afterCursor, beforeCursor });
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
      const nextAnswers = [...(item.answers || [''])];
      nextAnswers[idx] = val;
      onPatchItem({ answers: nextAnswers }, meta);
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

    // Nếu là mục mới tinh chưa chạm, hoàn toàn không báo lỗi (§9)
    if (blank && !itemTouched && touchedSet.size === 0) {
      return { allIssues, visibleByGroup: new Map(), headerIssues: [] };
    }

    const visibleByGroup = new Map();
    const headerIssues = [];

    for (const iss of allIssues) {
      const f = iss.field || 'question';
      const isFieldChecked = itemTouched || touchedSet.has(f) || touchedSet.has('*');
      if (isFieldChecked) {
        headerIssues.push(iss);
        if (!visibleByGroup.has(f)) visibleByGroup.set(f, []);
        visibleByGroup.get(f).push(iss);
      }
    }
    return { allIssues, visibleByGroup, headerIssues };
  }

  // Cập nhật các dòng báo lỗi dưới trường & chip ⚠ trên header mà KHÔNG dựng lại ô nhập
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
    const target = bodyHost.querySelector(`[data-path="${path}"]`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.focus();
      if (typeof target.select === 'function') target.select();
    }
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
        class: 'ux-popover-item',
        onclick: () => { openHeaderPopover = null; renderHeader(); onDuplicate(); },
      }, 'Nhân đôi mục (Ctrl+D)'),
      h('button', {
        class: 'ux-popover-item danger',
        onclick: () => { openHeaderPopover = null; renderHeader(); onDelete(); },
      }, 'Xoá mục này'),
      h('div', { class: 'ux-popover-sep' }),
      h('button', {
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
          class: `ux-seg-btn ${mobileTab !== 'preview' ? 'active' : ''}`,
          onclick: () => onChangeMobileTab('form'),
        }, 'Soạn'),
        h('button', {
          class: `ux-seg-btn ${mobileTab === 'preview' ? 'active' : ''}`,
          onclick: () => onChangeMobileTab('preview'),
        }, 'Xem trước'))) : null;

    headerHost.replaceChildren(
      h('div', { class: 'form-nav-group' },
        h('button', {
          class: 'ux-icon-btn',
          disabled: idx <= 0,
          title: 'Mục trước (Alt+↑)',
          onclick: onNavigatePrev,
        }, '◀'),
        h('span', null, `Mục ${idx + 1}/${total}`),
        h('button', {
          class: 'ux-icon-btn',
          disabled: idx >= total - 1,
          title: 'Mục tiếp theo (Alt+↓)',
          onclick: onNavigateNext,
        }, '▶')),

      h('div', { style: 'display: flex; align-items: center; gap: 8px; position: relative;' },
        headerIssues.length ? h('div', { style: 'position: relative;' },
          h('button', {
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

  // Tạo ô soạn văn bản có thanh công cụ (Câu hỏi / Mặt trước / Mặt sau / Giải thích)
  function createRichBox({
    label,
    path,
    validateGroup,
    value,
    placeholder,
    minRows = 3,
    onCollapse,
  }) {
    let beforeFocusCursor = null;

    const ta = h('textarea', {
      class: 'rich-textarea',
      rows: String(minRows),
      placeholder,
      'data-path': path,
      'data-validate-input': validateGroup,
      value: value || '',
      onfocus: () => {
        beforeFocusCursor = captureCursor(ta, path);
        if (onSetActiveTextarea) {
          onSetActiveTextarea({
            insertImageMarkdown(relPath) {
              const snippet = `![mô tả](${relPath})`;
              const start = ta.selectionStart ?? ta.value.length;
              const end = ta.selectionEnd ?? ta.value.length;
              const next = ta.value.slice(0, start) + snippet + ta.value.slice(end);
              ta.value = next;
              ta.focus();
              ta.setSelectionRange(start + 2, start + 7); // bôi đen chữ "mô tả"
              autoResizeTextarea(ta);
              applyPathValue(path, next, {
                mergeKey: path,
                cursor: captureCursor(ta, path),
                beforeCursor: beforeFocusCursor,
              });
            },
          });
        }
      },
      oninput: () => {
        autoResizeTextarea(ta);
        const cur = captureCursor(ta, path);
        applyPathValue(path, ta.value, {
          mergeKey: path,
          cursor: cur,
          beforeCursor: beforeFocusCursor,
        });
        beforeFocusCursor = cur;
        updateValidationUI();
      },
      onblur: () => {
        markFieldTouched(validateGroup);
        updateValidationUI();
      },
      onkeydown: ev => {
        if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'b') {
          ev.preventDefault();
          insertAtCursor(ta, path, '**', '**', 'chữ đậm');
          updateValidationUI();
        } else if ((ev.ctrlKey || ev.metaKey) && !ev.shiftKey && ev.key.toLowerCase() === 'i') {
          ev.preventDefault();
          insertAtCursor(ta, path, '*', '*', 'chữ nghiêng');
          updateValidationUI();
        }
      },
      ondragover: ev => {
        if (ev.dataTransfer?.types?.includes('Files')) {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
        }
      },
      ondrop: async ev => {
        const files = ev.dataTransfer?.files;
        if (!files?.length) return;
        ev.preventDefault();
        for (const f of files) {
          const relPath = await onUploadFile(f);
          if (relPath) {
            const snippet = `![mô tả](${relPath})`;
            const start = ta.selectionStart ?? ta.value.length;
            const next = ta.value.slice(0, start) + snippet + ta.value.slice(start);
            ta.value = next;
            ta.focus();
            ta.setSelectionRange(start + 2, start + 7);
            autoResizeTextarea(ta);
            applyPathValue(path, next, { mergeKey: path, cursor: captureCursor(ta, path) });
          }
        }
      },
      onpaste: async ev => {
        const items = ev.clipboardData?.items;
        if (!items) return;
        for (const it of items) {
          if (it.type.startsWith('image/')) {
            ev.preventDefault();
            const f = it.getAsFile();
            if (!f) continue;
            const relPath = await onUploadFile(f);
            if (relPath) {
              const snippet = `![mô tả](${relPath})`;
              const start = ta.selectionStart ?? ta.value.length;
              const next = ta.value.slice(0, start) + snippet + ta.value.slice(start);
              ta.value = next;
              ta.focus();
              ta.setSelectionRange(start + 2, start + 7);
              autoResizeTextarea(ta);
              applyPathValue(path, next, { mergeKey: path, cursor: captureCursor(ta, path) });
            }
          }
        }
      },
    });

    queueMicrotask(() => autoResizeTextarea(ta));

    const toolbar = h('div', { class: 'rich-toolbar' },
      h('button', {
        type: 'button',
        class: 'rich-tool-btn',
        title: 'In đậm (Ctrl+B)',
        onclick: () => insertAtCursor(ta, path, '**', '**', 'chữ đậm'),
      }, h('strong', null, 'B')),
      h('button', {
        type: 'button',
        class: 'rich-tool-btn',
        title: 'In nghiêng (Ctrl+I)',
        onclick: () => insertAtCursor(ta, path, '*', '*', 'chữ nghiêng'),
      }, h('em', null, 'I')),
      h('button', {
        type: 'button',
        class: 'rich-tool-btn',
        title: 'Mã lệnh nội dòng',
        onclick: () => insertAtCursor(ta, path, '`', '`', 'code'),
      }, '</>'),
      h('div', { class: 'rich-tool-sep' }),
      h('button', {
        type: 'button',
        class: 'rich-tool-btn',
        title: 'Chèn công thức toán ($…$)',
        onclick: () => insertAtCursor(ta, path, '$', '$', 'x^2'),
      }, 'ƒx'),
      h('button', {
        type: 'button',
        class: 'rich-tool-btn',
        title: 'Chèn ảnh vào văn bản',
        onclick: async () => {
          const relPath = await onPickImageDialog();
          if (relPath) {
            const snippet = `![mô tả](${relPath})`;
            const start = ta.selectionStart ?? ta.value.length;
            const next = ta.value.slice(0, start) + snippet + ta.value.slice(start);
            ta.value = next;
            ta.focus();
            ta.setSelectionRange(start + 2, start + 7);
            autoResizeTextarea(ta);
            applyPathValue(path, next, { mergeKey: path, cursor: captureCursor(ta, path) });
          }
        },
      }, '🖼 Ảnh'));

    const boxWrap = h('div', {
      class: 'rich-box-wrap',
      'data-validate-input': validateGroup,
    }, toolbar, ta);

    return h('div', { class: 'form-field' },
      h('div', { class: 'form-label-row' },
        h('label', { class: 'form-label' }, label),
        onCollapse ? h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          style: 'height: 22px; padding: 0 6px;',
          title: 'Ẩn trường này',
          onclick: onCollapse,
        }, '✕ Ẩn') : null),
      boxWrap,
      h('div', { 'data-validate-group': validateGroup }));
  }

  // Ô thả/dán/chọn ảnh (không lộ đường dẫn img/...)
  function createImageSlot({ label, field, value, onCollapse }) {
    const hasImg = Boolean(value && String(value).trim());
    const assets = getAssets() || [];
    const assetMeta = assets.find(a => a.name === value);
    const sizeKb = assetMeta?.size ? `${Math.max(1, Math.round(assetMeta.size / 1024))} KB` : '';

    const setImg = relPath => {
      markFieldTouched(field);
      onPatchItem({ [field]: relPath }, { mergeKey: field });
      render();
    };

    const slotBox = hasImg
      ? h('div', { class: 'img-slot-box has-image', 'data-validate-input': field },
          h('img', {
            class: 'img-slot-thumb',
            src: `asset://${deckKey}/${value}`,
            alt: label,
          }),
          h('div', { class: 'img-slot-meta' },
            h('div', { style: 'font-size: 13px; font-weight: 500;' }, fileName(value)),
            sizeKb ? h('div', { class: 'muted', style: 'font-size: 11px;' }, sizeKb) : null),
          h('div', { style: 'display: flex; gap: 6px;' },
            h('button', {
              type: 'button',
              class: 'ux-btn sm',
              onclick: async () => {
                const picked = await onPickImageDialog();
                if (picked) setImg(picked);
              },
            }, 'Thay'),
            h('button', {
              type: 'button',
              class: 'ux-btn sm danger-hover',
              onclick: () => {
                manuallyOpened.delete(field);
                setImg('');
              },
            }, 'Xoá')))
      : h('div', {
          class: 'img-slot-box',
          tabindex: '0',
          'data-path': field,
          'data-validate-input': field,
          onclick: async () => {
            const picked = await onPickImageDialog();
            if (picked) setImg(picked);
          },
          ondragover: ev => {
            if (ev.dataTransfer?.types?.includes('Files')) {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = 'copy';
            }
          },
          ondrop: async ev => {
            const f = ev.dataTransfer?.files?.[0];
            if (!f) return;
            ev.preventDefault();
            const picked = await onUploadFile(f);
            if (picked) setImg(picked);
          },
          onpaste: async ev => {
            const items = ev.clipboardData?.items || [];
            for (const it of items) {
              if (it.type.startsWith('image/')) {
                ev.preventDefault();
                const f = it.getAsFile();
                if (f) {
                  const picked = await onUploadFile(f);
                  if (picked) setImg(picked);
                }
              }
            }
          },
        }, '🖼 Kéo ảnh vào, dán Ctrl+V, hoặc bấm để chọn…');

    return h('div', { class: 'form-field' },
      h('div', { class: 'form-label-row' },
        h('label', { class: 'form-label' }, label),
        !hasImg && onCollapse ? h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          style: 'height: 22px; padding: 0 6px;',
          onclick: onCollapse,
        }, '✕ Ẩn') : null),
      slotBox,
      h('div', { 'data-validate-group': field }));
  }

  // Phần riêng: Trắc nghiệm (gộp single + multi)
  function renderMultipleChoiceSection(item) {
    const choices = item.choices || ['', ''];
    const correctIndices = item.type === 'multi'
      ? (Array.isArray(item.answer) ? item.answer : [])
      : (typeof item.answer === 'number' ? [item.answer] : []);

    const statusHint = correctIndices.length > 1
      ? `Nhiều đáp án đúng — người học chọn ${correctIndices.length}`
      : 'Một đáp án đúng';

    const rows = choices.map((c, idx) => {
      const isObj = c && typeof c === 'object';
      const textVal = isObj ? (c.text ?? '') : String(c ?? '');
      const imgVal = isObj ? (c.image ?? '') : '';
      const isCorrect = correctIndices.includes(idx);
      const letter = String.fromCharCode(65 + idx);
      const path = `choices.${idx}`;
      let beforeCursor = null;

      const inp = h('input', {
        type: 'text',
        class: 'ux-input choice-row-input',
        placeholder: `Lựa chọn ${letter}…`,
        value: textVal,
        'data-path': path,
        'data-validate-input': 'choices',
        onfocus: () => { beforeCursor = captureCursor(inp, path); },
        oninput: () => {
          const cur = captureCursor(inp, path);
          applyPathValue(path, inp.value, { mergeKey: path, cursor: cur, beforeCursor });
          beforeCursor = cur;
          updateValidationUI();
        },
        onblur: () => {
          markFieldTouched('choices');
          updateValidationUI();
        },
        onpaste: ev => {
          const clipText = ev.clipboardData?.getData('text/plain') || '';
          const split = splitPastedChoices(clipText);
          if (split && split.length >= 2) {
            ev.preventDefault();
            const nextChoices = [...choices];
            nextChoices.splice(idx, 1, ...split);
            onPatchItem({ choices: nextChoices });
            render();
            focusFieldByPath(`choices.${idx + split.length - 1}`);
          }
        },
        onkeydown: ev => {
          if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
            ev.preventDefault();
            const nextChoices = [...(getItem().choices || [])];
            nextChoices.splice(idx + 1, 0, '');
            onPatchItem({ choices: nextChoices });
            render();
            focusFieldByPath(`choices.${idx + 1}`);
          } else if (ev.key === 'Backspace' && inp.value === '' && (getItem().choices || []).length > 2) {
            ev.preventDefault();
            const curItem = getItem();
            const nextChoices = curItem.choices.filter((_, i) => i !== idx);
            let nextAns = curItem.answer;
            if (curItem.type === 'single') {
              if (nextAns === idx) nextAns = 0;
              else if (nextAns > idx) nextAns--;
            } else if (Array.isArray(nextAns)) {
              nextAns = nextAns.filter(a => a !== idx).map(a => (a > idx ? a - 1 : a));
            }
            onPatchItem({ choices: nextChoices, answer: nextAns });
            render();
            focusFieldByPath(`choices.${Math.max(0, idx - 1)}`);
          }
        },
      });

      return h('div', { class: 'choice-editor-row' },
        h('button', {
          type: 'button',
          class: `choice-letter-btn ${isCorrect ? 'is-correct' : ''}`,
          title: isCorrect ? 'Đang là đáp án đúng (bấm để bỏ)' : 'Bấm để đánh dấu là đáp án đúng',
          onclick: () => {
            markFieldTouched('answer');
            const updated = setCorrect(getItem(), idx);
            onPatchItem({ type: updated.type, answer: updated.answer });
            render();
          },
        }, letter),
        inp,
        imgVal
          ? h('button', {
              type: 'button',
              class: 'ux-icon-btn sm',
              title: 'Xoá ảnh của lựa chọn này',
              onclick: () => {
                const nextChoices = [...getItem().choices];
                nextChoices[idx] = textVal;
                onPatchItem({ choices: nextChoices });
                render();
              },
            }, '🖼✕')
          : h('button', {
              type: 'button',
              class: 'ux-icon-btn sm choice-row-del',
              title: 'Thêm ảnh cho lựa chọn này',
              onclick: async () => {
                const picked = await onPickImageDialog();
                if (picked) {
                  const nextChoices = [...getItem().choices];
                  nextChoices[idx] = { text: textVal, image: picked };
                  onPatchItem({ choices: nextChoices });
                  render();
                }
              },
            }, '🖼'),
        choices.length > 2 ? h('button', {
          type: 'button',
          class: 'ux-icon-btn sm choice-row-del',
          title: 'Xoá lựa chọn này',
          onclick: () => {
            const curItem = getItem();
            const nextChoices = curItem.choices.filter((_, i) => i !== idx);
            let nextAns = curItem.answer;
            if (curItem.type === 'single') {
              if (nextAns === idx) nextAns = 0;
              else if (nextAns > idx) nextAns--;
            } else if (Array.isArray(nextAns)) {
              nextAns = nextAns.filter(a => a !== idx).map(a => (a > idx ? a - 1 : a));
            }
            onPatchItem({ choices: nextChoices, answer: nextAns });
            render();
          },
        }, '✕') : null);
    });

    return h('div', { class: 'form-field' },
      h('div', { class: 'form-label-row' },
        h('label', { class: 'form-label' }, 'Các lựa chọn (bấm chữ cái đầu dòng để chọn đáp án đúng)'),
        h('span', { class: 'form-label-hint' }, statusHint)),
      h('div', { class: 'choices-editor-list' }, ...rows),
      h('div', { style: 'margin-top: 4px;' },
        h('button', {
          type: 'button',
          class: 'ux-btn sm',
          onclick: () => {
            const nextChoices = [...(getItem().choices || []), ''];
            onPatchItem({ choices: nextChoices });
            render();
            focusFieldByPath(`choices.${nextChoices.length - 1}`);
          },
        }, '+ Thêm lựa chọn')),
      h('div', { 'data-validate-group': 'choices' }),
      h('div', { 'data-validate-group': 'answer' }));
  }

  // Phần riêng: Điền đáp án / Gõ lệnh
  function renderFillCommandSection(item) {
    const isCmd = item.type === 'command';
    const answers = item.answers?.length ? item.answers : [''];
    const matchMode = item.match || (isCmd ? 'command' : 'loose');

    let testValue = '';
    const testResultEl = h('span', { style: 'font-size: 12px; font-weight: 600;' });

    const runLiveGrade = () => {
      if (!testValue.trim()) {
        testResultEl.textContent = '';
        return;
      }
      const cur = getItem();
      const validAns = (cur.answers || []).filter(a => a && a.trim());
      if (!validAns.length) {
        testResultEl.textContent = 'Chưa có đáp án mẫu';
        testResultEl.style.color = 'var(--c-text-muted)';
        return;
      }
      const g = gradeText(testValue, validAns, cur.match || (isCmd ? 'command' : 'loose'), {
        tolerance: cur.tolerance,
      });
      if (g.ok) {
        testResultEl.textContent = g.near ? '≈ Gần đúng (Chấp nhận)' : '✓ Khớp đáp án';
        testResultEl.style.color = 'var(--c-ok)';
      } else {
        testResultEl.textContent = '✗ Không khớp';
        testResultEl.style.color = 'var(--c-danger)';
      }
    };

    const answerRows = answers.map((ans, idx) => {
      const path = `answers.${idx}`;
      let beforeCursor = null;
      const inp = h('input', {
        type: 'text',
        class: `ux-input ${isCmd ? 'font-mono' : ''}`,
        style: 'flex: 1;',
        placeholder: isCmd ? `Lệnh chấp nhận ${idx + 1}…` : `Đáp án chấp nhận ${idx + 1}…`,
        value: ans,
        'data-path': path,
        'data-validate-input': 'answers',
        onfocus: () => { beforeCursor = captureCursor(inp, path); },
        oninput: () => {
          const cur = captureCursor(inp, path);
          applyPathValue(path, inp.value, { mergeKey: path, cursor: cur, beforeCursor });
          beforeCursor = cur;
          updateValidationUI();
          runLiveGrade();
        },
        onblur: () => {
          markFieldTouched('answers');
          updateValidationUI();
        },
        onkeydown: ev => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            const nextAns = [...(getItem().answers || ['']), ''];
            onPatchItem({ answers: nextAns });
            render();
            focusFieldByPath(`answers.${nextAns.length - 1}`);
          }
        },
      });

      return h('div', { style: 'display: flex; align-items: center; gap: 6px;' },
        isCmd ? h('span', { class: 'font-mono muted', style: 'font-weight: 700;' }, '$') : null,
        inp,
        answers.length > 1 ? h('button', {
          type: 'button',
          class: 'ux-icon-btn sm',
          title: 'Xoá biến thể này',
          onclick: () => {
            const nextAns = getItem().answers.filter((_, i) => i !== idx);
            onPatchItem({ answers: nextAns });
            render();
          },
        }, '✕') : null);
    });

    const matchModes = isCmd
      ? [
          { key: 'command', label: 'Chuẩn câu lệnh' },
          { key: 'exact', label: 'Chính xác' },
          { key: 'regex', label: 'Biểu thức Regex' },
        ]
      : [
          { key: 'loose', label: 'Thường' },
          { key: 'exact', label: 'Chính xác' },
          { key: 'number', label: 'Số' },
          { key: 'latex', label: 'Công thức LaTeX' },
          { key: 'regex', label: 'Regex' },
        ];

    return h('div', { style: 'display: flex; flex-direction: column; gap: 14px;' },
      h('div', { class: 'form-field' },
        h('div', { class: 'form-label-row' },
          h('label', { class: 'form-label' }, 'Đáp án chấp nhận'),
          h('span', { class: 'form-label-hint' }, 'Nhấn Enter để thêm biến thể đúng khác')),
        h('div', { style: 'display: flex; flex-direction: column; gap: 6px;' }, ...answerRows),
        h('div', null,
          h('button', {
            type: 'button',
            class: 'ux-btn sm',
            onclick: () => {
              const nextAns = [...(getItem().answers || ['']), ''];
              onPatchItem({ answers: nextAns });
              render();
              focusFieldByPath(`answers.${nextAns.length - 1}`);
            },
          }, '+ Thêm biến thể đáp án')),
        h('div', { 'data-validate-group': 'answers' })),

      h('div', { class: 'form-field' },
        h('label', { class: 'form-label' }, 'Cách chấm'),
        h('div', { class: 'ux-segmented', style: 'align-self: flex-start; flex-wrap: wrap;' },
          matchModes.map(m => h('button', {
            type: 'button',
            class: `ux-seg-btn ${matchMode === m.key ? 'active' : ''}`,
            onclick: () => {
              onPatchItem({ match: m.key });
              render();
            },
          }, m.label)))),

      matchMode === 'number' ? h('div', { class: 'form-field' },
        h('label', { class: 'form-label' }, 'Sai số cho phép (±)'),
        h('input', {
          type: 'number',
          step: 'any',
          min: '0',
          class: 'ux-input',
          style: 'max-width: 180px;',
          placeholder: '0 (mặc định)',
          value: item.tolerance ?? '',
          'data-path': 'tolerance',
          'data-validate-input': 'tolerance',
          oninput: ev => {
            const v = ev.target.value === '' ? undefined : Number(ev.target.value);
            onPatchItem({ tolerance: v }, { mergeKey: 'tolerance', cursor: captureCursor(ev.target, 'tolerance') });
            updateValidationUI();
            runLiveGrade();
          },
          onblur: () => {
            markFieldTouched('tolerance');
            updateValidationUI();
          },
        }),
        h('div', { 'data-validate-group': 'tolerance' })) : null,

      h('div', {
        style: 'padding: 10px 12px; border-radius: var(--r-md); background: var(--c-surface-2); display: flex; align-items: center; gap: 10px;',
      },
        h('span', { style: 'font-size: 12px; font-weight: 600; color: var(--c-text-muted); white-space: nowrap;' }, 'Chấm thử nhanh:'),
        h('input', {
          type: 'text',
          class: `ux-input sm ${isCmd ? 'font-mono' : ''}`,
          style: 'flex: 1;',
          placeholder: 'Gõ câu trả lời giả định để kiểm tra bộ chấm…',
          oninput: ev => {
            testValue = ev.target.value;
            runLiveGrade();
          },
        }),
        testResultEl)
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

    const t = item.type || 'single';
    const isMC = t === 'single' || t === 'multi';

    // Thanh chọn dạng 4 nút (§6.1)
    const typeSeg = h('div', { class: 'form-field' },
      h('div', { class: 'ux-segmented', style: 'width: 100%;' },
        [
          { key: 'single', active: isMC, label: 'Trắc nghiệm' },
          { key: 'fill', active: t === 'fill', label: 'Điền' },
          { key: 'command', active: t === 'command', label: 'Lệnh' },
          { key: 'card', active: t === 'card', label: 'Thẻ' },
        ].map(opt => h('button', {
          type: 'button',
          class: `ux-seg-btn ${opt.active ? 'active' : ''}`,
          style: 'flex: 1;',
          onclick: () => {
            if (!opt.active) onChangeType(opt.key);
          },
        }, opt.label))));

    // 1. Câu hỏi / Mặt trước + 2. Phần riêng theo dạng
    const mainNodes = [typeSeg];

    if (t === 'card') {
      mainNodes.push(
        createRichBox({
          label: 'Mặt trước',
          path: 'front',
          validateGroup: 'question',
          value: item.front || '',
          placeholder: 'Nhập câu hỏi, thuật ngữ hoặc nội dung mặt trước…',
          minRows: 3,
        }),
        createRichBox({
          label: 'Mặt sau',
          path: 'back',
          validateGroup: 'answer',
          value: item.back || '',
          placeholder: 'Nhập câu trả lời hoặc giải nghĩa ở mặt sau…',
          minRows: 3,
        })
      );
    } else {
      mainNodes.push(
        createRichBox({
          label: 'Câu hỏi',
          path: 'question',
          validateGroup: 'question',
          value: item.question || '',
          placeholder: 'Nhập nội dung câu hỏi (hỗ trợ Markdown & công thức $…$)…',
          minRows: 3,
        })
      );
      if (isMC) {
        mainNodes.push(renderMultipleChoiceSection(item));
      } else if (t === 'fill' || t === 'command') {
        mainNodes.push(renderFillCommandSection(item));
      }
    }

    // 3. Các phần tuỳ chọn đã có dữ liệu hoặc đã bấm "+ Thêm"
    const hasExplanation = Boolean((item.explanation || '').trim()) || manuallyOpened.has('explanation');
    const hasImage = Boolean((item.image || '').trim()) || manuallyOpened.has('image');
    const hasAnswerImage = Boolean((item.answerImage || '').trim()) || manuallyOpened.has('answerImage');
    const hasTopic = Boolean((item.topic || '').trim()) || manuallyOpened.has('topic');
    const hasTags = Boolean(item.tags?.length) || manuallyOpened.has('tags');
    const hasAnswerDisplay = (t === 'fill' || t === 'command')
      && (Boolean((item.answerDisplay || '').trim()) || manuallyOpened.has('answerDisplay'));

    if (hasImage) {
      mainNodes.push(
        createImageSlot({
          label: t === 'card' ? 'Ảnh mặt trước' : 'Ảnh kèm đề',
          field: 'image',
          value: item.image || '',
          onCollapse: () => {
            manuallyOpened.delete('image');
            onPatchItem({ image: '' });
            render();
          },
        })
      );
    }

    if (hasAnswerImage) {
      mainNodes.push(
        createImageSlot({
          label: t === 'card' ? 'Ảnh mặt sau' : 'Ảnh kèm đáp án',
          field: 'answerImage',
          value: item.answerImage || '',
          onCollapse: () => {
            manuallyOpened.delete('answerImage');
            onPatchItem({ answerImage: '' });
            render();
          },
        })
      );
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
            placeholder: 'Chuỗi Markdown/LaTeX hiển thị sau khi nộp bài (nếu khác đáp án thô)…',
            value: item.answerDisplay || '',
            'data-path': 'answerDisplay',
            oninput: ev => {
              onPatchItem(
                { answerDisplay: ev.target.value },
                { mergeKey: 'answerDisplay', cursor: captureCursor(ev.target, 'answerDisplay') }
              );
            },
          }))
      );
    }

    if (hasExplanation) {
      mainNodes.push(
        createRichBox({
          label: 'Giải thích',
          path: 'explanation',
          validateGroup: 'explanation',
          value: item.explanation || '',
          placeholder: 'Giải thích chi tiết hiện ra sau khi người học trả lời…',
          minRows: 2,
          onCollapse: () => {
            manuallyOpened.delete('explanation');
            onPatchItem({ explanation: '' });
            render();
          },
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
      const tagListId = 'editor-tags-datalist';
      const currentTags = item.tags || [];
      const tagInput = h('input', {
        type: 'text',
        class: 'tag-inline-input',
        list: tagListId,
        placeholder: currentTags.length ? 'Thêm nhãn…' : 'Gõ nhãn rồi nhấn Enter hoặc dấu phẩy…',
        'data-path': 'tags',
        onkeydown: ev => {
          if (ev.key === 'Enter' || ev.key === ',') {
            ev.preventDefault();
            const val = tagInput.value.trim().replace(/,/g, '');
            if (val && !currentTags.includes(val)) {
              onPatchItem({ tags: [...currentTags, val] });
              render();
              focusFieldByPath('tags');
            } else {
              tagInput.value = '';
            }
          } else if (ev.key === 'Backspace' && tagInput.value === '' && currentTags.length > 0) {
            onPatchItem({ tags: currentTags.slice(0, -1) });
            render();
            focusFieldByPath('tags');
          }
        },
        onblur: () => {
          const val = tagInput.value.trim().replace(/,/g, '');
          if (val && !currentTags.includes(val)) {
            onPatchItem({ tags: [...currentTags, val] });
            render();
          }
        },
      });

      mainNodes.push(
        h('div', { class: 'form-field' },
          h('div', { class: 'form-label-row' },
            h('label', { class: 'form-label' }, 'Nhãn'),
            !currentTags.length ? h('button', {
              type: 'button',
              class: 'ux-btn ghost sm',
              style: 'height: 22px; padding: 0 6px;',
              onclick: () => {
                manuallyOpened.delete('tags');
                render();
              },
            }, '✕ Ẩn') : null),
          h('div', {
            class: 'tags-chip-box',
            onclick: () => tagInput.focus(),
          },
            ...currentTags.map(tg => h('span', { class: 'tag-pill' },
              tg,
              h('button', {
                type: 'button',
                title: 'Bỏ nhãn',
                onclick: ev => {
                  ev.stopPropagation();
                  onPatchItem({ tags: currentTags.filter(x => x !== tg) });
                  render();
                },
              }, '✕'))),
            tagInput),
          h('datalist', { id: tagListId }, existingTags.map(tg => h('option', { value: tg }))))
      );
    }

    // 4. Hàng chip "+ Thêm" cho các trường tuỳ chọn chưa mở (§6.1)
    const addChips = [];
    if (!hasExplanation) {
      addChips.push({ key: 'explanation', label: '+ Giải thích', focusPath: 'explanation' });
    }
    if (!hasImage) {
      addChips.push({
        key: 'image',
        label: t === 'card' ? '+ Ảnh mặt trước' : '+ Ảnh kèm đề',
        focusPath: 'image',
      });
    }
    if (!hasAnswerImage) {
      addChips.push({
        key: 'answerImage',
        label: t === 'card' ? '+ Ảnh mặt sau' : '+ Ảnh kèm đáp án',
        focusPath: 'answerImage',
      });
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

