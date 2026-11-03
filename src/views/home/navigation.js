// src/views/home/navigation.js — Điều hướng lịch sử Back/Forward kiểu Nautilus và các nút bấm

import { h } from '../dom.js';

export function createNavigation(ctx) {
  const { ui, refresh } = ctx;

  function updateNavButtons() {
    backBtn.disabled = ui.historyIndex <= 0;
    forwardBtn.disabled = ui.historyIndex >= ui.history.length - 1;
  }

  function navigateToFolder(folderId, recordHistory = true) {
    if (recordHistory) {
      if (ui.selectedFolderId !== folderId) {
        ui.history = ui.history.slice(0, ui.historyIndex + 1);
        ui.history.push(folderId);
        ui.historyIndex = ui.history.length - 1;
      }
    }
    ui.selectedFolderId = folderId;
    updateNavButtons();
    refresh.breadcrumb();
    refresh.sidebar();
    refresh.cards();
  }

  function goBack() {
    if (ui.historyIndex > 0) {
      ui.historyIndex--;
      const prevFolder = ui.history[ui.historyIndex];
      navigateToFolder(prevFolder, false);
    }
  }

  function goForward() {
    if (ui.historyIndex < ui.history.length - 1) {
      ui.historyIndex++;
      const nextFolder = ui.history[ui.historyIndex];
      navigateToFolder(nextFolder, false);
    }
  }

  const backBtn = h(
    'button',
    {
      type: 'button',
      class: 'nautilus-nav-btn',
      title: 'Quay lại thư mục trước (Alt+←)',
      disabled: ui.historyIndex <= 0,
      onclick: goBack,
    },
    '‹'
  );

  const forwardBtn = h(
    'button',
    {
      type: 'button',
      class: 'nautilus-nav-btn',
      title: 'Tiến tới thư mục sau (Alt+→)',
      disabled: ui.historyIndex >= ui.history.length - 1,
      onclick: goForward,
    },
    '›'
  );

  return {
    backBtn,
    forwardBtn,
    goBack,
    goForward,
    navigateToFolder,
    updateNavButtons,
  };
}

