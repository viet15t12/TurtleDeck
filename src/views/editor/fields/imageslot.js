// src/views/editor/fields/imageslot.js — Ô ảnh kèm đề / đáp án (thumbnail ~96px, dung lượng, Thay/Xoá, ô Mô tả ảnh alt) (§8)
import { h, fileName } from '../../dom.js';

export function createImageSlot({
  label,
  field,
  altField,
  value,
  altValue,
  deckKey,
  getAssets,
  onPatchItem,
  onMarkTouched,
  onUpdateValidationUI,
  onRerenderForm,
  onUploadFile,
  onPickImageDialog,
  onCollapse,
  captureCursor,
}) {
  const hasImg = Boolean(value && String(value).trim());
  const assets = getAssets ? getAssets() : [];
  const assetMeta = assets.find(a => a.name === value);
  const sizeKb = assetMeta?.size ? `${Math.max(1, Math.round(assetMeta.size / 1024))} KB` : '';
  const resolvedAltField = altField || (field === 'answerImage' ? 'answerImageAlt' : 'imageAlt');

  function setImagePath(relPath) {
    if (onMarkTouched) onMarkTouched(field);
    const patch = { [field]: relPath };
    // Khi mới gắn ảnh lần đầu, khởi tạo trường mô tả ảnh để nhắc nếu để trống (§8)
    if (relPath && altValue === undefined) {
      patch[resolvedAltField] = fileName(relPath).replace(/^[0-9a-f]{8}-/i, '').replace(/\.[^.]+$/, '');
    } else if (!relPath) {
      patch[resolvedAltField] = undefined;
    }
    onPatchItem(patch, { mergeKey: field });
    onRerenderForm();
  }

  let slotBox;
  if (hasImg) {
    let beforeAltCursor = null;
    const altInput = h('input', {
      type: 'text',
      class: 'ux-input sm',
      placeholder: 'Nhập mô tả ảnh (alt text)…',
      value: altValue ?? '',
      'data-path': resolvedAltField,
      'data-validate-input': field,
      onfocus: () => {
        if (captureCursor) beforeAltCursor = captureCursor(altInput, resolvedAltField);
      },
      oninput: () => {
        const cur = captureCursor ? captureCursor(altInput, resolvedAltField) : null;
        onPatchItem(
          { [resolvedAltField]: altInput.value },
          { mergeKey: resolvedAltField, cursor: cur, beforeCursor: beforeAltCursor }
        );
        beforeAltCursor = cur;
        if (onUpdateValidationUI) onUpdateValidationUI();
      },
      onblur: () => {
        if (onMarkTouched) onMarkTouched(field);
        if (onUpdateValidationUI) onUpdateValidationUI();
      },
    });

    slotBox = h('div', {
      class: 'img-slot-box has-image',
      tabindex: '0',
      'data-path': field,
      'data-validate-input': field,
      onpaste: async ev => {
        const items = ev.clipboardData?.items || [];
        for (const it of items) {
          if (it.type.startsWith('image/')) {
            ev.preventDefault();
            const f = it.getAsFile();
            if (f) {
              const picked = await onUploadFile(f);
              if (picked) setImagePath(picked);
            }
          }
        }
      },
    },
      h('img', {
        class: 'img-slot-thumb',
        src: `asset://${deckKey}/${value}`,
        alt: altValue || label,
      }),
      h('div', { class: 'img-slot-meta' },
        h('div', { style: 'display: flex; align-items: center; justify-content: space-between; gap: 8px;' },
          h('span', { style: 'font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' },
            fileName(value)),
          sizeKb ? h('span', { class: 'muted', style: 'font-size: 11px; flex-shrink: 0;' }, sizeKb) : null),
        h('div', { style: 'display: flex; align-items: center; gap: 8px; margin-top: 6px;' },
          h('span', { class: 'muted', style: 'font-size: 12px; white-space: nowrap;' }, 'Mô tả ảnh:'),
          altInput),
        h('div', { style: 'display: flex; gap: 6px; margin-top: 8px;' },
          h('button', {
            type: 'button',
            class: 'ux-btn sm',
            onclick: async () => {
              const picked = await onPickImageDialog();
              if (picked) setImagePath(picked);
            },
          }, 'Thay'),
          h('button', {
            type: 'button',
            class: 'ux-btn sm danger-hover',
            onclick: () => {
              if (onCollapse) onCollapse();
              else setImagePath('');
            },
          }, 'Xoá'))));
  } else {
    slotBox = h('div', {
      class: 'img-slot-box',
      tabindex: '0',
      'data-path': field,
      'data-validate-input': field,
      onclick: async () => {
        const picked = await onPickImageDialog();
        if (picked) setImagePath(picked);
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
        if (picked) setImagePath(picked);
      },
      onpaste: async ev => {
        const items = ev.clipboardData?.items || [];
        for (const it of items) {
          if (it.type.startsWith('image/')) {
            ev.preventDefault();
            const f = it.getAsFile();
            if (f) {
              const picked = await onUploadFile(f);
              if (picked) setImagePath(picked);
            }
          }
        }
      },
    }, '🖼 Kéo ảnh vào, dán (Ctrl+V) hoặc bấm để chọn');
  }

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

