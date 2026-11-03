// src/main/app/external-files.ts — Quản lý file .sdeck mở từ bên ngoài (CLI argv, file association)
import path from 'node:path';
import { validateSdeckPath } from '../services/deck-service.js';
export class ExternalFilesManager {
    sendToRenderer;
    rendererReady = false;
    pendingExternalFiles = [];
    constructor(sendToRenderer) {
        this.sendToRenderer = sendToRenderer;
    }
    extractSdeckFilesFromArgv(argv) {
        if (!Array.isArray(argv))
            return [];
        return argv
            .filter(a => typeof a === 'string' && !a.startsWith('-') && a.toLowerCase().endsWith('.sdeck'))
            .map(p => path.resolve(p));
    }
    async handleExternalFiles(filePaths) {
        const valid = [];
        for (const p of filePaths) {
            const v = await validateSdeckPath(p);
            if (v && !valid.includes(v))
                valid.push(v);
        }
        if (!valid.length)
            return;
        if (this.rendererReady) {
            this.sendToRenderer('deck:openExternal', valid);
        }
        else {
            for (const v of valid) {
                if (!this.pendingExternalFiles.includes(v)) {
                    this.pendingExternalFiles.push(v);
                }
            }
        }
    }
    onRendererReady() {
        this.rendererReady = true;
        if (this.pendingExternalFiles.length > 0) {
            this.sendToRenderer('deck:openExternal', [...this.pendingExternalFiles]);
            this.pendingExternalFiles.length = 0;
        }
    }
    isRendererReady() {
        return this.rendererReady;
    }
}
//# sourceMappingURL=external-files.js.map