// test/ttsvoice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickVoice } from '../src/core/ttsvoice.js';

test('pickVoice: chọn giọng khớp chính xác, khớp họ ngôn ngữ, hoặc null', () => {
  const voices = [
    { name: 'Google US English', lang: 'en-US' },
    { name: 'Google UK English Female', lang: 'en-GB' },
    { name: 'Google Tiếng Việt', lang: 'vi-VN' },
    { name: 'French Voice', lang: 'fr-FR' },
  ];

  // 1. Khớp chính xác en-US
  const v1 = pickVoice(voices, 'en-US');
  assert.equal(v1?.name, 'Google US English');

  // 2. Khớp chính xác en-GB
  const v2 = pickVoice(voices, 'en-GB');
  assert.equal(v2?.name, 'Google UK English Female');

  // 3. Khớp cùng họ ngôn ngữ khi không có chính xác (vd tìm en-AU nhưng chỉ có en-US và en-GB)
  const v3 = pickVoice(voices, 'en-AU');
  assert.ok(v3 && v3.lang.startsWith('en-'));

  // 4. Ngôn ngữ không có -> null
  const v4 = pickVoice(voices, 'ja-JP');
  assert.equal(v4, null);

  // 5. Ưu tiên preferredVoiceName nếu có và còn tồn tại
  const v5 = pickVoice(voices, 'en-US', 'Google UK English Female');
  assert.equal(v5?.name, 'Google UK English Female');

  // 6. Danh sách rỗng hoặc không hợp lệ -> null
  assert.equal(pickVoice([], 'en-US'), null);
  assert.equal(pickVoice(null, 'en-US'), null);
});

