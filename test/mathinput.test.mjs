import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mathContext,
  findEnclosingMath,
  insertFormula,
  nextPlaceholder,
  handleDollarKey,
  handleMathEnterKey,
} from '../src/core/mathinput.js';
import { SNIPPETS, SNIPPET_TABS, filterSnippets } from '../src/core/snippets.js';

test('mathContext: phát hiện đúng ngữ cảnh ngoài công thức, inline ($...$), block ($$...$$) và \\$', () => {
  const s1 = 'Tính $a + b$ và $$x^2 + y^2$$ với giá 5\\$ hoặc $c$.';
  assert.equal(mathContext(s1, 0), null);
  assert.equal(mathContext(s1, 5), null); // ngay trước dấu $ mở đầu tiên
  assert.equal(mathContext(s1, 6), 'inline'); // ngay sau dấu $ mở: bên trong $a + b$
  assert.equal(mathContext(s1, 11), 'inline'); // ngay trước dấu $ đóng
  assert.equal(mathContext(s1, 12), null); // ngay sau dấu $ đóng

  const blockStart = s1.indexOf('$$');
  assert.equal(mathContext(s1, blockStart + 2), 'block');
  assert.equal(mathContext(s1, blockStart + 5), 'block');

  const blockClose = s1.indexOf('$$', blockStart + 2);
  assert.equal(mathContext(s1, blockClose), 'block');
  assert.equal(mathContext(s1, blockClose + 2), null);

  // Dấu \$ được escape không mở công thức
  const escapedIdx = s1.indexOf('\\$');
  assert.equal(mathContext(s1, escapedIdx + 2), null);
  assert.equal(mathContext(s1, escapedIdx + 5), null);
});

test('findEnclosingMath: trích xuất đúng nội dung công thức bao quanh con trỏ để sửa tại chỗ', () => {
  const text = 'Cho $\\frac{1}{2}$ và $$\\int_0^1 x\\,dx$$.';
  const posInline = text.indexOf('\\frac') + 2;
  const enc1 = findEnclosingMath(text, posInline);
  assert.ok(enc1);
  assert.equal(enc1.mode, 'inline');
  assert.equal(enc1.latex, '\\frac{1}{2}');

  const posBlock = text.indexOf('\\int') + 2;
  const enc2 = findEnclosingMath(text, posBlock);
  assert.ok(enc2);
  assert.equal(enc2.mode, 'block');
  assert.equal(enc2.latex, '\\int_0^1 x\\,dx');

  assert.equal(findEnclosingMath(text, 2), null);
});

test('insertFormula: 5 quy tắc chèn công thức (ngoài/trong công thức, bôi đen, khoảng trắng quanh $, chọn sẵn ▢)', () => {
  // Quy tắc 2 & 5: Chèn ngoài công thức → tự bọc $...$ và chọn sẵn ▢ đầu tiên
  const r1 = insertFormula({ text: 'Tính ', selStart: 5, selEnd: 5 }, '\\frac{▢}{▢}');
  assert.equal(r1.text, 'Tính $\\frac{▢}{▢}$');
  assert.equal(r1.text.slice(r1.selStart, r1.selEnd), '▢');
  assert.equal(r1.selStart, 'Tính $\\frac{'.length);

  // Quy tắc 1: Con trỏ đang trong $...$ → chèn mã trần, không sinh thêm $
  const r2 = insertFormula({ text: '$x + $', selStart: 5, selEnd: 5 }, '\\sqrt{▢}');
  assert.equal(r2.text, '$x + \\sqrt{▢}$');
  assert.equal(r2.text.slice(r2.selStart, r2.selEnd), '▢');

  // Chèn liên tiếp nhiều ký hiệu không có ▢ ở ngoài công thức → mỗi lần đều bọc $ hợp lệ
  const rInf = insertFormula({ text: '', selStart: 0, selEnd: 0 }, '\\infty');
  assert.equal(rInf.text, '$\\infty$');
  assert.equal(rInf.selStart, rInf.text.length);

  // Quy tắc 3: Đang bôi đen chữ → đưa vào ▢ đầu tiên, con trỏ chọn ▢ thứ hai
  const r3 = insertFormula({ text: 'Tính x+1 chia y', selStart: 5, selEnd: 8 }, '\\frac{▢}{▢}');
  assert.equal(r3.text, 'Tính $\\frac{x+1}{▢}$ chia y');
  assert.equal(r3.text.slice(r3.selStart, r3.selEnd), '▢');

  // Quy tắc 4: Tự thêm khoảng trắng trước $ mở nếu ký tự liền trước là chữ/số
  const r4 = insertFormula({ text: 'Chobiểu thức', selStart: 3, selEnd: 3 }, 'x^2');
  assert.equal(r4.text, 'Cho $x^2$ biểu thức');

  // Khối riêng (block: true)
  const rBlock = insertFormula({ text: 'Đề bài:', selStart: 7, selEnd: 7 }, '\\sum_{i=1}^{▢} ▢', { block: true });
  assert.equal(rBlock.text, 'Đề bài:\n$$\n\\sum_{i=1}^{▢} ▢\n$$');
  assert.equal(rBlock.text.slice(rBlock.selStart, rBlock.selEnd), '▢');
});

