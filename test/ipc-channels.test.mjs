// test/ipc-channels.test.mjs — Kiểm tra danh sách kênh IPC khớp với fixture và tương thích Tauri
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerAll } from '../src/main/ipc/register.js';
import { PackageStore } from '../src/main/services/package-store.js';
import { DatabaseManager } from '../src/main/db/index.js';
import { CHANNEL_TO_COMMAND, ARRAY_CHANNELS } from '../src/platform/channels.js';

class MockDispatcher {
  constructor() {
    this.handlers = new Map();
    this.listeners = new Map();
  }

  handle(channel, fn) {
    this.handlers.set(channel, fn);
  }

  on(channel, fn) {
    this.listeners.set(channel, fn);
  }
}

test('IPC channels fixture matches expected structure and registerAll matches fixture', () => {
  const fixturePath = path.resolve('test/fixtures/ipc-channels.json');
  assert.ok(fs.existsSync(fixturePath), 'test/fixtures/ipc-channels.json must exist');

  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.ok(Array.isArray(fixture.handleChannels), 'handleChannels must be array');
  assert.ok(Array.isArray(fixture.onChannels), 'onChannels must be array');

  const dispatcher = new MockDispatcher();
  const dbManager = DatabaseManager.createInMemory();
  const packageStore = new PackageStore();
  const mockPaths = {
    userDataDir: () => '/tmp',
    progressFile: () => '/tmp/progress.json',
    settingsFile: () => '/tmp/settings.json',
    backupsDir: () => '/tmp/backups',
    draftsDir: () => '/tmp/drafts',
    defaultLibraryDir: () => '/tmp/StudyDecks',
  };

  registerAll(dispatcher, {
    dbManager,
    packageStore,
    paths: mockPaths,
    winOf: () => null,
  });

  const registeredChannels = Array.from(dispatcher.handlers.keys()).sort();
  const expectedChannels = fixture.handleChannels.slice().sort();

  assert.deepEqual(
    registeredChannels,
    expectedChannels,
    `Registered IPC channels must exactly match fixture. Differences:\nRegistered: ${JSON.stringify(registeredChannels)}\nExpected: ${JSON.stringify(expectedChannels)}`
  );
});

test('Tauri compatibility: every handle channel has an explicit mapping and Rust command', () => {
  const fixturePath = path.resolve('test/fixtures/ipc-channels.json');
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
