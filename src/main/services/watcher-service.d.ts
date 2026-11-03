import { PackageStore } from './package-store.js';
export interface WatcherDeps {
    packageStore: PackageStore;
    knownSaves: Map<string, number>;
    notify: (channel: string, payload: any) => void;
}
export declare class WatcherService {
    private readonly deps;
    private readonly watchedDirs;
    private readonly watchers;
    private readonly watchDebouncers;
    constructor(deps: WatcherDeps);
    isWatching(dirPath: string): boolean;
    watchRecursively(dirPath: string, maxDepth?: number): Promise<void>;
    watchPath(dirPath: string): void;
    onWatchedFileChanged(filePath: string): Promise<void>;
    closeAll(): void;
}
//# sourceMappingURL=watcher-service.d.ts.map