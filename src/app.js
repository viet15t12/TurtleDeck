// src/app.js — router màn hình + trạng thái bộ thẻ, tiến độ (SRS) và cài đặt (ES module, chỉ gọi main qua window.api).
import { h, fileName } from './views/dom.js';
import { renderHome } from './views/home.js';
import { renderDeck } from './views/deck.js';
import { renderSession } from './views/session.js';
import { renderEditor } from './views/editor.js';
import { renderSettings } from './views/settings.js';
import { renderStats } from './views/stats.js';
import { newDeck, newItem, newItemId, newItemLike, addItem, newDeckId } from './core/deckmodel.js';
import { setLearnSteps, recordReview, clearProgress, DEFAULT_LEARN_STEPS } from './core/srs.js';
import { DEFAULT_NEW_CARDS_PER_DAY } from './core/planner.js';
import { notify } from './views/notify.js';
import { renderSessionModal } from './views/modals/sessionsetup.js';
import { renderNewDeckModal } from './views/modals/newdeck.js';
import { renderDeckInfoModal } from './views/modals/deckinfo.js';
import { renderLearn } from './views/learn.js';
import { renderMatch } from './views/match.js';
import { renderExam } from './views/exam.js';
import { initGlobalShortcuts, renderShortcutsModal, setShortcutScope } from './shortcuts.js';

const api = window.api;
const root = document.querySelector('#app');

// entries: { uid, path|null, status: 'loading'|'ok'|'error'|'missing', deckKey, deckText, deck, issues, error, source, assetCount }
const state = {
  settings: {
    version: 1,
    decks: [],
    newCardsPerDay: DEFAULT_NEW_CARDS_PER_DAY,
    learnSteps: [...DEFAULT_LEARN_STEPS],
  },
  progress: {
    version: 1,
    cards: {},
    meta: {},
    log: [],
  },
  entries: [],
  route: { name: 'home' },
  modal: null,
  busy: false,
};

let uidSeq = 0;
const newEntry = fields => ({ uid: ++uidSeq, issues: [], ...fields });

// ── Lưu danh sách đường dẫn vào settings.json (hợp nhất) ──────────────────

async function persistDeckPaths() {
  const decks = [...new Set(state.entries.map(e => e.path).filter(Boolean))];
  state.settings.decks = decks;
  const r = await api.saveSettings({ decks });
  if (r && r.ok === false) notify('Không lưu được cài đặt: ' + r.error, 'error');
  else if (r?.settings) state.settings = r.settings;
}

// ── Ghi nhận kết quả trả lời câu hỏi vào progress.json ────────────────────

function handleRecordReview(args) {
  const res = recordReview(state.progress, {
    ...args,
    learnSteps: args?.learnSteps ?? state.settings.learnSteps,
  });
  if (res.persisted) {
    state.progress = res.progress;
    api.saveProgress(state.progress).then(r => {
      if (r && r.ok === false) notify('Không lưu được tiến độ: ' + r.error, 'error');
    }).catch(e => {
      notify('Lỗi lưu tiến độ: ' + (e?.message || e), 'error');
    });
  }
  return res;
}

// ── Nạp kết quả mở / nhập vào danh sách ───────────────────────────────────

const samePath = (a, b) => a && b && a === b;

