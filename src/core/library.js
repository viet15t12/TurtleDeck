// src/core/library.js — Các hàm thuần xử lý thư viện, đường dẫn và bản nháp (ES module).
// Phục vụ quét Thư mục Thư viện, phân nhóm và tự lưu nháp Editor (Giai đoạn 6).

// Suy ra nhóm (thư mục con) từ đường dẫn tương đối trong Thư viện
// Ví dụ: 'LPIC/101/linux.sdeck' -> 'LPIC/101'
//        'English/IELTS/vocab.sdeck' -> 'English/IELTS'
//        'basics.sdeck' -> ''
export function inferGroup(relPath) {
  if (typeof relPath !== 'string') return '';
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const lastSlash = normalized.lastIndexOf('/');
  if (lastSlash === -1) return '';
  return normalized.slice(0, lastSlash);
}

// Làm sạch draftId từ meta.id: chỉ giữ [A-Za-z0-9._-]
export function sanitizeDraftId(metaId) {
  if (typeof metaId !== 'string') return 'draft';
  const clean = metaId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return clean || 'draft';
}

// Kiểm tra xem sự kiện đổi file có phải do chính app vừa ghi hay không
export function isSelfSaveEvent(file, mtimeMs, knownSavesMap, thresholdMs = 1500) {
  if (!file || !knownSavesMap) return false;
  const lastSaveTime = knownSavesMap.get(file);
  if (!lastSaveTime) return false;
  if (Math.abs(mtimeMs - lastSaveTime) <= thresholdMs) {
    return true;
  }
  return false;
}

