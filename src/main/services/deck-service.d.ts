import { DatabaseManager } from '../db/index.js';
import { PackageStore } from './package-store.js';
export interface DeckServiceDeps {
    packageStore: PackageStore;
    draftsDir: () => string;
    getActiveLibraryDir?: () => Promise<string>;
    dbManager?: DatabaseManager;
    watchPath?: (dir: string) => void;
    knownSaves?: Map<string, number>;
}
export declare function slugify(s: string): string;
export declare function validateSdeckPath(p: string): Promise<string | null>;
export declare function openOne(p: string, deps: DeckServiceDeps): Promise<any>;
export declare function saveDeck(args: any, deps: DeckServiceDeps, targetFile?: string): Promise<any>;
//# sourceMappingURL=deck-service.d.ts.map