import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8, strFromU8 } from 'fflate';
import {
  readPackage, writePackage, addImage, isSafeEntry, detectImageType, collectAssetsFromDir, LIMITS,
} from '../src/core/sdeck.js';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3, 4]);
const PNG2 = Uint8Array.from([...PNG, 9, 9]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const GIF = strToU8('GIF89a....');
const WEBP = strToU8('RIFF\0\0\0\0WEBPVP8 ');
const SVG = strToU8('<?xml version="1.0"?>\n<!-- x --><svg xmlns="http://www.w3.org/2000/svg"></svg>');

const deck = {
  meta: { id: 'toan-101', title: 'Giải tích 1 — tiếng Việt có dấu', kind: 'quiz' },
  items: [
    { id: 'm-001', type: 'single', question: 'Tính $\\int_0^1 x^2\\,dx$\n\n![đồ thị](img/graph.svg)',
      choices: ['$\\frac{1}{2}$', '$\\frac{1}{3}$', { text: 'xem hình', image: 'img/tri.png' }], answer: [1] },
    { id: 'm-002', type: 'card', front: 'Đường tròn', back: '$\\pi r^2$', image: 'img/c.jpg' },
  ],
};
const deckText = JSON.stringify(deck);
const assets = () => new Map([['img/graph.svg', SVG], ['img/tri.png', PNG], ['img/c.jpg', JPG]]);

// bytes ZIP thủ công từ danh sách entry
const zip = files => zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));

test('isSafeEntry chặn tên entry độc hại', () => {
  for (const ok of ['deck.json', 'img/a.png', 'img/sub/b.svg', 'img/ảnh.png']) assert.equal(isSafeEntry(ok), true, ok);
  for (const bad of ['', '../x.png', 'img/../deck.json', '/etc/x', 'img\\a.png', 'img//a.png', './deck.json', 'img/a\u0000.png', 'img/\n.png', 'img/'])
    assert.equal(isSafeEntry(bad), false, JSON.stringify(bad));
});

test('detectImageType nhận dạng theo nội dung, không theo đuôi', () => {
  assert.equal(detectImageType(PNG), 'png');
  assert.equal(detectImageType(JPG), 'jpg');
  assert.equal(detectImageType(GIF), 'gif');
  assert.equal(detectImageType(WEBP), 'webp');
  assert.equal(detectImageType(SVG), 'svg');
  assert.equal(detectImageType(strToU8('\uFEFF  <svg>')), 'svg');
  assert.equal(detectImageType(strToU8('hello, tôi là văn bản')), null);
  assert.equal(detectImageType(strToU8('<html><svg></svg></html>')), null);
  assert.equal(detectImageType(new Uint8Array(0)), null);
});

test('ghi rồi đọc lại giống hệt (tiếng Việt, \\frac, ảnh)', () => {
  const built = writePackage(deckText, assets());
  assert.equal(built.ok, true);
  const back = readPackage(built.bytes);
  assert.equal(back.ok, true);
  assert.deepEqual(back.issues, []);
  const parsed = JSON.parse(back.deckText);
  assert.deepEqual(parsed, { ...deck, meta: { ...deck.meta, format: 'studydeck', formatVersion: 1 } });
  assert.equal(parsed.items[0].choices[0], '$\\frac{1}{2}$');
  assert.match(back.deckText, /\\\\frac/);           // trong JSON vẫn là \\frac
  assert.deepEqual([...back.assets.keys()].sort(), ['img/c.jpg', 'img/graph.svg', 'img/tri.png']);
  assert.deepEqual(back.assets.get('img/tri.png'), PNG);
  // đọc lại lần 2 → ghi lại → vẫn như cũ
  const again = readPackage(writePackage(back.deckText, back.assets).bytes);
  assert.equal(again.deckText, back.deckText);
});

test('không phải ZIP → từ chối', () => {
  for (const b of [strToU8('{"meta":{}}'), new Uint8Array(0), null, strToU8('PK')]) {
    const r = readPackage(b);
    assert.equal(r.ok, false);
    assert.match(r.error, /Không phải file \.sdeck/);
  }
  const broken = readPackage(Uint8Array.from([0x50, 0x4b, 3, 4, 1, 2, 3, 4, 5, 6]));
  assert.equal(broken.ok, false);
});

