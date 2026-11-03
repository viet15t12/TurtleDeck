import { DeckItem } from './types/item.types.js';
import { DeckKind } from './types/deck.types.js';
import { SrsCard, SrsDirection, LegacyReviewLog } from './types/srs.types.js';
export declare const DEFAULT_NEW_CARDS_PER_DAY = 20;
export declare function localDayKey(now?: number, timeZone?: string): string;
export interface CountNewOptions {
    deckId?: string;
    cards?: Record<string, SrsCard>;
    timeZone?: string;
}
export declare function countNewStudiedToday(log?: (LegacyReviewLog & {
    isNew?: boolean;
})[], now?: number, { deckId, cards, timeZone }?: CountNewOptions): number;
export interface PlanOptions {
    deckId?: string;
    deckKind?: DeckKind;
    newCardsPerDay?: number;
    direction?: SrsDirection;
    timeZone?: string;
    count?: number;
    mode?: string;
    log?: (LegacyReviewLog & {
        isNew?: boolean;
    })[];
    [key: string]: any;
}
export declare function getValidDeckItems(deckOrItems: any, deckKind?: DeckKind): DeckItem[];
export declare function deckDueCounts(deckOrItems: any, progress?: any, now?: number, opts?: PlanOptions): {
    due: number;
    learning: number;
    dueToday: number;
    newAvailable: number;
    newStudiedToday: number;
    newToday: number;
    total: number;
};
export declare function planSession(deckOrItems: any, progress?: any, now?: number, opts?: PlanOptions): any[];
export declare function reinsertWrong(queue: any[], currentIndexOrItem: any, opts?: any): any[];
export { LEARN_STAGES, QUIZ_LEARN_STAGES, getStagesForKind, nextStage, pickNext, initLearnQueue, buildLearnQuestion, graduateToSRS, } from './learnplanner.js';
//# sourceMappingURL=planner.d.ts.map