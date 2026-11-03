import { DatabaseManager } from '../db/index.js';
export interface BackupDeps {
    backupsDir: string;
    progressFile: string;
    dbManager?: DatabaseManager;
    now?: () => number;
    timeZone?: string;
}
export declare function ensureDailyBackup(deps: BackupDeps): Promise<void>;
export declare function createBackup(deps: BackupDeps): Promise<{
    ok: boolean;
    name?: string;
    error?: string;
}>;
export declare function listBackups(backupsDir: string): Promise<Array<{
    name: string;
    size: number;
    mtime: number;
}>>;
export declare function restoreBackup(deps: BackupDeps, name: string): Promise<{
    ok: boolean;
    progress?: any;
    error?: string;
}>;
//# sourceMappingURL=backup-service.d.ts.map