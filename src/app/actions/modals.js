// src/app/actions/modals.js — Các action quản lý hộp thoại modal và phím tắt

import { newDeck, newItemLike, addItem } from '../../core/deckmodel.js';
import { renderShortcutsModal } from '../../shortcuts.js';
import { renderNewDeckModal } from '../../views/modals/newdeck.js';
import { renderDeckInfoModal } from '../../views/modals/deckinfo.js';
import { renderSessionModal } from '../../views/modals/sessionsetup.js';
import { notify } from '../../views/notify.js';
import { applyResult } from '../entries.js';
import { render } from '../runtime.js';
import { saveEntry } from './deck.js';

const api = window.api;

export function modalActions({ state, actions }) {
  return {
    hasModal() {
      return Boolean(state.modal);
    },

    closeModal() {
      if (state.modal) {
        state.modal = null;
        render();
        return true;
      }
      return false;
    },

    showShortcuts() {
      state.modal = renderShortcutsModal(() => {
        state.modal = null;
        render();
      });
      render();
    },

    openNewDeckModal(preselectedKind) {
      state.modal = renderNewDeckModal(
        async ({ title, kind, description, lang }) => {
          state.modal = null;
          const r = await api.newDeck();
          if (!r?.ok) {
            notify('Không tạo được bộ thẻ: ' + (r?.error || 'Lỗi'), 'error');
            return;
          }
          let d = newDeck({ title, kind, description, lang });
          const firstItem = newItemLike(d);
          d = addItem(d, firstItem);
          const entry = applyResult({
            ok: true,
            deckKey: r.deckKey,
            path: null,
            deckText: JSON.stringify(d, null, 2),
            deck: d,
            issues: [],
            assetCount: 0,
          });
          state.route = { name: 'editor', uid: entry.uid };
          render();
        },
        () => {
          state.modal = null;
          render();
        },
        preselectedKind
      );
      render();
    },

    openDeckInfoModal(entry) {
      if (!entry?.deck) return;
      state.modal = renderDeckInfoModal(
        entry.deck,
        async ({ title, kind, description, lang }) => {
          state.modal = null;
          const nextMeta = {
            ...entry.deck.meta,
            title,
            kind,
            lang: lang || entry.deck.meta.lang || 'vi',
          };
          if (description) nextMeta.description = description;
          else delete nextMeta.description;

          entry.deck = {
            ...entry.deck,
            meta: nextMeta,
          };
          entry.deckText = JSON.stringify(entry.deck, null, 2);
          if (entry.path) {
            await saveEntry(entry, false);
          }
          render();
        },
        () => {
          state.modal = null;
          render();
        }
      );
      render();
    },

    openSessionSetup(entry, opts = {}) {
      state.modal = renderSessionModal(
        entry,
        config => actions.startSession(entry, { ...config, persist: true }),
        () => {
          state.modal = null;
          render();
        },
        opts
      );
      render();
    },
  };
}

