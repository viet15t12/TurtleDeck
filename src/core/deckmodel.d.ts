export declare function stripAccents(s: unknown): string;
export declare function newDeckId(title?: string): string;
export declare function newDeck({ title, kind, lang, description, id }?: any): any;
export declare function newItemId(deck: any, prefix?: string): string;
export declare function newItem(typeOrKind?: any, id?: string | null): any;
export declare function addItem(deck: any, item: any, atIndex?: number): any;
export declare function removeItems(deck: any, itemIds: string | string[]): any;
export declare function duplicateItem(deck: any, itemId: string): any;
export declare function moveItem(deck: any, fromIndex: number, toIndex: number): any;
export declare function updateItem(deck: any, itemId: string, patchOrFn: any): any;
export declare function changeType(item: any, newType: string): any;
export declare function imageRefs(item: any): Set<string>;
export declare function collectImageRefs(deck: any): Set<string>;
export declare function unusedAssets(deck: any, assets: any): string[];
export declare function newItemLike(deck: any, refItem?: any): any;
export declare function isBlankNewItem(item: any): boolean;
export declare function setCorrect(item: any, index: number, on?: boolean): any;
export declare function splitPastedChoices(text: unknown): {
    text: string;
    correct: boolean;
}[];
export declare function normalizeOnLeave(item: any): any;
export declare function addImportedItems(deck: any, importedItems: any[]): any;
export declare function createHistory(initialDeck: any, limit?: number): {
    push(newDeck: any, { isTyping, mergeKey, now, cursor, beforeCursor }?: any): void;
    undo(): any;
    redo(): any;
    canUndo(): boolean;
    canRedo(): boolean;
    current(): any;
    cursor(): any;
    reset(deck: any, cursor?: null): void;
};
//# sourceMappingURL=deckmodel.d.ts.map