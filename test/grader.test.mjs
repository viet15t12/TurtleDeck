import assert from 'node:assert/strict';
import test from 'node:test';
import { gradeText, gradeChoices, lev, norm } from '../src/core/grader.js';

test('lev: tính đúng khoảng cách Levenshtein', () => {
  assert.equal(lev('', ''), 0);
  assert.equal(lev('abc', 'abc'), 0);
  assert.equal(lev('', 'abc'), 3);
  assert.equal(lev('kitten', 'sitting'), 3);
  assert.equal(lev('mitigate', 'mitigat'), 1);
});

test('norm: chuẩn hoá NFC, trim, gộp khoảng trắng', () => {
  assert.equal(norm('  hello   world  '), 'hello world');
  assert.equal(norm('a\u0300'), 'à'); // NFD sang NFC
});

test('gradeText: mode exact', () => {
  assert.deepEqual(gradeText('rpm -qa', ['rpm -qa'], 'exact'), { ok: true, near: false });
  assert.deepEqual(gradeText('RPM -QA', ['rpm -qa'], 'exact'), { ok: false, near: false });
  assert.deepEqual(gradeText('rpm  -qa', ['rpm -qa'], 'exact'), { ok: false, near: false });
  assert.deepEqual(gradeText('rpm -qa', ['ls', 'rpm -qa'], 'exact'), { ok: true, near: false });
});

test('gradeText: mode normalized (hoa/thường, khoảng trắng thừa, Unicode NFC)', () => {
  // Hoa thường
  assert.deepEqual(gradeText('SYSTEMD', ['systemd']), { ok: true, near: false });
  assert.deepEqual(gradeText('SystemD', ['systemd']), { ok: true, near: false });

  // Khoảng trắng thừa
  assert.deepEqual(gradeText('   rpm    -qa   ', ['rpm -qa']), { ok: true, near: false });

  // Unicode NFC tiếng Việt
  assert.deepEqual(gradeText('giảm nhẹ', ['giảm nhẹ']), { ok: true, near: false });

  // Nhiều đáp án chấp nhận
  const answers = ['systemd', '/sbin/init', 'init'];
  assert.deepEqual(gradeText('/sbin/init', answers), { ok: true, near: false });
  assert.deepEqual(gradeText('INIT', answers), { ok: true, near: false });
  assert.deepEqual(gradeText('systemd', answers), { ok: true, near: false });
  assert.deepEqual(gradeText('bash', answers), { ok: false, near: false });
});

test('gradeText: dung sai Levenshtein (gần đúng)', () => {
  // Từ dài (>= 5 ký tự) sai 1 ký tự -> gần đúng
  assert.deepEqual(gradeText('mitigat', ['mitigate']), { ok: true, near: true });
  assert.deepEqual(gradeText('mitigae', ['mitigate']), { ok: true, near: true });
  assert.deepEqual(gradeText('substantil', ['substantial']), { ok: true, near: true });

  // Từ rất dài (>= 9 ký tự) cho phép sai tối đa 2 ký tự
  assert.deepEqual(gradeText('deterorats', ['deteriorate']), { ok: true, near: true });

  // Từ ngắn (< 5 ký tự) KHÔNG chấp nhận lỗi chính tả
  assert.deepEqual(gradeText('car', ['cat']), { ok: false, near: false });
  assert.deepEqual(gradeText('bad', ['bat']), { ok: false, near: false });

  // Chuỗi rỗng hoặc sai quá xa
  assert.deepEqual(gradeText('', ['mitigate']), { ok: false, near: false });
  assert.deepEqual(gradeText('completely wrong text', ['mitigate']), { ok: false, near: false });
});

test('gradeText: mode regex', () => {
  assert.deepEqual(gradeText('ls -la /tmp', ['^ls\\s+-[a-z]+\\s+/tmp$'], 'regex'), { ok: true, near: false });
  assert.deepEqual(gradeText('cat /tmp', ['^ls\\s+-[a-z]+\\s+/tmp$'], 'regex'), { ok: false, near: false });
  // Regex lỗi không làm crash
  assert.deepEqual(gradeText('test', ['[unclosed'], 'regex'), { ok: false, near: false });
});

test('gradeText: mode number', () => {
  assert.deepEqual(gradeText('1.414', ['1.414'], 'number'), { ok: true, near: false });
  assert.deepEqual(gradeText('1,414', ['1.414'], 'number'), { ok: true, near: false }); // dấu phẩy thập phân
  assert.deepEqual(gradeText('0,5', ['0.5'], 'number'), { ok: true, near: false });
  assert.deepEqual(gradeText('1/3', ['0.3333'], 'number', { tolerance: 0.001 }), { ok: true, near: false });
  assert.deepEqual(gradeText('1/3', ['0.333333333'], 'number', { tolerance: 1e-4 }), { ok: true, near: false });
  assert.deepEqual(gradeText('2.5', ['1.414'], 'number'), { ok: false, near: false });
  assert.deepEqual(gradeText('abc', ['1.414'], 'number'), { ok: false, near: false });
});

test('gradeText: mode latex', () => {
  assert.deepEqual(gradeText('\\dfrac{1}{2}', ['\\frac{1}{2}'], 'latex'), { ok: true, near: false });
  assert.deepEqual(gradeText('\\tfrac{1}{2}', ['\\frac{1}{2}'], 'latex'), { ok: true, near: false });
  assert.deepEqual(gradeText('\\left( x \\right)', ['(x)'], 'latex'), { ok: true, near: false });
  assert.deepEqual(gradeText(' \\frac{ 1 }{ 2 } ', ['\\frac{1}{2}'], 'latex'), { ok: true, near: false });
  assert.deepEqual(gradeText('\\frac{1}{3}', ['\\frac{1}{2}'], 'latex'), { ok: false, near: false });
});

test('gradeChoices: single & multi choice (chính xác, thiếu, thừa, thứ tự)', () => {
  // Single choice
  assert.deepEqual(gradeChoices([1], [1]), { ok: true, near: false });
  assert.deepEqual(gradeChoices([0], [1]), { ok: false, near: false });
  assert.deepEqual(gradeChoices([], [1]), { ok: false, near: false });

  // Multi choice khớp chính xác
  assert.deepEqual(gradeChoices([0, 1], [0, 1]), { ok: true, near: false });

  // Thứ tự chọn khác nhau vẫn đúng
  assert.deepEqual(gradeChoices([1, 0], [0, 1]), { ok: true, near: false });

  // Trùng lặp phần tử khi chọn vẫn tính đúng
  assert.deepEqual(gradeChoices([0, 1, 1], [0, 1]), { ok: true, near: false });

  // Thiếu đáp án -> sai
  assert.deepEqual(gradeChoices([0], [0, 1]), { ok: false, near: false });

  // Thừa đáp án -> sai
  assert.deepEqual(gradeChoices([0, 1, 2], [0, 1]), { ok: false, near: false });

  // Không chọn gì -> sai
  assert.deepEqual(gradeChoices([], [0, 1]), { ok: false, near: false });
  assert.deepEqual(gradeChoices(null, [0, 1]), { ok: false, near: false });
});

