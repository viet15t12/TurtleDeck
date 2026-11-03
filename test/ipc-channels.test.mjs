// test/ipc-channels.test.mjs — Kiểm tra danh sách kênh IPC khớp với fixture
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerAll } from '../src/main/ipc/register.js';
import { PackageStore } from '../src/main/services/package-store.js';
import { DatabaseManager } from '../src/main/db/index.js';

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
