// src/core/ttsvoice.js — Logic chọn giọng đọc TTS (hàm thuần, ES module, test được bằng node --test).

// pickVoice(voices, targetLang, preferredVoiceName):
// 1. Ưu tiên khớp chính xác preferredVoiceName (nếu truyền vào và còn tồn tại)
// 2. Khớp chính xác mã ngôn ngữ targetLang (vd en-US hoặc en-GB)
// 3. Khớp tiền tố cùng nhóm ngôn ngữ (vd en-*)
// 4. Không có -> trả null
export function pickVoice(voices, targetLang = 'en-US', preferredVoiceName = null) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  // 1. Ưu tiên voiceName nếu người dùng đã chỉ định trong Cài đặt
  if (preferredVoiceName && typeof preferredVoiceName === 'string') {
    const named = voices.find(v => v?.name === preferredVoiceName);
    if (named) return named;
  }

  const target = String(targetLang || 'en-US').toLowerCase().replace('_', '-');
  const prefix = target.split('-')[0] + '-';

  // 2. Khớp chính xác targetLang
  const exact = voices.find(v => {
    const l = String(v?.lang || '').toLowerCase().replace('_', '-');
    return l === target;
  });
  if (exact) return exact;

  // 3. Khớp cùng họ ngôn ngữ (en-*)
  const langMatch = voices.find(v => {
    const l = String(v?.lang || '').toLowerCase().replace('_', '-');
    return l.startsWith(prefix) || l === target.split('-')[0];
  });
  if (langMatch) return langMatch;

  return null;
}
