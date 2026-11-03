export declare const LEARN_STAGES: string[];
export declare const QUIZ_LEARN_STAGES: string[];
export declare function getStagesForKind(deckKind?: string): string[];
export declare function nextStage(entry: any, correct: boolean, stages?: string[]): string | null;
export declare function pickNext(queue: any[], lastId?: string): any;
export declare function initLearnQueue(items?: any[], { deckKind }?: {
    deckKind?: string | undefined;
}): any[];
export declare function buildLearnQuestion(entry: any, allItems?: any[]): any;
export declare function graduateToSRS(entry: any, progress?: any, { deckId, now, rating }?: {
    deckId?: string | undefined;
    now?: number | undefined;
    rating?: number | undefined;
}): any;
//# sourceMappingURL=learnplanner.d.ts.map