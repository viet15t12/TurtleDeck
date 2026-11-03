// src/views/home/menus.js — Quản lý menu thả xuống Nhập và Sao lưu

import { h } from '../dom.js';

export function closeAllDropdowns(except) {
  document.querySelectorAll('.menu, .ux-popover[data-dropdown]').forEach(el => {
    if (el !== except) el.hidden = true;
  });
}

export function createImportMenu(ctx) {
  const { transfer, actions } = ctx;
  const importMenu = h(
    'div',
    { class: 'ux-popover align-right', 'data-dropdown': '1', hidden: true, style: 'min-width: 270px;' },
    h(
      'button',
      {
        type: 'button',
        class: 'ux-popover-item',
        style: 'font-weight: 600;',
        onclick: () => {
          importMenu.hidden = true;
          transfer.handleImportSdeck();
        },
      },
      '📥 Nhập file bộ thẻ (.sdeck) vào đây…'
    ),
    h('div', { style: 'height: 1px; background: var(--c-border); margin: 4px 0;' }),
    h(
      'button',
      {
        type: 'button',
        class: 'ux-popover-item',
        onclick: () => {
          importMenu.hidden = true;
          actions.importDeck('text');
        },
      },
      'Từ bảng / văn bản (.csv, .tsv, .txt, .md)…'
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'ux-popover-item',
        onclick: () => {
          importMenu.hidden = true;
          actions.importDeck('file');
        },
      },
      'Từ file nguồn .json…'
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'ux-popover-item',
        onclick: () => {
          importMenu.hidden = true;
          actions.importDeck('dir');
        },
      },
      'Từ thư mục (kèm ảnh)…'
    )
  );
  return importMenu;
}

export function createBackupMenu(ctx) {
  const { transfer } = ctx;
  const backupMenu = h(
    'div',
    { class: 'ux-popover align-right', 'data-dropdown': '1', hidden: true, style: 'min-width: 280px;' },
    h(
      'button',
      {
        type: 'button',
        class: 'ux-popover-item',
        style: 'font-weight: 600;',
        onclick: () => {
          backupMenu.hidden = true;
          transfer.handleFullBackup();
        },
      },
      '💾 Sao lưu toàn bộ hệ thống (.turtlebackup)…'
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'ux-popover-item',
        onclick: () => {
          backupMenu.hidden = true;
          transfer.handleFullRestore();
        },
      },
      '↺ Khôi phục toàn bộ từ file sao lưu…'
    ),
    h('div', { style: 'height: 1px; background: var(--c-border); margin: 4px 0;' }),
    h(
      'button',
      {
        type: 'button',
        class: 'ux-popover-item',
        onclick: () => {
          backupMenu.hidden = true;
          window.api?.openBackupsFolder?.();
        },
      },
      '📂 Mở thư mục sao lưu'
    )
  );
  return backupMenu;
}

