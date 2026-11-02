import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck, parseImport } from '../src/core/parser.js';
import fs from 'node:fs';

const good = {
  meta: { id: 'lpic-101', title: 'LPIC-1 101', kind: 'quiz' },
  items: [
    { id: '1', type: 'single', question: 'Q1', choices: ['a', 'b'], answer: [1] },
    { id: '2', type: 'command', question: 'Q2', answer: ['rpm -qa'] },
    { id: '3', type: 'card', front: 'F', back: 'B' },
  ],
};

test('deck hợp lệ (cảnh báo nhẹ nếu có mục lệch loại, không bỏ qua mục)', () => {
  const r = parseDeck(JSON.stringify(good));
  assert.equal(r.ok, true);
  assert.equal(r.deck.items.length, 3);
  assert.equal(r.total, 3);
  assert.equal(r.skipped, 0);
  // Bộ good có kind = 'quiz' nhưng mục #3 là 'card' -> 1 cảnh báo nhẹ mismatch
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].level, 'warn');
  assert.equal(r.issues[0].mismatch, true);
  assert.match(r.issues[0].msg, /1 mục dạng Thẻ nằm trong bộ Đề luyện thi/);
  assert.equal(r.deck.meta.title, 'LPIC-1 101');
});

test('GĐ3B: thiếu hoặc lạ meta.kind -> tự suy ra bằng inferKind, không báo lỗi; giữ meta.description', () => {
  const qaNoKind = {
    meta: { id: 'qa-1', title: 'Bộ thẻ nhớ', description: 'Ôn công thức giải tích' },
    items: [
      { id: '1', type: 'card', front: 'Mặt trước', back: 'Mặt sau' },
    ],
  };
  const r1 = parseDeck(JSON.stringify(qaNoKind));
  assert.equal(r1.ok, true);
  assert.equal(r1.deck.meta.kind, 'qa');
  assert.equal(r1.deck.meta.description, 'Ôn công thức giải tích');
  assert.deepEqual(r1.issues, []);

  const quizWeirdKind = {
    meta: { id: 'qz-1', title: 'Bộ trắc nghiệm', kind: 'unknown-kind' },
    items: [
      { id: '1', type: 'single', question: '1+1?', choices: ['1', '2'], answer: [1] },
    ],
  };
  const r2 = parseDeck(JSON.stringify(quizWeirdKind));
  assert.equal(r2.ok, true);
  assert.equal(r2.deck.meta.kind, 'quiz');
  assert.deepEqual(r2.issues, []);
});

test('JSON hỏng → ok:false, thông báo có dòng/cột', () => {
  const r = parseDeck('{\n  "meta": { "id": "x" },\n  "items": [ { "id": "1", } ]\n}');
  assert.equal(r.ok, false);
  assert.match(r.error, /deck\.json bị hỏng/);
  assert.match(r.error, /dòng 3/);
  assert.equal(r.issues[0].level, 'error');
});

test('JSON hỏng do \\ của LaTeX chưa escape → nhắc viết \\\\', () => {
  const r = parseDeck('{"meta":{"id":"x"},"items":[{"id":"1","type":"card","front":"$\\int x$","back":"b"}]}');
  assert.equal(r.ok, false);
  assert.match(r.error, /\\\\frac/);
});

test('deckText rỗng / không phải chuỗi / không phải object', () => {
  assert.equal(parseDeck('').ok, false);
  assert.equal(parseDeck(undefined).ok, false);
  assert.match(parseDeck('[1,2]').error, /không phải đối tượng/);
  assert.match(parseDeck('null').error, /không phải đối tượng/);
});

test('thiếu meta.id / items → ok:false', () => {
  assert.match(parseDeck(JSON.stringify({ meta: {}, items: [] })).error, /meta\.id/);
  assert.match(parseDeck(JSON.stringify({ meta: { id: 'x' } })).error, /items/);
});

