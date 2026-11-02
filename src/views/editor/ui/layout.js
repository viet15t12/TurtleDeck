// src/views/editor/ui/layout.js — Bố cục 3 cột, Splitter kéo thả, Responsive (§3)
import { h } from '../../dom.js';

export function syncResponsiveClasses({ bodyEl, previewColEl, rightSplitter, state }) {
  bodyEl.classList.toggle('mobile-show-preview', state.mobileTab === 'preview');
  bodyEl.classList.toggle('drawer-open', state.drawerOpen);
  previewColEl.classList.toggle('collapsed', state.previewCollapsed);
  if (rightSplitter) {
    rightSplitter.style.display = state.previewCollapsed ? 'none' : '';
  }
}

export function createSplitter(side, { state, listColEl, previewColEl, onPersistLayout }) {
  const sp = h('div', {
    class: 'editor-splitter',
    title: 'Kéo để thay đổi độ rộng cột',
    onmousedown: ev => {
      ev.preventDefault();
      sp.classList.add('dragging');
      const startX = ev.clientX;
      const startW = side === 'left' ? state.listWidth : state.previewWidth;

      const onMove = moveEv => {
        const dx = moveEv.clientX - startX;
        if (side === 'left') {
          state.listWidth = Math.max(200, Math.min(400, startW + dx));
          listColEl.style.width = `${state.listWidth}px`;
        } else {
          state.previewWidth = Math.max(320, Math.min(640, startW - dx));
          previewColEl.style.width = `${state.previewWidth}px`;
        }
      };

      const onUp = () => {
        sp.classList.remove('dragging');
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (onPersistLayout) onPersistLayout();
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
  });
  return sp;
}
