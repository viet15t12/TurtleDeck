// src/app.js — router màn hình + trạng thái bộ thẻ đã nạp (ES module, chỉ gọi main qua window.api).
import { h, fileName } from './views/dom.js';
import { renderHome } from './views/home.js';
import { renderDeck } from './views/deck.js';
import { renderSession } from './views/session.js';
import { renderEditor } from './views/editor.js';
import { newDeck, newItem, newItemId, addItem, newDeckId } from './core/deckmodel.js';

const api = window.api;
const root = document.querySelector('#app');
const notices = document.querySelector('#notices');

// entries: { uid, path|null, status: 'loading'|'ok'|'error'|'missing', deckKey, deckText, deck, issues, error, source, assetCount }
const state = { settings: { version: 1, decks: [] }, entries: [], route: { name: 'home' }, modal: null, busy: false };
let uidSeq = 0;
const newEntry = fields => ({ uid: ++uidSeq, issues: [], ...fields });

// ── Thông báo ──────────────────────────────────────────────────────────────

function notify(text, level = 'info', timeout = level === 'error' ? 0 : 6000) {
  const box = h('div', { class: `notice ${level}`, role: level === 'error' ? 'alert' : 'status' },
    h('span', { class: 'notice-text' }, text),
    h('button', { class: 'notice-close', title: 'Đóng', onclick: () => box.remove() }, '✕'));
  notices.append(box);
  if (timeout) setTimeout(() => box.remove(), timeout);
}

// ── Lưu danh sách đường dẫn vào settings.json ─────────────────────────────

async function persistDeckPaths() {
  state.settings.decks = [...new Set(state.entries.map(e => e.path).filter(Boolean))];
  const r = await api.saveSettings(state.settings);
  if (r && r.ok === false) notify('Không lưu được cài đặt: ' + r.error, 'error');
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

  openEditor(entry) {
    state.route = { name: 'editor', uid: entry.uid };
    render();
  },

  openNewDeckModal() {
    state.modal = renderNewDeckModal(
      async ({ title, kind, lang }) => {
        state.modal = null;
        const r = await api.newDeck();
        if (!r?.ok) {
          notify('Không tạo được bộ thẻ: ' + (r?.error || 'Lỗi'), 'error');
          return;
        }
        let d = newDeck({ title, kind, lang });
        const firstItem = newItem('single', newItemId(d));
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

  openSessionSetup(entry) {
    state.modal = renderSessionModal(
      entry,
      config => actions.startSession(entry, config),
      () => { state.modal = null; render(); }
    );
    render();
  },

  startSession(entry, config = {}) {
    state.modal = null;
    state.route = { name: 'session', uid: entry.uid, config };
    render();
  },

  startTrialSession(entry, workingDeck) {
    state.modal = null;
    if (workingDeck) {
      entry.deck = JSON.parse(JSON.stringify(workingDeck));
      entry.deckText = JSON.stringify(workingDeck, null, 2);
    }
    state.route = {
      name: 'session',
      uid: entry.uid,
      fromEditor: true,
      config: { count: (entry.deck.items || []).length, shuffle: false },
    };
    render();
  },
};

function renderSessionModal(entry, onStart, onCancel) {
  const items = entry.deck.items || [];
  let selectedCount = items.length;
  let shuffleOrder = false;

  const countOptions = [
    { value: items.length, label: `Tất cả (${items.length} câu)` },
  ];
  if (items.length > 5) countOptions.push({ value: 5, label: '5 câu' });
  if (items.length > 10) countOptions.push({ value: 10, label: '10 câu' });
  if (items.length > 20) countOptions.push({ value: 20, label: '20 câu' });

  const selectEl = h('select', {
    class: 'form-control',
    onchange: ev => { selectedCount = Number(ev.target.value); },
  }, countOptions.map(opt => h('option', { value: opt.value }, opt.label)));

  const fileOrderRadio = h('input', {
    type: 'radio',
    name: 'order',
    value: 'file',
    checked: true,
    onchange: () => { shuffleOrder = false; },
  });

  const randomOrderRadio = h('input', {
    type: 'radio',
    name: 'order',
    value: 'random',
    onchange: () => { shuffleOrder = true; },
  });

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog' },
      h('h2', null, 'Bắt đầu phiên học'),
      h('p', { class: 'muted', style: 'margin-top: -8px; margin-bottom: 16px;' }, entry.deck.meta.title),
      h('div', { class: 'form-group' },
        h('label', null, 'Số lượng câu hỏi:'),
        selectEl),
      h('div', { class: 'form-group' },
        h('label', null, 'Thứ tự câu hỏi:'),
        h('div', { class: 'radio-group' },
          h('label', { class: 'radio-label' }, fileOrderRadio, 'Theo file'),
          h('label', { class: 'radio-label' }, randomOrderRadio, 'Ngẫu nhiên'))),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 24px;' },
        h('button', { class: 'btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          class: 'btn primary',
          onclick: () => onStart({ count: selectedCount, shuffle: shuffleOrder }),
        }, 'Bắt đầu học'))));

  return modal;
}