test('thiếu deck.json → từ chối', () => {
  const r = readPackage(zip({ 'img/a.png': PNG }));
  assert.equal(r.ok, false);
  assert.match(r.error, /không có deck\.json/);
});

test('entry ../x.png, /etc/x, img\\a.png, img//a.png, tập tin lạ bị bỏ kèm cảnh báo', () => {
  const r = readPackage(zip({
    'deck.json': deckText, 'img/tri.png': PNG,
    '../x.png': PNG, '/etc/x': 'root', 'img\\a.png': PNG, 'img//a.png': PNG,
    'notes.txt': 'x', 'img/script.js': 'alert(1)', 'deck.json.bak': '{}',
  }));
  assert.equal(r.ok, true);
  assert.deepEqual([...r.assets.keys()], ['img/tri.png']);
  for (const name of ['../x.png', '/etc/x', 'img\\a.png', 'img//a.png'])
    assert.ok(r.issues.some(i => i.includes('không an toàn') && i.includes(name)), name);
  for (const name of ['notes.txt', 'img/script.js', 'deck.json.bak'])
    assert.ok(r.issues.some(i => i.includes('lạ') && i.includes(name)), name);
});

test('file .png giả (nội dung văn bản) bị bỏ', () => {
  const r = readPackage(zip({ 'deck.json': deckText, 'img/fake.png': 'tôi không phải ảnh', 'img/tri.png': PNG }));
  assert.equal(r.ok, true);
  assert.equal(r.assets.has('img/fake.png'), false);
  assert.equal(r.assets.has('img/tri.png'), true);
  assert.ok(r.issues.some(i => i.includes('img/fake.png') && i.includes('không phải ảnh')));
});

test('quá nhiều entry → từ chối', () => {
  const files = { 'deck.json': deckText };
  for (let i = 0; i <= LIMITS.entries; i++) files[`img/${i}.png`] = PNG;
  const r = readPackage(zip(files));
  assert.equal(r.ok, false);
  assert.match(r.error, /quá nhiều tập tin/);
});

test('ảnh > 5 MB bị bỏ kèm cảnh báo; deck.json quá lớn → không có deck', () => {
  const big = new Uint8Array(LIMITS.image + 1); big.set(PNG);
  const r = readPackage(zip({ 'deck.json': deckText, 'img/big.png': big }));
  assert.equal(r.ok, true);
  assert.equal(r.assets.size, 0);
  assert.ok(r.issues.some(i => i.includes('img/big.png') && i.includes('quá lớn')));

  const old = LIMITS.deckJson;
  LIMITS.deckJson = 10;
  try {
    const r2 = readPackage(zip({ 'deck.json': deckText }));
    assert.equal(r2.ok, false);
    assert.match(r2.error, /không có deck\.json/);
  } finally { LIMITS.deckJson = old; }
});

test('tổng dung lượng giải nén quá lớn → từ chối', () => {
  const old = LIMITS.total;
  LIMITS.total = 100;
  try {
    const r = readPackage(zip({ 'deck.json': deckText }));
    assert.equal(r.ok, false);
    assert.match(r.error, /quá lớn/);
  } finally { LIMITS.total = old; }
});

test('header khai sai kích thước → phát hiện sau khi giải nén', () => {
  const big = new Uint8Array(LIMITS.image + 10); big.set(PNG);
  const bytes = zipSync({ 'deck.json': strToU8(deckText), 'img/lie.png': [big, { level: 0 }] });
  // sửa "uncompressed size" của img/lie.png trong local header (offset 22) và central directory (offset 24)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let patched = 0;
  for (let i = 0; i < bytes.length - 46; i++) {
    const sig = dv.getUint32(i, true);
    if (sig === 0x04034b50 || sig === 0x02014b50) {
      const central = sig === 0x02014b50;
      const nameLen = dv.getUint16(i + (central ? 28 : 26), true);
      const name = strFromU8(bytes.subarray(i + (central ? 46 : 30), i + (central ? 46 : 30) + nameLen));
      if (name === 'img/lie.png') { dv.setUint32(i + (central ? 24 : 22), 100, true); patched++; }
    }
  }
  assert.equal(patched, 2);
  const r = readPackage(bytes);
  assert.equal(r.ok, false);
  assert.match(r.error, /lớn hơn khai báo/);
});

