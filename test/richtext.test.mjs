import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRich, toPlain, assetUrl } from '../src/core/richtext.js';

test('toPlain: loại bỏ định dạng Markdown, LaTeX, ảnh để lấy văn bản thuần', () => {
  assert.equal(toPlain('**In đậm** và *nghiêng*'), 'In đậm và nghiêng');
  assert.equal(toPlain('`code` và [link](url)'), 'code và [link](url)');
  assert.equal(toPlain('![ảnh](img/a.png) văn bản'), 'văn bản');
  assert.equal(toPlain('> Trích dẫn\n## Tiêu đề'), 'Trích dẫn Tiêu đề');
  assert.equal(toPlain('Công thức $\\frac{1}{2}$ và $$\\int_0^1 x^2 dx$$'), 'Công thức và');
});

test('assetUrl: chỉ nhận đường dẫn tương đối đuôi ảnh, chặn http, file, data, //', () => {
  assert.equal(assetUrl('img/pic.png', 'key1'), 'asset://key1/img/pic.png');
  assert.equal(assetUrl('img/sub/photo.jpg', 'key1'), 'asset://key1/img/sub/photo.jpg');

  // Chặn http, https, file, data, //
  assert.equal(assetUrl('http://example.com/a.png', 'key1'), null);
  assert.equal(assetUrl('https://example.com/a.png', 'key1'), null);
  assert.equal(assetUrl('file:///etc/passwd', 'key1'), null);
  assert.equal(assetUrl('data:image/png;base64,...', 'key1'), null);
  assert.equal(assetUrl('//example.com/a.png', 'key1'), null);

  // Chặn file không phải ảnh
  assert.equal(assetUrl('deck.json', 'key1'), null);
  assert.equal(assetUrl('img/script.js', 'key1'), null);
});

test('makeRich: render Markdown và ảnh qua asset://', () => {
  const rich = makeRich('deck-abc');

  // Markdown cơ bản
  const html = rich.html('# Tiêu đề\n\nĐoạn văn với `code` và **đậm**.');
  assert.match(html, /<h1[^>]*>Tiêu đề<\/h1>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<strong>đậm<\/strong>/);

  // Ảnh hợp lệ trong gói -> src asset://...
  const imgHtml = rich.html('![Biểu đồ](img/graph.svg)');
  assert.match(imgHtml, /<img class="rich-img" loading="lazy" src="asset:\/\/deck-abc\/img\/graph\.svg" alt="Biểu đồ"/);

  // Ảnh ngoài (http) -> bị chặn thành img-bad
  const badImgHtml = rich.html('![web](https://bad.com/hack.png)');
  assert.match(badImgHtml, /<span class="img-bad">/);
});

test('makeRich: KaTeX inline $...$ và block $$...$$', () => {
  const rich = makeRich('deck-abc');

  // Inline formula
  const inline = rich.inline('Tính $\\frac{a}{b}$');
  assert.match(inline, /<span class="katex">/);
  assert.match(inline, /katex-html/);

  // Inline formula trong ngoặc đơn ($a \neq 0$)
  const parenFormula = rich.inline('Phương trình $ax^2 + bx + c = 0$ ($a \\neq 0$)?');
  const countKatex = (parenFormula.match(/class="katex"/g) || []).length;
  assert.equal(countKatex >= 2, true, 'Cả hai công thức kể cả trong ngoặc đều phải được render');

  // Block formula
  const block = rich.html('$$\\int_0^1 x^2\\,dx$$');
  assert.match(block, /<span class="katex-display">/);
  assert.match(block, /<span class="katex">/);

  // KaTeX sai cú pháp không làm crash app, hiển thị mã báo lỗi
  const badLatex = rich.inline('$\\invalidMacro{123}$');
  assert.ok(typeof badLatex === 'string');
});

test('makeRich: bảo mật (loại bỏ script, onerror, href javascript)', () => {
  const rich = makeRich('deck-abc');

  // Script tag bị loại bỏ
  const dangerous = rich.html('<script>alert("xss")</script>Nội dung');
  assert.doesNotMatch(dangerous, /<script>/i);

  // onerror trong thẻ img bị loại
  const imgXss = rich.html('<img src="x" onerror="alert(1)">');
  assert.doesNotMatch(imgXss, /onerror/i);

  // KaTeX href javascript không sinh link javascript:
  const katexXss = rich.html('$\\href{javascript:alert(1)}{Click}$');
  assert.doesNotMatch(katexXss, /<a\s[^>]*href=["']?javascript:/i);
});
