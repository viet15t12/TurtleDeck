// src/app.js — router màn hình + trạng thái bộ thẻ, tiến độ (SRS) và cài đặt (ES module, chỉ gọi main qua window.api).
import { h, fileName } from './views/dom.js';
import { renderHome } from './views/home.js';
import { renderDeck } from './views/deck.js';
import { renderSession } from './views/session.js';
import { renderEditor } from './views/editor.js';
import { renderSettings } from './views/settings.js';
import { newDeck, newItem, newItemId, newItemLike, addItem, newDeckId } from './core/deckmodel.js';
import { KINDS, kindOf, kindLabel, mismatchedItems, formatMismatchWarning } from './core/deckkinds.js';
import { setLearnSteps, recordReview, DEFAULT_LEARN_STEPS } from './core/srs.js';
import { DEFAULT_NEW_CARDS_PER_DAY } from './core/planner.js';

const api = window.api;
const root = document.querySelector('#app');
const notices = document.querySelector('#notices');

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

// ── Thông báo ──────────────────────────────────────────────────────────────

function notify(text, level = 'info', timeout = level === 'error' ? 0 : 6000) {
  const box = h('div', { class: `notice ${level}`, role: level === 'error' ? 'alert' : 'status' },
    h('span', { class: 'notice-text' }, text),
    h('button', { class: 'notice-close', title: 'Đóng', onclick: () => box.remove() }, '✕'));
  notices.append(box);
  if (timeout) setTimeout(() => box.remove(), timeout);
}

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

  openSessionSetup(entry) {
    state.modal = renderSessionModal(
      entry,
      config => actions.startSession(entry, { ...config, persist: true }),
      () => { state.modal = null; render(); }
    );
    render();
  },

  startSession(entry, config = {}) {
    state.modal = null;
    state.route = { name: 'session', uid: entry.uid, config };
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
    class: 'ux-select',
    style: 'width: 100%;',
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
      h('h2', null, 'Bắt đầu phiên luyện tập'),
      h('p', { class: 'muted', style: 'margin-top: -8px; margin-bottom: 16px;' }, entry.deck.meta.title),
      h('div', { class: 'form-group' },
        h('label', null, 'Số lượng mục:'),
        selectEl),
      h('div', { class: 'form-group' },
        h('label', null, 'Thứ tự hiển thị:'),
        h('div', { class: 'radio-group' },
          h('label', { class: 'radio-label' }, fileOrderRadio, 'Theo thứ tự bộ thẻ'),
          h('label', { class: 'radio-label' }, randomOrderRadio, 'Ngẫu nhiên'))),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 24px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: () => onStart({ mode: 'custom', count: selectedCount, shuffle: shuffleOrder }),
        }, 'Bắt đầu học'))));

  return modal;
}

function renderNewDeckModal(onCreate, onCancel, preselectedKind) {
  let title = '';
  let kind = (typeof preselectedKind === 'string' && KINDS[preselectedKind]?.available) ? preselectedKind : 'quiz';
  let description = '';
  let lang = 'vi';
  let errorText = '';

  const kindGridHost = h('div', { class: 'ux-kind-grid' });
  const errEl = h('div', { class: 'ux-field-msg error', hidden: true });
  const descCountEl = h('span', { class: 'muted', style: 'font-size: 12px;' }, '0/200');

  const titleInput = h('input', {
    type: 'text',
    class: 'ux-input',
    value: title,
    placeholder: 'Ví dụ: Giải tích 1, Lệnh Linux cơ bản…',
    oninput: ev => {
      title = ev.target.value;
      if (title.trim()) {
        errorText = '';
        errEl.hidden = true;
      }
    },
    onkeydown: ev => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        submit();
      }
    },
  });

  function renderKindCards() {
    kindGridHost.replaceChildren(
      ...['qa', 'quiz', 'vocab'].map(k => {
        const info = KINDS[k];
        const disabled = !info.available;
        const active = kind === k;
        return h('button', {
          type: 'button',
          class: `ux-kind-card ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`,
          'data-kind': k,
          disabled,
          onclick: () => {
            if (disabled) return;
            kind = k;
            renderKindCards();
            titleInput.focus();
          },
        },
          h('div', { class: 'ux-kind-card-head' },
            h('span', { class: 'ux-kind-icon' }, info.icon),
            info.comingSoon ? h('span', { class: 'ux-kind-soon' }, info.comingSoon) : null),
          h('div', { class: 'ux-kind-title' }, info.label),
          h('div', { class: 'ux-kind-desc' }, info.description));
      })
    );
  }

  function submit() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      errorText = 'Vui lòng nhập tên bộ thẻ.';
      errEl.textContent = errorText;
      errEl.hidden = false;
      titleInput.focus();
      return;
    }
    onCreate({
      title: cleanTitle,
      kind,
      description: description.trim().slice(0, 200),
      lang: lang.trim() || 'vi',
    });
  }

  renderKindCards();
  queueMicrotask(() => titleInput.focus());

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog', style: 'max-width: 620px; width: 94vw;' },
      h('h2', null, 'Bộ thẻ mới'),
      h('p', { class: 'muted', style: 'margin-top: -6px; margin-bottom: 16px;' },
        'Chọn loại bộ thẻ phù hợp với nội dung bạn muốn học, sau đó đặt tên để bắt đầu soạn.'),
      h('div', { class: 'form-group', style: 'margin-bottom: 14px;' },
        h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, '1. Chọn loại bộ thẻ'),
        kindGridHost),
      h('div', { class: 'form-group', style: 'margin-bottom: 14px;' },
        h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, '2. Tên bộ thẻ'),
        titleInput,
        errEl),
      h('div', { class: 'form-group', style: 'margin-bottom: 14px;' },
        h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' },
          h('label', { style: 'font-weight: 600; font-size: 13px;' }, 'Mô tả ngắn (tuỳ chọn)'),
          descCountEl),
        h('textarea', {
          class: 'ux-textarea',
          rows: '2',
          maxLength: 200,
          placeholder: 'Mô tả ngắn gọn nội dung bộ thẻ (tối đa 200 ký tự)…',
          oninput: ev => {
            description = ev.target.value.slice(0, 200);
            descCountEl.textContent = `${description.length}/200`;
          },
        })),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 20px; gap: 8px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: submit,
        }, 'Tạo & Mở trình soạn'))));

  return modal;
}

