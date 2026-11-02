import assert from 'node:assert/strict';
import test from 'node:test';
import { makeRich, toPlain } from '../src/core/richtext.js';

test('toPlain: loại bỏ định dạng Markdown để lấy văn bản thuần', () => {
  assert.equal(toPlain('**In đậm** và *nghiêng*'), 'In đậm và nghiêng');
  assert.equal(toPlain('`code` và [link](url)'), 'code và [link](url)');
  assert.equal(toPlain('![ảnh](img/a.png) văn bản'), 'văn bản');
  assert.equal(toPlain('> Trích dẫn\n## Tiêu đề'), 'Trích dẫn Tiêu đề');
});

test('makeRich: render Markdown cơ bản và code block', () => {
  const rich = makeRich('sample-deck');
  const html = rich.html('# Tiêu đề\n\nĐoạn văn với `code` và **đậm**.');
  assert.match(html, /<h1[^>]*>Tiêu đề<\/h1>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<strong>đậm<\/strong>/);

  const inline = rich.inline('`lspci` liệt kê thiết bị PCI');
  assert.match(inline, /<code>lspci<\/code>/);
});

