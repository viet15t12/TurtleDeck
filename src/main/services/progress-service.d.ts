import { DatabaseManager } from '../db/index.js';
export interface ProgressServiceDeps {
    progressFile: string;
    backupsDir: string;
    dbManager?: DatabaseManager;
}
export declare function loadProgress(deps: ProgressServiceDeps): Promise<any>;
export declare function saveProgress(deps: ProgressServiceDeps, data: any): Promise<{
    ok: boolean;
    error?: string;
}>;
export declare function exportProgressToFile(deps: ProgressServiceDeps, destPath: string): Promise<{
    ok: boolean;
    path?: string;
    error?: string;
}>;
export declare function readAndValidateImportFile(filePath: string): Promise<{
    ok: boolean;
    file?: string;
    data?: any;
    stats?: any;
    error?: string;
}>;
export declare function applyImport(deps: ProgressServiceDeps, importedProgress: any, mode?: 'merge' | 'replace'): Promise<{
    ok: boolean;
    stats?: any;
    error?: string;
}>;
//# sourceMappingURL=progress-service.d.ts.map