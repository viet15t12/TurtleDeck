// src/views/settings.js — Màn hình Cài đặt hệ thống (GĐ3, GĐ4, GĐ6).
// Quản lý: nhịp độ học mới/ngày, bước nhắc ngắn, Thư mục Thư viện, giọng TTS, Theme Sáng/Tối, Sao lưu & Xuất/Nhập tiến độ.
import { h } from './dom.js';
import { parseLearnSteps, DEFAULT_LEARN_STEPS } from '../core/srs.js';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../core/planner.js';
import { speak, getVoices } from '../tts.js';
import { notify } from './notify.js';

export function renderSettings(root, { settings, progress, entries }, actions) {
  let newCardsVal = String(settings?.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY);
  let stepsVal = Array.isArray(settings?.learnSteps) && settings.learnSteps.length
    ? settings.learnSteps.join(', ')
    : DEFAULT_LEARN_STEPS.join(', ');
  let ttsLangVal = settings?.ttsLang || 'en-US';
  let ttsVoiceNameVal = settings?.ttsVoiceName || '';
  let themeVal = settings?.theme || localStorage.getItem('studyapp_theme') || 'system';
  let libraryDirVal = settings?.libraryDir || '';
  let backupList = [];
  let errorMsg = '';

  const errorBox = h('div', { class: 'ux-field-msg error', style: 'margin-bottom: 12px;', hidden: true });

  // 1. Theme
  function applyTheme(t) {
    themeVal = t;
    localStorage.setItem('studyapp_theme', t);
    const isDark = t === 'dark' || (t === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  const themeSelect = h('select', {
    class: 'ux-select',
    style: 'width: 100%;',
    onchange: ev => {
      applyTheme(ev.target.value);
    },
  },
    h('option', { value: 'system', selected: themeVal === 'system' }, 'Theo hệ thống (System)'),
    h('option', { value: 'light', selected: themeVal === 'light' }, 'Giao diện Sáng (Light)'),
    h('option', { value: 'dark', selected: themeVal === 'dark' }, 'Giao diện Tối (Dark)')
  );

  // 2. Thư mục Thư viện
  const libraryDirDisplay = h('input', {
    type: 'text',
    class: 'ux-input font-mono',
    style: 'width: 100%;',
    readOnly: true,
    value: libraryDirVal || 'Đang tải…',
  });

  window.api.getLibraryDir?.().then(dir => {
    libraryDirVal = dir;
    libraryDirDisplay.value = dir;
  });

  // 3. Nhịp độ học
  const newCardsInput = h('input', {
    type: 'number',
    class: 'ux-input',
    style: 'width: 100%;',
    min: '0',
    max: '9999',
    step: '1',
    value: newCardsVal,
    oninput: ev => {
      newCardsVal = ev.target.value;
      errorBox.hidden = true;
    },
  });

  const stepsInput = h('input', {
    type: 'text',
    class: 'ux-input',
    style: 'width: 100%;',
    placeholder: 'Ví dụ: 1, 10',
    value: stepsVal,
    oninput: ev => {
      stepsVal = ev.target.value;
      errorBox.hidden = true;
    },
  });

  // 4. Giọng đọc TTS
  const allVoices = getVoices();
  const enVoices = allVoices.filter(v => v?.lang && String(v.lang).toLowerCase().startsWith('en'));
  const displayVoices = enVoices.length ? enVoices : allVoices;

  const ttsVoiceSelect = h('select', {
    class: 'ux-select',
    style: 'width: 100%;',
    onchange: ev => {
      ttsVoiceNameVal = ev.target.value;
    },
  },
    h('option', { value: '', selected: !ttsVoiceNameVal }, 'Mặc định theo hệ thống (Auto)'),
    ...displayVoices.map(v => h('option', {
      value: v.name,
      selected: ttsVoiceNameVal === v.name,
    }, `${v.name} (${v.lang})`))
  );

  function showError(msg) {
    errorMsg = msg;
    errorBox.textContent = errorMsg;
    errorBox.hidden = !msg;
  }

  function handleSave(ev) {
    if (ev) ev.preventDefault();
    const numNew = Number(newCardsVal.trim());
    if (newCardsVal.trim() === '' || !Number.isFinite(numNew) || numNew < 0) {
      showError('Số thẻ mới mỗi ngày phải là số nguyên không âm (ví dụ: 20).');
      newCardsInput.focus();
      return;
    }

    const rawSteps = stepsVal.split(/[\s,;]+/).filter(Boolean).map(Number);
    if (!rawSteps.length || rawSteps.some(n => !Number.isFinite(n) || n <= 0)) {
      showError('Các bước nhắc ngắn phải là danh sách số phút lớn hơn 0, cách nhau bởi dấu phẩy (ví dụ: 1, 10).');
      stepsInput.focus();
      return;
    }

    const cleanSteps = parseLearnSteps(rawSteps);
    actions.saveSettings({
      newCardsPerDay: Math.floor(numNew),
      learnSteps: cleanSteps,
      ttsLang: ttsLangVal,
      ttsVoiceName: ttsVoiceNameVal,
      theme: themeVal,
      libraryDir: libraryDirVal,
    });
  }

  function handleReset() {
    newCardsVal = String(DEFAULT_NEW_CARDS_PER_DAY);
    stepsVal = DEFAULT_LEARN_STEPS.join(', ');
    ttsLangVal = 'en-US';
    ttsVoiceNameVal = '';
    applyTheme('system');
    themeSelect.value = 'system';
    newCardsInput.value = newCardsVal;
    stepsInput.value = stepsVal;
    ttsVoiceSelect.value = '';
    showError('');
  }

  // 5. Đặt lại tiến trình học (SRS)
  const cardsMap = progress?.cards || {};
  const totalTrackedCards = Object.keys(cardsMap).length;
  const totalLogReviews = Array.isArray(progress?.log) ? progress.log.length : 0;
  let selectedResetTarget = 'all';

  const deckChoices = [
    { id: 'all', title: 'Tất cả bộ thẻ', count: totalTrackedCards },
  ];

  const loadedEntries = (entries || []).filter(e => e.status === 'ok' && e.deck?.meta?.id);
  loadedEntries.forEach(entry => {
    const dId = entry.deck.meta.id;
    const prefix = `${dId}:`;
    const count = Object.keys(cardsMap).filter(k => k.startsWith(prefix)).length;
    deckChoices.push({
      id: dId,
      title: entry.deck.meta.title || dId,
      count,
    });
  });

  const resetTargetSelect = h('select', {
    class: 'ux-select',
    style: 'max-width: 380px; width: 100%;',
    onchange: ev => {
      selectedResetTarget = ev.target.value;
    },
  }, deckChoices.map(c => h('option', { value: c.id }, `${c.title} (${c.count} thẻ có tiến trình)`)));

  function handleResetProgress() {
    const chosen = deckChoices.find(c => c.id === selectedResetTarget) || deckChoices[0];
    const isAll = selectedResetTarget === 'all';
    const message = isAll
      ? `Bạn có chắc chắn muốn đặt lại tiến trình học của TẤT CẢ bộ thẻ?\n\n- ${totalTrackedCards} thẻ đang theo dõi sẽ đưa về trạng thái "Mới".\n- ${totalLogReviews} lượt ôn tập trong lịch sử sẽ bị xoá.\n\nNội dung các file bộ thẻ (.sdeck) sẽ KHÔNG bị thay đổi.`
      : `Bạn có chắc chắn muốn đặt lại tiến trình học của bộ thẻ "${chosen.title}"?\n\n- ${chosen.count} thẻ của bộ thẻ này sẽ đưa về trạng thái "Mới".\n- Lịch sử ôn tập của bộ thẻ này sẽ bị xoá.\n\nNội dung file bộ thẻ (.sdeck) sẽ KHÔNG bị thay đổi.`;

    if (window.confirm(message)) {
      actions.resetProgress(selectedResetTarget);
    }
  }

  // 6. Danh sách Sao lưu
  const backupsContainer = h('div', { class: 'backup-list-box' });

  async function loadBackups() {
    const list = await window.api.listBackups?.();
    backupList = Array.isArray(list) ? list : [];
    renderBackupsList();
  }

  function renderBackupsList() {
    if (!backupList.length) {
      backupsContainer.replaceChildren(
        h('div', { class: 'muted', style: 'padding: 12px; font-size: 13px;' },
          'Chưa có bản sao lưu tự động nào. Bản sao lưu hàng ngày sẽ tự động được tạo khi bạn mở ứng dụng.')
      );
      return;
    }

    backupsContainer.replaceChildren(
      h('div', { style: 'display: flex; flex-direction: column; gap: 8px;' },
        ...backupList.map(b => {
          const sizeKb = Math.max(1, Math.round(b.size / 1024));
          const dateStr = new Date(b.mtime).toLocaleString('vi-VN');
          return h('div', {
            style: 'display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--c-surface-2); border-radius: var(--radius-sm); border: 1px solid var(--c-border); font-size: 13px;',
          },
            h('div', null,
              h('div', { style: 'font-weight: 600; font-family: var(--font-mono); font-size: 12px;' }, b.name),
              h('div', { class: 'muted', style: 'font-size: 11px; margin-top: 2px;' }, `${dateStr} · ${sizeKb} KB`)),
            h('button', {
              type: 'button',
              class: 'ux-btn sm',
              onclick: async () => {
                if (window.confirm(`Khôi phục dữ liệu tiến trình từ bản sao lưu "${b.name}"?\n\nDữ liệu hiện tại sẽ được tự động sao lưu dự phòng trước khi thay thế.`)) {
                  const r = await window.api.restoreBackup(b.name);
                  if (r?.ok) {
                    notify(`Đã khôi phục tiến trình từ "${b.name}".`, 'success');
                    if (actions.reloadProgress) actions.reloadProgress(r.progress);
                    else renderSettings(root, { settings, progress: r.progress, entries }, actions);
                  } else {
                    notify('Không thể khôi phục bản sao lưu: ' + (r?.error || 'Lỗi'), 'error');
                  }
                }
              },
            }, '↺ Khôi phục'));
        }))
    );
  }

  loadBackups();

  // ── Render toàn bộ màn Cài đặt ────────────────────────────────────────────

  root.replaceChildren(
    h('header', { class: 'page-head' },
      h('div', null,
        h('button', { type: 'button', class: 'ux-btn ghost sm back-btn', onclick: actions.home }, '← Về trang chủ'),
        h('p', { class: 'eyebrow' }, 'CÀI ĐẶT HỆ THỐNG'),
        h('h1', null, 'Cài đặt & Dữ liệu học tập')),
      h('div', { class: 'toolbar' },
        h('button', { type: 'button', class: 'ux-btn', onclick: handleReset }, 'Khôi phục mặc định'),
        h('button', { type: 'button', class: 'ux-btn primary', onclick: handleSave }, 'Lưu cài đặt'))),

    h('form', { class: 'panel settings-panel', onsubmit: handleSave },
      h('h2', null, 'Giao diện & Thư viện bộ thẻ'),
      h('div', { class: 'settings-grid' },
        h('div', { class: 'form-group settings-field' },
          h('label', null, 'Chế độ giao diện (Theme)'),
          themeSelect,
          h('p', { class: 'muted settings-help' }, 'Chọn giao diện Sáng, Tối hoặc tự động theo thiết lập hệ điều hành.')),
        h('div', { class: 'form-group settings-field' },
          h('label', null, 'Thư mục Thư viện bộ thẻ'),
          h('div', { style: 'display: flex; gap: 8px;' },
            libraryDirDisplay,
            h('button', {
              type: 'button',
              class: 'ux-btn',
              onclick: async () => {
                const picked = await window.api.pickLibraryDir?.();
                if (picked) {
                  libraryDirVal = picked;
                  libraryDirDisplay.value = picked;
                  notify('Đã đổi thư mục Thư viện thành: ' + picked, 'success');
                  if (actions.scanLibrary) actions.scanLibrary();
                }
              },
            }, 'Chọn…')),
          h('p', { class: 'muted settings-help' },
            'Ứng dụng tự động quét các file .sdeck trong thư mục này và chia nhóm theo các thư mục con.')))),

    h('form', { class: 'panel settings-panel', style: 'margin-top: 24px;', onsubmit: handleSave },
      h('h2', null, 'Nhịp độ học mới & các bước nhắc ngắn'),
      errorBox,
      h('div', { class: 'settings-grid' },
        h('div', { class: 'form-group settings-field' },
          h('label', null, 'Số thẻ mới tối đa mỗi ngày'),
          newCardsInput,
          h('p', { class: 'muted settings-help' },
            'Giới hạn số lượng mục mới được đưa vào phiên "Ôn hôm nay" mỗi ngày (tính theo ngày địa phương). Các mục đã đến hạn ôn tập luôn được hiển thị đầy đủ.')),
        h('div', { class: 'form-group settings-field' },
          h('label', null, 'Các bước nhắc lại ngắn hạn (phút)'),
          stepsInput,
          h('p', { class: 'muted settings-help' },
            'Thời gian chờ (phút) giữa các bước học ngắn trong phiên trước khi mục đó chuyển sang lịch ôn tập dài hạn theo ngày (mặc định: 1, 10 phút).'))),
      h('div', { class: 'toolbar', style: 'justify-content: flex-end; margin-top: 16px;' },
        h('button', { type: 'button', class: 'ux-btn ghost', onclick: actions.home }, 'Huỷ'),
        h('button', { type: 'submit', class: 'ux-btn primary' }, 'Lưu cài đặt'))),

    h('section', { class: 'panel settings-panel', style: 'margin-top: 24px;' },
      h('h2', null, 'Phát âm & Giọng đọc (Text-to-Speech)'),
      h('p', { class: 'muted settings-help', style: 'margin-bottom: 16px;' },
        'Tùy chỉnh giọng phát âm cho bộ thẻ Từ vựng tiếng Anh (hỗ trợ các chế độ Flashcards, Trắc nghiệm, Cloze và Nghe–Gõ).'),
      h('div', { class: 'settings-grid' },
        h('div', { class: 'form-group settings-field' },
          h('label', null, 'Giọng đọc tiếng Anh ưu tiên'),
          h('div', { style: 'display: flex; gap: 8px; align-items: center;' },
            ttsVoiceSelect,
            h('button', {
              type: 'button',
              class: 'ux-btn sm',
              onclick: () => {
                speak('Hello! Welcome to English vocabulary study.', ttsLangVal, { voiceName: ttsVoiceNameVal });
              },
            }, '🔊 Nghe thử')),
          h('p', { class: 'muted settings-help', style: 'margin-top: 8px;' },
            'Hệ thống dùng bộ tổng hợp giọng nói Web Speech của hệ điều hành. Nếu chưa phát được âm trên Linux, bạn có thể cài gói giọng đọc: `sudo dnf install speech-dispatcher espeak-ng`.')))),

    h('section', { class: 'panel settings-panel', style: 'margin-top: 24px;' },
      h('h2', null, 'Sao lưu & Xuất / Nhập tiến trình học tập'),
      h('p', { class: 'muted settings-help', style: 'margin-bottom: 16px;' },
        'Hệ thống tự động sao lưu dữ liệu tiến trình hàng ngày và lưu trữ 7 bản gần nhất. Bạn cũng có thể xuất file tiến trình ra JSON để chuyển đổi thiết bị hoặc nhập file đã lưu.'),
      h('div', { class: 'toolbar', style: 'margin-bottom: 18px; flex-wrap: wrap; gap: 10px;' },
        h('button', {
          type: 'button',
          class: 'ux-btn primary sm',
          onclick: async () => {
            const r = await window.api.createBackup?.();
            if (r?.ok) {
              notify(`Đã tạo bản sao lưu: ${r.name}`, 'success');
              loadBackups();
            } else {
              notify('Không tạo được sao lưu: ' + (r?.error || 'Lỗi'), 'error');
            }
          },
        }, '💾 Sao lưu ngay'),
        h('button', {
          type: 'button',
          class: 'ux-btn sm',
          onclick: async () => {
            const r = await window.api.exportProgress?.();
            if (r?.ok) notify(`Đã xuất dữ liệu tiến trình thành công: ${r.path}`, 'success');
            else if (!r?.canceled) notify('Không xuất được tiến trình: ' + (r?.error || 'Lỗi'), 'error');
          },
        }, '📤 Xuất tiến độ…'),
        h('button', {
          type: 'button',
          class: 'ux-btn sm',
          onclick: async () => {
            const r = await window.api.pickImportProgress?.();
            if (!r || !r.ok) {
              if (r?.error) notify(r.error, 'error');
              return;
            }
            const { preview, importedProgress } = r;
            const mode = window.confirm(
              `Đã đọc file tiến độ hợp lệ:\n- ${preview.cardsCount} thẻ\n- ${preview.logCount} lượt ôn tập trong lịch sử\n\nBấm [OK] để GỘP với tiến độ hiện tại (giữ lượt học cao hơn, an toàn cho dữ liệu local).\nBấm [Cancel / Huỷ] nếu muốn THAY THẾ toàn bộ.`
            ) ? 'merge' : (window.confirm('Bạn có chắc chắn muốn THAY THẾ TOÀN BỘ tiến độ hiện tại bằng dữ liệu trong file này?') ? 'replace' : null);

            if (!mode) return;

            const res = await window.api.applyImportProgress?.({ importedProgress, mode });
            if (res?.ok) {
              notify('Nhập tiến độ học tập thành công!', 'success');
              if (actions.reloadProgress) actions.reloadProgress(res.progress);
              else renderSettings(root, { settings, progress: res.progress, entries }, actions);
            } else {
              notify('Lỗi nhập tiến độ: ' + (res?.error || 'Lỗi'), 'error');
            }
          },
        }, '📥 Nhập tiến độ…'),
        h('button', {
          type: 'button',
          class: 'ux-btn ghost sm',
          onclick: () => window.api.openBackupsFolder?.(),
        }, '📂 Mở thư mục sao lưu')),
      h('div', { class: 'form-group' },
        h('label', null, 'Bản sao lưu gần đây:'),
        backupsContainer)),

    h('section', { class: 'panel settings-panel', style: 'margin-top: 24px;' },
      h('h2', null, 'Đặt lại tiến trình học tập (SRS)'),
      h('p', { class: 'muted settings-help', style: 'margin-bottom: 18px;' },
        'Đặt lại tiến trình sẽ đưa các câu hỏi về trạng thái "Mới" ban đầu để bạn bắt đầu học lại từ đầu, không ảnh hưởng đến nội dung câu hỏi trong file .sdeck.'),
      h('div', { style: 'display: flex; gap: 14px; flex-wrap: wrap; margin-bottom: 20px;' },
        h('div', { class: 'card', style: 'flex: 1; min-width: 160px; padding: 14px 18px; background: var(--c-surface-2); border-radius: var(--radius-md); border: 1px solid var(--c-border);' },
          h('div', { class: 'eyebrow', style: 'font-size: 11px; margin-bottom: 4px;' }, 'THẺ ĐÃ HỌC CÓ TIẾN TRÌNH'),
          h('div', { style: 'font-size: 24px; font-weight: 700; color: var(--c-primary);' }, `${totalTrackedCards} thẻ`)),
        h('div', { class: 'card', style: 'flex: 1; min-width: 160px; padding: 14px 18px; background: var(--c-surface-2); border-radius: var(--radius-md); border: 1px solid var(--c-border);' },
          h('div', { class: 'eyebrow', style: 'font-size: 11px; margin-bottom: 4px;' }, 'TỔNG LƯỢT ÔN TẬP ĐÃ LƯU'),
          h('div', { style: 'font-size: 24px; font-weight: 700; color: var(--c-text);' }, `${totalLogReviews} lượt`))),
      h('div', { class: 'form-group', style: 'margin-bottom: 14px;' },
        h('label', { style: 'display: block; font-weight: 600; margin-bottom: 6px; font-size: 13px;' }, 'Chọn bộ thẻ muốn đặt lại'),
        h('div', { style: 'display: flex; gap: 12px; align-items: center; flex-wrap: wrap;' },
          resetTargetSelect,
          h('button', {
            type: 'button',
            class: 'ux-btn danger',
            onclick: handleResetProgress,
          }, '🗑 Đặt lại tiến trình'))),
      h('p', { class: 'muted', style: 'font-size: 12px; margin: 0;' },
        '💡 Mẹo: Bạn có thể chọn đặt lại cho một bộ thẻ riêng lẻ hoặc toàn bộ hệ thống. Thao tác cần xác nhận và không thể hoàn tác.'))
  );

  root.ownerDocument.title = 'Cài đặt — Turtle Deck';
}
