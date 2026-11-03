// src/core/deckmodel.ts — thao tác trên mô hình bộ thẻ (hàm thuần, không sửa state cũ, dùng chung main/renderer).
// Hỗ trợ Deck Editor (GĐ2C): newDeck, newItem, addItem, removeItems, duplicateItem, moveItem, updateItem, changeType, history...
import { kindOf, allowedTypes, defaultTypeFor, isValidKind } from './deckkinds.js';
import { normalizeTerm } from './hash.js';
const MD_IMG = /!\[[^\]]*\]\(\s*([^)\s]+)/g;
export function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
}
function slugify(s) {
    return stripAccents(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bo-the-moi';
}
export function newDeckId(title = '') {
    const base = slugify(title) || 'bo-the-moi';
    const rand = Math.random().toString(36).slice(2, 6);
    const time = Date.now().toString(36).slice(-4);
    return `${base}-${time}${rand}`;
}
export function newDeck({ title = 'Bộ thẻ mới', kind = 'quiz', lang = 'vi', description, id = null } = {}) {
    const meta = {
        id: id || newDeckId(title),
        title: String(title).trim() || 'Bộ thẻ mới',
        kind: isValidKind(kind) ? kind : 'quiz',
        lang: String(lang || 'vi').trim(),
        format: 'studydeck',
        formatVersion: 1,
    };
    if (typeof description === 'string' && description.trim() !== '') {
        meta.description = description.trim().slice(0, 200);
    }
    return {
        meta,
        items: [],
    };
}
export function newItemId(deck, prefix = 'q') {
    const existing = new Set((deck?.items || []).map((it) => it && it.id).filter(Boolean));
    let n = 1;
    while (existing.has(`${prefix}-${String(n).padStart(3, '0')}`)) {
        n++;
    }
    return `${prefix}-${String(n).padStart(3, '0')}`;
}
export function newItem(typeOrKind = 'single', id = null) {
    if (typeOrKind && typeof typeOrKind === 'object') {
        const resolvedId = id || newItemId(typeOrKind);
        return newItem(defaultTypeFor(kindOf(typeOrKind)), resolvedId);
    }
    const type = typeOrKind === 'qa'
        ? 'card'
        : (typeOrKind === 'quiz' ? 'single' : typeOrKind);
    const base = { id: id || 'q-001' };
    switch (type) {
        case 'single':
            return { ...base, type: 'single', question: '', choices: ['', ''], answer: [0], explanation: '' };
        case 'multi':
            return { ...base, type: 'multi', question: '', choices: ['', ''], answer: [0], explanation: '' };
        case 'fill':
            return { ...base, type: 'fill', question: '', answer: [''], match: 'normalized', explanation: '' };
        case 'command':
            return { ...base, type: 'command', question: '', answer: [''], match: 'normalized', explanation: '' };
        case 'card':
            return { ...base, type: 'card', front: '', back: '' };
        case 'vocab':
            return { ...base, type: 'vocab', term: '', definition: '', tags: [] };
        default:
            return { ...base, type: 'single', question: '', choices: ['', ''], answer: [0] };
    }
}
export function addItem(deck, item, atIndex = -1) {
    const items = [...(deck?.items || [])];
    if (atIndex < 0 || atIndex >= items.length) {
        items.push(item);
    }
    else {
        items.splice(atIndex, 0, item);
    }
    return { ...deck, items };
}
export function removeItems(deck, itemIds) {
    const ids = new Set(Array.isArray(itemIds) ? itemIds : [itemIds]);
    const items = (deck?.items || []).filter((it) => !ids.has(it.id));
    return { ...deck, items };
}
export function duplicateItem(deck, itemId) {
    const items = [...(deck?.items || [])];
    const idx = items.findIndex((it) => it.id === itemId);
    if (idx === -1)
        return deck;
    const original = items[idx];
    const newId = newItemId(deck);
    const clone = JSON.parse(JSON.stringify(original));
    clone.id = newId;
    items.splice(idx + 1, 0, clone);
    return { ...deck, items };
}
export function moveItem(deck, fromIndex, toIndex) {
    const items = [...(deck?.items || [])];
    if (fromIndex < 0 || fromIndex >= items.length ||
        toIndex < 0 || toIndex >= items.length ||
        fromIndex === toIndex) {
        return deck;
    }
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    return { ...deck, items };
}
export function updateItem(deck, itemId, patchOrFn) {
    const items = (deck?.items || []).map((it) => {
        if (it.id !== itemId)
            return it;
        if (typeof patchOrFn === 'function') {
            return patchOrFn(it);
        }
        return { ...it, ...patchOrFn };
    });
    return { ...deck, items };
}
export function changeType(item, newType) {
    if (!item || item.type === newType)
        return item;
    const common = {
        id: item.id,
        topic: item.topic,
        tags: item.tags ? [...item.tags] : undefined,
        image: item.image,
        answerImage: item.answerImage,
        explanation: item.explanation,
    };
    for (const k of Object.keys(common)) {
        if (common[k] === undefined)
            delete common[k];
    }
    const qText = item.question ?? item.front ?? item.term ?? '';
    let textAnswers = [];
    if (Array.isArray(item.choices) && Array.isArray(item.answer)) {
        textAnswers = item.answer.map((idx) => {
            const c = item.choices[idx];
            return typeof c === 'string' ? c : (c?.text ?? '');
        }).filter((s) => s !== '');
    }
    else if (Array.isArray(item.answer)) {
        textAnswers = item.answer.map(String).filter((s) => s !== '');
    }
    else if (typeof item.back === 'string' && item.back) {
        textAnswers = [item.back];
    }
    else if (typeof item.definition === 'string' && item.definition) {
        textAnswers = [item.definition];
    }
    switch (newType) {
        case 'single': {
            let choices;
            let answer = [0];
            if (Array.isArray(item.choices) && item.choices.length >= 2) {
                choices = JSON.parse(JSON.stringify(item.choices));
                if (Array.isArray(item.answer) && item.answer.length > 0) {
                    answer = [item.answer[0]];
                }
            }
            else {
                const firstAns = textAnswers[0] || 'Đáp án đúng';
                choices = [firstAns, 'Lựa chọn 2'];
                answer = [0];
            }
            return { ...common, type: 'single', question: qText, choices, answer };
        }
        case 'multi': {
            let choices;
            let answer = [0];
            if (Array.isArray(item.choices) && item.choices.length >= 2) {
                choices = JSON.parse(JSON.stringify(item.choices));
                if (Array.isArray(item.answer) && item.answer.length > 0) {
                    answer = [...item.answer];
                }
            }
            else {
                const firstAns = textAnswers[0] || 'Đáp án đúng';
                choices = [firstAns, 'Lựa chọn 2'];
                answer = [0];
            }
            return { ...common, type: 'multi', question: qText, choices, answer };
        }
        case 'fill': {
            const answers = textAnswers.length ? textAnswers : [''];
            const res = {
                ...common,
                type: 'fill',
                question: qText,
                answer: answers,
                match: item.match || 'normalized',
            };
            if (item.tolerance !== undefined)
                res.tolerance = item.tolerance;
            if (item.answerDisplay !== undefined)
                res.answerDisplay = item.answerDisplay;
            return res;
        }
        case 'command': {
            const answers = textAnswers.length ? textAnswers : [''];
            const res = {
                ...common,
                type: 'command',
                question: qText,
                answer: answers,
                match: item.match || 'normalized',
            };
            if (item.answerDisplay !== undefined)
                res.answerDisplay = item.answerDisplay;
            return res;
        }
        case 'card': {
            const back = textAnswers.join('\n\n') || item.back || item.definition || '';
            return {
                ...common,
                type: 'card',
                front: qText,
                back,
            };
        }
        case 'vocab': {
            const definition = textAnswers[0] || item.definition || item.back || '';
            const res = {
                ...common,
                type: 'vocab',
                term: qText,
                definition,
            };
            if (item.phonetic)
                res.phonetic = item.phonetic;
            if (item.pos)
                res.pos = item.pos;
            if (item.example)
                res.example = item.example;
            if (item.forms)
                res.forms = [...item.forms];
            return res;
        }
        default:
            return { ...common, type: newType, question: qText };
    }
}
export function imageRefs(item) {
    const out = new Set();
    const walk = (v, key) => {
        if (typeof v === 'string') {
            if (key === 'image' || key === 'answerImage') {
                if (v.trim())
                    out.add(v.trim());
            }
            for (const m of v.matchAll(MD_IMG))
                out.add(m[1]);
        }
        else if (Array.isArray(v)) {
            v.forEach(x => walk(x, key));
        }
        else if (v && typeof v === 'object') {
            for (const [k, x] of Object.entries(v))
                walk(x, k);
        }
    };
    walk(item);
    return out;
}
export function collectImageRefs(deck) {
    const all = new Set();
    for (const it of deck?.items ?? []) {
        for (const r of imageRefs(it))
            all.add(r);
    }
    return all;
}
export function unusedAssets(deck, assets) {
    const used = collectImageRefs(deck);
    const out = [];
    const list = assets instanceof Map || assets instanceof Set ? [...(assets.keys ? assets.keys() : assets)]
        : Array.isArray(assets) ? assets
            : (assets && typeof assets === 'object') ? Object.keys(assets)
                : [];
    for (const path of list) {
        if (!used.has(path)) {
            out.push(path);
        }
    }
    return out;
}
export function newItemLike(deck, refItem = null) {
    const id = newItemId(deck);
    const deckKind = kindOf(deck);
    const allowed = new Set(allowedTypes(deckKind));
    const refType = refItem?.type && allowed.has(refItem.type) ? refItem.type : null;
    const rawType = refType || defaultTypeFor(deckKind);
    const type = rawType === 'multi' ? 'single' : rawType;
    let item = newItem(type, id);
    if (type === 'single' || type === 'multi') {
        item = { ...item, choices: ['', '', '', ''], answer: [0] };
    }
    if (refItem?.topic && typeof refItem.topic === 'string' && refItem.topic.trim()) {
        item.topic = refItem.topic.trim();
    }
    if (Array.isArray(refItem?.tags) && refItem.tags.length > 0) {
        item.tags = [...refItem.tags];
    }
    return item;
}
export function isBlankNewItem(item) {
    if (!item || typeof item !== 'object')
        return false;
    const main = (item.question ?? item.front ?? item.term ?? '').trim();
    if (main)
        return false;
    if ((item.explanation ?? '').trim() || (item.image ?? '').trim() || (item.answerImage ?? '').trim())
        return false;
    if ((item.back ?? '').trim() || (item.definition ?? '').trim())
        return false;
    if ((item.phonetic ?? '').trim() || (item.pos ?? '').trim() || (item.example ?? '').trim())
        return false;
    if (Array.isArray(item.forms) && item.forms.length > 0)
        return false;
    if (Array.isArray(item.synonyms) && item.synonyms.length > 0)
        return false;
    if (Array.isArray(item.choices)) {
        const anyChoice = item.choices.some((c) => typeof c === 'string' ? c.trim() !== '' : ((c?.text ?? '').trim() !== '' || (c?.image ?? '').trim() !== ''));
        if (anyChoice)
            return false;
    }
    if ((item.type === 'fill' || item.type === 'command') && Array.isArray(item.answer)) {
        if (item.answer.some((a) => String(a ?? '').trim() !== ''))
            return false;
    }
    return true;
}
export function setCorrect(item, index, on) {
    if (!item || typeof item !== 'object')
        return item;
    const current = new Set(Array.isArray(item.answer) ? item.answer : []);
    const shouldBeOn = on === undefined ? !current.has(index) : Boolean(on);
    if (shouldBeOn)
        current.add(index);
    else
        current.delete(index);
    const answer = [...current].sort((a, b) => a - b);
    const type = answer.length >= 2 ? 'multi' : 'single';
    return { ...item, type, answer };
}
export function splitPastedChoices(text) {
    const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return lines.map(line => {
        let s = line;
        let correct = false;
        if (/^\[[xX✓✔]\]\s*/.test(s)) {
            correct = true;
            s = s.replace(/^\[[xX✓✔]\]\s*/, '');
        }
        else if (/^\[\s*\]\s*/.test(s)) {
            s = s.replace(/^\[\s*\]\s*/, '');
        }
        else if (/^\*\s*/.test(s)) {
            correct = true;
            s = s.replace(/^\*\s*/, '');
        }
        else if (/^[-•]\s+/.test(s)) {
            s = s.replace(/^[-•]\s+/, '');
        }
        s = s.replace(/^(?:\([A-Za-z0-9]+\)|[A-Za-z0-9]+[.)])\s*/, '');
        if (/^\[[xX✓✔]\]\s*/.test(s)) {
            correct = true;
            s = s.replace(/^\[[xX✓✔]\]\s*/, '');
        }
        else if (/^\[\s*\]\s*/.test(s)) {
            s = s.replace(/^\[\s*\]\s*/, '');
        }
        return { text: s.trim(), correct };
    }).filter(c => c.text !== '');
}
export function normalizeOnLeave(item) {
    if (!item || typeof item !== 'object')
        return item;
    const out = JSON.parse(JSON.stringify(item));
    for (const f of ['question', 'front', 'back', 'explanation', 'topic', 'answerDisplay', 'term', 'definition', 'phonetic', 'pos', 'example']) {
        if (typeof out[f] === 'string')
            out[f] = out[f].trim();
    }
    for (const f of ['forms', 'synonyms', 'tags']) {
        if (Array.isArray(out[f])) {
            out[f] = out[f].map((s) => String(s ?? '').trim()).filter(Boolean);
        }
    }
    if (Array.isArray(out.choices)) {
        out.choices = out.choices.map((c) => {
            if (typeof c === 'string')
                return c.trim();
            if (c && typeof c === 'object') {
                const next = { ...c };
                if (typeof next.text === 'string')
                    next.text = next.text.trim();
                if (typeof next.image === 'string')
                    next.image = next.image.trim();
                return next;
            }
            return c;
        });
        const isChoiceEmpty = (c) => typeof c === 'string' ? c.trim() === '' : !((c?.text ?? '').trim() || (c?.image ?? '').trim());
        const ansSet = new Set(Array.isArray(out.answer) ? out.answer : []);
        while (out.choices.length > 2) {
            const lastIdx = out.choices.length - 1;
            if (isChoiceEmpty(out.choices[lastIdx]) && !ansSet.has(lastIdx)) {
                out.choices.pop();
            }
            else {
                break;
            }
        }
        if (Array.isArray(out.answer)) {
            out.answer = out.answer.filter((i) => Number.isInteger(i) && i >= 0 && i < out.choices.length);
            out.type = out.answer.length >= 2 ? 'multi' : 'single';
        }
    }
    else if ((out.type === 'fill' || out.type === 'command') && Array.isArray(out.answer)) {
        const trimmed = out.answer.map((a) => String(a ?? '').trim());
        const nonEmpty = trimmed.filter(Boolean);
        out.answer = nonEmpty.length > 0 ? nonEmpty : [''];
    }
    return out;
}
export function addImportedItems(deck, importedItems) {
    if (!deck || typeof deck !== 'object') {
        return { deck, added: [], skipped: [] };
    }
    const currentItems = [...(deck.items || [])];
    const existingIds = new Set(currentItems.map(it => it && it.id).filter(Boolean));
    const existingTerms = new Set(currentItems
        .filter(it => it && typeof it === 'object' && ('term' in it || it.type === 'vocab'))
        .map(it => normalizeTerm(it.term)));
    const added = [];
    const skipped = [];
    for (const it of (importedItems || [])) {
        if (!it || typeof it !== 'object')
            continue;
        const isVocab = 'term' in it || it.type === 'vocab';
        const norm = isVocab ? normalizeTerm(it.term) : null;
        const isDupId = existingIds.has(it.id);
        const isDupTerm = Boolean(isVocab && norm && existingTerms.has(norm));
        if (isDupId || isDupTerm) {
            skipped.push({ item: it, reason: isDupId ? 'trùng id' : 'trùng từ vựng' });
        }
        else {
            existingIds.add(it.id);
            if (norm)
                existingTerms.add(norm);
            added.push(it);
            currentItems.push(it);
        }
    }
    return {
        deck: { ...deck, items: currentItems },
        added,
        skipped,
    };
}
export function createHistory(initialDeck, limit = 100) {
    let past = [];
    let present = { deck: initialDeck, cursor: null };
    let future = [];
    let lastTypingTime = 0;
    let lastMergeKey = null;
    return {
        push(newDeck, { isTyping = false, mergeKey = null, now = Date.now(), cursor = null, beforeCursor = null } = {}) {
            const typingActive = Boolean(isTyping || mergeKey);
            const sameKey = !mergeKey || !lastMergeKey || mergeKey === lastMergeKey;
            if (typingActive && sameKey && lastTypingTime && (now - lastTypingTime < 500)) {
                present = { deck: newDeck, cursor: cursor ?? present.cursor };
                lastTypingTime = now;
                lastMergeKey = mergeKey;
                future = [];
                return;
            }
            const prevSnap = beforeCursor ? { deck: present.deck, cursor: beforeCursor } : present;
            past.push(prevSnap);
            if (past.length > limit)
                past.shift();
            present = { deck: newDeck, cursor };
            future = [];
            lastTypingTime = typingActive ? now : 0;
            lastMergeKey = typingActive ? mergeKey : null;
        },
        undo() {
            if (!past.length)
                return present.deck;
            future.unshift(present);
            present = past.pop();
            lastTypingTime = 0;
            lastMergeKey = null;
            return present.deck;
        },
        redo() {
            if (!future.length)
                return present.deck;
            past.push(present);
            present = future.shift();
            lastTypingTime = 0;
            lastMergeKey = null;
            return present.deck;
        },
        canUndo() {
            return past.length > 0;
        },
        canRedo() {
            return future.length > 0;
        },
        current() {
            return present.deck;
        },
        cursor() {
            return present.cursor;
        },
        reset(deck, cursor = null) {
            past = [];
            present = { deck, cursor };
            future = [];
            lastTypingTime = 0;
        },
    };
}
//# sourceMappingURL=deckmodel.js.map