// r: kết quả từ main (deck:open / deck:import / deck:save). Trả entry đã thêm/cập nhật.
function applyResult(r, target) {
  const fields = r.ok
    ? { status: 'ok', path: r.path ?? target?.path ?? null, deckKey: r.deckKey ?? target?.deckKey, deckText: r.deckText,
        deck: r.deck, issues: r.issues || [], error: null, source: r.source ?? target?.source, assetCount: r.assetCount }
    : { status: r.missing ? 'missing' : 'error', path: r.path ?? target?.path ?? null, deckKey: null, deck: null,
        issues: r.issues || [], error: r.error || 'Không mở được bộ thẻ.' };

  // hai file khác nhau cùng meta.id → cảnh báo và chỉ nạp một
  if (r.ok && fields.path) {
    const twin = state.entries.find(e => e !== target && e.status === 'ok' && !samePath(e.path, fields.path)
      && e.path && e.deck.meta.id === fields.deck.meta.id);
    if (twin) {
      api.closeDeck(fields.deckKey);
      Object.assign(fields, { status: 'error', deckKey: null, deck: null,
        error: `Trùng mã bộ thẻ (meta.id "${r.deck.meta.id}") với "${fileName(twin.path)}" đang mở — chỉ nạp một bộ.` });
      notify(`"${fileName(fields.path)}" có cùng mã bộ thẻ với "${fileName(twin.path)}" nên không được nạp.`, 'warn');
    }
  }

  // cùng đường dẫn đã có trong danh sách → thay thế mục cũ
  const existing = target ?? (fields.path ? state.entries.find(e => samePath(e.path, fields.path)) : null);
  if (existing) {
    if (existing.deckKey && existing.deckKey !== fields.deckKey) api.closeDeck(existing.deckKey);
    Object.assign(existing, fields);
    // lưu đè lên file đang có ở mục khác → gộp lại
    for (const other of state.entries.filter(e => e !== existing && samePath(e.path, existing.path))) {
      if (other.deckKey) api.closeDeck(other.deckKey);
      state.entries.splice(state.entries.indexOf(other), 1);
    }
    return existing;
  }
  const entry = newEntry(fields);
  state.entries.push(entry);
  return entry;
}

// ── Hành động ─────────────────────────────────────────────────────────────

async function withBusy(fn) {
  state.busy = true; render();
  try { return await fn(); }
  catch (e) { notify('Lỗi: ' + (e?.message || e), 'error'); }
  finally { state.busy = false; render(); }
}

