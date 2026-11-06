import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractRawKeyword,
  generateWordForms,
  checkKeyword,
} from '../src/core/translate/morphology.js';

import {
  checkPattern,
} from '../src/core/translate/pattern-matcher.js';

import {
  normalizeSentence,
  checkAnswerList,
} from '../src/core/translate/sentence-normalizer.js';

import {
  evaluateTranslation,
} from '../src/core/translate/evaluator.js';

import {
  exportTranslateToMarkdown,
} from '../src/core/translate/md-exporter.js';

import {
  buildUserPrompt,
  parseLLMResponse,
  gradeWithLLM,
} from '../src/core/translate/llm-grader.js';

import { validateItem } from '../src/core/validate.js';
import { newItem } from '../src/core/deckmodel.js';
import { detectItemType } from '../src/core/deckkinds.js';

test('translate morphology: extractRawKeyword & generateWordForms', () => {
  assert.equal(extractRawKeyword('prevent (v)'), 'prevent');
  assert.equal(extractRawKeyword('look forward to'), 'look forward to');

  const forms = generateWordForms('prevent', 'v');
  assert.ok(forms.includes('prevent'));
  assert.ok(forms.includes('prevented'));
  assert.ok(forms.includes('preventing'));
  assert.ok(forms.includes('prevents'));

  // Double consonant rule: stop -> stopped, stopping
  const stopForms = generateWordForms('stop', 'v');
  assert.ok(stopForms.includes('stopped'));
  assert.ok(stopForms.includes('stopping'));
});

test('translate morphology: checkKeyword kiểm tra từ neo trong câu', () => {
  // Có chia thì: prevented
  const r1 = checkKeyword('The heavy rain prevented us from leaving.', 'prevent (v)');
  assert.equal(r1.passed, true);
  assert.equal(r1.detectedForm, 'prevented');

  // Không dùng từ gợi ý
  const r2 = checkKeyword('The heavy rain stopped us from leaving.', 'prevent (v)');
  assert.equal(r2.passed, false);

  // Không bắt nhầm substring (vd "repreventing" hoặc từ khác chứa chữ "vent")
  const r3 = checkKeyword('We opened the vent.', 'prevent (v)');
  assert.equal(r3.passed, false);

  // Danh sách acceptableForms tuỳ chỉnh
  const r4 = checkKeyword('He went away.', 'go (v)', ['go', 'went', 'gone', 'going']);
  assert.equal(r4.passed, true);
  assert.equal(r4.detectedForm, 'went');
});

test('translate pattern-matcher: checkPattern kiểm tra cấu trúc ngữ pháp', () => {
  const pattern = 'prevent\\s+\\w+\\s+from\\s+\\w+ing';

  // Đúng cấu trúc: prevented him from giving (tự động mở rộng stem qua forms)
  const res1 = checkPattern(
    'I prevented him from giving up.',
    pattern,
    ['prevent', 'prevented', 'preventing', 'prevents'],
    'prevented'
  );
  assert.equal(res1.passed, true);

  // Đúng cấu trúc với từ gốc
  const res1b = checkPattern('They prevent us from entering.', pattern);
  assert.equal(res1b.passed, true);

  // Sai cấu trúc: thiếu "from"
  const res2 = checkPattern('I prevented him giving up.', pattern);
  assert.equal(res2.passed, false);

  // Không có pattern -> mặc định passed
  const res3 = checkPattern('Any sentence here.', undefined);
  assert.equal(res3.passed, true);
});

test('translate sentence-normalizer: chuẩn hoá co rút và dấu câu', () => {
  assert.equal(
    normalizeSentence("I didn't stop, and I'm ready!"),
    'i did not stop and i am ready'
  );

  const answers = [
    'I prevented him from giving up.',
    'I prevented him from quitting.',
  ];

  const match1 = checkAnswerList("I prevented him from giving up!", answers);
  assert.equal(match1.passed, true);
  assert.equal(match1.matchedAnswer, answers[0]);

  const match2 = checkAnswerList("I prevented him from walking away.", answers);
  assert.equal(match2.passed, false);
});

test('translate evaluator: chấm điểm phân tầng 3 lớp', () => {
  const item = {
    id: 'tr-1',
    type: 'translate',
    vi: 'Tôi đã ngăn anh ấy bỏ cuộc.',
    keyword: 'prevent',
    pos: 'v',
    pattern: 'prevent\\s+\\w+\\s+from\\s+\\w+ing',
    answers: [
      'I prevented him from giving up.',
      'I prevented him from quitting.',
    ],
  };

  // 1. Đúng hoàn hảo (khớp cả 3 tầng)
  const e1 = evaluateTranslation('I prevented him from giving up.', item);
  assert.equal(e1.status, 'correct');
  assert.equal(e1.score, 100);
  assert.equal(e1.layer1.passed, true);
  assert.equal(e1.layer2.passed, true);
  assert.equal(e1.layer3.passed, true);

  // 2. Không dùng từ gợi ý (Trượt tầng 1)
  const e2 = evaluateTranslation('I stopped him from giving up.', item);
  assert.equal(e2.status, 'incorrect');
  assert.equal(e2.score, 0);
  assert.equal(e2.layer1.passed, false);

  // 3. Có dùng từ gợi ý nhưng sai cấu trúc (Trượt tầng 2)
  const e3 = evaluateTranslation('I prevented him to give up.', item);
  assert.equal(e3.status, 'incorrect');
  assert.equal(e3.score, 30);
  assert.equal(e3.layer1.passed, true);
  assert.equal(e3.layer2.passed, false);

  // 4. Đúng tầng 1 + 2 nhưng câu hợp lệ khác câu mẫu -> Fallback: needs_review
  const e4 = evaluateTranslation('I prevented him from abandoning the plan.', item);
  assert.equal(e4.status, 'needs_review');
  assert.equal(e4.score, 75);
  assert.equal(e4.layer1.passed, true);
  assert.equal(e4.layer2.passed, true);
  assert.equal(e4.layer3.passed, false);
});

