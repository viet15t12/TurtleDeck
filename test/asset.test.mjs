import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAssetUrl, MIME, IMG_PATH } from '../src/core/assetprotocol.js';

test('assetprotocol: MIME và IMG_PATH whitelist đuôi ảnh', () => {
  assert.equal(IMG_PATH.test('img/a.png'), true);
  assert.equal(IMG_PATH.test('img/b.jpg'), true);
  assert.equal(IMG_PATH.test('img/c.jpeg'), true);
  assert.equal(IMG_PATH.test('img/d.svg'), true);
  assert.equal(IMG_PATH.test('img/e.webp'), true);
  assert.equal(IMG_PATH.test('img/f.gif'), true);

  // Không phải ảnh hoặc sai thư mục
  assert.equal(IMG_PATH.test('img/deck.json'), false);
  assert.equal(IMG_PATH.test('deck.json'), false);
  assert.equal(IMG_PATH.test('img/script.js'), false);
  assert.equal(IMG_PATH.test('other/a.png'), false);
});

test('handleAssetUrl: phục vụ ảnh hợp lệ với đúng Content-Type và CSP sandbox', () => {
  const pngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  const svgData = new Uint8Array(Buffer.from('<svg></svg>'));
  const jpgData = new Uint8Array([0xff, 0xd8, 0xff]);

  const packages = new Map([
    ['test-key-123', {
      file: '/path/test.sdeck',
      assets: new Map([
        ['img/pic.png', pngData],
        ['img/diag.svg', svgData],
        ['img/photo.jpg', jpgData],
      ]),
    }],
  ]);

  // 1. PNG
  const resPng = handleAssetUrl('asset://test-key-123/img/pic.png', packages);
  assert.equal(resPng.status, 200);
  assert.equal(resPng.data, pngData);
  assert.equal(resPng.headers['Content-Type'], 'image/png');
  assert.equal(resPng.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(resPng.headers['Content-Security-Policy'], /sandbox/);

  // 2. SVG
  const resSvg = handleAssetUrl('asset://test-key-123/img/diag.svg', packages);
  assert.equal(resSvg.status, 200);
  assert.equal(resSvg.data, svgData);
  assert.equal(resSvg.headers['Content-Type'], 'image/svg+xml');

  // 3. JPG
  const resJpg = handleAssetUrl('asset://test-key-123/img/photo.jpg', packages);
  assert.equal(resJpg.status, 200);
  assert.equal(resJpg.data, jpgData);
  assert.equal(resJpg.headers['Content-Type'], 'image/jpeg');
});

test('handleAssetUrl: chặn path traversal, deck.json, deckKey lạ, file không tồn tại', () => {
  const packages = new Map([
    ['valid-key', {
      file: '/path/test.sdeck',
      assets: new Map([
        ['img/a.png', new Uint8Array([1, 2, 3])],
      ]),
    }],
  ]);

  // 1. Path traversal: ../deck.json
  const res1 = handleAssetUrl('asset://valid-key/img/../deck.json', packages);
  assert.equal(res1.status, 404);

  // 2. Path traversal mã hoá: %2e%2e
  const res2 = handleAssetUrl('asset://valid-key/img/%2e%2e/deck.json', packages);
  assert.equal(res2.status, 404);

  // 3. deck.json trực tiếp
  const res3 = handleAssetUrl('asset://valid-key/deck.json', packages);
  assert.equal(res3.status, 404);

  // 4. deckKey lạ không tồn tại trong Map
  const res4 = handleAssetUrl('asset://unknown-key/img/a.png', packages);
  assert.equal(res4.status, 404);

  // 5. Đường dẫn ảnh không tồn tại trong gói
  const res5 = handleAssetUrl('asset://valid-key/img/missing.png', packages);
  assert.equal(res5.status, 404);

  // 6. Entry không phải ảnh hợp lệ
  const res6 = handleAssetUrl('asset://valid-key/img/script.sh', packages);
  assert.equal(res6.status, 404);
});

