export declare const norm: (s: unknown) => string;
export declare function lev(a: string, b: string): number;
export declare function gradeNumber(input: unknown, answers: unknown, tol?: number): {
    ok: boolean;
    near: boolean;
};
export declare const normLatex: (s: unknown) => string;
export declare function gradeLatex(input: unknown, answers: unknown): {
    ok: boolean;
    near: boolean;
};
export interface GradeTextOptions {
    tolerance?: number;
    [key: string]: any;
}
export declare function gradeText(input: unknown, answers: unknown, mode?: string, options?: GradeTextOptions): {
    ok: boolean;
    near: boolean;
};
export declare function gradeChoices(selected: unknown, correct: unknown): {
    ok: boolean;
    near: boolean;
};
//# sourceMappingURL=grader.d.ts.map