// src/views/editor/form/sections/card.js — Form soạn thẻ ghi nhớ 2 mặt (Flashcard)
import { h } from '../../../dom.js';
import { createMarkdownField } from '../../fields/mdfield.js';
import { createImageSlot } from '../../fields/imageslot.js';

export function renderCardSection({ item, ctx }) {
  const nodes = [];

  // Mặt trước
  const frontBlock = h('div', { class: 'card-editor-face' },
    createMarkdownField({
      label: 'Mặt trước',
      path: 'front',
      validateGroup: 'front',
      value: item.front || '',
      placeholder: 'Nhập câu hỏi, thuật ngữ hoặc nội dung mặt trước…',
      minRows: 3,
      ...ctx.mdFieldProps,
      onBlurValidate: grp => {
        ctx.markFieldTouched(grp);
        ctx.updateValidationUI();
      },
    }),
    createImageSlot({
      label: 'Ảnh kèm đề (Mặt trước)',
      field: 'image',
      altField: 'imageAlt',
      value: item.image || '',
      altValue: item.imageAlt,
      ...ctx.imageSlotProps,
    })
  );

  // Mặt sau
  const backBlock = h('div', { class: 'card-editor-face' },
    createMarkdownField({
      label: 'Mặt sau',
      path: 'back',
      validateGroup: 'back',
      value: item.back || '',
      placeholder: 'Nhập câu trả lời, công thức hoặc giải nghĩa ở mặt sau…',
      minRows: 3,
      ...ctx.mdFieldProps,
      onBlurValidate: grp => {
        ctx.markFieldTouched(grp);
        ctx.updateValidationUI();
      },
    }),
    createImageSlot({
      label: 'Ảnh kèm đáp án (Mặt sau)',
      field: 'answerImage',
      altField: 'answerImageAlt',
      value: item.answerImage || '',
      altValue: item.answerImageAlt,
      ...ctx.imageSlotProps,
    })
  );

  nodes.push(frontBlock, backBlock);
  return nodes;
}