const actions = {
  home() { state.route = { name: 'home' }; render(); },

  openStats() {
    state.route = { name: 'stats' };
    render();
  },

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

  async reloadProgress() {
    const loadedProgress = await api.loadProgress();
    if (loadedProgress && typeof loadedProgress === 'object') {
      state.progress = {
        version: 1,
        cards: loadedProgress.cards || {},
        meta: loadedProgress.meta || {},
        log: Array.isArray(loadedProgress.log) ? loadedProgress.log : [],
      };
      render();
    }
  },

  async scanLibrary() {
    const r = await api.scanLibrary();
    if (!r || !r.ok) return;
    const libFiles = r.files || [];
    let updated = false;

    for (const entry of state.entries) {
      const match = libFiles.find(f => samePath(f.path, entry.path));
      if (match) {
        entry.group = match.group;
        entry.inLibrary = true;
      } else if (entry.inLibrary) {
        entry.inLibrary = false;
      }
    }

    for (const f of libFiles) {
      const existing = state.entries.find(e => samePath(e.path, f.path));
      if (!existing) {
        const [opened] = await api.openDecks(f.path);
        if (opened?.ok) {
          const e = applyResult(opened);
          e.group = f.group;
          e.inLibrary = true;
          updated = true;
        }
      }
    }

    if (updated) {
      await persistDeckPaths();
    }
    render();
  },

  openSettings() {
    state.route = { name: 'settings' };
    render();
  },

  async saveSettings(patch) {
    const r = await api.saveSettings(patch);
    if (r && r.ok === false) {
      notify('Không lưu được cài đặt: ' + r.error, 'error');
      return;
    }
    state.settings = r?.settings || { ...state.settings, ...patch };
    setLearnSteps(state.settings.learnSteps);
    notify('Đã lưu cài đặt thành công.', 'success');
    state.route = { name: 'home' };
    render();
  },

  async resetProgress(targetDeckId = 'all') {
    state.progress = clearProgress(state.progress, targetDeckId);
    const r = await api.saveProgress(state.progress);
    if (r && r.ok === false) {
      notify('Không thể lưu trạng thái đặt lại tiến trình: ' + (r.error || 'Lỗi'), 'error');
      return;
    }
    const targetEntry = targetDeckId && targetDeckId !== 'all'
      ? state.entries.find(e => e.deck?.meta?.id === targetDeckId)
      : null;
    if (targetEntry) {
      notify(`Đã đặt lại tiến trình của bộ thẻ "${targetEntry.deck.meta.title}".`, 'success');
    } else {
      notify('Đã đặt lại toàn bộ tiến trình học tập của tất cả bộ thẻ.', 'success');
    }
    render();
  },

  openEditor(entry, initialItemId = null) {
    state.route = { name: 'editor', uid: entry.uid, itemId: initialItemId };
    render();
  },

  async showInFolder(entry) {
    if (!entry?.path) return;
    const r = await api.showInFolder?.(entry.path);
    if (r && r.ok === false) {
      notify(r.error || 'Không mở được thư mục chứa file.', 'warn');
    }
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
      () => { state.modal = null; render(); },
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
      () => { state.modal = null; render(); }
    );
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

    const newEntry = applyResult({
      ok: true,
      deckKey: r.deckKey,
      path: null,
      deckText: JSON.stringify(copyDeck, null, 2),
      deck: copyDeck,
      issues: [],
      assetCount: r.assetCount || 0,
    });
    notify(`Đã tạo bản sao "${copyDeck.meta.title}".`, 'success');
    state.route = { name: 'editor', uid: newEntry.uid };
    render();
  },

  openDeckView(entry) { state.route = { name: 'deck', uid: entry.uid }; render(); },

  openFiles: () => withBusy(async () => {
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

  importDeck: kind => withBusy(async () => {
    const r = await api.importDeck(kind);
    if (!r) return;
    if (!r.ok) { notify(`Không nhập được "${fileName(r.source)}": ${r.error}`, 'error'); return; }
    const entry = applyResult({ ...r, path: null });
    notify(`Đã nhập "${r.deck.meta.title}" (${r.deck.items.length} mục, ${r.assetCount} ảnh). Chọn nơi lưu file .sdeck.`);
    await saveEntry(entry, true);
    state.route = { name: 'deck', uid: entry.uid };
  }),

  saveAs: entry => withBusy(() => saveEntry(entry, true)),

  async reload(entry) {
    if (!entry.path) return;
    entry.status = 'loading'; render();
    const [r] = await api.openDecks(entry.path);
    applyResult(r, entry);
    render();
  },

  async remove(entry) {
    if (!entry.path && entry.status === 'ok'
        && !window.confirm(`Bộ thẻ "${entry.deck.meta.title}" chưa được lưu thành .sdeck. Gỡ khỏi danh sách và bỏ dữ liệu đã nhập?`)) return;
    if (entry.deckKey) await api.closeDeck(entry.deckKey);
    state.entries.splice(state.entries.indexOf(entry), 1);
    if (state.route.uid === entry.uid) state.route = { name: 'home' };
    await persistDeckPaths();
    render();
  },

  startSrsSession(entry) {
    state.modal = null;
    state.route = {
      name: 'session',
      uid: entry.uid,
      config: { mode: 'srs', persist: true },
    };
    render();
  },

  startLearnSession(entry, config = {}) {
    state.modal = null;
    state.route = { name: 'learn', uid: entry.uid, config };
    render();
  },

  startMatchSession(entry, config = {}) {
    state.modal = null;
    state.route = { name: 'match', uid: entry.uid, config };
    render();
  },

  startExamSession(entry, config = {}) {
    state.modal = null;
    state.route = { name: 'exam', uid: entry.uid, config };
    render();
  },

  openSessionSetup(entry, opts = {}) {
    state.modal = renderSessionModal(
      entry,
      config => actions.startSession(entry, { ...config, persist: true }),
      () => { state.modal = null; render(); },
      opts
    );
    render();
  },

  startSession(entry, config = {}) {
    state.modal = null;
    if (config.mode === 'learn') {
      state.route = { name: 'learn', uid: entry.uid, config };
    } else if (config.mode === 'match') {
      state.route = { name: 'match', uid: entry.uid, config };
    } else if (config.mode === 'exam') {
      state.route = { name: 'exam', uid: entry.uid, config };
    } else {
      state.route = { name: 'session', uid: entry.uid, config };
    }
    render();
  },

  // "Học thử" từ Editor (bộ thẻ đang soạn): persist: false → KHÔNG ghi progress hay log
  startTrialSession(entry, workingDeck) {
    state.modal = null;
    const trialDeck = workingDeck ? JSON.parse(JSON.stringify(workingDeck)) : entry.deck;
    state.route = {
      name: 'session',
      uid: entry.uid,
      fromEditor: true,
      trialDeck,
      config: {
        mode: 'trial',
        persist: false,
        count: (trialDeck.items || []).length,
        shuffle: false,
      },
    };
    render();
  },
};

// Lưu thành .sdeck (hộp thoại chọn nơi lưu do main hiển thị)
async function saveEntry(entry, saveAs) {
  const r = await api.saveDeck(entry.deckKey, entry.deckText, { saveAs });
  if (r?.canceled) { notify('Chưa lưu. Bạn có thể bấm "Lưu thành .sdeck…" bất cứ lúc nào.', 'warn'); return; }
  if (!r?.ok) { notify('Không lưu được: ' + (r?.error || 'lỗi không rõ'), 'error'); return; }
  applyResult({ ...r, deckKey: entry.deckKey, source: entry.source }, entry);
  await persistDeckPaths();
  notify(`Đã lưu "${fileName(r.path)}".`, 'success');
}

// ── Router ────────────────────────────────────────────────────────────────

function render() {
  document.body.classList.toggle('in-editor', state.route.name === 'editor');

  if (state.route.name === 'stats') {
    document.title = 'Thống kê học tập — Turtle Deck';
    setShortcutScope('stats', {
      onEscape: () => actions.home(),
    });
    renderStats(root, {
      progress: state.progress,
      entries: state.entries,
      settings: state.settings,
    }, actions);
    if (state.modal) root.append(state.modal);
    return;
  }

  if (state.route.name === 'settings') {
    document.title = 'Cài đặt — Turtle Deck';
    setShortcutScope('settings', {
      onEscape: () => actions.home(),
    });
    renderSettings(root, {
      settings: state.settings,
      progress: state.progress,
      entries: state.entries,
    }, actions);
    if (state.modal) root.append(state.modal);
    return;
  }

  if (state.route.name === 'editor') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      document.title = `Soạn thảo: ${entry.deck.meta.title} — Turtle Deck`;
      setShortcutScope('editor');
      renderEditor(root, { entry, initialItemId: state.route.itemId || null }, actions);
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
    document.body.classList.remove('in-editor');
  }

  if (state.route.name === 'session') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      const effectiveEntry = state.route.trialDeck
        ? { ...entry, deck: state.route.trialDeck }
        : entry;
      document.title = `Học: ${effectiveEntry.deck.meta.title} — Turtle Deck`;
      const sessionActions = state.route.fromEditor
        ? { ...actions, openDeckView: () => actions.openEditor(entry) }
        : actions;
      renderSession(root, {
        entry: effectiveEntry,
        config: state.route.config,
        progress: state.progress,
        settings: state.settings,
        onRecordReview: handleRecordReview,
      }, sessionActions);
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
  }

  if (state.route.name === 'learn') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      document.title = `Học thích ứng: ${entry.deck.meta.title} — Turtle Deck`;
      setShortcutScope('session');
      renderLearn(root, {
        entry,
        progress: state.progress,
        onSaveProgress: async newProg => {
          state.progress = newProg;
          await api.saveProgress(state.progress);
        },
      }, actions);
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
  }

  if (state.route.name === 'match') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      document.title = `Ghép thẻ: ${entry.deck.meta.title} — Turtle Deck`;
      setShortcutScope('session');
      renderMatch(root, {
        entry,
        progress: state.progress,
        onRecordMatch: async res => {
          if (res?.progress) {
            state.progress = res.progress;
            await api.saveProgress(state.progress);
          }
        },
      }, actions);
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
  }

  if (state.route.name === 'exam') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      document.title = `Thi thử: ${entry.deck.meta.title} — Turtle Deck`;
      setShortcutScope('session');
      renderExam(root, {
        entry,
        config: state.route.config,
        progress: state.progress,
        onSaveProgress: async newProg => {
          state.progress = newProg;
          await api.saveProgress(state.progress);
        },
      }, actions);
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
  }

  if (state.route.name === 'deck') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      document.title = `${entry.deck.meta.title} — Turtle Deck`;
      setShortcutScope('deck', {
        onEscape: () => actions.home(),
      });
      renderDeck(root, entry, actions, { progress: state.progress, settings: state.settings });
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
  }

  document.title = 'Turtle Deck';
  setShortcutScope('home');
  renderHome(root, {
    entries: state.entries,
    busy: state.busy,
    progress: state.progress,
    settings: state.settings,
  }, actions);
  if (state.modal) root.append(state.modal);
}

