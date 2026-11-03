export type ItemType = 'single' | 'multi' | 'fill' | 'command' | 'card' | 'vocab';
export type TextMatchMode = 'exact' | 'normalized' | 'regex' | 'number';
export interface ChoiceObject {
    text?: string;
    image?: string;
}
export type ChoiceItem = string | ChoiceObject;
export interface BaseItem {
    id: string;
    topic?: string;
    tags?: string[];
    explanation?: string;
    image?: string;
    answerImage?: string;
    starred?: boolean;
    note?: string;
}
export interface SingleChoiceItem extends BaseItem {
    type: 'single';
    question: string;
    choices: ChoiceItem[];
    answer: [number];
}
export interface MultiChoiceItem extends BaseItem {
    type: 'multi';
    question: string;
    choices: ChoiceItem[];
    answer: number[];
}
export interface FillItem extends BaseItem {
    type: 'fill';
    question: string;
    answer: string[];
    match?: TextMatchMode;
    tolerance?: number;
    answerDisplay?: string;
}
export interface CommandItem extends BaseItem {
    type: 'command';
    question: string;
    answer: string[];
    match?: 'exact' | 'regex';
    answerDisplay?: string;
}
export interface FlashcardItem extends BaseItem {
    type: 'card';
    front: string;
    back: string;
}
export interface VocabItem extends BaseItem {
    type: 'vocab';
    term: string;
    definition: string;
    phonetic?: string;
    pos?: string;
    example?: string;
    forms?: string[];
    synonyms?: string[];
    audio?: string;
}
export type DeckItem = SingleChoiceItem | MultiChoiceItem | FillItem | CommandItem | FlashcardItem | VocabItem;
//# sourceMappingURL=item.types.d.ts.map