test('id item trùng → ok:false, nêu rõ id', () => {
  const d = structuredClone(good);
  d.items[2].id = '1';
  const r = parseDeck(JSON.stringify(d));
  assert.equal(r.ok, false);
  assert.match(r.error, /Trùng id "1"/);
});

test('formatVersion cao hơn app biết → ok:false', () => {
  const r = parseDeck(JSON.stringify({ ...good, meta: { ...good.meta, format: 'studydeck', formatVersion: 9 } }));
  assert.equal(r.ok, false);
  assert.match(r.error, /bản app mới hơn/);
});

test('item lỗi bị bỏ qua và liệt kê kèm id + lý do; item khác vẫn học được', () => {
  const d = structuredClone(good);
  d.items.push(
    { id: 'bad-1', type: 'single', question: 'Q', choices: ['a', 'b'], answer: [5] },
    { id: 'bad-2', type: 'card', front: 'chỉ có mặt trước' },
    { type: 'fill', question: 'không id', answer: ['x'] },
    'không phải object',
  );
  const r = parseDeck(JSON.stringify(d));
  assert.equal(r.ok, true);
  assert.deepEqual(r.deck.items.map(i => i.id), ['1', '2', '3']);
  assert.equal(r.total, 7);
  assert.equal(r.skipped, 4);
  const skipped = r.issues.filter(i => i.skipped);
  assert.equal(skipped.length, 4);
  assert.equal(skipped[0].itemId, 'bad-1');
  assert.match(skipped[0].msg, /bad-1.*ngoài danh sách lựa chọn/);
  assert.match(skipped[1].msg, /bad-2.*mặt sau/);
  assert.equal(skipped[2].itemId, null);
  assert.match(skipped[2].msg, /thứ 6.*id/);
  assert.equal(skipped[3].index, 6);
});

test('JSON có \\\\frac giữ đúng \\frac; BOM được bỏ', () => {
  const d = { meta: { id: 'm' }, items: [{ id: '1', type: 'card', front: 'Phân số', back: '$\\frac{1}{2}$' }] };
  const r = parseDeck('\uFEFF' + JSON.stringify(d));
  assert.equal(r.ok, true);
  assert.equal(r.deck.items[0].back, '$\\frac{1}{2}$');
});

test('meta mặc định: title = id, kind suy ra (vocab nếu toàn từ vựng)', () => {
  const v = parseDeck(JSON.stringify({ meta: { id: 'eng' }, items: [{ id: 'w1', term: 'a', definition: 'b' }] }));
  assert.equal(v.ok, true);
  assert.equal(v.deck.meta.title, 'eng');
  assert.equal(v.deck.meta.kind, 'vocab');
  assert.ok(v.issues.some(i => i.level === 'warn' && /tiêu đề/.test(i.msg)));
  const q = parseDeck(JSON.stringify({ meta: { id: 'q' }, items: good.items }));
  assert.equal(q.deck.meta.kind, 'quiz');
});

test('không sửa đối tượng đầu vào / giữ trường lạ của item', () => {
  const d = structuredClone(good);
  d.items[0].note = 'giữ lại';
  const r = parseDeck(JSON.stringify(d));
  assert.equal(r.deck.items[0].note, 'giữ lại');
});

test('GĐ2B: duyệt ảnh tham chiếu, cảnh báo ảnh thiếu/sai đuôi/quá 5MB mà không chặn nạp deck', () => {
  const deckWithImages = {
    meta: { id: 'math-img', title: 'Math with images' },
    items: [
      {
        id: '1',
        type: 'single',
        question: 'Xem hình: ![Đồ thị](img/graph.svg)',
        choices: [
          { text: 'A', image: 'img/choice_a.png' },
          { text: 'B', image: 'img/choice_b.badext' },
        ],
        answer: [0],
        answerImage: 'img/ans.jpg',
      },
    ],
  };

  const assets = new Map([
    ['img/graph.svg', new Uint8Array([1, 2, 3])],
    ['img/choice_a.png', new Uint8Array([4, 5, 6])],
    // img/ans.jpg bị thiếu trong assets
    // img/huge.png quá 5 MB
  ]);

  const r = parseDeck(JSON.stringify(deckWithImages), { assets });
  assert.equal(r.ok, true);
  assert.equal(r.deck.items.length, 1); // Item VẪN được nạp!

  // Cảnh báo đuôi sai
  assert.ok(r.issues.some(i => i.level === 'warn' && /định dạng không được hỗ trợ/i.test(i.msg)));
  // Cảnh báo ảnh thiếu
  assert.ok(r.issues.some(i => i.level === 'warn' && /không tìm thấy ảnh "img\/ans\.jpg"/i.test(i.msg)));
});

