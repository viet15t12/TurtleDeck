export interface AppPaths {
    progressFile(): string;
    settingsFile(): string;
    backupsDir(): string;
    draftsDir(): string;
    defaultLibraryDir(): string;
    userDataDir(): string;
}
export declare function createPaths(getUserData?: () => any, getHome?: () => any): AppPaths;
export declare const defaultPaths: AppPaths;
//# sourceMappingURL=paths.d.ts.map