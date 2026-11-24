// src/views/editor/form/sections/question.js — Form soạn câu hỏi (Trắc nghiệm, Điền, Lệnh)
import { h } from '../../../dom.js';
import { createMarkdownField } from '../../fields/mdfield.js';
import { createImageSlot } from '../../fields/imageslot.js';
import { createChoicesSection } from '../../fields/choices.js';
import { createFillCommandSection } from '../../fields/graderbox.js';
import { createChipListField } from '../../fields/chips.js';

export function renderQuestionSection({ item, isMC, ctx }) {
  const nodes = [];

  if (item.type === 'word-order') {
    nodes.push(
      createMarkdownField({
        label: 'Gợi ý / Câu tiếng Việt (prompt_vi)',
        path: 'prompt_vi',
        validateGroup: 'prompt_vi',
        value: item.prompt_vi || '',
        placeholder: 'Ví dụ: Anh ấy đã mua bốn ổ bánh mì.',
        minRows: 2,
        ...ctx.mdFieldProps,
        onBlurValidate: grp => {
          ctx.markFieldTouched(grp);
          ctx.updateValidationUI();
        },
      })
    );

    nodes.push(
      h('div', { class: 'form-field' },
        h('div', { class: 'form-label-row' },
          h('label', { class: 'form-label' }, 'Câu đáp án đúng (tách từng từ bằng khoảng trắng hoặc |)'),
        ),
        h('input', {
          type: 'text',
          class: 'ux-input',
          placeholder: 'Ví dụ: He bought four loaves of bread.',
          value: Array.isArray(item.answer) ? item.answer.join(' ') : '',
          'data-path': 'answer',
          'data-validate-input': 'answer',
          oninput: ev => {
            const raw = ev.target.value;
            const tokens = raw.includes('|')
              ? raw.split('|').map(s => s.trim()).filter(Boolean)
              : raw.trim().split(/\s+/).filter(Boolean);
            ctx.onPatchItem(
              { answer: tokens.length ? tokens : [''] },
              { mergeKey: 'wo-answer', cursor: ctx.captureCursor(ev.target, 'answer') }
            );
            ctx.updateValidationUI();
          },
          onblur: () => {
            ctx.markFieldTouched('answer');
            ctx.updateValidationUI();
          },
        }),
        h('div', { 'data-validate-group': 'answer' })
      )
    );

    nodes.push(
      createChipListField({
        label: 'Từ gây nhiễu (distractors)',
        hint: 'Nhấn Enter để thêm từng từ gây nhiễu',
        path: 'distractors',
        values: Array.isArray(item.distractors) ? item.distractors : [],
        suggestions: [],
        placeholder: 'Ví dụ: breads., loaf…',
        splitComma: false,
        onChangeValues: nextDist => {
          ctx.onPatchItem({ distractors: nextDist });
          ctx.rerender();
        },
        onFocusPath: ctx.focusFieldByPath,
      })
    );
    return nodes;
  }

  // Ô soạn câu hỏi
  nodes.push(
    createMarkdownField({
      label: 'Câu hỏi',
      path: 'question',
      validateGroup: 'question',
      value: item.question || '',
      placeholder: 'Nhập nội dung câu hỏi (gõ $ để viết công thức, Ctrl+M mở bảng ký hiệu)…',
      minRows: 3,
      ...ctx.mdFieldProps,
      onBlurValidate: grp => {
        ctx.markFieldTouched(grp);
        ctx.updateValidationUI();
      },
    })
  );

  // Choices (Trắc nghiệm) hoặc Graderbox (Điền / Lệnh)
  if (isMC) {
    nodes.push(
      createChoicesSection({
        deckKey: ctx.deckKey,
        rich: ctx.rich,
        getItem: ctx.getItem,
        getRecentSnippets: ctx.getRecentSnippets,
        onRecordRecentSnippet: ctx.onRecordRecentSnippet,
        onPatchItem: ctx.onPatchItem,
        onApplyPathValue: ctx.applyPathValue,
        onMarkFieldTouched: ctx.markFieldTouched,
        onUpdateValidationUI: ctx.updateValidationUI,
        onRerenderForm: ctx.rerender,
        onFocusPath: ctx.focusFieldByPath,
        onPickImageDialog: ctx.onPickImageDialog,
        onUploadFile: ctx.onUploadFile,
        captureCursor: ctx.captureCursor,
      })
    );
  } else if (item.type === 'fill' || item.type === 'command') {
    nodes.push(
      createFillCommandSection({
        getItem: ctx.getItem,
        onPatchItem: ctx.onPatchItem,
        onMarkFieldTouched: ctx.markFieldTouched,
        onUpdateValidationUI: ctx.updateValidationUI,
        onRerenderForm: ctx.rerender,
        onFocusPath: ctx.focusFieldByPath,
        captureCursor: ctx.captureCursor,
      })
    );
  }

  // Optional: Ảnh kèm đề
  if (ctx.hasImage) {
    nodes.push(
      createImageSlot({
        label: 'Ảnh kèm đề',
        field: 'image',
        altField: 'imageAlt',
        value: item.image || '',
        altValue: item.imageAlt,
        ...ctx.imageSlotProps,
        onCollapse: () => {
          ctx.manuallyOpened.delete('image');
          ctx.onPatchItem({ image: '', imageAlt: undefined });
          ctx.rerender();
        },
      })
    );
  }

  // Optional: Ảnh kèm đáp án
  if (ctx.hasAnswerImage) {
    nodes.push(
      createImageSlot({
        label: 'Ảnh kèm đáp án',
        field: 'answerImage',
        altField: 'answerImageAlt',
        value: item.answerImage || '',
        altValue: item.answerImageAlt,
        ...ctx.imageSlotProps,
        onCollapse: () => {
          ctx.manuallyOpened.delete('answerImage');
          ctx.onPatchItem({ answerImage: '', answerImageAlt: undefined });
          ctx.rerender();
        },
      })
    );
  }

  return nodes;
}

