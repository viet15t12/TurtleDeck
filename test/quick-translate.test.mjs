// test/quick-translate.test.mjs — Unit tests cho module dịch nhanh Google Translate

import test from 'node:test';
import assert from 'node:assert/strict';

import { translateText, clearTranslateCache } from '../src/core/translate/quick-translate.js';

test('translateText: trả về rỗng nếu chuỗi rỗng hoặc chỉ có khoảng trắng', async () => {
  clearTranslateCache();
  const res1 = await translateText('');
  const res2 = await translateText('   \n  ');
  assert.equal(res1, '');
  assert.equal(res2, '');
});

test('translateText: phân tích cú pháp kết quả từ Google Translate endpoint', async () => {
  clearTranslateCache();
  let calledUrl = '';
  const mockFetch = async (url) => {
    calledUrl = String(url);
    return {
      ok: true,
      json: async () => [
        [
          ['Thủ đô của nước Pháp là gì? ', 'What is the capital of France? ', null, null],
          ['Nó là Paris.', 'It is Paris.', null, null]
        ]
      ]
    };
  };

  const translated = await translateText('What is the capital of France? It is Paris.', {
    from: 'en',
    to: 'vi',
    fetcher: mockFetch
  });

  assert.equal(translated, 'Thủ đô của nước Pháp là gì? Nó là Paris.');
  assert.match(calledUrl, /translate\.googleapis\.com/);
  assert.match(calledUrl, /sl=en/);
  assert.match(calledUrl, /tl=vi/);
});

test('translateText: sử dụng in-memory cache cho các lần gọi lặp lại', async () => {
  clearTranslateCache();
  let fetchCount = 0;
  const mockFetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => [[['Xin chào', 'Hello', null, null]]]
    };
  };

  const res1 = await translateText('Hello', { fetcher: mockFetch });
  const res2 = await translateText('Hello', { fetcher: mockFetch });

  assert.equal(res1, 'Xin chào');
  assert.equal(res2, 'Xin chào');
  assert.equal(fetchCount, 1, 'Chỉ được gọi fetch 1 lần cho cùng 1 câu');
});

test('translateText: ném lỗi rõ ràng khi fetch thất bại', async () => {
  clearTranslateCache();
  const mockFailFetch = async () => {
    return {
      ok: false,
      status: 503,
      statusText: 'Service Unavailable'
    };
  };

  await assert.rejects(
    async () => {
      await translateText('Some query', { fetcher: mockFailFetch });
    },
    /503/
  );
});