test('writePackage: bỏ ảnh không còn tham chiếu (prune), giữ khi prune=false, lọc ảnh giả / tên sai', () => {
  const a = assets();
  a.set('img/unused.png', PNG2);
  a.set('img/fake.png', strToU8('text'));
  a.set('../evil.png', PNG);
  const pruned = writePackage(deckText, a);
  assert.deepEqual([...pruned.keptAssets.keys()].sort(), ['img/c.jpg', 'img/graph.svg', 'img/tri.png']);
  const kept = writePackage(deckText, a, { prune: false });
  assert.deepEqual([...kept.keptAssets.keys()].sort(), ['img/c.jpg', 'img/graph.svg', 'img/tri.png', 'img/unused.png']);
  assert.equal(readPackage(kept.bytes).assets.size, 4);
});

test('writePackage từ chối deck.json hỏng / thiếu meta.id', () => {
  assert.equal(writePackage('{oops', new Map()).ok, false);
  assert.equal(writePackage('{"items":[]}', new Map()).ok, false);
  assert.equal(writePackage('{"meta":{"id":"x"}}', new Map()).ok, false);
});

test('addImage: từ chối ảnh giả và > 5 MB; cùng ảnh thêm 2 lần chỉ lưu 1 bản', () => {
  const a = new Map();
  assert.equal(addImage(a, 'x.png', strToU8('không phải ảnh')).ok, false);
  const big = new Uint8Array(LIMITS.image + 1); big.set(PNG);
  assert.equal(addImage(a, 'big.png', big).ok, false);
  const r1 = addImage(a, 'Đồ thị hàm số.PNG', PNG);
  const r2 = addImage(a, 'khác tên.png', PNG);
  assert.equal(r1.ok, true);
  assert.match(r1.path, /^img\/[0-9a-f]{8}-do-thi-ham-so\.png$/);
  assert.equal(r2.path.slice(0, 13), r1.path.slice(0, 13));    // cùng nội dung → cùng hash
  const r3 = addImage(a, 'Đồ thị hàm số.png', PNG);            // thêm lại đúng ảnh đó
  assert.equal(r3.path, r1.path);
  assert.equal(a.size, 2);                                     // r1 (= r3) và r2: không nhân bản
  // đuôi theo nội dung thật, không theo tên
  assert.match(addImage(a, 'anh.png', SVG).path, /\.svg$/);
});

test('collectAssetsFromDir: chỉ nhận ảnh thật trong thư mục nguồn', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sdeck-src-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sdeck-out-'));
  try {
    const dir = path.join(tmp, 'deck');
    await fs.mkdir(path.join(dir, 'img'), { recursive: true });
    await fs.writeFile(path.join(dir, 'img', 'a.png'), PNG);
    await fs.writeFile(path.join(dir, 'img', 'fake.png'), 'văn bản');
    const big = new Uint8Array(LIMITS.image + 1); big.set(PNG);
    await fs.writeFile(path.join(dir, 'img', 'big.png'), big);
    await fs.writeFile(path.join(outside, 'secret.png'), PNG);
    await fs.symlink(path.join(outside, 'secret.png'), path.join(dir, 'img', 'link.png'));
    await fs.writeFile(path.join(tmp, 'up.png'), PNG);
    const d = {
      meta: { id: 'x' },
      items: [{ id: '1', type: 'card', front: '![a](img/a.png) ![f](img/fake.png) ![m](img/missing.png)', back: '![u](../up.png)',
        image: 'img/link.png', answerImage: 'img/big.png', explanation: '![w](https://example.com/x.png) ![d](deck.json)' }],
    };
    const { assets: got, issues } = await collectAssetsFromDir(dir, JSON.stringify(d));
    assert.deepEqual([...got.keys()], ['img/a.png']);
    for (const s of ['img/fake.png', 'img/missing.png', '../up.png', 'img/link.png', 'img/big.png', 'https://example.com/x.png', 'deck.json'])
      assert.ok(issues.some(i => i.includes(s)), s);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
