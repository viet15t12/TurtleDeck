export interface OpenPackage {
    file: string | null;
    assets: Map<string, Uint8Array>;
    sourceDir?: string;
}
export interface TempImport {
    path: string;
    createdAt: number;
}
export declare class PackageStore {
    private readonly packages;
    private readonly tempImports;
    newKey(): string;
    get(deckKey: string): OpenPackage | undefined;
    set(deckKey: string, pkg: OpenPackage): void;
    delete(deckKey: string): boolean;
    has(deckKey: string): boolean;
    keys(): IterableIterator<string>;
    setTempImport(token: string, filePath: string): void;
    getTempImport(token: string): string | undefined;
    deleteTempImport(token: string): boolean;
    pruneTempImports(maxAgeMs?: number, now?: number): void;
    clear(): void;
}
export declare const defaultPackageStore: PackageStore;
//# sourceMappingURL=package-store.d.ts.map