test('translate md-exporter: xuất kết quả markdown với Heading', () => {
  const item = {
    id: 'tr-1',
    type: 'translate',
    vi: 'Tôi đã ngăn anh ấy bỏ cuộc.',
    keyword: 'prevent',
    pos: 'v',
    pattern: 'prevent\\s+\\w+\\s+from\\s+\\w+ing',
    answers: ['I prevented him from giving up.'],
    explanation: 'prevent sb from doing sth',
  };

  const evaluation = evaluateTranslation('I prevented him from giving up.', item);

  const md = exportTranslateToMarkdown([
    { item, userAnswer: 'I prevented him from giving up.', evaluation },
  ], {
    title: 'Bài kiểm tra dịch câu',
    studentName: 'Trần Văn B',
    submittedAt: '2026-11-05',
  });

  assert.ok(md.includes('# Bài kiểm tra dịch câu'));
  assert.ok(md.includes('Trần Văn B'));
  assert.ok(md.includes('### Câu 1: [prevent (v)]'));
  assert.ok(md.includes('- [x] Dùng từ gợi ý'));
  assert.ok(md.includes('- [x] Khớp cấu trúc ngữ pháp yêu cầu'));
  assert.ok(md.includes('**Điểm:** 10/10'));
  assert.ok(md.includes('Nhận xét của người chấm:'));
});

test('translate llm-grader: prompt, parse response và mock call', async () => {
  const req = {
    vi: 'Tôi đã ngăn anh ấy bỏ cuộc.',
    keyword: 'prevent',
    pattern: 'prevent\\s+\\w+\\s+from\\s+\\w+ing',
    answers: ['I prevented him from giving up.'],
    userAnswer: 'I prevented him from surrendering.',
  };

  const prompt = buildUserPrompt(req);
  assert.ok(prompt.includes('Tôi đã ngăn anh ấy bỏ cuộc.'));
  assert.ok(prompt.includes('prevent'));

  // Test parse json an toàn kể cả khi có markdown codeblock
  const rawAI = '```json\n{"usesKeyword": true, "patternOk": true, "grammarScore": 9, "meaningScore": 9, "feedback": "Rất tốt", "suggestedSentence": "I prevented him from giving up."}\n```';
  const parsed = parseLLMResponse(rawAI);
  assert.equal(parsed.usesKeyword, true);
  assert.equal(parsed.patternOk, true);
  assert.equal(parsed.grammarScore, 9);
  assert.equal(parsed.feedback, 'Rất tốt');

  // Test mock fetch call
  const mockFetch = async (url, options) => {
    assert.ok(url.includes('/chat/completions'));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Authorization'], 'Bearer test-key');
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                usesKeyword: true,
                patternOk: true,
                grammarScore: 10,
                meaningScore: 10,
                feedback: 'Chính xác hoàn hảo!',
              }),
            },
          },
        ],
      }),
    };
  };

  const res = await gradeWithLLM(req, {
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'test-key',
    model: 'gpt-4o-mini',
  }, mockFetch);

  assert.equal(res.grammarScore, 10);
  assert.equal(res.feedback, 'Chính xác hoàn hảo!');
});

test('translate validation & deckmodel: hợp lệ và phát hiện lỗi', () => {
  // 1. Tạo item mới qua deckmodel
  const it = newItem('translate', 'tr-new');
  assert.equal(it.type, 'translate');
  assert.equal(detectItemType(it), 'translate');

  // 2. Validate thiếu câu tiếng Việt và từ gợi ý
  const badIssues = validateItem(it);
  assert.ok(badIssues.some(iss => iss.field === 'vi' && iss.level === 'error'));
  assert.ok(badIssues.some(iss => iss.field === 'keyword' && iss.level === 'error'));
  assert.ok(badIssues.some(iss => iss.field.startsWith('answers') && iss.level === 'error'));

  // 3. Item hợp lệ
  const validItem = {
    id: 'tr-valid',
    type: 'translate',
    vi: 'Tôi đã ngăn anh ấy bỏ cuộc.',
    keyword: 'prevent',
    pos: 'v',
    pattern: 'prevent\\s+\\w+\\s+from\\s+\\w+ing',
    answers: ['I prevented him from giving up.'],
  };

  const okIssues = validateItem(validItem);
  const errors = okIssues.filter(i => i.level === 'error');
  assert.equal(errors.length, 0);
});
