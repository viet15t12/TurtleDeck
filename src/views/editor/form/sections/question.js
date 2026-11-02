// src/views/editor/form/sections/question.js — Form soạn câu hỏi (Trắc nghiệm, Điền, Lệnh)
import { h } from '../../../dom.js';
import { createMarkdownField } from '../../fields/mdfield.js';
import { createImageSlot } from '../../fields/imageslot.js';
import { createChoicesSection } from '../../fields/choices.js';
import { createFillCommandSection } from '../../fields/graderbox.js';

export function renderQuestionSection({ item, isMC, ctx }) {
  const nodes = [];

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

