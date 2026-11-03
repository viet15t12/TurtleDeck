// src/core/fsutil.d.ts
export declare const DEFAULT_SETTINGS: any;
export declare function normalizeSettings(settings: any): any;
export declare function atomicWrite(targetPath: string, data: string | Uint8Array | Buffer): Promise<{ ok: boolean; path?: string; error?: string }>;
export declare function backupFile(targetPath: string): Promise<boolean>;
export declare function defaultProgress(): any;
export declare function enqueueFileOp<T>(key: string, op: () => Promise<T>): Promise<T>;
export declare function loadProgressFile(filePath: string): Promise<any>;
export declare function saveProgressFile(filePath: string, data: any, opts?: any): Promise<{ ok: boolean; error?: string }>;
export declare function loadSettingsFile(filePath: string): Promise<any>;
export declare function saveSettingsFile(filePath: string, data: any): Promise<{ ok: boolean; error?: string }>;