test('nextPlaceholder: Tab nhảy qua các ô ▢ và thoát ra sau công thức khi hết ▢', () => {
  const s = 'Tính $\\frac{▢}{▢} + \\sqrt{▢}$ nhé.';
  const firstIdx = s.indexOf('▢');

  // Đang đứng ở ▢ đầu tiên → nhảy sang ▢ thứ hai
  const step1 = nextPlaceholder(s, firstIdx);
  assert.ok(step1?.found);
  assert.equal(s.slice(step1.selStart, step1.selEnd), '▢');
  assert.ok(step1.selStart > firstIdx);

  // Từ ▢ thứ hai → nhảy sang ▢ thứ ba
  const step2 = nextPlaceholder(s, step1.selStart);
  assert.ok(step2?.found);
  assert.ok(step2.selStart > step1.selStart);

  // Từ ▢ thứ ba (cuối cùng trong công thức) → thoát ra ngay sau dấu $ đóng
  const step3 = nextPlaceholder(s, step2.selStart);
  assert.ok(step3);
  assert.equal(step3.found, false);
  assert.equal(step3.exitedMath, true);
  assert.equal(s.slice(step3.selStart), ' nhé.');
});

test('handleDollarKey & handleMathEnterKey: tự đóng cặp $, nhảy qua $ đóng, và tách khối $$', () => {
  // Gõ $ vào ô trống → $$ với con trỏ ở giữa
  const d1 = handleDollarKey({ text: '', selStart: 0, selEnd: 0 });
  assert.equal(d1.text, '$$');
  assert.equal(d1.selStart, 1);

  // Gõ $ tiếp ngay trong $|$ rỗng → thành $$|$$ (khối công thức)
  const d2 = handleDollarKey(d1);
  assert.equal(d2.text, '$$$$');
  assert.equal(d2.selStart, 2);

  // Nhấn Enter giữa $$|$$ → tách dòng $$\n|\n$$
  const mEnter = handleMathEnterKey(d2);
  assert.ok(mEnter);
  assert.equal(mEnter.text, '$$\n\n$$');
  assert.equal(mEnter.selStart, 3);

  // Gõ $ khi đang đứng trước $ đóng của công thức có nội dung → nhảy qua $ đóng
  const stepOver = handleDollarKey({ text: '$x+1$', selStart: 4, selEnd: 4 });
  assert.equal(stepOver.text, '$x+1$');
  assert.equal(stepOver.selStart, 5);
});

test('snippets: danh mục 6 tab và tìm kiếm bỏ dấu tiếng Việt', () => {
  assert.equal(SNIPPET_TABS.length, 6);
  assert.ok(SNIPPETS.length >= 40);

  const fracMatches = filterSnippets('phan so');
  assert.ok(fracMatches.some(s => s.id === 'frac'));

  const intMatches = filterSnippets('tích phân');
  assert.ok(intMatches.some(s => s.id === 'int'));

  const alphaMatches = filterSnippets('alpha');
  assert.ok(alphaMatches.some(s => s.id === 'alpha'));
});
