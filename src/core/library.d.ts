// src/core/library.d.ts
export declare function inferGroup(relPath: string): string;
export declare function isSelfSaveEvent(filePath: string, knownSaves: Map<string, number>, windowMs?: number): boolean;
export declare function sanitizeDraftId(metaId: string): string;

