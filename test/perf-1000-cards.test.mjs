// test/perf-1000-cards.test.mjs — Kiểm tra hiệu năng với gói 1000 thẻ và 200 ảnh
import test from 'node:test';
import assert from 'node:assert/strict';
import { writePackage, readPackage } from '../src/core/sdeck.js';
import { validateDeck } from '../src/core/validate.js';
import { deckStats } from '../src/core/deckstats.js';
import { buildSessionQuestions } from '../src/core/builder.js';

test('hiệu năng: gói 1,000 thẻ + 200 ảnh (đóng gói, mở gói, thống kê, tạo câu hỏi < 1s)', async () => {
  // 1. Tạo 1 ảnh PNG 1x1 chuẩn (68 bytes)
  const png1x1 = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, // IEND chunk
    0x42, 0x60, 0x82,
  ]);

  // 2. Tạo assets map với 200 ảnh
  const assets = new Map();
  for (let i = 0; i < 200; i++) {
    assets.set(`img/photo_${i}.png`, png1x1);
  }

  // 3. Tạo 1,000 thẻ (đa dạng loại: card, vocab, single, fill)
  const items = [];
  for (let i = 0; i < 1000; i++) {
    const imgRef = i < 200 ? `![Ảnh](img/photo_${i}.png)` : '';
    const formulaRef = i % 5 === 0 ? ` $E = mc^2$ ` : '';
    if (i % 4 === 0) {
      items.push({
        id: `card_${i}`,
        type: 'card',
        front: `Mặt trước câu hỏi số ${i}: ${formulaRef} ${imgRef}`,
        back: `Mặt sau đáp án số ${i}`,
        topic: `Chủ đề ${i % 10}`,
        tags: [`tag_${i % 5}`],
      });
    } else if (i % 4 === 1) {
      items.push({
        id: `single_${i}`,
        type: 'single',
        prompt: `Câu hỏi trắc nghiệm số ${i}? ${imgRef}`,
        choices: ['Lựa chọn A', 'Lựa chọn B', 'Lựa chọn C', 'Lựa chọn D'],
        answer: 0,
        explanation: 'Giải thích chi tiết đáp án A',
      });
    } else if (i % 4 === 2) {
      items.push({
        id: `fill_${i}`,
        type: 'fill',
        prompt: `Điền vào chỗ trống số ${i}: [___] ${imgRef}`,
        answers: [`đáp án ${i}`],
      });
    } else {
      items.push({
        id: `vocab_${i}`,
        type: 'vocab',
        term: `Từ vựng ${i}`,
        definition: `Định nghĩa từ vựng ${i} trong từ điển ${imgRef}`,
        example: `Ví dụ câu chứa Từ vựng ${i} thực tế`,
      });
    }
  }

  const deck = {
    meta: {
      id: 'perf_deck_1000',
      title: 'Bộ thẻ kiểm tra hiệu năng 1000 thẻ',
      kind: 'quiz',
    },
    items,
  };

  // 4. Đo thời gian đóng gói
  const tPack0 = performance.now();
  const packRes = writePackage(JSON.stringify(deck), assets);
  const packTime = performance.now() - tPack0;

  assert.ok(packRes.ok, `writePackage phải thành công: ${packRes.error}`);
  const packedBytes = packRes.bytes;
  assert.ok(packedBytes.length > 0, 'Gói byte không được rỗng');
  console.log(`[Perf] Thời gian packDeck (1,000 thẻ + 200 ảnh): ${packTime.toFixed(2)}ms`);

  // 5. Đo thời gian đọc và mở gói
  const tRead0 = performance.now();
  const res = readPackage(packedBytes);
  const readTime = performance.now() - tRead0;

  assert.ok(res.ok, 'readPackage phải thành công');
  assert.equal(res.assets.size, 200, 'Phải khôi phục đủ 200 ảnh');
  console.log(`[Perf] Thời gian readPackage (mở gói 1,000 thẻ + 200 ảnh): ${readTime.toFixed(2)}ms`);

  // Tiêu chí: Mở gói < 1,000ms
  assert.ok(readTime < 1000, `readPackage mất ${readTime}ms, vượt quá ngưỡng 1000ms`);

  // 6. Đo thời gian validate bộ thẻ 1,000 thẻ
  const tVal0 = performance.now();
  const valRes = validateDeck(deck);
  const valTime = performance.now() - tVal0;
  assert.equal(valRes.errors.length, 0, `validateDeck không được có lỗi: ${valRes.errors.join(', ')}`);
  console.log(`[Perf] Thời gian validateDeck (1,000 thẻ): ${valTime.toFixed(2)}ms`);
  assert.ok(valTime < 500, `validateDeck mất ${valTime}ms, vượt quá 500ms`);

  // 7. Đo thời gian thống kê deckStats
  const tStats0 = performance.now();
  const stats = deckStats(deck, { cards: {}, log: [] });
  const statsTime = performance.now() - tStats0;
  assert.equal(stats.new, 500, '500 câu hỏi trắc nghiệm/điền từ mới được phân loại đúng');
  console.log(`[Perf] Thời gian deckStats (1,000 thẻ): ${statsTime.toFixed(2)}ms`);
  assert.ok(statsTime < 500, `deckStats mất ${statsTime}ms, vượt quá 500ms`);

  // 8. Đo thời gian tạo câu hỏi phiên học (buildSessionQuestions)
  const tSess0 = performance.now();
  const questions = buildSessionQuestions(deck.items, { count: 100, mode: 'random' });
  const sessTime = performance.now() - tSess0;
  assert.equal(questions.length, 100);
  console.log(`[Perf] Thời gian buildSessionQuestions (100/1000 thẻ): ${sessTime.toFixed(2)}ms`);
  assert.ok(sessTime < 100, `buildSessionQuestions mất ${sessTime}ms, vượt quá 100ms`);

  const totalCycleTime = packTime + readTime + valTime + statsTime + sessTime;
  console.log(`[Perf] Tổng chu kỳ xử lý 1,000 thẻ + 200 ảnh: ${totalCycleTime.toFixed(2)}ms`);
  assert.ok(totalCycleTime < 2500, `Tổng thời gian quá lớn: ${totalCycleTime}ms`);
});
