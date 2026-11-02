// src/views/editor/fields/mdfield.js — Ô soạn Markdown + LaTeX tự giãn, auto-pair $, nhảy ô ▢, popover ƒx (§7.1, §7.2)
import { h } from '../../dom.js';
import {
  findEnclosingMath,
  insertFormula,
  nextPlaceholder,
  handleDollarKey,
  handleMathEnterKey,
} from '../../../core/mathinput.js';
import { QUICK_TOOLBAR_SNIPPETS } from '../../../core/snippets.js';
import { openMathPopover } from '../mathpopover.js';

export function autoResizeTextarea(ta, minH = 76, maxH = 380) {
  if (!ta) return;
  ta.style.height = 'auto';
  const nextH = Math.max(minH, Math.min(ta.scrollHeight, maxH));
  ta.style.height = `${nextH}px`;
  ta.style.overflowY = ta.scrollHeight > maxH ? 'auto' : 'hidden';
}

export function createMarkdownField({
  label,
  path,
  validateGroup,
  value,
  placeholder,
  minRows = 3,
  rich,
  getRecentSnippets,
  onRecordRecentSnippet,
  onApplyValue,
  onBlurValidate,
  onUploadFile,
  onPickImageDialog,
  onSetActiveHelper,
  onCollapse,
  captureCursor,
}) {
  let beforeFocusCursor = null;
  const minH = minRows <= 2 ? 58 : 78;

  // Áp dụng kết quả { text, selStart, selEnd } vào textarea và đẩy vào history
  function applyStateResult(res) {
    const prevCur = captureCursor(ta, path);
    ta.value = res.text;
    ta.focus();
    ta.setSelectionRange(res.selStart, res.selEnd);
    autoResizeTextarea(ta, minH);
    const nextCur = captureCursor(ta, path);
    onApplyValue(path, res.text, {
      mergeKey: path,
      cursor: nextCur,
      beforeCursor: prevCur,
    });
    beforeFocusCursor = nextCur;
  }

  function wrapFormat(before, after = before, defaultInside = '') {
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const selected = ta.value.slice(start, end) || defaultInside;
    const nextText = ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
    applyStateResult({
      text: nextText,
      selStart: start + before.length,
      selEnd: start + before.length + selected.length,
    });
  }

  function insertImageMarkdown(relPath) {
    if (!relPath) return;
    const snippet = `![mô tả](${relPath})`;
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const nextText = ta.value.slice(0, start) + snippet + ta.value.slice(end);
    // Bôi đen chữ "mô tả" để người dùng gõ đè ngay (§8)
    applyStateResult({
      text: nextText,
      selStart: start + 2,
      selEnd: start + 7,
    });
  }

  function triggerFormulaInsert(latex, { block = false } = {}) {
    const res = insertFormula(
      {
        text: ta.value,
        selStart: ta.selectionStart ?? ta.value.length,
        selEnd: ta.selectionEnd ?? ta.value.length,
      },
      latex,
      { block }
    );
    applyStateResult(res);
  }

  function triggerMathPopover(anchorBtn, { defaultBlock = false } = {}) {
    const pos = ta.selectionStart ?? 0;
    const enc = findEnclosingMath(ta.value, pos);

    openMathPopover({
      anchorEl: anchorBtn || fxBtn,
      rich,
      enclosingMath: enc,
      defaultBlock,
      recentIds: getRecentSnippets ? getRecentSnippets() : [],
      onRecordRecent: onRecordRecentSnippet,
      onInsertSnippet: (latex, { block }) => {
        triggerFormulaInsert(latex, { block });
      },
      onCommitCustom: (customLatex, { block, replaceEnclosing }) => {
        if (replaceEnclosing && enc) {
          const delim = block ? '$$' : '$';
          const replacement = block ? `$$\n${customLatex}\n$$` : `${delim}${customLatex}${delim}`;
          const nextText = ta.value.slice(0, enc.start) + replacement + ta.value.slice(enc.end);
          const endPos = enc.start + replacement.length;
          applyStateResult({ text: nextText, selStart: endPos, selEnd: endPos });
        } else {
          triggerFormulaInsert(customLatex, { block });
        }
      },
      onRestoreFocus: () => {
        ta.focus();
      },
    });
  }

  const ta = h('textarea', {
    class: 'rich-textarea',
    rows: String(minRows),
    placeholder,
    'data-path': path,
    'data-validate-input': validateGroup,
    value: value || '',
    onfocus: () => {
      beforeFocusCursor = captureCursor(ta, path);
      if (onSetActiveHelper) {
        onSetActiveHelper({ insertImageMarkdown });
      }
    },
    oninput: () => {
      autoResizeTextarea(ta, minH);
      const cur = captureCursor(ta, path);
      onApplyValue(path, ta.value, {
        mergeKey: path,
        cursor: cur,
        beforeCursor: beforeFocusCursor,
      });
      beforeFocusCursor = cur;
    },
    onblur: () => {
      if (onBlurValidate) onBlurValidate(validateGroup);
    },
    onkeydown: ev => {
      const ctrl = ev.ctrlKey || ev.metaKey;
      const key = ev.key.toLowerCase();

      // Ctrl+B / Ctrl+I
      if (ctrl && !ev.shiftKey && key === 'b') {
        ev.preventDefault();
        wrapFormat('**', '**', 'chữ đậm');
        return;
      }
      if (ctrl && !ev.shiftKey && key === 'i') {
        ev.preventDefault();
        wrapFormat('*', '*', 'chữ nghiêng');
        return;
      }

      // Ctrl+M: mở popover công thức (hoặc bọc công thức nếu đang bôi đen)
      if (ctrl && !ev.shiftKey && key === 'm') {
        ev.preventDefault();
        triggerMathPopover(fxBtn, { defaultBlock: false });
        return;
      }
      // Ctrl+Shift+M: mở popover công thức ở chế độ Khối riêng
      if (ctrl && ev.shiftKey && key === 'm') {
        ev.preventDefault();
        triggerMathPopover(fxBtn, { defaultBlock: true });
        return;
      }

      // Phím $: tự đóng cặp $...$ hoặc nhảy qua $ đóng (§7.1)
      if (ev.key === '$' && !ctrl && !ev.altKey) {
        ev.preventDefault();
        const res = handleDollarKey({
          text: ta.value,
          selStart: ta.selectionStart ?? 0,
          selEnd: ta.selectionEnd ?? 0,
        });
        applyStateResult(res);
        return;
      }

      // Phím Enter khi đang đứng giữa $$|$$ → tách khối công thức nhiều dòng
      if (ev.key === 'Enter' && !ctrl && !ev.shiftKey) {
        const mEnter = handleMathEnterKey({
          text: ta.value,
          selStart: ta.selectionStart ?? 0,
          selEnd: ta.selectionEnd ?? 0,
        });
        if (mEnter) {
          ev.preventDefault();
          applyStateResult(mEnter);
          return;
        }
      }

      // Phím Tab / Shift+Tab: nhảy qua các ô trống ▢ trong công thức (§7.2, §11)
      if (ev.key === 'Tab' && !ctrl && !ev.altKey) {
        const jump = nextPlaceholder(ta.value, ta.selectionStart ?? 0, { backward: ev.shiftKey });
        if (jump) {
          ev.preventDefault();
          ta.setSelectionRange(jump.selStart, jump.selEnd);
        }
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
        if (relPath) insertImageMarkdown(relPath);
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
          if (relPath) insertImageMarkdown(relPath);
        }
      }
    },
  });

  queueMicrotask(() => autoResizeTextarea(ta, minH));

  const fxBtn = h('button', {
    type: 'button',
    class: 'rich-tool-btn fx-btn',
    title: 'Bảng công thức toán học (Ctrl+M)',
    onmousedown: ev => ev.preventDefault(),
    onclick: ev => {
      ev.stopPropagation();
      triggerMathPopover(fxBtn, { defaultBlock: false });
    },
  }, 'ƒx ▾');

  const quickButtons = QUICK_TOOLBAR_SNIPPETS.map(qs => h('button', {
    type: 'button',
    class: 'rich-tool-btn math-quick-btn',
    title: `${qs.title} — Chèn nhanh`,
    onmousedown: ev => ev.preventDefault(),
    onclick: () => {
      if (onRecordRecentSnippet) onRecordRecentSnippet(qs.id);
      triggerFormulaInsert(qs.latex, { block: false });
    },
  }, qs.label));

  const toolbar = h('div', { class: 'rich-toolbar' },
    h('button', {
      type: 'button',
      class: 'rich-tool-btn',
      title: 'In đậm (Ctrl+B)',
      onmousedown: ev => ev.preventDefault(),
      onclick: () => wrapFormat('**', '**', 'chữ đậm'),
    }, h('strong', null, 'B')),
    h('button', {
      type: 'button',
      class: 'rich-tool-btn',
      title: 'In nghiêng (Ctrl+I)',
      onmousedown: ev => ev.preventDefault(),
      onclick: () => wrapFormat('*', '*', 'chữ nghiêng'),
    }, h('em', null, 'I')),
    h('button', {
      type: 'button',
      class: 'rich-tool-btn',
      title: 'Mã lệnh nội dòng (`code`)',
      onmousedown: ev => ev.preventDefault(),
      onclick: () => wrapFormat('`', '`', 'code'),
    }, '</>'),
    h('div', { class: 'rich-tool-sep' }),
    fxBtn,
    ...quickButtons,
    h('div', { class: 'rich-tool-sep' }),
    h('button', {
      type: 'button',
      class: 'rich-tool-btn',
      title: 'Chèn ảnh vào văn bản',
      onmousedown: ev => ev.preventDefault(),
      onclick: async () => {
        const relPath = await onPickImageDialog();
        if (relPath) insertImageMarkdown(relPath);
      },
    }, '🖼'));

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

