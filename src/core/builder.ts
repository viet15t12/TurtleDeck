// src/core/builder.ts — chuyển đổi item về cấu trúc Question thống nhất (hàm thuần, ES module).
// Hỗ trợ single, multi, fill, command, card và các chế độ vocab (MC, Write, Cloze, Listen, Flashcards).

import { validateItem, hasError } from './validate.js';
import { lev } from './grader.js';
import { toPlain } from './richtext.js';
import { getItemForLanguage, getPrimaryLanguage } from './deckmodel.js';
import { shuffleWordBank } from './word-order.js';

const norm = (s: unknown): string => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

export function shuffle<T>(array: T[], rand = Math.random): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function applyQuestionSpacing(list: any[], minSeparation = 5): any[] {
  if (!Array.isArray(list) || list.length <= 2) return list || [];
  const result = [...list];
  const getId = (q: any) => q?.rootId || q?.itemId || q?.id;

  for (let i = 0; i < result.length - 1; i++) {
    const curId = getId(result[i]);
    const maxLookahead = Math.min(result.length - 1, i + minSeparation);
    for (let j = i + 1; j <= maxLookahead; j++) {
      if (getId(result[j]) === curId) {
        let swapIdx = -1;
        for (let k = i + minSeparation + 1; k < result.length; k++) {
          if (getId(result[k]) !== curId) {
            const prevJ = getId(result[j - 1]);
            const nextJ = j < result.length - 1 ? getId(result[j + 1]) : null;
            if (getId(result[k]) !== prevJ && getId(result[k]) !== nextJ) {
              swapIdx = k;
              break;
            } else if (swapIdx === -1) {
              swapIdx = k;
            }
          }
        }
        if (swapIdx === -1) {
          for (let k = result.length - 1; k > j; k--) {
            if (getId(result[k]) !== curId) {
              swapIdx = k;
              break;
            }
          }
        }
        if (swapIdx !== -1) {
          const temp = result[j];
          result[j] = result[swapIdx];
          result[swapIdx] = temp;
        }
      }
    }
  }

  // Đảm bảo không bao giờ có 2 câu cùng id nằm liền kề
  for (let i = 0; i < result.length - 1; i++) {
    if (getId(result[i]) === getId(result[i + 1])) {
      const swapIdx = result.findIndex((q, idx) => idx > i + 1 && getId(q) !== getId(result[i]));
      if (swapIdx !== -1) {
        const temp = result[i + 1];
        result[i + 1] = result[swapIdx];
        result[swapIdx] = temp;
      }
    }
  }

  return result;
}

// ── Các hàm builder cho Từ vựng (vocab) ─────────────────────────────────────

