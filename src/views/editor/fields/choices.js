// src/views/editor/fields/choices.js — Danh sách lựa chọn trắc nghiệm (tự suy single/multi, kéo thả, dán thông minh, công thức) (§6.2)
import { h } from '../../dom.js';
import { setCorrect, splitPastedChoices } from '../../../core/deckmodel.js';
import {
  findEnclosingMath,
  insertFormula,
  nextPlaceholder,
  handleDollarKey,
} from '../../../core/mathinput.js';
import { openMathPopover } from '../mathpopover.js';

function autoFitChoiceTextarea(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(36, Math.min(ta.scrollHeight, 180))}px`;
}

export function createChoicesSection({
  deckKey,
  rich,
  getItem,
  getRecentSnippets,
  onRecordRecentSnippet,
  onPatchItem,
  onApplyPathValue,
  onMarkFieldTouched,
  onUpdateValidationUI,
  onRerenderForm,
  onFocusPath,
  onPickImageDialog,
  onUploadFile,
  captureCursor,
}) {
  const item = getItem();
  const choices = item.choices || ['', ''];
  const correctIndices = Array.isArray(item.answer)
    ? item.answer
    : (typeof item.answer === 'number' ? [item.answer] : []);

  const statusHint = correctIndices.length > 1
    ? `Nhiều đáp án đúng — người học chọn ${correctIndices.length}`
    : correctIndices.length === 1
      ? 'Một đáp án đúng'
      : 'Bấm chữ cái đầu dòng để chọn đáp án đúng';

  let dragChoiceFrom = null;

  function reorderChoice(fromIdx, toIdx) {
    const cur = getItem();
    const list = [...(cur.choices || [])];
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= list.length || toIdx >= list.length || fromIdx === toIdx) return;

    // Đánh dấu những phần tử nào đang là đáp án đúng trước khi di chuyển
    const oldAns = new Set(Array.isArray(cur.answer) ? cur.answer : []);
    const tagged = list.map((c, i) => ({ c, correct: oldAns.has(i) }));
    const [moved] = tagged.splice(fromIdx, 1);
    tagged.splice(toIdx, 0, moved);

    const nextChoices = tagged.map(x => x.c);
    const nextAnswer = [];
    tagged.forEach((x, i) => {
      if (x.correct) nextAnswer.push(i);
    });
    const nextType = nextAnswer.length >= 2 ? 'multi' : 'single';
    onPatchItem({ choices: nextChoices, answer: nextAnswer, type: nextType });
    onRerenderForm();
  }

  function removeChoiceAt(idx) {
    const curItem = getItem();
    const curChoices = curItem.choices || [];
    if (curChoices.length <= 2) return;
    const oldAns = new Set(Array.isArray(curItem.answer) ? curItem.answer : []);
    const tagged = curChoices.map((c, i) => ({ c, correct: oldAns.has(i) })).filter((_, i) => i !== idx);
    const nextChoices = tagged.map(x => x.c);
    const nextAnswer = [];
    tagged.forEach((x, i) => {
      if (x.correct) nextAnswer.push(i);
    });
    const nextType = nextAnswer.length >= 2 ? 'multi' : 'single';
    onPatchItem({ choices: nextChoices, answer: nextAnswer, type: nextType });
    onRerenderForm();
    onFocusPath(`choices.${Math.max(0, idx - 1)}`);
  }

  const rows = choices.map((c, idx) => {
    const isObj = c && typeof c === 'object';
    const textVal = isObj ? (c.text ?? '') : String(c ?? '');
    const imgVal = isObj ? (c.image ?? '') : '';
    const isCorrect = correctIndices.includes(idx);
    const letter = String.fromCharCode(65 + idx);
    const path = `choices.${idx}`;
    let beforeCursor = null;

    function applyChoiceTextResult(res) {
      const prevCur = captureCursor(ta, path);
      ta.value = res.text;
      ta.focus();
      ta.setSelectionRange(res.selStart, res.selEnd);
      autoFitChoiceTextarea(ta);
      const nextCur = captureCursor(ta, path);
      onApplyPathValue(path, res.text, {
        mergeKey: path,
        cursor: nextCur,
        beforeCursor: prevCur,
      });
      beforeCursor = nextCur;
      onUpdateValidationUI();
    }

    function wrapChoiceFormat(before, after = before, defaultInside = '') {
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      const selected = ta.value.slice(start, end) || defaultInside;
      const nextText = ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
      applyChoiceTextResult({
        text: nextText,
        selStart: start + before.length,
        selEnd: start + before.length + selected.length,
      });
    }

    function openChoiceMath(anchorBtn, defaultBlock = false) {
      const pos = ta.selectionStart ?? 0;
      const enc = findEnclosingMath(ta.value, pos);
      openMathPopover({
        anchorEl: anchorBtn,
        rich,
        enclosingMath: enc,
        defaultBlock,
        recentIds: getRecentSnippets ? getRecentSnippets() : [],
        onRecordRecent: onRecordRecentSnippet,
        onInsertSnippet: (latex, { block }) => {
          const res = insertFormula(
            {
              text: ta.value,
              selStart: ta.selectionStart ?? ta.value.length,
              selEnd: ta.selectionEnd ?? ta.value.length,
            },
            latex,
            { block }
          );
          applyChoiceTextResult(res);
        },
        onCommitCustom: (customLatex, { block, replaceEnclosing }) => {
          if (replaceEnclosing && enc) {
            const delim = block ? '$$' : '$';
            const replacement = `${delim}${customLatex}${delim}`;
            const nextText = ta.value.slice(0, enc.start) + replacement + ta.value.slice(enc.end);
            const endPos = enc.start + replacement.length;
            applyChoiceTextResult({ text: nextText, selStart: endPos, selEnd: endPos });
          } else {
            const res = insertFormula(
              {
                text: ta.value,
                selStart: ta.selectionStart ?? ta.value.length,
                selEnd: ta.selectionEnd ?? ta.value.length,
              },
              customLatex,
              { block }
            );
            applyChoiceTextResult(res);
          }
        },
        onRestoreFocus: () => ta.focus(),
      });
    }

    const ta = h('textarea', {
      class: 'ux-input choice-row-input choice-textarea',
      rows: '1',
      placeholder: `Lựa chọn ${letter}…`,
      value: textVal,
      'data-path': path,
      'data-validate-input': `choices[${idx}]`,
      onfocus: () => {
        beforeCursor = captureCursor(ta, path);
        rowEl.classList.add('is-focused');
      },
      oninput: () => {
        autoFitChoiceTextarea(ta);
        const cur = captureCursor(ta, path);
        onApplyPathValue(path, ta.value, { mergeKey: path, cursor: cur, beforeCursor });
        beforeCursor = cur;
        onUpdateValidationUI();
      },
      onblur: () => {
        rowEl.classList.remove('is-focused');
        onMarkFieldTouched('choices');
        onMarkFieldTouched(`choices[${idx}]`);
        onUpdateValidationUI();
      },
      onpaste: async ev => {
        // Kiểm tra nếu dán ảnh trực tiếp vào lựa chọn
        const items = ev.clipboardData?.items || [];
        for (const it of items) {
          if (it.type.startsWith('image/')) {
            ev.preventDefault();
            const f = it.getAsFile();
            if (f && onUploadFile) {
              const picked = await onUploadFile(f);
              if (picked) {
                const nextChoices = [...getItem().choices];
                nextChoices[idx] = { text: ta.value, image: picked };
                onPatchItem({ choices: nextChoices });
                onRerenderForm();
              }
            }
            return;
          }
        }

        // Dán nhiều dòng văn bản → tách thành nhiều lựa chọn thông minh (§6.2)
        const clipText = ev.clipboardData?.getData('text/plain') || '';
        if (clipText.includes('\n')) {
          const parsed = splitPastedChoices(clipText);
          if (parsed && parsed.length >= 2) {
            ev.preventDefault();
            const cur = getItem();
            const curChoices = [...(cur.choices || [])];
            const isChoiceEmpty = ch =>
              typeof ch === 'string' ? ch.trim() === '' : !((ch?.text ?? '').trim() || (ch?.image ?? '').trim());

            // Đếm xem từ vị trí idx trở đi có bao nhiêu ô trống liên tiếp để ghi đè thay vì để dư ô trống
            let replaceCount = 1;
            for (let k = idx + 1; k < curChoices.length && replaceCount < parsed.length; k++) {
              if (isChoiceEmpty(curChoices[k])) replaceCount++;
              else break;
            }

            const newTexts = parsed.map(p => p.text);
            curChoices.splice(idx, replaceCount, ...newTexts);

            const ansSet = new Set(Array.isArray(cur.answer) ? cur.answer : []);
            const hasExplicitCorrect = parsed.some(p => p.correct);
            if (hasExplicitCorrect) {
              // Nếu văn bản dán có đánh dấu [x] hoặc * → dùng chính các dòng được đánh dấu
              ansSet.clear();
              parsed.forEach((p, offset) => {
                if (p.correct) ansSet.add(idx + offset);
              });
            }
            const nextAnswer = [...ansSet].filter(a => a >= 0 && a < curChoices.length).sort((a, b) => a - b);
            const nextType = nextAnswer.length >= 2 ? 'multi' : 'single';

            onPatchItem({ choices: curChoices, answer: nextAnswer, type: nextType });
            onRerenderForm();
            onFocusPath(`choices.${idx + parsed.length - 1}`);
          }
        }
      },
      onkeydown: ev => {
        const ctrl = ev.ctrlKey || ev.metaKey;
        const key = ev.key.toLowerCase();

        if (ctrl && !ev.shiftKey && key === 'b') {
          ev.preventDefault();
          wrapChoiceFormat('**', '**', 'chữ đậm');
          return;
        }
        if (ctrl && !ev.shiftKey && key === 'i') {
          ev.preventDefault();
          wrapChoiceFormat('*', '*', 'chữ nghiêng');
          return;
        }
        if (ctrl && key === 'm') {
          ev.preventDefault();
          openChoiceMath(miniFxBtn, ev.shiftKey);
          return;
        }
        if (ev.key === '$' && !ctrl && !ev.altKey) {
          ev.preventDefault();
          const res = handleDollarKey({
            text: ta.value,
            selStart: ta.selectionStart ?? 0,
            selEnd: ta.selectionEnd ?? 0,
          });
          applyChoiceTextResult(res);
          return;
        }
        if (ev.key === 'Tab' && !ctrl && !ev.altKey) {
          const jump = nextPlaceholder(ta.value, ta.selectionStart ?? 0, { backward: ev.shiftKey });
          if (jump) {
            ev.preventDefault();
            ta.setSelectionRange(jump.selStart, jump.selEnd);
            return;
          }
        }

        // Enter (không giữ Shift/Ctrl): thêm lựa chọn mới ngay bên dưới và focus (§6.2)
        if (ev.key === 'Enter' && !ev.shiftKey && !ctrl) {
          ev.preventDefault();
          const cur = getItem();
          const nextChoices = [...(cur.choices || [])];
          nextChoices.splice(idx + 1, 0, '');
          // Dịch các chỉ số đáp án đúng nằm sau idx lên +1
          const nextAnswer = (Array.isArray(cur.answer) ? cur.answer : []).map(a => (a > idx ? a + 1 : a));
          onPatchItem({ choices: nextChoices, answer: nextAnswer });
          onRerenderForm();
          onFocusPath(`choices.${idx + 1}`);
          return;
        }

        // Backspace khi lựa chọn rỗng → xoá và focus lựa chọn trước (§6.2)
        if (ev.key === 'Backspace' && ta.value === '' && !imgVal && (getItem().choices || []).length > 2) {
          ev.preventDefault();
          removeChoiceAt(idx);
        }
      },
    });

    queueMicrotask(() => autoFitChoiceTextarea(ta));

    const miniFxBtn = h('button', {
      type: 'button',
      class: 'choice-mini-tool',
      title: 'Chèn công thức (Ctrl+M)',
      onmousedown: ev => ev.preventDefault(),
      onclick: ev => {
        ev.stopPropagation();
        openChoiceMath(miniFxBtn, false);
      },
    }, 'ƒx');

    const focusToolbar = h('div', { class: 'choice-focus-tools' },
      h('button', {
        type: 'button',
        class: 'choice-mini-tool',
        title: 'In đậm (Ctrl+B)',
        onmousedown: ev => ev.preventDefault(),
        onclick: () => wrapChoiceFormat('**', '**', 'chữ đậm'),
      }, h('strong', null, 'B')),
      h('button', {
        type: 'button',
        class: 'choice-mini-tool',
        title: 'In nghiêng (Ctrl+I)',
        onmousedown: ev => ev.preventDefault(),
        onclick: () => wrapChoiceFormat('*', '*', 'chữ nghiêng'),
      }, h('em', null, 'I')),
      miniFxBtn);

    // Nút ảnh hoặc thumbnail 28px của lựa chọn (§6.2)
    const imgActionNode = imgVal
      ? h('div', { class: 'choice-thumb-group' },
          h('img', {
            class: 'choice-thumb-28',
            src: `asset://${deckKey}/${imgVal}`,
            alt: `Ảnh lựa chọn ${letter}`,
            title: 'Bấm để thay ảnh cho lựa chọn này',
            onclick: async () => {
              const picked = await onPickImageDialog();
              if (picked) {
                const nextChoices = [...getItem().choices];
                nextChoices[idx] = { text: ta.value, image: picked };
                onPatchItem({ choices: nextChoices });
                onRerenderForm();
              }
            },
          }),
          h('button', {
            type: 'button',
            class: 'choice-thumb-remove',
            title: 'Gỡ ảnh khỏi lựa chọn này',
            onclick: () => {
              const nextChoices = [...getItem().choices];
              nextChoices[idx] = ta.value;
              onPatchItem({ choices: nextChoices });
              onRerenderForm();
            },
          }, '✕'))
      : h('button', {
          type: 'button',
          class: 'ux-icon-btn sm choice-row-img-btn',
          title: 'Thêm ảnh cho lựa chọn này',
          onclick: async () => {
            const picked = await onPickImageDialog();
            if (picked) {
              const nextChoices = [...getItem().choices];
              nextChoices[idx] = { text: ta.value, image: picked };
              onPatchItem({ choices: nextChoices });
              onRerenderForm();
            }
          },
        }, '🖼');

    const rowEl = h('div', {
      class: 'choice-editor-row',
      ondragover: ev => {
        if (dragChoiceFrom === null || dragChoiceFrom === idx) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        rowEl.classList.add('choice-drag-over');
      },
      ondragleave: () => {
        rowEl.classList.remove('choice-drag-over');
      },
      ondrop: ev => {
        if (dragChoiceFrom === null) return;
        ev.preventDefault();
        rowEl.classList.remove('choice-drag-over');
        reorderChoice(dragChoiceFrom, idx);
        dragChoiceFrom = null;
      },
    },
      h('span', {
        class: 'choice-drag-grip',
        draggable: 'true',
        title: 'Kéo để đổi thứ tự lựa chọn',
        ondragstart: ev => {
          dragChoiceFrom = idx;
          ev.dataTransfer.effectAllowed = 'move';
        },
        ondragend: () => {
          dragChoiceFrom = null;
          rowEl.classList.remove('choice-drag-over');
        },
      }, '⠿'),

      h('button', {
        type: 'button',
        class: `choice-letter-btn ${isCorrect ? 'is-correct' : ''}`,
        title: isCorrect ? 'Đang là đáp án đúng (bấm để bỏ chọn)' : 'Bấm để đánh dấu là đáp án đúng',
        onclick: () => {
          onMarkFieldTouched('answer');
          const updated = setCorrect(getItem(), idx);
          onPatchItem({ type: updated.type, answer: updated.answer });
          onRerenderForm();
        },
      }, isCorrect ? `${letter} ✓` : letter),

      h('div', { class: 'choice-input-wrap' },
        ta,
        focusToolbar,
        h('div', { 'data-validate-group': `choices[${idx}]` })),

      imgActionNode,

      choices.length > 2 ? h('button', {
        type: 'button',
        class: 'ux-icon-btn sm choice-row-del',
        title: 'Xoá lựa chọn này',
        onclick: () => removeChoiceAt(idx),
      }, '✕') : null);

    return rowEl;
  });

  return h('div', { class: 'form-field' },
    h('div', { class: 'form-label-row' },
      h('label', { class: 'form-label' }, 'Các lựa chọn'),
      h('span', { class: `form-label-hint ${correctIndices.length >= 2 ? 'is-multi' : ''}` }, statusHint)),
    h('div', { class: 'choices-editor-list' }, ...rows),
    h('div', { style: 'margin-top: 4px;' },
      h('button', {
        type: 'button',
        class: 'ux-btn sm',
        onclick: () => {
          const nextChoices = [...(getItem().choices || []), ''];
          onPatchItem({ choices: nextChoices });
          onRerenderForm();
          onFocusPath(`choices.${nextChoices.length - 1}`);
        },
      }, '+ Thêm lựa chọn')),
    h('div', { 'data-validate-group': 'choices' }),
    h('div', { 'data-validate-group': 'answer' }));
}

