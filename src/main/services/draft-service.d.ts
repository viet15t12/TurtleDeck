import { PackageStore } from './package-store.js';
import { DeckServiceDeps } from './deck-service.js';
export declare function saveDraft(draftsDir: string, packageStore: PackageStore, req: {
    metaId: string;
    deckKey: string;
    deckText: string;
}): Promise<{
    ok: boolean;
    draftId?: string;
    error?: string;
}>;
export declare function deleteDraft(draftsDir: string, metaId: string): Promise<{
    ok: boolean;
}>;
export declare function listDrafts(draftsDir: string): Promise<any[]>;
export declare function loadDraft(draftsDir: string, draftId: string, deps: DeckServiceDeps): Promise<any>;
//# sourceMappingURL=draft-service.d.ts.map