// bấm ra ngoài thì đóng mọi menu thả xuống
document.addEventListener('click', () => {
  document.querySelectorAll('.menu, .ux-popover[data-dropdown]').forEach(m => { m.hidden = true; });
});

// Khởi động: đọc settings + progress, tự nạp lại các bộ thẻ đã mở lần trước
async function init() {
  initGlobalShortcuts(actions);

  // Đăng ký các sự kiện tệp và hệ thống từ main
  api.onOpenExternal?.(async ({ path: filePath }) => {
    if (!filePath) return;
    const existing = state.entries.find(e => samePath(e.path, filePath));
    if (existing && existing.status === 'ok') {
      actions.openDeckView(existing);
      return;
    }
    const [r] = await api.openDecks(filePath);
    if (r && r.ok) {
      const e = applyResult(r, existing);
      await persistDeckPaths();
      actions.openDeckView(e);
    } else {
      notify(`Không mở được file "${fileName(filePath)}": ${r?.error || 'Lỗi'}`, 'error');
    }
  });

  api.onDeckChanged?.(async ({ deckKey, path: filePath }) => {
    const entry = state.entries.find(e => (deckKey && e.deckKey === deckKey) || samePath(e.path, filePath));
    if (!entry) return;
    if (state.route.name === 'editor' && state.route.uid === entry.uid) {
      const dirty = Boolean(document.querySelector('.editor-dirty-indicator') || window.__isEditorDirty?.());
      if (dirty) {
        const accept = window.confirm(
          `File "${fileName(entry.path)}" vừa được sửa đổi từ bên ngoài.\nBạn có muốn nạp lại và ghi đè các thay đổi chưa lưu trong Editor không?`
        );
        if (!accept) return;
      }
    }
    await actions.reload(entry);
    notify(`Đã nạp lại "${fileName(entry.path)}" vì file có thay đổi bên ngoài.`, 'info');
  });

  api.onWatchError?.(({ path: filePath, error }) => {
    const entry = state.entries.find(e => samePath(e.path, filePath));
    if (entry) {
      entry.status = 'error';
      entry.error = error;
      render();
    }
    notify(`Lỗi theo dõi file "${fileName(filePath)}": ${error}`, 'warn');
  });

  api.onFileAdded?.(async ({ path: filePath, group }) => {
    const existing = state.entries.find(e => samePath(e.path, filePath));
    if (existing) {
      existing.group = group;
      existing.inLibrary = true;
      render();
      return;
    }
    const [r] = await api.openDecks(filePath);
    if (r?.ok) {
      const e = applyResult(r);
      e.group = group;
      e.inLibrary = true;
      await persistDeckPaths();
      render();
    }
  });

  api.onFileRemoved?.(({ path: filePath }) => {
    const entry = state.entries.find(e => samePath(e.path, filePath));
    if (entry) {
      entry.status = 'missing';
      render();
    }
  });

  const [loadedSettings, loadedProgress] = await Promise.all([
    api.loadSettings(),
    api.loadProgress(),
  ]);
  if (loadedSettings && typeof loadedSettings === 'object') {
    state.settings = { ...state.settings, ...loadedSettings };
    setLearnSteps(state.settings.learnSteps);
  }
  if (loadedProgress && typeof loadedProgress === 'object') {
    state.progress = {
      version: 1,
      cards: loadedProgress.cards || {},
      meta: loadedProgress.meta || {},
      log: Array.isArray(loadedProgress.log) ? loadedProgress.log : [],
    };
  }

  const paths = state.settings.decks || [];
  state.entries = paths.map(p => newEntry({ path: p, status: 'loading' }));
  render();

  if (paths.length) {
    const results = await api.openDecks(paths);
    results.forEach((r, i) => applyResult(r, state.entries[i]));
    const missing = state.entries.filter(e => e.status === 'missing');
    if (missing.length) {
      notify(`${missing.length} bộ thẻ không còn tồn tại: ${missing.map(e => fileName(e.path)).join(', ')}. Bấm "Gỡ" để bỏ khỏi danh sách.`, 'warn', 0);
    }
    render();
  }

  // Quét thư viện thư mục
  await actions.scanLibrary();

  // Kiểm tra bản nháp Editor chưa lưu còn sót (do sự cố bất ngờ)
  const drafts = await api.listDrafts?.().catch(() => []);
  if (drafts && drafts.length > 0) {
    const draft = drafts[0];
    const draftTimeStr = draft.mtime ? new Date(draft.mtime).toLocaleString('vi-VN') : '';
    state.modal = h('div', { class: 'modal-backdrop' },
      h('div', { class: 'modal-dialog', style: 'max-width: 520px;' },
        h('h2', { style: 'margin-top: 0;' }, '📝 Khôi phục bản nháp chưa lưu'),
        h('p', null, `Tìm thấy bản nháp được tự động lưu lúc ${draftTimeStr} cho bộ thẻ "${draft.metaId || 'Chưa đặt tên'}".`),
        h('p', { class: 'color-muted', style: 'font-size: 13px;' }, 'Có thể ứng dụng đã bị tắt đột ngột trước khi kịp bấm Lưu.'),
        h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 24px; gap: 10px;' },
          h('button', {
            type: 'button',
            class: 'ux-btn ghost',
            onclick: async () => {
              state.modal = null;
              await api.deleteDraft?.(draft.metaId);
              render();
            },
          }, 'Bỏ qua & Xoá nháp'),
          h('button', {
            type: 'button',
            class: 'ux-btn primary',
            onclick: async () => {
              state.modal = null;
              const r = await api.loadDraft?.(draft.draftId);
              if (r && r.ok) {
                const entry = applyResult({
                  ok: true,
                  deckKey: r.deckKey,
                  path: null,
                  deckText: r.deckText,
                  deck: r.deck,
                  issues: [],
                  assetCount: r.assetCount || 0,
                });
                notify(`Đã khôi phục bản nháp "${r.deck.meta.title}".`, 'success');
                state.route = { name: 'editor', uid: entry.uid };
              } else {
                notify('Không thể nạp bản nháp: ' + (r?.error || 'Lỗi'), 'error');
              }
              render();
            },
          }, 'Khôi phục và mở Editor')
        )
      )
    );
    render();
  }

  // Báo cho main process biết renderer đã sẵn sàng nhận file mở từ ngoài
  api.notifyReady?.();
}

init().catch(e => notify('Không khởi động được: ' + (e?.message || e), 'error'));
