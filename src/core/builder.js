// src/core/builder.js — chuyển đổi item về cấu trúc Question thống nhất (hàm thuần, ES module).
// GĐ2 & GĐ2B: hỗ trợ single, multi, fill, command, card (và vocab fallback như card), kèm image, answerImage, answerDisplay.

export function buildQuestion(item) {
  if (!item || typeof item !== 'object') return null;

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
      const termDisplay = [item.term, item.phonetic].filter(Boolean).join(' ');
      return {
        id: item.id,
        kind: 'card',
        prompt: termDisplay,
        front: termDisplay,
        back: item.definition ?? '',
        answers: [item.definition ?? ''],
        image: item.image,
        answerImage: item.answerImage,
        answerDisplay: item.answerDisplay,
        explanation: item.example ? `*Ví dụ:* ${item.example}` : '',
        topic: item.pos,
        tags: item.tags,
        rawItem: item,
      };
    }

    default:
      return null;
  }
}

export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildSessionQuestions(items, options = {}) {
  let list = (items || []).map(buildQuestion).filter(Boolean);

  if (options.itemIds && Array.isArray(options.itemIds)) {
    const idSet = new Set(options.itemIds);
    list = list.filter(q => idSet.has(q.id));
  }

  if (options.shuffle) {
    list = shuffle(list);
  }

  const count = Number(options.count);
  if (count > 0 && count < list.length) {
    list = list.slice(0, count);
  }

  return list;
}
