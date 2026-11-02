// Kiểm tra CLI tools/sdeck.mjs: pack → check → unpack → pack lại (round-trip)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'tools', 'sdeck.mjs');
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });

test('sdeck.mjs pack / check / unpack / pack-all', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sdeck-cli-'));
  try {
    const src = path.join(root, 'data', 'samples-src', 'lpic-sample');
    const file = path.join(tmp, 'lpic.sdeck');
    assert.match(run('pack', src, file), /5\/5 mục, 1 ảnh/);
    assert.match(run('check', file), /mục học được: 5\/5/);

    const out = path.join(tmp, 'unpacked');
    run('unpack', file, out);
    const orig = JSON.parse(await fs.readFile(path.join(src, 'deck.json'), 'utf8'));
    const back = JSON.parse(await fs.readFile(path.join(out, 'deck.json'), 'utf8'));
    assert.deepEqual(back, orig);
    assert.deepEqual(await fs.readFile(path.join(out, 'img', 'inode.svg')), await fs.readFile(path.join(src, 'img', 'inode.svg')));

    const all = path.join(tmp, 'all');
    assert.match(run('pack-all', path.join(root, 'data', 'samples-src'), all), /vocab-sample\.sdeck/);
    assert.deepEqual((await fs.readdir(all)).sort(), ['lpic-sample.sdeck', 'vocab-sample.sdeck']);

    // file không phải gói → check báo lỗi, mã thoát khác 0
    await fs.writeFile(path.join(tmp, 'bad.sdeck'), 'hello');
    const bad = spawnSync(process.execPath, [cli, 'check', path.join(tmp, 'bad.sdeck')], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stdout, /Không phải file \.sdeck/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

