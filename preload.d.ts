import type { IpcChannel, IpcRequest, IpcResponse, IpcEvents, IpcEventChannel } from './src/core/types/ipc.types.js';
declare function invokeTyped<C extends IpcChannel>(channel: C, data?: IpcRequest<C>): Promise<IpcResponse<C>>;
declare function onEvent<E extends IpcEventChannel>(channel: E, callback: (payload: IpcEvents[E]) => void): () => void;
declare const api: {
    platform: NodeJS.Platform;
    invokeTyped: typeof invokeTyped;
    onEvent: typeof onEvent;
    openDeck: (filePath?: string | string[]) => Promise<{
        path: string;
        ok: boolean;
        deckKey?: string;
        deckText?: string;
        deck?: any;
        error?: string;
        issues?: any[];
        total?: number;
        skipped?: number;
        assetCount?: number;
        missing?: boolean;
    }[]>;
    saveDeckTyped: (params: IpcRequest<'deck:save'>) => Promise<{
        ok: boolean;
        path?: string;
        filePath?: string;
        deckText?: string;
        deck?: any;
        canceled?: boolean;
        error?: string;
        issues?: any[];
        total?: number;
        skipped?: number;
        assetCount?: number;
    }>;
    queryItems: (params: IpcRequest<'deck:queryItems'>) => Promise<{
        items: import("./src/core/types/item.types.js", { with: { "resolution-mode": "import" } }).DeckItem[];
        total: number;
    }>;
    getDeckSummary: (deckId: string, now?: number) => Promise<import("./src/core/types/srs.types.js", { with: { "resolution-mode": "import" } }).SrsDeckSummary>;
    getDueItems: (deckId: string, limit?: number, now?: number) => Promise<{
        item: import("./src/core/types/item.types.js", { with: { "resolution-mode": "import" } }).DeckItem;
        card: import("./src/core/types/srs.types.js", { with: { "resolution-mode": "import" } }).SrsCard;
    }[]>;
    recordReview: (params: IpcRequest<'srs:recordReview'>) => Promise<{
        ok: boolean;
        card: import("./src/core/types/srs.types.js", { with: { "resolution-mode": "import" } }).SrsCard;
    }>;
    getCard: (params: IpcRequest<'srs:getCard'>) => Promise<import("./src/core/types/srs.types.js", { with: { "resolution-mode": "import" } }).SrsCard | null>;
    getDeckReport: (deckId: string, days?: number) => Promise<import("./src/core/types/stats.types.js", { with: { "resolution-mode": "import" } }).DeckStatsReport>;
    getOverallStreak: () => Promise<import("./src/core/types/stats.types.js", { with: { "resolution-mode": "import" } }).OverallStreak>;
    getItemMeta: (deckId: string, itemId: string) => Promise<import("./src/core/types/srs.types.js", { with: { "resolution-mode": "import" } }).ItemMetaRecord | null>;
    setItemStarred: (deckId: string, itemId: string, starred: boolean) => Promise<{
        ok: boolean;
    }>;
    setItemNote: (deckId: string, itemId: string, note: string) => Promise<{
        ok: boolean;
    }>;
    openDecks: (filePath?: string | string[]) => Promise<{
        path: string;
        ok: boolean;
        deckKey?: string;
        deckText?: string;
        deck?: any;
        error?: string;
        issues?: any[];
        total?: number;
        skipped?: number;
        assetCount?: number;
        missing?: boolean;
    }[]>;
    newDeck: () => Promise<{
        ok: boolean;
        deckKey: string;
        deckText: string;
        deck: any;
        issues: any[];
        total: number;
        skipped: number;
        assetCount: number;
    }>;
    duplicateDeck: (oldDeckKey: string) => Promise<any>;
    importDeck: (kind: string) => Promise<any>;
    saveDeck: (deckKey: string, deckText?: string, opts?: any) => Promise<{
        ok: boolean;
        path?: string;
        filePath?: string;
        deckText?: string;
        deck?: any;
        canceled?: boolean;
        error?: string;
        issues?: any[];
        total?: number;
        skipped?: number;
        assetCount?: number;
    }>;
    closeDeck: (deckKey: string) => Promise<boolean>;
    showInFolder: (filePath: string) => Promise<boolean>;
    exportCopy: (filePath: string) => Promise<{
        ok: boolean;
        path?: string;
        error?: string;
        canceled?: boolean;
    }>;
    addImages: (deckKey: string) => Promise<any>;
    addImageBytes: (deckKey: string, name: string, bytes: any) => Promise<any>;
    listAssets: (deckKey: string) => Promise<string[]>;
    removeAsset: (deckKey: string, assetPath: string) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    loadProgress: () => Promise<any>;
    saveProgress: (d: any) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    loadSettings: () => Promise<any>;
    saveSettings: (d: any) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    pickImportFile: () => Promise<{
        ok: boolean;
        path?: string;
        token?: string;
        name?: string;
        size?: number;
        canceled?: boolean;
        error?: string;
    }>;
    previewImport: (args: any) => Promise<any>;
    commitImport: (args: any) => Promise<any>;
    getLibraryDir: () => Promise<string>;
    pickLibraryDir: () => Promise<string | null>;
    setLibraryDir: (dir: string) => Promise<{
        ok: boolean;
        dir?: string;
        error?: string;
    }>;
    scanLibrary: () => Promise<any[]>;
    saveDraft: (metaId: string, deckKey: string, deckText: string) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    deleteDraft: (metaId: string) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    listDrafts: () => Promise<any[]>;
    loadDraft: (draftId: string) => Promise<any>;
    exportProgress: () => Promise<{
        ok: boolean;
        path?: string;
        canceled?: boolean;
        error?: string;
    }>;
    pickImportProgress: () => Promise<any>;
    applyImportProgress: (opts: any) => Promise<any>;
    listBackups: () => Promise<{
        name: string;
        size: number;
        mtime: number;
    }[]>;
    createBackup: () => Promise<{
        ok: boolean;
        file?: string;
        error?: string;
    }>;
    restoreBackup: (name: string) => Promise<{
        ok: boolean;
        error?: string;
    }>;
    openBackupsFolder: () => Promise<{
        ok: boolean;
        error?: string;
    }>;
    onDeckChanged: (cb: (data: any) => void) => () => void;
    onWatchError: (cb: (data: any) => void) => () => void;
    onFileAdded: (cb: (data: any) => void) => () => void;
    onFileRemoved: (cb: (data: any) => void) => () => void;
    onOpenExternal: (cb: (data: any) => void) => () => void;
    notifyReady: () => void;
};
export type WindowApi = typeof api;
export {};
//# sourceMappingURL=preload.d.ts.map