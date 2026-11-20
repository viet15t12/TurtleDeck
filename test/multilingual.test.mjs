import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getDeckLanguages,
  getPrimaryLanguage,
  hasMultiLanguageFeature,
  getItemForLanguage,
} from '../src/core/deckmodel.js';
import {
  buildQuestion,
  buildSessionQuestions,
  applyQuestionSpacing,
} from '../src/core/builder.js';
import {
  validateDeck,
  validateItem,
} from '../src/core/validate.js';
import {
  writePackage,
  readPackage,
} from '../src/core/sdeck.js';
import {
  planSession,
  deckDueCounts,
} from '../src/core/planner.js';
import { cardKey } from '../src/core/srs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper tạo item trắc nghiệm
function makeItem(id, overrides = {}) {
  return {
    id,
    type: 'single',
    question: `Question in English for ${id}?`,
    choices: ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
    answer: [0],
    explanation: `Explanation for ${id}`,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TEST 1: Tương thích ngược với file mẫu hiện có (formatVersion 1, lang string)
// ---------------------------------------------------------------------------
test('Test 1: Tương thích ngược với file mẫu hiện có (sample.json)', async () => {
  const samplePath = path.resolve(__dirname, '../templates/sample.json');
  const rawText = await fs.readFile(samplePath, 'utf8');
  const sampleDeck = JSON.parse(rawText);

  // 1. Kiểm tra ngôn ngữ và tính năng đa ngôn ngữ
  assert.deepEqual(getDeckLanguages(sampleDeck), ['vi']);
  assert.equal(getPrimaryLanguage(sampleDeck), 'vi');
  assert.equal(hasMultiLanguageFeature(sampleDeck), false);

  // 2. Validate không có lỗi
  const vResult = validateDeck(sampleDeck);
  assert.equal(vResult.errors.length, 0);

  // 3. Đóng gói và giải nén round-trip: formatVersion và lang giữ nguyên
  const assets = new Map();
  const pkg = writePackage(JSON.stringify(sampleDeck), assets);
  assert.equal(pkg.ok, true);

  const unpacked = readPackage(pkg.bytes);
  assert.equal(unpacked.ok, true);
  const unpackedDeck = JSON.parse(unpacked.deckText);

  assert.equal(unpackedDeck.meta.formatVersion, 1);
  assert.equal(typeof unpackedDeck.meta.lang, 'string');
  assert.equal(unpackedDeck.meta.lang, 'vi');

  // 4. Bỏ qua / chịu được trường lạ (unknown fields) mà không báo lỗi
  const deckWithUnknownFields = {
    ...sampleDeck,
    meta: {
      ...sampleDeck.meta,
      unknownMetaField: 'should be ignored safely',
    },
    items: sampleDeck.items.map(it => ({
      ...it,
      customProperty123: [1, 2, 3],
    })),
  };
  const vResultUnknown = validateDeck(deckWithUnknownFields);
  assert.equal(vResultUnknown.errors.length, 0);

  // Gói lại bảo toàn các trường lạ
  const pkgUnknown = writePackage(JSON.stringify(deckWithUnknownFields), assets);
  const readBackUnknown = JSON.parse(readPackage(pkgUnknown.bytes).deckText);
  assert.equal(readBackUnknown.meta.unknownMetaField, 'should be ignored safely');
  assert.deepEqual(readBackUnknown.items[0].customProperty123, [1, 2, 3]);
});

// ---------------------------------------------------------------------------
// TEST 2: Bộ thẻ 100 câu EN, trong đó 20 câu có bản VI
// - Chỉ EN -> 100 thẻ
// - Chỉ VI -> 20 thẻ
// - EN + VI -> 120 thẻ
// ---------------------------------------------------------------------------
test('Test 2: Bộ thẻ 100 câu EN + 20 câu có VI: số lượng thẻ và nội dung theo ngôn ngữ chọn', () => {
  const items = [];
  for (let i = 1; i <= 100; i++) {
    const id = `q-${String(i).padStart(3, '0')}`;
    const item = makeItem(id, {
      question: `English question ${i}?`,
      explanation: `English explanation ${i}`,
    });
    // 20 câu đầu có thêm bản dịch tiếng Việt
    if (i <= 20) {
      item.translations = {
        vi: {
          question: `Câu hỏi tiếng Việt ${i}?`,
          explanation: `Giải thích tiếng Việt ${i}`,
        },
      };
    }
    items.push(item);
  }

  const deck = {
    meta: {
      id: 'deck-en-vi-100',
      title: '100 EN + 20 VI Deck',
      lang: ['en', 'vi'],
      format: 'studydeck',
      formatVersion: 2,
    },
    items,
  };

  assert.deepEqual(getDeckLanguages(deck), ['en', 'vi']);
  assert.equal(getPrimaryLanguage(deck), 'en');
  assert.equal(hasMultiLanguageFeature(deck), true);

  // Kịch bản A: Chỉ EN -> 100 câu
  const enQuestions = buildSessionQuestions(deck.items, { selectedLangs: ['en'], deck });
  assert.equal(enQuestions.length, 100);
  assert.ok(enQuestions.every(q => q.lang === 'en'));
  assert.equal(enQuestions[0].prompt, 'English question 1?');
  assert.equal(enQuestions[0].id, 'q-001');

  // Kịch bản B: Chỉ VI -> 20 câu (chỉ những câu có bản VI)
  const viQuestions = buildSessionQuestions(deck.items, { selectedLangs: ['vi'], deck });
  assert.equal(viQuestions.length, 20);
  assert.ok(viQuestions.every(q => q.lang === 'vi'));
  assert.equal(viQuestions[0].prompt, 'Câu hỏi tiếng Việt 1?');
  assert.equal(viQuestions[0].id, 'q-001@vi');
  assert.equal(viQuestions[0].itemId, 'q-001');
  assert.equal(viQuestions[0].rootId, 'q-001');

  // Kịch bản C: EN + VI -> 120 thẻ (câu nào có cả hai thì thêm cả hai bản, câu chỉ EN thì chỉ bản EN)
  const allQuestions = buildSessionQuestions(deck.items, { selectedLangs: ['en', 'vi'], deck });
  assert.equal(allQuestions.length, 120);

  const enInAll = allQuestions.filter(q => q.lang === 'en');
  const viInAll = allQuestions.filter(q => q.lang === 'vi');
  assert.equal(enInAll.length, 100);
  assert.equal(viInAll.length, 20);

  // Kiểm tra counts trong deckDueCounts
  const countsEN = deckDueCounts(deck, { version: 1, cards: {} }, Date.now(), { selectedLangs: ['en'] });
  assert.equal(countsEN.total, 100);

  const countsVI = deckDueCounts(deck, { version: 1, cards: {} }, Date.now(), { selectedLangs: ['vi'] });
  assert.equal(countsVI.total, 20);

  const countsAll = deckDueCounts(deck, { version: 1, cards: {} }, Date.now(), { selectedLangs: ['en', 'vi'] });
  assert.equal(countsAll.total, 120);
});

// ---------------------------------------------------------------------------
// TEST 3: Dạng "translate" là ngôn ngữ-trung-lập, luôn xuất hiện ở mọi lựa chọn
// ---------------------------------------------------------------------------
test('Test 3: Dạng "translate" là ngôn ngữ-trung-lập, luôn xuất hiện ở mọi lựa chọn', () => {
  const deck = {
    meta: {
      id: 'deck-translate-test',
      lang: ['en', 'vi'],
    },
    items: [
      makeItem('item-en-only', { question: 'EN only question' }),
      makeItem('item-en-vi', {
        question: 'EN question',
        translations: { vi: { question: 'VI question' } },
      }),
      {
        id: 'tr-01',
        type: 'translate',
        vi: 'Tôi đã ngăn anh ấy bỏ cuộc.',
        keyword: 'prevent',
        pos: 'v',
        pattern: 'prevent\\s+\\w+\\s+from\\s+\\w+ing',
        answers: ['I prevented him from giving up.'],
        explanation: 'prevent someone from doing something',
      },
    ],
  };

  // 1. Chỉ chọn EN: gồm item-en-only, item-en-vi (bản EN), và tr-01 -> tổng 3
  const qEN = buildSessionQuestions(deck.items, { selectedLangs: ['en'], deck });
  assert.equal(qEN.length, 3);
  assert.ok(qEN.some(q => q.id === 'tr-01'));
  const trCardEN = qEN.find(q => q.id === 'tr-01');
  assert.equal(trCardEN.kind, 'translate');
  assert.equal(trCardEN.id, 'tr-01'); // id không bị gắn @en hay @vi

  // 2. Chỉ chọn VI: gồm item-en-vi (bản VI) và tr-01 -> tổng 2
  const qVI = buildSessionQuestions(deck.items, { selectedLangs: ['vi'], deck });
  assert.equal(qVI.length, 2);
  assert.ok(qVI.some(q => q.id === 'tr-01'));
  const trCardVI = qVI.find(q => q.id === 'tr-01');
  assert.equal(trCardVI.id, 'tr-01');

  // 3. Chọn cả EN + VI: gồm 2 bản EN + 1 bản VI + tr-01 xuất hiện ĐÚNG 1 LẦN -> tổng 4
  const qBoth = buildSessionQuestions(deck.items, { selectedLangs: ['en', 'vi'], deck });
  assert.equal(qBoth.length, 4);
  const trMatches = qBoth.filter(q => q.id === 'tr-01');
  assert.equal(trMatches.length, 1);
});

// ---------------------------------------------------------------------------
// TEST 4: Thêm/bỏ ngôn ngữ giữa phiên học (Dynamic language toggle)
// ---------------------------------------------------------------------------
test('Test 4: Thêm và bỏ ngôn ngữ giữa phiên học bảo toàn câu đã trả lời và điểm số', () => {
  const items = [
    makeItem('q1', { translations: { vi: { question: 'Câu 1 VI' } } }),
    makeItem('q2', { translations: { vi: { question: 'Câu 2 VI' } } }),
    makeItem('q3', { translations: { vi: { question: 'Câu 3 VI' } } }),
    makeItem('q4'), // chỉ EN
    makeItem('q5', { translations: { vi: { question: 'Câu 5 VI' } } }),
  ];

  const deck = {
    meta: { id: 'd-toggle', lang: ['en', 'vi'] },
    items,
  };

  // Khởi tạo phiên chỉ với EN -> 5 câu
  const initialQuestions = buildSessionQuestions(deck.items, { selectedLangs: ['en'], deck });
  assert.equal(initialQuestions.length, 5);

  const session = {
    questions: [...initialQuestions],
    index: 0,
    history: [],
  };

  // Giả lập người học đã làm xong câu đầu tiên (q1)
  session.history.push({
    question: session.questions[0],
    userAnswer: 0,
    isCorrect: true,
  });
  session.index = 1; // Đang ở câu thứ 2 (q2)

  // THÊM NGÔN NGỮ 'vi' VÀO PHIÊN
  let activeLangs = ['en'];
  const l = 'vi';
  activeLangs.push(l);

  const answeredCardIds = new Set(session.history.map(h => h.question?.id));
  const currentCardIds = new Set(session.questions.map(q => q.id));
  const newQuestions = [];
  for (const item of deck.items) {
    if (item.type === 'translate') continue;
    const itL = getItemForLanguage(item, l, 'en');
    if (itL && !answeredCardIds.has(itL.cardId) && !currentCardIds.has(itL.cardId)) {
      const q = buildQuestion(itL);
      if (q) {
        q.id = itL.cardId;
        q.itemId = item.id;
        q.rootId = item.id;
        q.lang = l;
        newQuestions.push(q);
      }
    }
  }
  assert.equal(newQuestions.length, 4); // q1@vi, q2@vi, q3@vi, q5@vi

  const answered = session.questions.slice(0, session.index + 1);
  const remaining = session.questions.slice(session.index + 1).concat(newQuestions);
  const spaced = applyQuestionSpacing(remaining, 5);
  session.questions = answered.concat(spaced);

  // Tổng số câu hiện tại = 2 (đã duyệt đến index 1) + 3 câu EN còn lại + 4 câu VI mới = 9 câu
  assert.equal(session.questions.length, 9);
  // Câu đã trả lời ở history vẫn giữ nguyên
  assert.equal(session.history.length, 1);
  assert.equal(session.history[0].question.id, 'q1');
  assert.equal(session.history[0].isCorrect, true);

  // BỎ NGÔN NGỮ 'vi' KHỎI PHIÊN
  const lToRemove = 'vi';
  activeLangs = activeLangs.filter(x => x !== lToRemove);
  const answeredBefore = session.questions.slice(0, session.index + 1);
  const remainingFiltered = session.questions.slice(session.index + 1).filter(q => {
    if (q.kind === 'translate') return true;
    const qLang = (q.lang || 'en').toLowerCase();
    return qLang !== lToRemove;
  });
  session.questions = answeredBefore.concat(remainingFiltered);

  // Khi bỏ 'vi', các thẻ VI chưa học bị loại bỏ, quay về 5 câu EN ban đầu
  assert.equal(session.questions.length, 5);
  assert.ok(session.questions.slice(session.index + 1).every(q => q.lang === 'en'));
  assert.equal(session.history.length, 1);
  assert.equal(session.history[0].question.id, 'q1');
});

// ---------------------------------------------------------------------------
// TEST 5: Định danh thẻ SRS & Giữ nguyên tiến độ học cũ
// ---------------------------------------------------------------------------
test('Test 5: Định danh thẻ SRS: Thẻ chính giữ id, thẻ dịch id@lang, khớp tiến độ cũ', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const deck = {
    meta: { id: 'history-deck', lang: ['en', 'vi'] },
    items: [
      makeItem('mc_http_status', {
        translations: {
          vi: { question: 'Mã HTTP nào là Not Found?' },
        },
      }),
      makeItem('mc_tcp_udp'),
    ],
  };

  // Giả sử người học ĐÃ CÓ lịch sử học từ formatVersion 1 cho câu mc_http_status
  const progress = {
    version: 1,
    cards: {
      'history-deck:mc_http_status:fwd': {
        state: 'review',
        step: 0,
        ease: 2.6,
        interval: 10,
        due: now - 86400000, // quá hạn 1 ngày
        reps: 5,
        lapses: 0,
      },
    },
    meta: {},
    log: [],
  };

  // Lập kế hoạch phiên học với cả ['en', 'vi']
  const planned = planSession(deck, progress, now, { selectedLangs: ['en', 'vi'] });

  // 1. Thẻ chính phải có cardId = 'mc_http_status' và nhận đúng tiến độ review cũ (due)
  const primaryCard = planned.find(q => q.id === 'mc_http_status');
  assert.ok(primaryCard, 'Thẻ chính phải tồn tại với id = mc_http_status');
  assert.equal(primaryCard.category, 'due');
  assert.equal(primaryCard.card.interval, 10);
  assert.equal(primaryCard.card.reps, 5);

  // 2. Thẻ bản dịch phải có cardId = 'mc_http_status@vi' và được phân loại là new
  const viCard = planned.find(q => q.id === 'mc_http_status@vi');
  assert.ok(viCard, 'Thẻ bản dịch phải tồn tại với id = mc_http_status@vi');
  assert.equal(viCard.category, 'new');
  assert.equal(viCard.card.interval, 0);

  // 3. Khóa cardKey phải chuẩn hóa theo quy tắc
  assert.equal(cardKey('history-deck', primaryCard.id, 'fwd'), 'history-deck:mc_http_status:fwd');
  assert.equal(cardKey('history-deck', viCard.id, 'fwd'), 'history-deck:mc_http_status@vi:fwd');
});

// ---------------------------------------------------------------------------
// TEST 6: Thuật toán dãn cách câu hỏi (applyQuestionSpacing >= 5 thẻ)
// ---------------------------------------------------------------------------
test('Test 6: Thuật toán dãn cách không xếp hai bản của cùng một câu liền kề (cách >= 5)', () => {
  // Tạo danh sách câu hỏi trong đó cùng rootId nằm sát nhau lúc đầu
  const rawList = [
    { id: 'q1', rootId: 'q1', lang: 'en' },
    { id: 'q1@vi', rootId: 'q1', lang: 'vi' },
    { id: 'q2', rootId: 'q2', lang: 'en' },
    { id: 'q2@vi', rootId: 'q2', lang: 'vi' },
    { id: 'q3', rootId: 'q3', lang: 'en' },
    { id: 'q4', rootId: 'q4', lang: 'en' },
    { id: 'q5', rootId: 'q5', lang: 'en' },
    { id: 'q6', rootId: 'q6', lang: 'en' },
    { id: 'q7', rootId: 'q7', lang: 'en' },
    { id: 'q8', rootId: 'q8', lang: 'en' },
  ];

  const spaced = applyQuestionSpacing(rawList, 5);
  assert.equal(spaced.length, rawList.length);

  // 1. Không có hai câu nào cùng rootId đứng liền kề nhau
  for (let i = 0; i < spaced.length - 1; i++) {
    const curr = spaced[i].rootId;
    const next = spaced[i + 1].rootId;
    assert.notEqual(curr, next, `Câu ở vị trí ${i} và ${i + 1} không được cùng rootId "${curr}"`);
  }

  // 2. Khoảng cách giữa các bản của cùng một câu tối thiểu là 5 khi danh sách đủ dài
  const idxQ1_a = spaced.findIndex(q => q.id === 'q1');
  const idxQ1_b = spaced.findIndex(q => q.id === 'q1@vi');
  const distQ1 = Math.abs(idxQ1_a - idxQ1_b);
  assert.ok(distQ1 >= 5, `Khoảng cách giữa q1 và q1@vi phải >= 5, thực tế là ${distQ1}`);

  const idxQ2_a = spaced.findIndex(q => q.id === 'q2');
  const idxQ2_b = spaced.findIndex(q => q.id === 'q2@vi');
  const distQ2 = Math.abs(idxQ2_a - idxQ2_b);
  assert.ok(distQ2 >= 5, `Khoảng cách giữa q2 và q2@vi phải >= 5, thực tế là ${distQ2}`);
});

// ---------------------------------------------------------------------------
// TEST 7: Quy tắc kiểm tra (Validator) cho formatVersion 2
// ---------------------------------------------------------------------------
test('Test 7: Quy tắc kiểm tra Validator: cảnh báo ngôn ngữ chưa khai báo, lỗi lệch choices', () => {
  // 1. Cảnh báo khi translation dùng ngôn ngữ chưa khai báo trong meta.lang
  const deckUndeclaredLang = {
    meta: { id: 'd-val-1', lang: 'en' },
    items: [
      makeItem('it-1', {
        translations: {
          fr: { question: 'Question en français?' },
        },
      }),
    ],
  };
  const v1 = validateDeck(deckUndeclaredLang);
  assert.ok(
    v1.warnings.some(w => /chưa khai báo trong meta\.lang/.test(w)),
    'Phải cảnh báo khi dùng ngôn ngữ chưa khai báo'
  );

  // 2. Cảnh báo khi translation trùng với ngôn ngữ chính
  const itemSameAsPrimary = makeItem('it-2', {
    translations: {
      en: { question: 'English override on English primary' },
    },
  });
  const itemIssues1 = validateItem(itemSameAsPrimary, { primaryLang: 'en', metaLangs: ['en'] });
  assert.ok(
    itemIssues1.some(i => i.level === 'warn' && /trùng với ngôn ngữ chính/.test(i.msg)),
    'Phải cảnh báo khi translation dùng ngôn ngữ trùng ngôn ngữ chính'
  );

  // 3. Cảnh báo khi đặt translations trên item type 'translate'
  const translateWithTranslations = {
    id: 'tr-bad',
    type: 'translate',
    vi: 'Câu tiếng Việt',
    keyword: 'test',
    answers: ['test answer'],
    translations: {
      fr: { question: 'bad' },
    },
  };
  const itemIssues2 = validateItem(translateWithTranslations, { primaryLang: 'en', metaLangs: ['en', 'fr'] });
  assert.ok(
    itemIssues2.some(i => i.level === 'warn' && /ngôn ngữ-trung-lập/.test(i.msg)),
    'Phải cảnh báo khi type translate có translations'
  );

  // 4. Báo lỗi khi choices trong translation lệch số lượng so với choices gốc
  const singleChoicesMismatch = makeItem('it-mismatch', {
    choices: ['A', 'B', 'C', 'D'],
    translations: {
      vi: {
        choices: ['A_vi', 'B_vi'], // chỉ có 2 thay vì 4
      },
    },
  });
  const itemIssues3 = validateItem(singleChoicesMismatch, { primaryLang: 'en', metaLangs: ['en', 'vi'] });
  assert.ok(
    itemIssues3.some(i => i.level === 'error' && /lệch số lượng/.test(i.msg)),
    'Phải báo lỗi khi choices trong translation lệch số lượng'
  );

  // 5. Báo lỗi khi trường dịch có kiểu không hợp lệ (không phải chuỗi)
  const invalidFieldType = makeItem('it-bad-type', {
    translations: {
      vi: {
        question: 12345, // Sai kiểu (number thay vì string)
      },
    },
  });
  const itemIssues4 = validateItem(invalidFieldType, { primaryLang: 'en', metaLangs: ['en', 'vi'] });
  assert.ok(
    itemIssues4.some(i => i.level === 'error' && /phải là chuỗi/.test(i.msg)),
    'Phải báo lỗi khi trường dịch sai kiểu dữ liệu'
  );

  // 6. Tự động ghi formatVersion 2 khi đóng gói bộ thẻ có tính năng đa ngôn ngữ
  const multiDeck = {
    meta: { id: 'd-multi-pack', lang: ['en', 'vi'] },
    items: [
      makeItem('item-1', {
        translations: { vi: { question: 'Câu hỏi 1 tiếng Việt' } },
      }),
    ],
  };
  const pkgMulti = writePackage(JSON.stringify(multiDeck), new Map());
  const readBackMulti = JSON.parse(readPackage(pkgMulti.bytes).deckText);
  assert.equal(readBackMulti.meta.formatVersion, 2, 'Bộ thẻ đa ngôn ngữ phải ghi formatVersion: 2');
  assert.deepEqual(readBackMulti.meta.lang, ['en', 'vi']);
});
