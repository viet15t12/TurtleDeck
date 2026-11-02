// src/views/editor/imagemanager.js — Hộp thoại Quản lý ảnh (study-app-editor-ux.md §8)
import { h, fileName } from '../dom.js';
import { imageRefs, unusedAssets } from '../../core/deckmodel.js';

export async function renderImageManagerModal({
  deckKey,
  getDeck,
  getAssets,
  refreshAssets,
  onInsertToActive,
  onJumpToItem,
  onMarkDirty,
  onClose,
  showToast,
}) {
  const api = window.api;
  await refreshAssets();
  const assetsList = getAssets();
  const deck = getDeck();
  const assetsMap = new Map(assetsList.map(a => [a.name, a]));
  const unused = unusedAssets(deck, assetsMap);

  // Tìm danh sách các mục sử dụng mỗi ảnh
  const usageItems = new Map();
  for (const a of assetsList) usageItems.set(a.name, []);
  deck.items.forEach((it, idx) => {
    for (const ref of imageRefs(it)) {
      if (usageItems.has(ref)) {
        usageItems.get(ref).push({ item: it, index: idx });
      }
    }
  });

  const gridEl = h('div', { class: 'assets-grid' },
    assetsList.length ? assetsList.map(asset => {
      const usedIn = usageItems.get(asset.name) || [];
      const count = usedIn.length;
      const sizeKb = Math.max(1, Math.round((asset.size || 0) / 1024));
      const isUnused = count === 0;

      return h('div', { class: `asset-card ${isUnused ? 'unused' : ''}` },
        h('div', { class: 'asset-thumb-wrap' },
          h('img', {
            class: 'asset-thumb-img',
            src: `asset://${deckKey}/${asset.name}`,
            alt: fileName(asset.name),
            onerror: ev => { ev.target.style.display = 'none'; },
          })),
        h('div', { class: 'asset-card-info' },
          h('span', { class: 'asset-card-name', title: fileName(asset.name) }, fileName(asset.name)),
          h('span', { class: 'asset-card-size muted' }, `${sizeKb} KB`),
          isUnused
            ? h('span', { class: 'asset-usage warn' }, 'Không dùng')
            : h('button', {
                class: 'ux-btn ghost sm',
                style: 'justify-content: flex-start; padding: 0 4px; height: 22px; color: var(--c-ok);',
                title: `Nhảy tới mục ${usedIn.map(u => '#' + (u.index + 1)).join(', ')}`,
                onclick: () => {
                  onClose();
                  onJumpToItem(usedIn[0].item.id);
                },
              }, `Dùng ở ${count} mục ↗`),
          h('div', { class: 'asset-card-actions' },
            onInsertToActive ? h('button', {
              class: 'ux-btn sm',
              onclick: () => {
                onInsertToActive(asset.name);
                onClose();
              },
            }, 'Chèn') : null,
            isUnused ? h('button', {
              class: 'ux-btn sm danger-hover',
              onclick: async () => {
                await api.removeAsset(deckKey, asset.name);
                await refreshAssets();
                onMarkDirty();
              },
            }, 'Xoá') : null)));
    }) : h('div', { class: 'empty' }, 'Bộ thẻ chưa có ảnh nào.')
  );

  const backdrop = h('div', {
    class: 'modal-backdrop',
    onclick: ev => { if (ev.target === backdrop) onClose(); },
  },
    h('div', { class: 'modal-dialog modal-large' },
      h('div', { class: 'modal-head' },
        h('h2', null, `Quản lý ảnh (${assetsList.length})`),
        h('button', { class: 'ux-icon-btn', title: 'Đóng (Esc)', onclick: onClose }, '✕')),
      h('div', { class: 'toolbar', style: 'margin-bottom: 12px;' },
        h('button', {
          class: 'ux-btn primary sm',
          onclick: async () => {
            const res = await api.addImages(deckKey);
            if (res?.length) {
              await refreshAssets();
              onMarkDirty();
            }
          },
        }, '+ Thêm ảnh…'),
        unused.length ? h('button', {
          class: 'ux-btn sm danger-hover',
          onclick: async () => {
            for (const p of unused) await api.removeAsset(deckKey, p);
            await refreshAssets();
            onMarkDirty();
            if (showToast) showToast(`Đã xoá ${unused.length} ảnh không dùng.`);
          },
        }, `Xoá ảnh không dùng (${unused.length})`) : null),
      gridEl,
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 16px;' },
        h('button', { class: 'ux-btn', onclick: onClose }, 'Đóng'))));

  return backdrop;
}

