// src/views/home/keyboard.js — Trình xử lý phím tắt màn hình Home và dọn dẹp listener tránh rò rỉ

let off = null;

export function attachHomeKeyboard(ctx) {
  off?.();
  const { nav, toolbar, root } = ctx;

  const onHomeKeyDown = e => {
    if (!root.isConnected) {
      detachHomeKeyboard();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      e.preventDefault();
      toolbar.toggleSidebar();
    }
    // Alt + Left: Back, Alt + Right: Forward
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      nav.goBack();
    }
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      nav.goForward();
    }
  };

  window.addEventListener('keydown', onHomeKeyDown);
  off = () => {
    window.removeEventListener('keydown', onHomeKeyDown);
  };
}

export const detachHomeKeyboard = () => {
  off?.();
  off = null;
};