function renderDeckInfoModal(deck, onSave, onCancel) {
  const meta = deck?.meta || {};
  let title = meta.title || '';
  let description = meta.description || '';
  let lang = meta.lang || 'vi';
  let kind = kindOf(deck);

  const kindGridHost = h('div', { class: 'ux-kind-grid' });
  const mismatchHost = h('div');
  const descCountEl = h('span', { class: 'muted', style: 'font-size: 12px;' }, `${description.length}/200`);

  function renderKindCardsAndWarning() {
    kindGridHost.replaceChildren(
      ...['qa', 'quiz', 'vocab'].map(k => {
        const info = KINDS[k];
        const disabled = !info.available && kindOf(deck) !== k;
        const active = kind === k;
        return h('button', {
          type: 'button',
          class: `ux-kind-card ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`,
          'data-kind': k,
          disabled,
          onclick: () => {
            if (disabled) return;
            kind = k;
            renderKindCardsAndWarning();
          },
        },
          h('div', { class: 'ux-kind-card-head' },
            h('span', { class: 'ux-kind-icon' }, info.icon),
            info.comingSoon ? h('span', { class: 'ux-kind-soon' }, info.comingSoon) : null),
          h('div', { class: 'ux-kind-title' }, info.label),
          h('div', { class: 'ux-kind-desc' }, info.description));
      })
    );

    const mismatched = mismatchedItems(deck, kind);
    if (mismatched.length > 0) {
      mismatchHost.replaceChildren(
        h('div', { class: 'ux-mismatch-banner', style: 'margin-top: 8px;' },
          h('span', { style: 'font-weight: 700;' }, '⚠'),
          h('div', null,
            h('div', { style: 'font-weight: 600;' }, formatMismatchWarning(deck, kind)),
            h('div', { style: 'font-size: 12px; margin-top: 2px;' },
              `Có ${mismatched.length} mục lệch loại với "${kindLabel(kind)}". Các mục này không bị xoá hay tự chuyển đổi.`)))
      );
    } else {
      mismatchHost.replaceChildren();
    }
  }

  renderKindCardsAndWarning();

  const modal = h('div', { class: 'modal-backdrop', onclick: ev => { if (ev.target === modal) onCancel(); } },
    h('div', { class: 'modal-dialog', style: 'max-width: 600px; width: 94vw;' },
      h('h2', null, 'Thông tin bộ thẻ'),
      h('div', { style: 'display: flex; flex-direction: column; gap: 14px; margin: 14px 0 20px;' },
        h('div', { class: 'form-group' },
          h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, 'Tên bộ thẻ'),
          h('input', {
            type: 'text',
            class: 'ux-input',
            value: title,
            oninput: ev => { title = ev.target.value; },
          })),
        h('div', { class: 'form-group' },
          h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, 'Loại bộ thẻ'),
          kindGridHost,
          mismatchHost),
        h('div', { class: 'form-group' },
          h('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;' },
            h('label', { style: 'font-weight: 600; font-size: 13px;' }, 'Mô tả (tuỳ chọn, tối đa 200 ký tự)'),
            descCountEl),
          h('textarea', {
            class: 'ux-textarea',
            rows: '2',
            maxLength: 200,
            value: description,
            oninput: ev => {
              description = ev.target.value.slice(0, 200);
              descCountEl.textContent = `${description.length}/200`;
            },
          }))),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; gap: 8px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: onCancel }, 'Huỷ'),
        h('button', {
          type: 'button',
          class: 'ux-btn primary',
          onclick: () => {
            if (!title.trim()) return;
            onSave({
              title: title.trim(),
              kind,
              description: description.trim().slice(0, 200),
              lang: lang.trim() || 'vi',
            });
          },
        }, 'Lưu thông tin'))));

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

  if (state.route.name === 'settings') {
    renderSettings(root, { settings: state.settings }, actions);
    if (state.modal) root.append(state.modal);
    return;
  }

  if (state.route.name === 'editor') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
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
      document.title = `Học: ${effectiveEntry.deck.meta.title} — Study App`;
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

  if (state.route.name === 'deck') {
    const entry = state.entries.find(e => e.uid === state.route.uid);
    if (entry?.status === 'ok') {
      renderDeck(root, entry, actions, { progress: state.progress, settings: state.settings });
      if (state.modal) root.append(state.modal);
      return;
    }
    state.route = { name: 'home' };
  }

  document.title = 'Study App';
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
  if (!paths.length) return;
  const results = await api.openDecks(paths);
  results.forEach((r, i) => applyResult(r, state.entries[i]));
  const missing = state.entries.filter(e => e.status === 'missing');
  if (missing.length)
    notify(`${missing.length} bộ thẻ không còn tồn tại: ${missing.map(e => fileName(e.path)).join(', ')}. Bấm "Gỡ" để bỏ khỏi danh sách.`, 'warn', 0);
  render();
}

init().catch(e => notify('Không khởi động được: ' + (e?.message || e), 'error'));
