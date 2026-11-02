// src/core/deckmodel.js — thao tác trên mô hình bộ thẻ (hàm thuần, không sửa state cũ, dùng chung main/renderer).
// Hỗ trợ Deck Editor (GĐ2C): newDeck, newItem, addItem, removeItems, duplicateItem, moveItem, updateItem, changeType, history...

const MD_IMG = /!\[[^\]]*\]\(\s*([^)\s]+)/g;

function slugify(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'bo-the-moi';
}

export function newDeckId(title = '') {
  const base = slugify(title) || 'bo-the-moi';
  const rand = Math.random().toString(36).slice(2, 6);
  const time = Date.now().toString(36).slice(-4);
  return `${base}-${time}${rand}`;
}

// Tạo đối tượng bộ thẻ mới
export function newDeck({ title = 'Bộ thẻ mới', kind = 'quiz', lang = 'vi', id = null } = {}) {
  return {
    meta: {
      id: id || newDeckId(title),
      title: String(title).trim() || 'Bộ thẻ mới',
      kind: ['vocab', 'qa', 'quiz'].includes(kind) ? kind : 'quiz',
      lang: String(lang || 'vi').trim(),
      format: 'studydeck',
      formatVersion: 1,
    },
    items: [],
  };
}

// Sinh id mục mới không trùng với bất kỳ id nào đang có trong deck
export function newItemId(deck, prefix = 'q') {
  const existing = new Set((deck?.items || []).map(it => it && it.id).filter(Boolean));
  let n = 1;
  while (existing.has(`${prefix}-${String(n).padStart(3, '0')}`)) {
    n++;
  }
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

// Tạo mẫu item trắng cho từng dạng
export function newItem(type = 'single', id = null) {
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

// Thêm item vào vị trí atIndex (mặc định cuối danh sách)
export function addItem(deck, item, atIndex = -1) {
  const items = [...(deck?.items || [])];
  if (atIndex < 0 || atIndex >= items.length) {
    items.push(item);
  } else {
    items.splice(atIndex, 0, item);
  }
  return { ...deck, items };
}

// Xoá một hoặc nhiều item theo danh sách id
export function removeItems(deck, itemIds) {
  const ids = new Set(Array.isArray(itemIds) ? itemIds : [itemIds]);
  const items = (deck?.items || []).filter(it => !ids.has(it.id));
  return { ...deck, items };
}

// Nhân đôi một item: tạo bản sao có id mới và chèn ngay sau item gốc
export function duplicateItem(deck, itemId) {
  const items = [...(deck?.items || [])];
  const idx = items.findIndex(it => it.id === itemId);
  if (idx === -1) return deck;
  const original = items[idx];
  const newId = newItemId(deck);
  // deep clone original item
  const clone = JSON.parse(JSON.stringify(original));
  clone.id = newId;
  items.splice(idx + 1, 0, clone);
  return { ...deck, items };
}

// Di chuyển item từ vị trí fromIndex sang toIndex
export function moveItem(deck, fromIndex, toIndex) {
  const items = [...(deck?.items || [])];
  if (
    fromIndex < 0 || fromIndex >= items.length ||
    toIndex < 0 || toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return deck;
  }
  const [removed] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, removed);
  return { ...deck, items };
}

// Cập nhật thông tin của một item (hàm thuần)
export function updateItem(deck, itemId, patchOrFn) {
  const items = (deck?.items || []).map(it => {
    if (it.id !== itemId) return it;
    if (typeof patchOrFn === 'function') {
      return patchOrFn(it);
    }
    return { ...it, ...patchOrFn };
  });
  return { ...deck, items };
}

// Chuyển đổi giữa các dạng câu hỏi, giữ lại dữ liệu tối đa
export function changeType(item, newType) {
  if (!item || item.type === newType) return item;

  // Thu thập dữ liệu chung
  const common = {
    id: item.id,
    topic: item.topic,
    tags: item.tags ? [...item.tags] : undefined,
    image: item.image,
    answerImage: item.answerImage,
    explanation: item.explanation,
  };
  // Xoá các trường undefined
  for (const k of Object.keys(common)) {
    if (common[k] === undefined) delete common[k];
  }

  // Nội dung câu hỏi / đề / mặt trước
  const qText = item.question ?? item.front ?? item.term ?? '';

  // Danh sách chuỗi đáp án (từ answer, choices[answer], back, hoặc definition)
  let textAnswers = [];
  if (Array.isArray(item.choices) && Array.isArray(item.answer)) {
    textAnswers = item.answer.map(idx => {
      const c = item.choices[idx];
      return typeof c === 'string' ? c : (c?.text ?? '');
    }).filter(s => s !== '');
  } else if (Array.isArray(item.answer)) {
    textAnswers = item.answer.map(String).filter(s => s !== '');
  } else if (typeof item.back === 'string' && item.back) {
    textAnswers = [item.back];
  } else if (typeof item.definition === 'string' && item.definition) {
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
      } else {
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
      } else {
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
      if (item.tolerance !== undefined) res.tolerance = item.tolerance;
      if (item.answerDisplay !== undefined) res.answerDisplay = item.answerDisplay;
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
      if (item.answerDisplay !== undefined) res.answerDisplay = item.answerDisplay;
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
      if (item.phonetic) res.phonetic = item.phonetic;
      if (item.pos) res.pos = item.pos;
      if (item.example) res.example = item.example;
      if (item.forms) res.forms = [...item.forms];
      return res;
    }

    default:
      return { ...common, type: newType, question: qText };
  }
}

