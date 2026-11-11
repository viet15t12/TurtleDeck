// src/core/translate/quick-translate.ts — Dịch nhanh văn bản bằng Google Translate endpoint công khai

export interface TranslateOptions {
  from?: string; // Mặc định 'auto'
  to?: string;   // Mặc định 'vi'
  fetcher?: typeof fetch;
}

// In-memory cache cho các câu đã dịch trong phiên
const translationCache = new Map<string, string>();

/**
 * Xóa cache dịch
 */
export function clearTranslateCache(): void {
  translationCache.clear();
}

/**
 * Dịch văn bản sang ngôn ngữ đích (mặc định là tiếng Việt)
 */
export async function translateText(text: string, options: TranslateOptions = {}): Promise<string> {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return '';
  }

  const from = options.from || 'auto';
  const to = options.to || 'vi';
  const fetchFn = options.fetcher || (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);

  const cacheKey = `${from}:${to}:${trimmed}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(
    from
  )}&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(trimmed)}`;

  const res = await fetchFn(url);
  if (!res.ok) {
    throw new Error(`Google Translate API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  // Cấu trúc data: [[ [translated_part, source_part, ...], ... ], null, detected_lang, ...]
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Dữ liệu trả về từ Google Translate không đúng định dạng');
  }

  const translatedText = data[0]
    .map((chunk: any) => (Array.isArray(chunk) && chunk[0] ? String(chunk[0]) : ''))
    .join('');

  translationCache.set(cacheKey, translatedText);
  return translatedText;
}
