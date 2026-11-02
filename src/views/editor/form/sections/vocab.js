// src/views/editor/form/sections/vocab.js — Form soạn từ vựng
import { h } from '../../../dom.js';
import { createMarkdownField } from '../../fields/mdfield.js';
import { createImageSlot } from '../../fields/imageslot.js';
import { createChipListField } from '../../fields/chips.js';
import { speak } from '../../../../tts.js';
import { POS_OPTIONS } from '../constants.js';

export function renderVocabSection({
  item,
  ctx,
}) {
  const nodes = [];

  // Thuật ngữ (Từ vựng)
  const termBlock = h('div', { class: 'form-field' },
    createMarkdownField({
      label: 'Thuật ngữ (Từ vựng)',
      path: 'term',
      validateGroup: 'term',
      value: item.term || '',
      placeholder: 'Nhập từ hoặc cụm từ tiếng Anh…',
      minRows: 1,
      ...ctx.mdFieldProps,
      onBlurValidate: grp => {
        ctx.markFieldTouched(grp);
        ctx.updateValidationUI();
      },
    }),
    item.term ? h('div', { style: 'margin-top: 4px;' },
      h('button', {
        type: 'button',
        class: 'ux-btn ghost sm',
        title: 'Phát âm (Web Speech TTS)',
        onclick: () => speak(item.term),
      }, '🔊 Phát âm từ này')) : null
  );

  // Định nghĩa
  const defBlock = createMarkdownField({
    label: 'Định nghĩa / Nghĩa tiếng Việt',
    path: 'definition',
    validateGroup: 'definition',
    value: item.definition || '',
    placeholder: 'Nhập nghĩa tiếng Việt hoặc giải nghĩa…',
    minRows: 2,
    ...ctx.mdFieldProps,
    onBlurValidate: grp => {
      ctx.markFieldTouched(grp);
      ctx.updateValidationUI();
    },
  });

  // Phiên âm & Từ loại
  const phoneticAndPosRow = h('div', { style: 'display: flex; gap: 12px; margin-bottom: 12px;' },
    h('div', { class: 'form-field', style: 'flex: 1; margin: 0;' },
      h('label', { class: 'form-label' }, 'Phiên âm (IPA)'),
      h('input', {
        type: 'text',
        class: 'ux-input',
        placeholder: 'Ví dụ: /ˈæp.əl/…',
        value: item.phonetic || '',
        'data-path': 'phonetic',
        oninput: ev => {
          ctx.onPatchItem(
            { phonetic: ev.target.value },
            { mergeKey: 'phonetic', cursor: ctx.captureCursor(ev.target, 'phonetic') }
          );
        },
      })),
    h('div', { class: 'form-field', style: 'flex: 1; margin: 0;' },
      h('label', { class: 'form-label' }, 'Từ loại (POS)'),
      h('select', {
        class: 'ux-select',
        style: 'width: 100%;',
        value: item.pos || '',
        onchange: ev => {
          ctx.onPatchItem({ pos: ev.target.value || undefined });
        },
      }, POS_OPTIONS.map(opt => h('option', { value: opt.value, selected: (item.pos || '') === opt.value }, opt.label))))
  );

  // Câu ví dụ
  const exampleBlock = createMarkdownField({
    label: 'Câu ví dụ',
    path: 'example',
    validateGroup: 'example',
    value: item.example || '',
    placeholder: 'Ví dụ: We need to mitigate the risks… (câu ví dụ nên chứa từ hoặc biến thể của từ để học Cloze)',
    minRows: 2,
    ...ctx.mdFieldProps,
    onBlurValidate: grp => {
      ctx.markFieldTouched(grp);
      ctx.updateValidationUI();
    },
  });

  nodes.push(termBlock, defBlock, phoneticAndPosRow, exampleBlock);

  // Optional: Biến thể của từ (Forms)
  if (ctx.hasForms) {
    nodes.push(
      createChipListField({
        label: 'Biến thể của từ (Forms)',
        hint: 'Nhấn Enter hoặc dấu phẩy để thêm dạng biến thể (vd: past, plural, -ing, ...)',
        path: 'forms',
        values: item.forms || [],
        placeholder: 'Gõ dạng biến thể rồi nhấn Enter…',
        splitComma: true,
        onChangeValues: nextForms => {
          ctx.onPatchItem({ forms: nextForms.length ? nextForms : undefined });
          ctx.rerender();
        },
        onCollapse: () => {
          ctx.manuallyOpened.delete('forms');
          ctx.onPatchItem({ forms: undefined });
          ctx.rerender();
        },
        onFocusPath: ctx.focusFieldByPath,
      })
    );
  }

  // Optional: Từ đồng nghĩa (Synonyms)
  if (ctx.hasSynonyms) {
    nodes.push(
      createChipListField({
        label: 'Từ đồng nghĩa (Synonyms)',
        hint: 'Nhấn Enter hoặc dấu phẩy để thêm từ đồng nghĩa',
        path: 'synonyms',
        values: item.synonyms || [],
        placeholder: 'Gõ từ đồng nghĩa rồi nhấn Enter…',
        splitComma: true,
        onChangeValues: nextSynonyms => {
          ctx.onPatchItem({ synonyms: nextSynonyms.length ? nextSynonyms : undefined });
          ctx.rerender();
        },
        onCollapse: () => {
          ctx.manuallyOpened.delete('synonyms');
          ctx.onPatchItem({ synonyms: undefined });
          ctx.rerender();
        },
        onFocusPath: ctx.focusFieldByPath,
      })
    );
  }

  // Optional: Ảnh minh hoạ
  if (ctx.hasImage) {
    nodes.push(
      createImageSlot({
        label: 'Ảnh minh hoạ',
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

  return nodes;
}
