// src/views/editor/preview.js — Cột Xem trước thời gian thực (study-app-editor-ux.md §10)
import { h } from '../dom.js';
import { assetUrl } from '../../core/richtext.js';
import { buildQuestion } from '../../core/builder.js';
import { gradeText, gradeChoices } from '../../core/grader.js';
import { validateItem, hasError, friendlyIssue } from '../../core/validate.js';
import { isBlankNewItem } from '../../core/deckmodel.js';

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

export function createPreviewPane({ container, deckKey, rich, getAssets, onToggleCollapse }) {
  let currentItem = null;
  let tabMode = 'prompt'; // 'prompt' ('Đề') | 'answer' ('Đáp án')
  let userAnswer = null;
  let submitted = false;
  let grade = null;
  let cardFlipped = false;
  let debounceTimer = null;

  const scrollBox = h('div', { class: 'preview-scroll' });

  function resetInteractive(item) {
    if (!item || currentItem?.id !== item.id || currentItem?.type !== item.type) {
      userAnswer = null;
      submitted = false;
      grade = null;
      cardFlipped = false;
    }
    currentItem = item;
  }

  function renderImmediate(item) {
    resetInteractive(item);
    const prevScroll = scrollBox.scrollTop;

    const topbar = h('div', { class: 'preview-topbar' },
      h('span', { class: 'preview-col-title' }, 'Xem trước'),
      h('div', { style: 'display: flex; align-items: center; gap: 6px;' },
        h('div', { class: 'ux-segmented sm' },
          h('button', {
            class: `ux-seg-btn ${tabMode === 'prompt' ? 'active' : ''}`,
            onclick: () => { tabMode = 'prompt'; renderImmediate(currentItem); },
          }, 'Đề'),
          h('button', {
            class: `ux-seg-btn ${tabMode === 'answer' ? 'active' : ''}`,
            onclick: () => { tabMode = 'answer'; renderImmediate(currentItem); },
          }, 'Đáp án')),
        onToggleCollapse ? h('button', {
          class: 'ux-icon-btn',
          title: 'Ẩn/hiện Xem trước (Ctrl+\\)',
          onclick: onToggleCollapse,
        }, '⇥') : null));

    if (!item) {
      scrollBox.replaceChildren(h('div', { class: 'empty muted' }, 'Chưa chọn mục nào.'));
      container.replaceChildren(topbar, scrollBox);
      return;
    }

    const assetsList = getAssets ? getAssets() : [];
    const assetsMap = new Map(assetsList.map(a => [a.name, a]));
    const issues = validateItem(item, { assets: assetsMap });
    const errors = issues.filter(i => i.level === 'error');
    const q = buildQuestion(item);

    const showAnswerState = tabMode === 'answer' || submitted;
    const nodes = [];

    if (q) {
      // Đề bài / Mặt trước
      if (q.kind !== 'card') {
        const promptText = (q.prompt || '').trim();
        nodes.push(
          promptText
            ? richEl('div', { class: 'question-prompt' }, rich.html(promptText))
            : h('div', { class: 'question-prompt muted', style: 'font-style: italic;' }, '(Chưa nhập câu hỏi)')
        );
        const mainImg = q.image ? assetUrl(q.image, deckKey) : null;
        if (mainImg) {
          nodes.push(h('img', { class: 'rich-img', src: mainImg, alt: 'Ảnh kèm đề' }));
        }
      }

      // Phần trả lời theo từng dạng
      if (q.kind === 'single' || q.kind === 'multi') {
        const isMulti = q.kind === 'multi';
        const choices = q.choices.length ? q.choices : ['', ''];

        nodes.push(
          h('div', { class: 'choices-list' },
            choices.map((c, i) => {
              const isObj = c && typeof c === 'object';
              const text = isObj ? (c.text ?? '').trim() : String(c ?? '').trim();
              const imgUrl = isObj && c.image ? assetUrl(c.image, deckKey) : null;
              const isEmptyChoice = !text && !imgUrl;

              const isSelected = isMulti
                ? (userAnswer || []).includes(i)
                : userAnswer === i;
              const isCorrect = (q.answers || []).includes(i);

              let stateClass = isEmptyChoice ? 'preview-empty-choice' : '';
              if (showAnswerState) {
                if (isCorrect) stateClass += ' choice-correct';
                else if (submitted && isSelected) stateClass += ' choice-wrong';
              } else if (isSelected) {
                stateClass += ' choice-selected';
              }

              return h('div', {
                class: `choice-label ${stateClass}`,
                role: isMulti ? 'checkbox' : 'radio',
                'aria-checked': isSelected,
                onclick: () => {
                  if (showAnswerState) return;
                  if (isMulti) {
                    const set = new Set(userAnswer || []);
                    if (set.has(i)) set.delete(i);
                    else set.add(i);
                    userAnswer = [...set];
                  } else {
                    userAnswer = i;
                  }
                  renderImmediate(currentItem);
                },
              },
                h('span', { class: 'choice-key' }, String.fromCharCode(65 + i)),
                h('input', {
                  type: isMulti ? 'checkbox' : 'radio',
                  name: `preview-choice-${q.id}`,
                  checked: showAnswerState ? (submitted ? isSelected : isCorrect) : isSelected,
                  disabled: showAnswerState,
                  tabindex: '-1',
                }),
                h('div', { class: 'choice-content' },
                  imgUrl ? h('img', { class: 'rich-img choice-img', src: imgUrl, alt: text || `Lựa chọn ${i + 1}` }) : null,
                  isEmptyChoice
                    ? h('span', null, '(lựa chọn trống)')
                    : text ? richEl('span', { class: 'choice-text' }, rich.inline(text)) : null));
            }))
        );
      } else if (q.kind === 'fill' || q.kind === 'command') {
        const isCmd = q.kind === 'command';
        let inputClass = 'ux-input answer-input';
        if (isCmd) inputClass += ' font-mono';
        if (submitted && grade) {
          inputClass += grade.ok ? ' has-ok' : ' has-error';
        }

        const checkNow = () => {
          grade = gradeText(String(userAnswer || ''), (q.answers || []).filter(Boolean), q.match, { tolerance: q.tolerance });
          submitted = true;
          renderImmediate(currentItem);
        };

        nodes.push(
          h('div', { class: 'input-area', style: 'display: flex; align-items: center; gap: 8px;' },
            isCmd ? h('span', { class: 'cmd-prompt' }, '$') : null,
            h('input', {
              type: 'text',
              class: inputClass,
              style: 'flex: 1;',
              placeholder: isCmd ? 'Nhập lệnh để chấm thử…' : 'Nhập câu trả lời để chấm thử…',
              value: tabMode === 'answer' ? ((q.answers || [])[0] || '') : (userAnswer || ''),
              disabled: showAnswerState,
              oninput: ev => { userAnswer = ev.target.value; },
              onkeydown: ev => {
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  checkNow();
                }
              },
            }))
        );
      } else if (q.kind === 'card') {
        const frontImg = q.image ? assetUrl(q.image, deckKey) : null;
        const backImg = q.answerImage ? assetUrl(q.answerImage, deckKey) : null;
        const flipped = tabMode === 'answer' || cardFlipped;

        nodes.push(
          h('div', { class: 'flashcard-wrap' },
            h('div', {
              class: `flashcard ${flipped ? 'flipped' : ''}`,
              onclick: () => {
                if (tabMode === 'prompt') {
                  cardFlipped = !cardFlipped;
                  renderImmediate(currentItem);
                }
              },
            },
              h('div', { class: 'card-face card-front' },
                h('span', { class: 'card-badge' }, 'Mặt trước'),
                (q.front || '').trim()
                  ? richEl('div', { class: 'card-content' }, rich.html(q.front))
                  : h('div', { class: 'card-content muted', style: 'font-style: italic;' }, '(Chưa nhập mặt trước)'),
                frontImg ? h('img', { class: 'rich-img card-img', src: frontImg, alt: 'Ảnh mặt trước' }) : null),
              flipped ? h('div', { class: 'card-face card-back' },
                h('span', { class: 'card-badge' }, 'Mặt sau'),
                (q.back || '').trim()
                  ? richEl('div', { class: 'card-content' }, rich.html(q.back))
                  : h('div', { class: 'card-content muted', style: 'font-style: italic;' }, '(Chưa nhập mặt sau)'),
                backImg ? h('img', { class: 'rich-img card-img', src: backImg, alt: 'Ảnh mặt sau' }) : null) : null),
            tabMode === 'prompt'
              ? h('div', { class: 'card-hint' }, 'Bấm vào thẻ để lật xem mặt sau')
              : null)
        );
      }

      // Nút Chấm thử (ở tab Đề, khi chưa nộp và không phải thẻ lật)
      if (tabMode === 'prompt' && !submitted && q.kind !== 'card') {
        nodes.push(
          h('div', { style: 'display: flex; justify-content: flex-start;' },
            h('button', {
              class: 'ux-btn primary sm',
              onclick: () => {
                if (q.kind === 'single') {
                  if (userAnswer === null) return;
                  grade = gradeChoices([userAnswer], q.answers || []);
                } else if (q.kind === 'multi') {
                  grade = gradeChoices(userAnswer || [], q.answers || []);
                } else {
                  grade = gradeText(String(userAnswer || ''), (q.answers || []).filter(Boolean), q.match, { tolerance: q.tolerance });
                }
                submitted = true;
                renderImmediate(currentItem);
              },
            }, 'Chấm thử'))
        );
      }

      // Phản hồi sau khi chấm thử hoặc ở tab Đáp án
      if (showAnswerState && q.kind !== 'card') {
        const ansImgUrl = q.answerImage ? assetUrl(q.answerImage, deckKey) : null;
        const ansDisplay = q.answerDisplay
          || ((q.kind === 'single' || q.kind === 'multi')
            ? (q.answers || []).map(idx => String.fromCharCode(65 + idx)).join(', ')
            : (q.answers || []).filter(Boolean).join(' | '));

        nodes.push(
          h('div', {
            class: `feedback-banner ${submitted && grade ? (grade.ok ? (grade.near ? 'near' : 'correct') : 'wrong') : 'correct'}`,
          },
            submitted && grade
              ? h('div', { class: 'feedback-title' },
                  grade.ok ? (grade.near ? '≈ Gần đúng (được chấp nhận)' : '✓ Chính xác!') : '✗ Chưa đúng')
              : null,
            ansDisplay ? h('div', { style: 'font-size: 13px;' },
              h('span', { class: 'muted' }, 'Đáp án đúng: '),
              richEl('span', null, rich.inline(ansDisplay))) : null,
            ansImgUrl ? h('img', { class: 'rich-img', src: ansImgUrl, alt: 'Ảnh kèm đáp án' }) : null,
            (q.explanation || '').trim()
              ? richEl('div', { class: 'explanation-box' }, rich.html(q.explanation))
              : null,
            submitted ? h('div', { style: 'margin-top: 8px;' },
              h('button', {
                class: 'ux-btn sm',
                onclick: () => {
                  submitted = false;
                  grade = null;
                  userAnswer = null;
                  renderImmediate(currentItem);
                },
              }, 'Làm lại')) : null)
        );
      }
    }

    // Dòng ghi chú xám ở cuối vùng nếu mục chưa hợp lệ (§10: không đặt trong tiêu đề)
    if (hasError(issues) && !isBlankNewItem(item)) {
      const reasons = errors.map(e => friendlyIssue(e)).join(' ');
      nodes.push(
        h('div', { class: 'preview-skip-note' },
          `Mục này sẽ bị bỏ qua khi học vì: ${reasons}`)
      );
    }

    scrollBox.replaceChildren(...nodes);
    if (! container.contains(scrollBox)) {
      container.replaceChildren(topbar, scrollBox);
    } else {
      container.replaceChild(topbar, container.firstChild);
    }
    scrollBox.scrollTop = prevScroll;
  }

  return {
    render(item, { immediate = false } = {}) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (immediate) {
        renderImmediate(item);
      } else {
        debounceTimer = setTimeout(() => renderImmediate(item), 120);
      }
    },
  };
}

