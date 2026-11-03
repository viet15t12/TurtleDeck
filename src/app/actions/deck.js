// src/app/actions/deck.js — Các action thao tác với tệp bộ thẻ (mở, lưu, nhân đôi, xoá, nạp lại)

import { newDeckId } from '../../core/deckmodel.js';
import { fileName } from '../../views/dom.js';
import { notify } from '../../views/notify.js';
import { applyResult } from '../entries.js';
import { persistDeckPaths } from '../library.js';
import { render } from '../runtime.js';
import { withBusy } from '../busy.js';

const api = window.api;

// Lưu thành .sdeck (hộp thoại chọn nơi lưu do main hiển thị)
export async function saveEntry(entry, saveAs) {
  const r = await api.saveDeck(entry.deckKey, entry.deckText, { saveAs });
  if (r?.canceled) {
    notify('Chưa lưu. Bạn có thể bấm "Lưu thành .sdeck…" bất cứ lúc nào.', 'warn');
    return;
  }
  if (!r?.ok) {
    notify('Không lưu được: ' + (r?.error || 'lỗi không rõ'), 'error');
    return;
  }
  applyResult({ ...r, deckKey: entry.deckKey, source: entry.source }, entry);
  await persistDeckPaths();
  notify(`Đã lưu "${fileName(r.path)}".`, 'success');
}

export function deckActions({ state, actions }) {
  return {
    async exportCopy(entry) {
      if (!entry?.path) return;
      const r = await api.exportCopy(entry.path);
      if (r?.canceled) return;
      if (!r?.ok) {
        notify('Không xuất được bản sao: ' + (r?.error || 'Lỗi'), 'error');
        return;
      }
      notify(`Đã xuất bản sao tới "${fileName(r.path)}".`, 'success');
    },

    async showInFolder(entry) {
      if (!entry?.path) return;
      const r = await api.showInFolder?.(entry.path);
      if (r && r.ok === false) {
        notify(r.error || 'Không mở được thư mục chứa file.', 'warn');
      }
    },

    openFiles: () =>
      withBusy(async () => {
        const results = await api.openDecks();
        if (!results?.length) return;
        let last = null;
        for (const r of results) {
          const e = applyResult(r);
          if (r.ok && e.status === 'ok') last = e;
          else if (!r.ok) notify(`Không mở được "${fileName(r.path)}": ${r.error}`, 'error');
        }
        await persistDeckPaths();
        if (results.length === 1 && last) actions.openDeckView(last);
      }),

    importDeck: kind =>
      withBusy(async () => {
        const r = await api.importDeck(kind);
        if (!r) return;
        if (!r.ok) {
          notify(`Không nhập được "${fileName(r.source)}": ${r.error}`, 'error');
          return;
        }
        const entry = applyResult({ ...r, path: null });
        notify(`Đã nhập "${r.deck.meta.title}" (${r.deck.items.length} mục, ${r.assetCount} ảnh). Chọn nơi lưu file .sdeck.`);
        await saveEntry(entry, true);
        state.route = { name: 'deck', uid: entry.uid };
      }),

    saveAs: entry => withBusy(() => saveEntry(entry, true)),

    async reload(entry) {
      if (!entry.path) return;
      entry.status = 'loading';
      render();
      const [r] = await api.openDecks(entry.path);
      applyResult(r, entry);
      render();
    },

    async remove(entry) {
      if (
        !entry.path &&
        entry.status === 'ok' &&
        !window.confirm(
          `Bộ thẻ "${entry.deck.meta.title}" chưa được lưu thành .sdeck. Gỡ khỏi danh sách và bỏ dữ liệu đã nhập?`
        )
      ) {
        return;
      }
      if (entry.deckKey) await api.closeDeck(entry.deckKey);
      state.entries.splice(state.entries.indexOf(entry), 1);
      if (state.route.uid === entry.uid) state.route = { name: 'home' };
      await persistDeckPaths();
      render();
    },

    async duplicateDeck(entry) {
      const r = await api.duplicateDeck(entry.deckKey);
      if (!r?.ok) {
        notify('Không nhân đôi được bộ thẻ: ' + (r?.error || 'Lỗi'), 'error');
        return;
      }
      const copyDeck = JSON.parse(JSON.stringify(entry.deck));
      copyDeck.meta.id = newDeckId(copyDeck.meta.title + ' (Bản sao)');
      copyDeck.meta.title = copyDeck.meta.title + ' (Bản sao)';

      const copyEntry = applyResult({
        ok: true,
        deckKey: r.deckKey,
        path: null,
        deckText: JSON.stringify(copyDeck, null, 2),
        deck: copyDeck,
        issues: [],
        assetCount: r.assetCount || 0,
      });
      notify(`Đã tạo bản sao "${copyDeck.meta.title}".`, 'success');
      state.route = { name: 'editor', uid: copyEntry.uid };
      render();
    },
  };
}
