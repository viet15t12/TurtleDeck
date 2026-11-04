// test/ipc-channels.test.mjs — Kiểm tra danh sách kênh IPC khớp với fixture và tương thích Tauri
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHANNEL_TO_COMMAND, ARRAY_CHANNELS } from '../src/platform/channels.js';

test('Tauri compatibility: every handle channel has an explicit mapping and Rust command', () => {
  const fixturePath = path.resolve('test/fixtures/ipc-channels.json');
  assert.ok(fs.existsSync(fixturePath), 'test/fixtures/ipc-channels.json must exist');
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  // 1. Kiểm tra mọi channel đều có trong CHANNEL_TO_COMMAND
  for (const channel of fixture.handleChannels) {
    assert.ok(
      CHANNEL_TO_COMMAND[channel],
      `Channel "${channel}" must be mapped in src/platform/channels.js`
    );
  }

  // 2. Đọc src-tauri/src/lib.rs để đảm bảo command Rust đã được đăng ký trong invoke_handler
  const libRsContent = fs.readFileSync('src-tauri/src/lib.rs', 'utf8');
  for (const channel of fixture.handleChannels) {
    const cmdName = CHANNEL_TO_COMMAND[channel];
    assert.ok(
      libRsContent.includes(cmdName),
      `Rust command "${cmdName}" (for channel "${channel}") must be registered in src-tauri/src/lib.rs invoke_handler`
    );
  }

  // 3. Kiểm tra các kênh mảng được nhận diện đúng
  assert.ok(ARRAY_CHANNELS.has('deck:open'));
  assert.ok(ARRAY_CHANNELS.has('folder:getTree'));
  assert.ok(ARRAY_CHANNELS.has('library:scan'));
});
