// src/views/editor/fields/graderbox.js — Khu vực Điền / Lệnh: Đáp án chấp nhận (chip), Cách chấm, Sai số, Thử đáp án trực tiếp (§6.3)
import { h } from '../../dom.js';
import { gradeText } from '../../../core/grader.js';
import { createChipListField } from './chips.js';

const MATCH_OPTIONS = [
  {
    key: 'normalized',
    label: 'Thường',
    desc: 'Bỏ qua chữ hoa/thường và khoảng trắng thừa; chấp nhận gõ lệch nhỏ.',
  },
  {
    key: 'exact',
    label: 'Chính xác',
    desc: 'Phải khớp từng ký tự (kể cả chữ hoa/thường).',
  },
  {
    key: 'number',
    label: 'Số',
    desc: 'So sánh giá trị số (hiểu cả 0,5, 0.5, phân số 1/3, số mũ 1e-3).',
  },
  {
    key: 'latex',
    label: 'Công thức LaTeX',
    desc: 'So sánh công thức toán sau khi chuẩn hoá (vd \\dfrac{1}{2} khớp \\frac{1}{2}).',
  },
  {
    key: 'regex',
    label: 'Regex (nâng cao)',
    desc: 'Mỗi đáp án chấp nhận là một biểu thức chính quy JavaScript.',
  },
];

