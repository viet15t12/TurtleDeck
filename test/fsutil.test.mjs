import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite, backupFile } from '../src/core/fsutil.js';

async function withTmp(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fsutil-'));
  try { await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('atomicWrite ghi đúng nội dung, không để lại .tmp', () => withTmp(async dir => {
  const f = path.join(dir, 'settings.json');
  await atomicWrite(f, '{"a":1}');
  await atomicWrite(f, '{"a":2}');
  assert.equal(await fs.readFile(f, 'utf8'), '{"a":2}');
  assert.deepEqual(await fs.readdir(dir), ['settings.json']);
}));

test('atomicWrite nhiều lần đồng thời: kết quả là lần ghi cuối, file luôn nguyên vẹn', () => withTmp(async dir => {
  const f = path.join(dir, 'p.json');
  await Promise.all(Array.from({ length: 20 }, (_, i) => atomicWrite(f, JSON.stringify({ i, pad: 'x'.repeat(10000) }))));
  assert.equal(JSON.parse(await fs.readFile(f, 'utf8')).i, 19);
  assert.deepEqual(await fs.readdir(dir), ['p.json']);
}));

test('atomicWrite lỗi (thư mục không tồn tại) → ném lỗi, không tạo rác', () => withTmp(async dir => {
  await assert.rejects(atomicWrite(path.join(dir, 'khong-co', 'x.json'), 'x'));
  assert.deepEqual(await fs.readdir(dir), []);
}));

test('backupFile: chưa có file → false; có file → tạo .bak', () => withTmp(async dir => {
  const f = path.join(dir, 'a.sdeck');
  assert.equal(await backupFile(f), false);
  await fs.writeFile(f, 'v1');
  assert.equal(await backupFile(f), true);
  await atomicWrite(f, 'v2');
  assert.equal(await fs.readFile(f + '.bak', 'utf8'), 'v1');
  assert.equal(await fs.readFile(f, 'utf8'), 'v2');
}));

