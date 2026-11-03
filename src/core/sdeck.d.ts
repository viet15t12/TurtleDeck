export declare const LIMITS: {
    entries: number;
    deckJson: number;
    image: number;
    total: number;
};
export declare const FORMAT = "studydeck";
export declare const FORMAT_VERSION = 1;
export declare function isSafeEntry(name: unknown): boolean;
export declare const isImageEntry: (name: unknown) => boolean;
export declare function detectImageType(b: Uint8Array | null | undefined): string | null;
export declare function readPackage(bytes: Uint8Array | null | undefined): any;
export declare function readPackageMeta(bytes: Uint8Array | null | undefined): any;
export declare function writePackage(deckText: string, assets?: Map<string, Uint8Array>, { prune }?: {
    prune?: boolean;
}): any;
export declare function addImage(assets: Map<string, Uint8Array>, originalName: string, bytes: Uint8Array): any;
export declare function collectAssetsFromDir(dir: string, deckText: string): Promise<{
    assets: Map<string, Uint8Array>;
    issues: string[];
}>;
//# sourceMappingURL=sdeck.d.ts.map