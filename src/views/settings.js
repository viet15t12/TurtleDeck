// src/views/settings.js — Màn hình Cài đặt (GĐ3 / GĐ3B: số thẻ mới/ngày, các bước nhắc ngắn; GĐ4: giọng đọc TTS).
// Dùng chung tokens.css + controls.css, ngôn ngữ tiếng Việt thân thiện, không lộ thuật ngữ kỹ thuật.
import { h } from './dom.js';
import { parseLearnSteps, DEFAULT_LEARN_STEPS } from '../core/srs.js';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../core/planner.js';
import { speak, hasVoice } from '../tts.js';

export function renderSettings(root, { settings, progress, entries }, actions) {
  let newCardsVal = String(settings?.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY);
  let stepsVal = Array.isArray(settings?.learnSteps) && settings.learnSteps.length
    ? settings.learnSteps.join(', ')
    : DEFAULT_LEARN_STEPS.join(', ');
  let ttsLangVal = settings?.ttsLang || 'en-US';
  let errorMsg = '';

  const errorBox = h('div', { class: 'ux-field-msg error', style: 'margin-bottom: 12px;', hidden: true });

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

  const ttsLangSelect = h('select', {
    class: 'ux-select',
    style: 'width: 100%;',
    onchange: ev => {
      ttsLangVal = ev.target.value;
    },
  },
    h('option', { value: 'en-US', selected: ttsLangVal === 'en-US' }, 'Tiếng Anh - Mỹ (en-US)'),
    h('option', { value: 'en-GB', selected: ttsLangVal === 'en-GB' }, 'Tiếng Anh - Anh (en-GB)')
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
    });
  }

  function handleReset() {
    newCardsVal = String(DEFAULT_NEW_CARDS_PER_DAY);
    stepsVal = DEFAULT_LEARN_STEPS.join(', ');
    ttsLangVal = 'en-US';
    newCardsInput.value = newCardsVal;
    stepsInput.value = stepsVal;
    ttsLangSelect.value = ttsLangVal;
    showError('');
  }

  // ── Đặt lại tiến trình học (SRS) ──────────────────────────────────────────
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
          h('label', null, 'Giọng đọc tiếng Anh mặc định'),
          h('div', { style: 'display: flex; gap: 8px; align-items: center;' },
            ttsLangSelect,
            h('button', {
              type: 'button',
              class: 'ux-btn sm',
              onclick: () => {
                speak('Hello! Welcome to English vocabulary study.', ttsLangVal);
              },
            }, '🔊 Nghe thử')),
          h('p', { class: 'muted settings-help', style: 'margin-top: 8px;' },
            'Hệ thống dùng bộ tổng hợp giọng nói Web Speech của hệ điều hành. Nếu chưa phát được âm trên Linux, bạn có thể cài gói giọng đọc: `sudo dnf install speech-dispatcher espeak-ng`.')))),

    h('section', { class: 'panel settings-panel', style: 'margin-top: 24px;' },
      h('h2', null, 'Tiến trình học tập & Dữ liệu ghi nhớ'),
      h('p', { class: 'muted settings-help', style: 'margin-bottom: 18px;' },
        'Quản lý dữ liệu thuật toán lặp lại ngắt quãng (SRS) và lịch sử ôn tập. Đặt lại tiến trình sẽ đưa các câu hỏi về trạng thái "Mới" ban đầu để bạn bắt đầu học lại từ đầu, không ảnh hưởng đến nội dung câu hỏi trong file .sdeck.'),
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

  root.ownerDocument.title = 'Cài đặt — Study App';
}
