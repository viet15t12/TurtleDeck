import { PackageStore } from './package-store.js';
export declare function addAssetFiles(packageStore: PackageStore, deckKey: string, filePaths: string[]): Promise<Array<{
    path: string;
    name: string;
}>>;
export declare function addAssetBytes(packageStore: PackageStore, deckKey: string, name: string, bytes: Uint8Array | number[] | Buffer): {
    ok: boolean;
    path?: string;
    error?: string;
};
export declare function listAssets(packageStore: PackageStore, deckKey: string): string[];
export declare function removeAsset(packageStore: PackageStore, deckKey: string, assetPath: string): {
    ok: boolean;
    error?: string;
};
//# sourceMappingURL=asset-service.d.ts.map