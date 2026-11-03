import { PackageStore } from './package-store.js';
export declare function collectImportAssets(sourceDir: string, items: any[]): Promise<{
    assets: Map<string, Uint8Array>;
    issues: any[];
}>;
export declare function previewImport(packageStore: PackageStore, args: any): Promise<{
    ok: boolean;
    format?: string;
    items?: any[];
    issues?: any[];
    importId?: string;
    assetCount?: number;
    error?: string;
}>;
export declare function commitImport(packageStore: PackageStore, args: any): {
    ok: boolean;
    assetCount: number;
};
//# sourceMappingURL=import-service.d.ts.map