export function buildMC(item: any, all: any[] = [], dir = 'fwd', { count = 4, rng = Math.random }: any = {}): any {
  if (!item || !item.term || !item.definition) return null;

  const isFwd = dir === 'fwd';
  const prompt = isFwd ? item.term : item.definition;
  const targetKey = isFwd ? 'definition' : 'term';
  const correctAnswer = item[targetKey];
  const normCorrect = norm(correctAnswer);

  if (!normCorrect) return null;

  const validCandidates = (all || []).filter(it =>
    it && it.id !== item.id && (it.term || it.type === 'vocab') && it[targetKey] && it.term && it.definition
  );

  const groupPos: any[] = [];
  const groupTag: any[] = [];
  const groupOther: any[] = [];

  const itemTags = new Set(Array.isArray(item.tags) ? item.tags : []);

  for (const c of validCandidates) {
    const cAns = c[targetKey];
    const normAns = norm(cAns);
    if (normAns === normCorrect) continue;
    const d = lev(normAns, normCorrect);
    const maxD = normCorrect.length >= 8 ? 2 : 1;
    if (d <= maxD) continue;

    if (item.pos && c.pos && norm(item.pos) === norm(c.pos)) {
      groupPos.push(c);
    } else if (Array.isArray(c.tags) && c.tags.some((t: string) => itemTags.has(t))) {
      groupTag.push(c);
    } else {
      groupOther.push(c);
    }
  }

  const prioritized = [
    ...shuffle(groupPos, rng),
    ...shuffle(groupTag, rng),
    ...shuffle(groupOther, rng),
  ];

  const chosenDistractors: string[] = [];
  const seenNorm = new Set<string>([normCorrect]);

  for (const cand of prioritized) {
    const text = cand[targetKey];
    const n = norm(text);
    if (!seenNorm.has(n)) {
      seenNorm.add(n);
      chosenDistractors.push(text);
      if (chosenDistractors.length >= count - 1) break;
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

export function buildWrite(item: any, dir = 'rev'): any {
  if (!item || !item.term || !item.definition) return null;

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
  const splitParts = item.definition.split(/[;]/).map((s: string) => toPlain(s)).filter(Boolean);
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

export function buildCloze(item: any): any {
  if (!item || !item.example || !item.term) return null;

  const rawExample = String(item.example);
  const maskedTokens: string[] = [];
  const maskToken = (text: string) => {
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

  let firstMatch: string | null = null;
  let replaced = maskedText;

  for (const f of sortedForms) {
    const escaped = f.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    const regex = new RegExp(`(?:^|(?<=[^\\p{L}\\p{N}_]))(${escaped})(?:$|(?=[^\\p{L}\\p{N}_]))`, 'gui');

    replaced = replaced.replace(regex, (_match, word) => {
      if (!firstMatch) firstMatch = word;
      return '_____';
    });
  }

  if (!firstMatch) return null;

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

export function buildListen(item: any): any {
  if (!item || !item.term) return null;

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

export function buildFlashcard(item: any, dir = 'fwd'): any {
  if (!item) return null;

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

export function buildQuestion(item: any, opts: any = {}): any {
  if (!item || typeof item !== 'object') return null;

  const type = item.type || (item.term ? 'vocab' : (item.front ? 'card' : null));
  const cardId = item.cardId || item.id;
  const rootId = item.rootId || item.id;
  const lang = item.lang;

  switch (type) {
    case 'single':
      return {
        id: cardId,
        itemId: rootId,
        rootId,
        lang,
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
        id: cardId,
        itemId: rootId,
        rootId,
        lang,
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
        id: cardId,
        itemId: rootId,
        rootId,
        lang,
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
        id: cardId,
        itemId: rootId,
        rootId,
        lang,
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
        id: cardId,
        itemId: rootId,
        rootId,
        lang,
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

    case 'translate':
      return {
        id: cardId,
        itemId: rootId,
        rootId,
        lang,
        kind: 'translate',
        prompt: item.vi ?? '',
        vi: item.vi ?? '',
        keyword: item.keyword ?? '',
        answers: Array.isArray(item.answers) ? [...item.answers] : [item.answers],
        pattern: item.pattern,
        acceptableForms: item.acceptableForms,
        explanation: item.explanation ?? '',
        topic: item.topic,
        tags: item.tags,
        rawItem: item,
      };

    case 'word-order': {
      const answerTokens = Array.isArray(item.answer) ? item.answer.map((w: any) => String(w)) : [];
      const distractors = Array.isArray(item.distractors) ? item.distractors.map((w: any) => String(w)) : [];
      const altAnswers = Array.isArray(item.alt_answers)
        ? item.alt_answers.map((arr: any) => (Array.isArray(arr) ? arr.map((w: any) => String(w)) : []))
        : [];
      const bank = shuffleWordBank(answerTokens, distractors, opts.rand);
      return {
        id: cardId,
        itemId: rootId,
        rootId,
        lang,
        kind: 'word-order',
        prompt: item.question || 'Hãy sắp xếp lại các từ sau để tạo thành câu đúng.',
        prompt_vi: item.prompt_vi ?? '',
        audio: item.audio,
        bank,
        answerTokens,
        distractors,
        answers: [answerTokens.join(' '), ...altAnswers.map((a: string[]) => a.join(' '))],
        altAnswers,
        caseSensitive: item.caseSensitive !== false,
        image: item.image,
        answerImage: item.answerImage,
        explanation: item.explanation ?? '',
        topic: item.topic,
        tags: item.tags,
        rawItem: item,
      };
    }

    case 'vocab': {
      const mode = opts.mode;
      const dir = opts.dir || opts.direction || 'fwd';
      let q: any = null;
      if (mode === 'mc') q = buildMC(item, opts.allItems || [], dir, opts);
      else if (mode === 'write') q = buildWrite(item, dir);
      else if (mode === 'cloze') q = buildCloze(item);
      else if (mode === 'listen') q = buildListen(item);
      else q = buildFlashcard(item, dir);
      if (q) {
        q.id = cardId;
        q.itemId = rootId;
        q.rootId = rootId;
        q.lang = lang;
      }
      return q;
    }

    default:
      return null;
  }
}

export function buildSessionQuestions(items: any[], options: any = {}): any[] {
  const validItems = (items || []).filter(it => !hasError(validateItem(it, { deckKind: options.deckKind })));
  let list: any[] = [];

  const mode = options.mode || (options.deckKind === 'vocab' ? 'flashcards' : undefined);
  const direction = options.direction || 'both';

  // Nếu có tùy chọn selectedLangs: mở rộng items theo tập ngôn ngữ được chọn
  let itemsToBuild: any[] = validItems;
  if (Array.isArray(options.selectedLangs) && options.selectedLangs.length > 0) {
    const selected = options.selectedLangs.map((s: string) => String(s).trim().toLowerCase());
    const primaryLang = getPrimaryLanguage(options.deck?.meta || { lang: selected[0] }, validItems);
    const expanded: any[] = [];
    for (const it of validItems) {
      if (it.type === 'translate') {
        // Dạng translate vốn song ngữ, ngôn ngữ-trung-lập: luôn sinh đúng 1 thẻ
        expanded.push({ ...it, cardId: it.id, rootId: it.id, lang: primaryLang });
      } else {
        for (const l of selected) {
          const itLang = getItemForLanguage(it, l, primaryLang);
          if (itLang) expanded.push(itLang);
        }
      }
    }
    itemsToBuild = expanded;
  }

  if (options.deckKind === 'vocab') {
    const dirs = direction === 'both' ? ['fwd', 'rev'] : [direction];

    for (const it of itemsToBuild) {
      for (const d of dirs) {
        let q: any = null;
        if (mode === 'mc') q = buildMC(it, itemsToBuild, d, options);
        else if (mode === 'write') q = buildWrite(it, d);
        else if (mode === 'cloze') q = buildCloze(it);
        else if (mode === 'listen') q = buildListen(it);
        else q = buildFlashcard(it, d);

        if (q) {
          if (it.cardId) q.id = it.cardId;
          if (it.rootId) { q.itemId = it.rootId; q.rootId = it.rootId; }
          if (it.lang) q.lang = it.lang;
          list.push(q);
        }
      }
    }
  } else {
    list = itemsToBuild.map(it => buildQuestion(it, options)).filter(Boolean);
  }

  if (options.itemIds && Array.isArray(options.itemIds)) {
    const idSet = new Set(options.itemIds);
    list = list.filter(q => idSet.has(q.id) || idSet.has(q.rootId) || idSet.has(q.itemId));
  }

  if (options.shuffle) {
    list = shuffle(list, options.rng || Math.random);
  }

  // Tách các câu trùng rootId ít nhất minSeparation thẻ
  const minSep = options.minSeparation ?? 5;
  list = applyQuestionSpacing(list, minSep);

  const count = Number(options.count);
  if (count > 0 && count < list.length) {
    list = list.slice(0, count);
  }

  return list;
}
