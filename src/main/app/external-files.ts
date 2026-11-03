// src/main/app/external-files.ts — Quản lý file .sdeck mở từ bên ngoài (CLI argv, file association)
import path from 'node:path';
import { validateSdeckPath } from '../services/deck-service.js';

export class ExternalFilesManager {
  private rendererReady = false;
  private readonly pendingExternalFiles: string[] = [];

  constructor(private readonly sendToRenderer: (channel: string, payload: any) => void) {}

  extractSdeckFilesFromArgv(argv: string[]): string[] {
    if (!Array.isArray(argv)) return [];
    return argv
      .filter(a => typeof a === 'string' && !a.startsWith('-') && a.toLowerCase().endsWith('.sdeck'))
      .map(p => path.resolve(p));
  }

  async handleExternalFiles(filePaths: string[]): Promise<void> {
    const valid: string[] = [];
    for (const p of filePaths) {
      const v = await validateSdeckPath(p);
      if (v && !valid.includes(v)) valid.push(v);
    }
    if (!valid.length) return;

    if (this.rendererReady) {
      this.sendToRenderer('deck:openExternal', valid);
    } else {
      for (const v of valid) {
        if (!this.pendingExternalFiles.includes(v)) {
          this.pendingExternalFiles.push(v);
        }
      }
    }
  }

  onRendererReady(): void {
    this.rendererReady = true;
    if (this.pendingExternalFiles.length > 0) {
      this.sendToRenderer('deck:openExternal', [...this.pendingExternalFiles]);
      this.pendingExternalFiles.length = 0;
    }
  }

  isRendererReady(): boolean {
    return this.rendererReady;
  }
}