export function createFillCommandSection({
  getItem,
  onPatchItem,
  onMarkFieldTouched,
  onUpdateValidationUI,
  onRerenderForm,
  onFocusPath,
  captureCursor,
}) {
  const item = getItem();
  const isCmd = item.type === 'command';
  const rawAnswers = Array.isArray(item.answer) && item.answer.length ? item.answer : [''];
  // Dạng Lệnh mặc định "Thường" (normalized) theo §6.3
  const matchMode = item.match || 'normalized';
  const currentMatchMeta = MATCH_OPTIONS.find(m => m.key === matchMode) || MATCH_OPTIONS[0];

  let pendingChipInput = '';
  let testValue = '';
  const testResultEl = h('span', { class: 'grader-live-badge' });
  const regexStatusEl = h('div', { class: 'ux-field-msg error', hidden: true });

  function getEffectiveAnswers() {
    const cur = getItem();
    const list = (Array.isArray(cur.answer) ? cur.answer : []).map(a => String(a ?? '').trim()).filter(Boolean);
    if (pendingChipInput.trim() && !list.includes(pendingChipInput.trim())) {
      list.push(pendingChipInput.trim());
    }
    return list;
  }

  function validateRegexLive() {
    const cur = getItem();
    if ((cur.match || 'normalized') !== 'regex') {
      regexStatusEl.hidden = true;
      return;
    }
    const candidates = getEffectiveAnswers();
    for (let i = 0; i < candidates.length; i++) {
      try {
        new RegExp(candidates[i]);
      } catch (e) {
        regexStatusEl.hidden = false;
        regexStatusEl.textContent = `Regex không hợp lệ ("${candidates[i]}"): ${e.message}`;
        return;
      }
    }
    regexStatusEl.hidden = true;
  }

  function runLiveGrade() {
    validateRegexLive();
    if (!testValue.trim()) {
      testResultEl.textContent = '';
      testResultEl.className = 'grader-live-badge';
      return;
    }
    const cur = getItem();
    const validAns = getEffectiveAnswers();
    if (!validAns.length) {
      testResultEl.textContent = 'Chưa có đáp án chấp nhận';
      testResultEl.className = 'grader-live-badge muted';
      return;
    }
    const g = gradeText(testValue, validAns, cur.match || 'normalized', {
      tolerance: cur.tolerance,
    });
    if (g.ok) {
      testResultEl.textContent = g.near ? '≈ Gần đúng' : '✓ Đúng';
      testResultEl.className = `grader-live-badge ${g.near ? 'near' : 'ok'}`;
    } else {
      testResultEl.textContent = '✗ Sai';
      testResultEl.className = 'grader-live-badge wrong';
    }
  }

  const answersField = createChipListField({
    label: 'Đáp án chấp nhận',
    hint: 'Nhấn Enter để thêm biến thể · Dán nhiều dòng thành nhiều đáp án',
    path: 'answers.0',
    validateGroup: 'answer',
    values: rawAnswers,
    placeholder: isCmd ? 'Nhập lệnh đúng rồi nhấn Enter (vd: rpm -qa)…' : 'Nhập đáp án đúng rồi nhấn Enter…',
    mono: isCmd || matchMode === 'regex' || matchMode === 'latex',
    keepAtLeastOneEmpty: true,
    onChangeValues: nextArr => {
      pendingChipInput = '';
      onPatchItem({ answer: nextArr });
      onRerenderForm();
    },
    onLiveInput: textInBox => {
      pendingChipInput = textInBox;
      // Nếu chưa có chip nào, cập nhật trực tiếp phần tử đầu để người dùng không cần nhấn Enter vẫn lưu được
      const cur = getItem();
      const existingClean = (Array.isArray(cur.answer) ? cur.answer : []).filter(a => a && a.trim());
      if (existingClean.length === 0) {
        onPatchItem({ answer: [textInBox] }, { mergeKey: 'answer.0' });
        onUpdateValidationUI();
      }
      runLiveGrade();
    },
    onBlurValidate: () => {
      onMarkFieldTouched('answer');
      onUpdateValidationUI();
    },
    onFocusPath,
  });

  queueMicrotask(() => validateRegexLive());

  return h('div', { style: 'display: flex; flex-direction: column; gap: 14px;' },
    answersField,
    regexStatusEl,

    h('div', { class: 'form-field' },
      h('div', { class: 'form-label-row' },
        h('label', { class: 'form-label' }, 'Cách chấm'),
        h('span', { class: 'form-label-hint' }, currentMatchMeta.desc)),
      h('div', { class: 'ux-segmented', style: 'align-self: flex-start; flex-wrap: wrap;' },
        MATCH_OPTIONS.map(m => h('button', {
          type: 'button',
          class: `ux-seg-btn ${matchMode === m.key ? 'active' : ''}`,
          onclick: () => {
            onPatchItem({ match: m.key });
            onRerenderForm();
          },
        }, m.label))),
      matchMode === 'regex' ? h('div', { class: 'muted', style: 'font-size: 12px; margin-top: 2px;' },
        'Lưu ý: nhập biểu thức không kèm dấu / ở hai đầu (ví dụ: ^ls\\s+-la$).') : null),

    matchMode === 'number' ? h('div', { class: 'form-field' },
      h('label', { class: 'form-label' }, 'Sai số cho phép'),
      h('input', {
        type: 'number',
        step: 'any',
        min: '0',
        class: 'ux-input',
        style: 'max-width: 180px;',
        placeholder: '0 (mặc định)',
        value: item.tolerance ?? 0,
        'data-path': 'tolerance',
        'data-validate-input': 'tolerance',
        oninput: ev => {
          const v = ev.target.value === '' ? 0 : Number(ev.target.value);
          onPatchItem(
            { tolerance: v },
            { mergeKey: 'tolerance', cursor: captureCursor ? captureCursor(ev.target, 'tolerance') : null }
          );
          onUpdateValidationUI();
          runLiveGrade();
        },
        onblur: () => {
          onMarkFieldTouched('tolerance');
          onUpdateValidationUI();
        },
      }),
      h('div', { 'data-validate-group': 'tolerance' })) : null,

    h('div', { class: 'grader-test-box' },
      h('span', { class: 'grader-test-label' }, 'Thử đáp án'),
      h('input', {
        type: 'text',
        class: `ux-input sm ${isCmd ? 'font-mono' : ''}`,
        style: 'flex: 1;',
        placeholder: 'Gõ câu trả lời để kiểm tra bộ chấm ngay tại đây…',
        oninput: ev => {
          testValue = ev.target.value;
          runLiveGrade();
        },
      }),
      testResultEl)
  );
}

