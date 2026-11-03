// src/core/progressio.d.ts
export declare const CURRENT_FORMAT_VERSION: number;
export declare const MAX_CARDS_LIMIT: number;
export declare const MAX_LOG_LIMIT: number;
export declare const MAX_NOTE_LENGTH: number;
export declare function applyCardOverride(card: any, override: any, now?: number, opts?: any): any;
export declare function applyOverrideToProgress(progress: any, cardKey: string, nextCard: any, overrideLogEntry?: any): any;
export declare function backupFileName(timestamp?: number, timeZone?: string): string;
export declare function dayKey(timestamp?: number, timeZone?: string): string;
export declare function exportProgress(cards: any[], logs: any[], meta?: any): any;
export declare function mergeProgress(current: any, imported: any): any;
export declare function pickBackupsToDelete(files: string[], keepCount?: number): string[];
export declare function validateProgress(data: any): { ok: boolean; progress?: any; error?: string; stats?: any };

