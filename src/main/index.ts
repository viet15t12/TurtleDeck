// src/main/index.ts — Điểm vào chính của tiến trình Main (ESM)
import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
import { defaultPaths } from './app/paths.js';
import { defaultPackageStore } from './services/package-store.js';
import { initAppLifecycle } from './app/lifecycle.js';

const { app, protocol } = (electron as any) || {};

// 1. Single Instance Lock
const gotTheLock = app ? app.requestSingleInstanceLock() : true;
if (!gotTheLock) {
  app?.quit();
  process.exit(0);
}
  // 2. Đăng ký scheme asset:// trước khi app ready
  if (protocol) {
    protocol.registerSchemesAsPrivileged([
      { scheme: 'asset', privileges: { standard: true, secure: true, supportFetchAPI: true } },
    ]);
  }

  // 3. Đường dẫn preload và HTML renderer
  const actualPreload = path.resolve(import.meta.dirname, '../preload.js');
  const distHtml = path.resolve(import.meta.dirname, '../index.html');
  const srcHtml = path.resolve(import.meta.dirname, '../../src/index.html');
  const htmlPath = fs.existsSync(distHtml) ? distHtml : srcHtml;

  initAppLifecycle(defaultPaths, defaultPackageStore, actualPreload, htmlPath);

