import { DeckKind } from './types/deck.types.js';
export interface ModeInfo {
    id: string;
    label: string;
    description: string;
}
export interface KindInfo {
    id: DeckKind;
    label: string;
    description: string;
    icon: string;
    allowedTypes: string[];
    defaultType: string;
    available: boolean;
    comingSoon: string | null;
    modes: ModeInfo[];
}
export declare const KINDS: Record<DeckKind, KindInfo>;
export declare const ITEM_TYPE_LABELS: Record<string, string>;
export declare function isValidKind(kind: unknown): kind is DeckKind;
export declare function detectItemType(item: any, deckKind?: string): string | null;
export declare const itemType: typeof detectItemType;
export declare function inferKind(itemsOrDeck: any): DeckKind;
export declare function kindOf(deckOrKind: any): DeckKind;
export declare function allowedTypes(kindOrDeck: any): string[];
export declare function defaultTypeFor(kindOrDeck: any): string;
export declare function modesFor(kindOrDeck: any): ModeInfo[];
export declare function mismatchedItems(deckOrItems: any, targetKind?: any): any[];
export declare function kindLabel(kindOrDeck: any): string;
export declare function itemTypeLabel(type: string | null | undefined): string;
export declare function formatMismatchWarning(deckOrItems: any, targetKind?: any): string;
export declare function checkModeAvailability(modeId: string, deckOrItems: any, { hasVoice }?: {
    hasVoice?: boolean | undefined;
}): {
    available: boolean;
    reason: string;
};
//# sourceMappingURL=deckkinds.d.ts.map