// src/core/builder.ts — chuyển đổi item về cấu trúc Question thống nhất (hàm thuần, ES module).
// Hỗ trợ single, multi, fill, command, card và các chế độ vocab (MC, Write, Cloze, Listen, Flashcards).
import { validateItem, hasError } from './validate.js';
import { lev } from './grader.js';
import { toPlain } from './richtext.js';
const norm = (s) => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
export function shuffle(array, rand = Math.random) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
// ── Các hàm builder cho Từ vựng (vocab) ─────────────────────────────────────
export function buildMC(item, all = [], dir = 'fwd', { count = 4, rng = Math.random } = {}) {
    if (!item || !item.term || !item.definition)
        return null;
    const isFwd = dir === 'fwd';
    const prompt = isFwd ? item.term : item.definition;
    const targetKey = isFwd ? 'definition' : 'term';
    const correctAnswer = item[targetKey];
    const normCorrect = norm(correctAnswer);
    if (!normCorrect)
        return null;
    const validCandidates = (all || []).filter(it => it && it.id !== item.id && (it.term || it.type === 'vocab') && it[targetKey] && it.term && it.definition);
    const groupPos = [];
    const groupTag = [];
    const groupOther = [];
    const itemTags = new Set(Array.isArray(item.tags) ? item.tags : []);
    for (const c of validCandidates) {
        const cAns = c[targetKey];
        const normAns = norm(cAns);
        if (normAns === normCorrect)
            continue;
        const d = lev(normAns, normCorrect);
        const maxD = normCorrect.length >= 8 ? 2 : 1;
        if (d <= maxD)
            continue;
        if (item.pos && c.pos && norm(item.pos) === norm(c.pos)) {
            groupPos.push(c);
        }
        else if (Array.isArray(c.tags) && c.tags.some((t) => itemTags.has(t))) {
            groupTag.push(c);
        }
        else {
            groupOther.push(c);
        }
    }
    const prioritized = [
        ...shuffle(groupPos, rng),
        ...shuffle(groupTag, rng),
        ...shuffle(groupOther, rng),
    ];
    const chosenDistractors = [];
    const seenNorm = new Set([normCorrect]);
    for (const cand of prioritized) {
        const text = cand[targetKey];
        const n = norm(text);
        if (!seenNorm.has(n)) {
            seenNorm.add(n);
            chosenDistractors.push(text);
            if (chosenDistractors.length >= count - 1)
                break;
        }
    }
    const totalChoices = [correctAnswer, ...chosenDistractors];
    if (totalChoices.length < 2) {
        return null;
    }
    const shuffledChoices = shuffle(totalChoices, rng);
    const correctIndex = shuffledChoices.indexOf(correctAnswer);
    return {
        id: item.id,
        kind: 'single',
        prompt,
        choices: shuffledChoices,
        answers: [correctIndex],
        direction: dir,
        explanation: item.example ? `*Ví dụ:* ${item.example}` : (item.explanation || ''),
        topic: item.pos,
        tags: item.tags,
        phonetic: item.phonetic,
        image: isFwd ? item.image : undefined,
        rawItem: item,
    };
}
export function buildWrite(item, dir = 'rev') {
    if (!item || !item.term || !item.definition)
        return null;
    if (dir === 'rev') {
        return {
            id: item.id,
            kind: 'fill',
            prompt: item.definition,
            answers: [toPlain(item.term)],
            match: 'normalized',
            direction: 'rev',
            explanation: item.example ? `*Ví dụ:* ${item.example}` : '',
            topic: item.pos,
            tags: item.tags,
            rawItem: item,
        };
    }
    const fullDef = toPlain(item.definition);
    const splitParts = item.definition.split(/[;]/).map((s) => toPlain(s)).filter(Boolean);
    const answers = [...new Set([fullDef, ...splitParts])];
    return {
        id: item.id,
        kind: 'fill',
        prompt: item.term,
        answers,
        match: 'normalized',
        direction: 'fwd',
        explanation: item.example ? `*Ví dụ:* ${item.example}` : '',
        topic: item.pos,
        tags: item.tags,
        phonetic: item.phonetic,
        image: item.image,
        rawItem: item,
    };
}
export function buildCloze(item) {
    if (!item || !item.example || !item.term)
        return null;
    const rawExample = String(item.example);
    const maskedTokens = [];
    const maskToken = (text) => {
        const idx = maskedTokens.length;
        maskedTokens.push(text);
        return `\x00CLOZEMASK_${idx}\x00`;
    };
    let maskedText = rawExample
        .replace(/\$\$[\s\S]*?\$\$/g, maskToken)
        .replace(/\$[^$\n]+\$/g, maskToken)
        .replace(/!\[[^\]]*\]\([^)]*\)/g, maskToken);
    const allForms = [item.term, ...(Array.isArray(item.forms) ? item.forms : [])].filter(Boolean);
    const sortedForms = [...allForms].sort((a, b) => b.length - a.length);
    let firstMatch = null;
    let replaced = maskedText;
    for (const f of sortedForms) {
        const escaped = f.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const regex = new RegExp(`(?:^|(?<=[^\\p{L}\\p{N}_]))(${escaped})(?:$|(?=[^\\p{L}\\p{N}_]))`, 'gui');
        replaced = replaced.replace(regex, (_match, word) => {
            if (!firstMatch)
                firstMatch = word;
            return '_____';
        });
    }
    if (!firstMatch)
        return null;
    const prompt = replaced.replace(/\x00CLOZEMASK_(\d+)\x00/g, (_, idx) => maskedTokens[Number(idx)] || '');
    const hint = item.definition + (item.pos ? ` (${item.pos})` : '');
    return {
        id: item.id,
        kind: 'fill',
        prompt,
        answers: [firstMatch],
        match: 'normalized',
        hint,
        direction: 'rev',
        explanation: item.example,
        topic: item.pos,
        tags: item.tags,
        rawItem: item,
    };
}
export function buildListen(item) {
    if (!item || !item.term)
        return null;
    const cleanTerm = toPlain(item.term);
    return {
        id: item.id,
        kind: 'listen',
        prompt: '',
        speak: cleanTerm,
        answers: [cleanTerm],
        match: 'normalized',
        direction: 'rev',
        phonetic: item.phonetic,
        definition: item.definition,
        example: item.example,
        image: item.image,
        explanation: [item.phonetic, item.definition, item.example ? `*Ví dụ:* ${item.example}` : ''].filter(Boolean).join('\n\n'),
        topic: item.pos,
        tags: item.tags,
        rawItem: item,
    };
}
export function buildFlashcard(item, dir = 'fwd') {
    if (!item)
        return null;
    const isFwd = dir === 'fwd';
    const termDisplay = [item.term, item.phonetic].filter(Boolean).join(' ');
    const front = isFwd ? termDisplay : (item.definition ?? '');
    const back = isFwd ? (item.definition ?? '') : termDisplay;
    return {
        id: item.id,
        kind: 'card',
        prompt: front,
        front,
        back,
        answers: [back],
        direction: dir,
        phonetic: item.phonetic,
        pos: item.pos,
        example: item.example,
        image: isFwd ? item.image : undefined,
        answerImage: !isFwd ? item.image : undefined,
        explanation: item.example ? `*Ví dụ:* ${item.example}` : '',
        topic: item.pos,
        tags: item.tags,
        rawItem: item,
    };
}
export function buildQuestion(item, opts = {}) {
    if (!item || typeof item !== 'object')
        return null;
    const type = item.type || (item.term ? 'vocab' : (item.front ? 'card' : null));
    switch (type) {
        case 'single':
            return {
                id: item.id,
                kind: 'single',
                prompt: item.question ?? '',
                choices: Array.isArray(item.choices) ? [...item.choices] : [],
                answers: Array.isArray(item.answer) ? [...item.answer] : [item.answer],
                image: item.image,
                answerImage: item.answerImage,
                answerDisplay: item.answerDisplay,
                explanation: item.explanation ?? '',
                topic: item.topic,
                tags: item.tags,
                rawItem: item,
            };
        case 'multi':
            return {
                id: item.id,
                kind: 'multi',
                prompt: item.question ?? '',
                choices: Array.isArray(item.choices) ? [...item.choices] : [],
                answers: Array.isArray(item.answer) ? [...item.answer] : [item.answer],
                image: item.image,
                answerImage: item.answerImage,
                answerDisplay: item.answerDisplay,
                explanation: item.explanation ?? '',
                topic: item.topic,
                tags: item.tags,
                rawItem: item,
            };
        case 'fill':
            return {
                id: item.id,
                kind: 'fill',
                prompt: item.question ?? '',
                answers: Array.isArray(item.answer) ? [...item.answer] : [item.answer],
                match: item.match ?? 'normalized',
                tolerance: item.tolerance,
                image: item.image,
                answerImage: item.answerImage,
                answerDisplay: item.answerDisplay,
                explanation: item.explanation ?? '',
                topic: item.topic,
                tags: item.tags,
                rawItem: item,
            };
        case 'command':
            return {
                id: item.id,
                kind: 'command',
                prompt: item.question ?? '',
                answers: Array.isArray(item.answer) ? [...item.answer] : [item.answer],
                match: item.match ?? 'normalized',
                image: item.image,
                answerImage: item.answerImage,
                answerDisplay: item.answerDisplay,
                explanation: item.explanation ?? '',
                topic: item.topic,
                tags: item.tags,
                rawItem: item,
            };
        case 'card':
            return {
                id: item.id,
                kind: 'card',
                prompt: item.front ?? '',
                front: item.front ?? '',
                back: item.back ?? '',
                answers: [item.back ?? ''],
                image: item.image,
                answerImage: item.answerImage,
                answerDisplay: item.answerDisplay,
                explanation: item.explanation ?? '',
                topic: item.topic,
                tags: item.tags,
                rawItem: item,
            };
        case 'vocab': {
            const mode = opts.mode;
            const dir = opts.dir || opts.direction || 'fwd';
            if (mode === 'mc')
                return buildMC(item, opts.allItems || [], dir, opts);
            if (mode === 'write')
                return buildWrite(item, dir);
            if (mode === 'cloze')
                return buildCloze(item);
            if (mode === 'listen')
                return buildListen(item);
            return buildFlashcard(item, dir);
        }
        default:
            return null;
    }
}
export function buildSessionQuestions(items, options = {}) {
    const validItems = (items || []).filter(it => !hasError(validateItem(it, { deckKind: options.deckKind })));
    let list = [];
    const mode = options.mode || (options.deckKind === 'vocab' ? 'flashcards' : undefined);
    const direction = options.direction || 'both';
    if (options.deckKind === 'vocab') {
        const dirs = direction === 'both' ? ['fwd', 'rev'] : [direction];
        for (const it of validItems) {
            for (const d of dirs) {
                let q = null;
                if (mode === 'mc')
                    q = buildMC(it, validItems, d, options);
                else if (mode === 'write')
                    q = buildWrite(it, d);
                else if (mode === 'cloze')
                    q = buildCloze(it);
                else if (mode === 'listen')
                    q = buildListen(it);
                else
                    q = buildFlashcard(it, d);
                if (q)
                    list.push(q);
            }
        }
    }
    else {
        list = validItems.map(it => buildQuestion(it, options)).filter(Boolean);
    }
    if (options.itemIds && Array.isArray(options.itemIds)) {
        const idSet = new Set(options.itemIds);
        list = list.filter(q => idSet.has(q.id));
    }
    if (options.shuffle) {
        list = shuffle(list, options.rng || Math.random);
    }
    if (list.length > 2) {
        for (let i = 0; i < list.length - 1; i++) {
            if (list[i].id === list[i + 1].id) {
                const swapIdx = list.findIndex((q, idx) => idx > i + 1 && q.id !== list[i].id);
                if (swapIdx !== -1) {
                    const temp = list[i + 1];
                    list[i + 1] = list[swapIdx];
                    list[swapIdx] = temp;
                }
            }
        }
    }
    const count = Number(options.count);
    if (count > 0 && count < list.length) {
        list = list.slice(0, count);
    }
    return list;
}
//# sourceMappingURL=builder.js.map