// ── Tests cho parseImport (Giai đoạn 4) ────────────────────────────────────

test('parseImport: TSV 100 từ vựng hợp lệ', () => {
  const content = fs.readFileSync('test/fixtures/vocab-100.tsv', 'utf8');
  const res = parseImport(content);
  assert.equal(res.ok, true);
  assert.equal(res.format, 'tsv');
  assert.equal(res.items.length, 100);
  assert.equal(res.items[0].term, 'word_001');
  assert.equal(res.items[0].pos, 'verb');
  assert.deepEqual(res.items[0].forms, ['word_001s', 'word_001ed']);
  assert.match(res.items[0].id, /^w-[a-f0-9]{10}$/);
});

test('parseImport: CSV phức tạp (BOM, CRLF, nháy kép, phẩy trong ô, dòng trống, dedupe)', () => {
  const content = fs.readFileSync('test/fixtures/complex.csv', 'utf8');
  const res = parseImport(content);
  assert.equal(res.ok, true);
  assert.equal(res.format, 'csv');
  // 4 mục hợp lệ (mitigate, complex, multiline, dedupe) - dòng "Dedupe" thứ hai bị dedupe
  assert.equal(res.items.length, 4);

  // Ô có dấu phẩy và nháy kép
  const complexItem = res.items.find(i => i.term === 'complex, term');
  assert.ok(complexItem);
  assert.equal(complexItem.definition, 'định nghĩa có "dấu nháy kép" và dấu phẩy,');
  assert.match(complexItem.example, /Line 1\r?\nLine 2/);

  // Multiline trong ô
  const multilineItem = res.items.find(i => i.term === 'multiline');
  assert.ok(multilineItem);
  assert.match(multilineItem.definition, /Dòng 1 nghĩa\r?\nDòng 2 nghĩa/);

  // Cảnh báo trùng từ (dedupe vs Dedupe)
  assert.ok(res.issues.some(i => i.level === 'warn' && /trùng trong lần nhập này/i.test(i.msg)));
});

test('parseImport: Quizlet với dấu phân cách tuỳ ý (cardSep = ;;;, termSep = " - ")', () => {
  const content = fs.readFileSync('test/fixtures/quizlet-custom.txt', 'utf8');
  const res = parseImport(content, { format: 'quizlet', cardSep: ';;;', termSep: ' - ' });
  assert.equal(res.ok, true);
  assert.equal(res.format, 'quizlet');
  assert.equal(res.items.length, 3);
  assert.equal(res.items[0].term, 'ubiquitous');
  assert.match(res.items[0].definition, /phổ biến/);
  assert.equal(res.items[1].term, 'ephemeral');
  assert.match(res.items[1].definition, /sớm nở tối tàn\r?\n\(tồn tại trong thời gian ngắn\)/);
});

test('parseImport: Markdown vocab (## term | definition + - key: value)', () => {
  const content = fs.readFileSync('test/fixtures/vocab-sample.md', 'utf8');
  const res = parseImport(content);
  assert.equal(res.ok, true);
  assert.equal(res.format, 'md-vocab');
  assert.equal(res.items.length, 2);

  const it1 = res.items[0];
  assert.equal(it1.term, 'mitigate');
  assert.equal(it1.definition, 'giảm nhẹ, làm dịu');
  assert.equal(it1.pos, 'verb');
  assert.deepEqual(it1.forms, ['mitigates', 'mitigated', 'mitigating']);
  assert.deepEqual(it1.tags, ['ielts', 'environment']);

  const it2 = res.items[1];
  assert.equal(it2.term, 'resilient');
  assert.equal(it2.pos, 'adjective');
  assert.deepEqual(it2.synonyms, ['tough', 'strong']);
});