// Tập đường dẫn ảnh mà một item tham chiếu: ![](img/..), image, answerImage, choices[].image
export function imageRefs(item) {
  const out = new Set();
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (key === 'image' || key === 'answerImage') {
        if (v.trim()) out.add(v.trim());
      }
      for (const m of v.matchAll(MD_IMG)) out.add(m[1]);
    } else if (Array.isArray(v)) {
      v.forEach(x => walk(x, key));
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) walk(x, k);
    }
  };
  walk(item);
  return out;
}

export function collectImageRefs(deck) {
  const all = new Set();
  for (const it of deck?.items ?? []) {
    for (const r of imageRefs(it)) all.add(r);
  }
  return all;
}

// Danh sách ảnh có trong assets nhưng không được deck tham chiếu
export function unusedAssets(deck, assets) {
  const used = collectImageRefs(deck);
  const out = [];
  const list = assets instanceof Map || assets instanceof Set ? [...assets.keys ? assets.keys() : assets]
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

// Quản lý Undo / Redo cho Deck Editor, gộp các lần gõ liên tiếp trong 500 ms thành 1 bước
export function createHistory(initialDeck, limit = 100) {
  let past = [];
  let present = initialDeck;
  let future = [];
  let lastTypingTime = 0;

  return {
    push(newDeck, { isTyping = false, now = Date.now() } = {}) {
      if (isTyping && lastTypingTime && (now - lastTypingTime < 500)) {
        // Gộp lần gõ trong 500ms: cập nhật present mà không đẩy bước mới vào past
        present = newDeck;
        lastTypingTime = now;
        future = [];
        return;
      }

      past.push(present);
      if (past.length > limit) past.shift();
      present = newDeck;
      future = [];
      lastTypingTime = isTyping ? now : 0;
    },

    undo() {
      if (!past.length) return present;
      future.unshift(present);
      present = past.pop();
      lastTypingTime = 0;
      return present;
    },

    redo() {
      if (!future.length) return present;
      past.push(present);
      present = future.shift();
      lastTypingTime = 0;
      return present;
    },

    canUndo() {
      return past.length > 0;
    },

    canRedo() {
      return future.length > 0;
    },

    current() {
      return present;
    },

    reset(deck) {
      past = [];
      present = deck;
      future = [];
      lastTypingTime = 0;
    },
  };
}