function renderNewDeckModal(onCreate, onCancel) {
  let title = 'Bộ thẻ mới';
  let kind = 'quiz';
  let lang = 'vi';

  const titleInput = h('input', {
    type: 'text',
    class: 'input-text',
    value: title,
    placeholder: 'Nhập tên bộ thẻ...',
    oninput: ev => { title = ev.target.value; },
  });

  const kindSelect = h('select', {
    class: 'form-control',
    onchange: ev => { kind = ev.target.value; },
  },
    h('option', { value: 'quiz' }, 'Trắc nghiệm & Câu hỏi (quiz)'),
    h('option', { value: 'qa' }, 'Hỏi đáp (qa)'),
    h('option', { value: 'vocab' }, 'Từ vựng (vocab)'));

  const langInput = h('input', {
    type: 'text',
    class: 'input-text',
    value: lang,
    placeholder: 'Ngôn ngữ (vd: vi, en)...',
    oninput: ev => { lang = ev.target.value; },
  });

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog' },
      h('h2', null, 'Tạo bộ thẻ mới'),
      h('p', { class: 'muted', style: 'margin-top: -8px; margin-bottom: 16px;' },
        'Nhập thông tin ban đầu để mở màn hình soạn thảo'),
      h('div', { class: 'form-group' },
        h('label', null, 'Tên bộ thẻ:'),
        titleInput),
      h('div', { class: 'form-group' },
        h('label', null, 'Loại bộ thẻ:'),
        kindSelect),
      h('div', { class: 'form-group' },
        h('label', null, 'Ngôn ngữ:'),
        langInput),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 24px;' },
        h('button', { class: 'btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          class: 'btn primary',
          onclick: () => {
            if (!title.trim()) {
              alert('Vui lòng nhập tên bộ thẻ.');
              return;
            }
            onCreate({ title: title.trim(), kind, lang: lang.trim() });
          },
        }, 'Tạo bộ thẻ'))));

  return modal;
}

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

  if (state.route.name === 'editor') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      renderEditor(root, { entry }, actions);
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
    document.body.classList.remove('in-editor');
  }

  if (state.route.name === 'session') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      document.title = `Học: ${entry.deck.meta.title} — Study App`;
      const sessionActions = state.route.fromEditor
        ? { ...actions, openDeckView: e => actions.openEditor(e) }
        : actions;
      renderSession(root, { entry, config: state.route.config }, sessionActions);
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
  }

  if (state.route.name === 'deck') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      renderDeck(root, entry, actions);
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
  }

  document.title = 'Study App';
  renderHome(root, { entries: state.entries, busy: state.busy }, actions);
  if (state.modal) root.append(state.modal);
}

// bấm ra ngoài thì đóng mọi menu thả xuống
document.addEventListener('click', () => document.querySelectorAll('.menu').forEach(m => { m.hidden = true; }));

// Khởi động: đọc settings, tự nạp lại các bộ thẻ đã mở lần trước
async function init() {
  state.settings = await api.loadSettings();
  const paths = state.settings.decks || [];
  state.entries = paths.map(p => newEntry({ path: p, status: 'loading' }));
  render();
  if (!paths.length) return;
  const results = await api.openDecks(paths);
  results.forEach((r, i) => applyResult(r, state.entries[i]));
  const missing = state.entries.filter(e => e.status === 'missing');
  if (missing.length)
    notify(`${missing.length} bộ thẻ không còn tồn tại: ${missing.map(e => fileName(e.path)).join(', ')}. Bấm "Gỡ" để bỏ khỏi danh sách.`, 'warn', 0);
  render();
}

init().catch(e => notify('Không khởi động được: ' + (e?.message || e), 'error'));
