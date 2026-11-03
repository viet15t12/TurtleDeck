// src/types/api.d.ts — Khai báo kiểu TypeScript cho window.api

import type { WindowApi } from '../../preload.js';

declare global {
  interface Window {
    api: WindowApi;
    notify?: (message: string, type?: 'info' | 'error' | 'success') => void;
  }
}

export {};
