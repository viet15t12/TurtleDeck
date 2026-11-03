export declare function getActiveLibraryDir(settingsFile: string, defaultDir: string): Promise<string>;
export declare function scanLibraryRecursively(dir: string, rootDir: string, depth?: number, results?: Array<{
    fullPath: string;
    relPath: string;
    name: string;
}>, maxFiles?: number): Promise<Array<{
    fullPath: string;
    relPath: string;
    name: string;
}>>;
export declare function scanLibrary(libDir: string): Promise<any[]>;
//# sourceMappingURL=library-service.d.ts.map