test('parseImport: Markdown quiz có LaTeX nguyên vẹn, choices, answer, tolerance', () => {
  const content = fs.readFileSync('test/fixtures/quiz-latex.md', 'utf8');
  const res = parseImport(content);
  assert.equal(res.ok, true);
  assert.equal(res.format, 'md-quiz');
  assert.equal(res.items.length, 2);

  const q1 = res.items[0];
  assert.equal(q1.id, 'm-001');
  assert.equal(q1.type, 'single');
  assert.ok(q1.question.includes('$\\int_0^1 x^2\\,dx$'));
  assert.deepEqual(q1.answer, [1]); // lựa chọn thứ 2 được đánh dấu [x]
  assert.equal(q1.choices[1], '$\\frac{1}{3}$');
  assert.ok(q1.explanation.includes('\\left[\\frac{x^3}{3}\\right]'));

  const q2 = res.items[1];
  assert.equal(q2.id, 'm-002');
  assert.equal(q2.type, 'fill');
  assert.deepEqual(q2.answer, ['1.414', '1,414']);
  assert.equal(q2.match, 'number');
  assert.equal(q2.tolerance, 0.001);
});

test('parseImport: các ca lỗi và cảnh báo (ô thiếu, thừa, ảnh thiếu nguồn, audio bị bỏ qua)', () => {
  // Cột audio bị bỏ qua và có cảnh báo
  const withAudio = 'term\tdefinition\taudio\napple\tquả táo\taudio/apple.mp3';
  const rAudio = parseImport(withAudio, { format: 'tsv' });
  assert.equal(rAudio.items.length, 1);
  assert.ok(rAudio.issues.some(i => i.level === 'warn' && /chưa hỗ trợ audio/i.test(i.msg)));

  // Cột image khi không có sourceDir (dán văn bản) -> cảnh báo
  const withImg = 'term\tdefinition\timage\napple\tquả táo\timg/apple.png';
  const rImg = parseImport(withImg, { format: 'tsv', hasSourceDir: false });
  assert.equal(rImg.items.length, 1);
  assert.ok(rImg.issues.some(i => i.level === 'warn' && /cần nhập từ file để lấy ảnh/i.test(i.msg)));

  // Ô thiếu nghĩa
  const missingDef = 'term\tdefinition\ncat\t\ndog\tchó';
  const rDef = parseImport(missingDef, { format: 'tsv' });
  assert.equal(rDef.items.length, 1);
  assert.equal(rDef.items[0].term, 'dog');
  assert.ok(rDef.issues.some(i => i.level === 'error' && /thiếu nghĩa/i.test(i.msg)));

  // Ô lệch số lượng so với header
  const uneven = 'term\tdefinition\tphonetic\nfish\tcá\t/fɪʃ/\tthừa ô';
  const rUneven = parseImport(uneven, { format: 'tsv' });
  assert.equal(rUneven.items.length, 1);
  assert.ok(rUneven.issues.some(i => i.level === 'warn' && /ô/i.test(i.msg)));

  // Dạng card trong md quiz bị báo lỗi
  const mdQuizCard = '## Q c-001 | card\nFront\nBack';
  const rCard = parseImport(mdQuizCard, { format: 'md-quiz' });
  assert.equal(rCard.items.length, 0);
  assert.ok(rCard.issues.some(i => i.level === 'error' && /chưa được hỗ trợ/i.test(i.msg)));

  // Văn bản quá 5 MB
  const hugeText = 'a'.repeat(6 * 1024 * 1024);
  const rHuge = parseImport(hugeText);
  assert.equal(rHuge.ok, false);
  assert.ok(rHuge.issues.some(i => i.level === 'error' && /vượt quá giới hạn/i.test(i.msg)));
});



