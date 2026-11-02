// src/core/ttsvoice.js — Logic chọn giọng đọc TTS (hàm thuần, ES module, test được bằng node --test).

// pickVoice(voices, targetLang):
// 1. Khớp chính xác mã ngôn ngữ (vd en-US hoặc en-GB)
// 2. Khớp tiền tố cùng nhóm ngôn ngữ (vd en-*)
// 3. Không có -> trả null
export function pickVoice(voices, targetLang = 'en-US') {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const target = String(targetLang || 'en-US').toLowerCase().replace('_', '-');
  const prefix = target.split('-')[0] + '-';

  // 1. Khớp chính xác
  const exact = voices.find(v => {
    const l = String(v?.lang || '').toLowerCase().replace('_', '-');
    return l === target;
  });
  if (exact) return exact;

  // 2. Khớp cùng họ ngôn ngữ (en-*)
  const langMatch = voices.find(v => {
    const l = String(v?.lang || '').toLowerCase().replace('_', '-');
    return l.startsWith(prefix) || l === target.split('-')[0];
  });
  if (langMatch) return langMatch;

  return null;
}

