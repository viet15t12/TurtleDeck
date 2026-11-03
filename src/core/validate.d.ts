export declare const ITEM_TYPES: string[];
export declare const DECK_KINDS: string[];
export declare const MATCH_MODES: string[];
export declare const SUPPORTED_FORMAT_VERSION = 1;
export declare function parseNumber(s: unknown): number;
export declare function itemType(item: any, deckKind?: string): string | null;
export interface ValidateItemOptions {
    deckKind?: string;
    assets?: any;
}
export declare function validateItem(item: any, { deckKind, assets }?: ValidateItemOptions): any[];
export declare const hasError: (issues: any[]) => boolean;
export declare const typeLabel: (t: string) => string;
export declare function friendlyIssue(issue: any): string;
export declare function validateDeck(deck: any, { assets }?: {
    assets?: any;
}): {
    errors: string[];
    warnings: string[];
    items: any[];
};
//# sourceMappingURL=validate.d.ts.map