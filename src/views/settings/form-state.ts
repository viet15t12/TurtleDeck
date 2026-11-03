// src/views/settings/form-state.ts — Khởi tạo và kiểm tra tính hợp lệ của biểu mẫu Settings

import type { Settings } from '../../core/types.js';
import { parseLearnSteps, DEFAULT_LEARN_STEPS } from '../../core/srs.js';
import { DEFAULT_NEW_CARDS_PER_DAY } from '../../core/planner.js';

export interface SettingsFormState {
  newCardsVal: string;
  stepsVal: string;
  ttsLangVal: string;
  ttsVoiceNameVal: string;
  themeVal: string;
  libraryDirVal: string;
}

export type ValidationResult =
  | { ok: true; value: Partial<Settings> }
  | { ok: false; error: string; field: 'newCards' | 'steps' };

export function fromSettings(settings?: Settings): SettingsFormState {
  const newCardsVal = String(settings?.newCardsPerDay ?? DEFAULT_NEW_CARDS_PER_DAY);
  const stepsVal =
    Array.isArray(settings?.learnSteps) && settings.learnSteps.length
      ? settings.learnSteps.join(', ')
      : DEFAULT_LEARN_STEPS.join(', ');
  const ttsLangVal = settings?.ttsLang || 'en-US';
  const ttsVoiceNameVal = settings?.ttsVoiceName || '';
  const themeVal =
    settings?.theme ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('studyapp_theme') || 'system' : 'system');
  const libraryDirVal = settings?.libraryDir || '';

  return {
    newCardsVal,
    stepsVal,
    ttsLangVal,
    ttsVoiceNameVal,
    themeVal,
    libraryDirVal,
  };
}

export function validateSettingsForm(form: SettingsFormState): ValidationResult {
  const numNew = Number(form.newCardsVal.trim());
  if (form.newCardsVal.trim() === '' || !Number.isFinite(numNew) || numNew < 0) {
    return {
      ok: false,
      error: 'Số thẻ mới mỗi ngày phải là số nguyên không âm (ví dụ: 20).',
      field: 'newCards',
    };
  }

  const rawSteps = form.stepsVal.split(/[\s,;]+/).filter(Boolean).map(Number);
  if (!rawSteps.length || rawSteps.some(n => !Number.isFinite(n) || n <= 0)) {
    return {
      ok: false,
      error: 'Các bước nhắc ngắn phải là danh sách số phút lớn hơn 0, cách nhau bởi dấu phẩy (ví dụ: 1, 10).',
      field: 'steps',
    };
  }

  const cleanSteps = parseLearnSteps(rawSteps);
  return {
    ok: true,
    value: {
      newCardsPerDay: Math.floor(numNew),
      learnSteps: cleanSteps,
      ttsLang: form.ttsLangVal,
      ttsVoiceName: form.ttsVoiceNameVal,
      theme: form.themeVal as any,
      libraryDir: form.libraryDirVal,
    },
  };
}

