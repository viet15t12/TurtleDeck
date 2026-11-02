// src/core/mathinput.js — Hàm thuần xử lý ngữ cảnh công thức LaTeX, chèn công thức, nhảy ô trống ▢ và auto-pair $ (§7, §13.3)

export const PLACEHOLDER = '▢';

/**
 * Xác định ngữ cảnh công thức tại vị trí con trỏ `pos`.
 * Trả về: null (ngoài công thức) | 'inline' ($...$) | 'block' ($$...$$)
 */
export function mathContext(text, pos) {
  const s = String(text ?? '');
  const limit = Math.max(0, Math.min(pos ?? 0, s.length));
  let mode = null;
  for (let i = 0; i < limit; i++) {
    const c = s[i];
    if (c === '\\') {
      i++; // \$ không phải dấu đóng/mở công thức
      continue;
    }
    if (c !== '$') continue;
    if (s[i + 1] === '$' && i + 1 < limit) {
      mode = mode === 'block' ? null : mode === null ? 'block' : mode;
      i++;
    } else {
      mode = mode === 'inline' ? null : mode === null ? 'inline' : mode;
    }
  }
  return mode;
}

/**
 * Tìm phạm vi công thức ($...$ hoặc $$...$$) đang bao quanh vị trí `pos`.
 * Trả về null nếu `pos` nằm ngoài công thức, hoặc:
 * { mode: 'inline'|'block', start, end, innerStart, innerEnd, latex }
 */
export function findEnclosingMath(text, pos) {
  const s = String(text ?? '');
  const p = Math.max(0, Math.min(pos ?? 0, s.length));
  let mode = null;
  let openStart = -1;
  let innerStart = -1;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c !== '$') continue;

    const isDouble = s[i + 1] === '$';
    if (mode === null) {
      if (isDouble && i + 1 < p) {
        mode = 'block';
        openStart = i;
        innerStart = i + 2;
        i++;
      } else if (!isDouble && i < p) {
        mode = 'inline';
        openStart = i;
        innerStart = i + 1;
      } else if (i >= p) {
        return null;
      }
    } else if (mode === 'block' && isDouble) {
      const closeStart = i;
      const closeEnd = i + 2;
      if (p >= innerStart && p <= closeStart) {
        return {
          mode: 'block',
          start: openStart,
          end: closeEnd,
          innerStart,
          innerEnd: closeStart,
          latex: s.slice(innerStart, closeStart),
        };
      }
      mode = null;
      openStart = -1;
      innerStart = -1;
      i++;
    } else if (mode === 'inline' && !isDouble) {
      const closeStart = i;
      const closeEnd = i + 1;
      if (p >= innerStart && p <= closeStart) {
        return {
          mode: 'inline',
          start: openStart,
          end: closeEnd,
          innerStart,
          innerEnd: closeStart,
          latex: s.slice(innerStart, closeStart),
        };
      }
      mode = null;
      openStart = -1;
      innerStart = -1;
    }
  }

  return null;
}

const isWordOrDigit = ch => Boolean(ch && /[A-Za-zÀ-ỹ0-9]/.test(ch));

/**
 * Chèn công thức `latex` vào trạng thái ô nhập `state = { text, selStart, selEnd }` (§7.2, §13.3).
 *
 * Quy tắc:
 * 1. Con trỏ đang trong $…$ hoặc $$…$$ → chèn mã trần tại con trỏ.
 * 2. Con trỏ ngoài công thức → tự bọc $…$ (hoặc $$\n…\n$$ nếu block = true).
 * 3. Đang bôi đen chữ → chữ đó được đưa vào ô trống ▢ đầu tiên của mẫu.
 * 4. Tự thêm khoảng trắng trước $ mở nếu ký tự liền trước là chữ/số (và sau $ đóng nếu liền sau là chữ/số).
 * 5. Mẫu có ô trống ▢ → chọn sẵn ▢ đầu tiên (selStart..selStart+1) để gõ đè ngay.
 */
export function insertFormula(state, latex, { block = false } = {}) {
  const text = String(state?.text ?? '');
  const selStart = Math.max(0, Math.min(state?.selStart ?? state?.start ?? text.length, text.length));
  const selEnd = Math.max(selStart, Math.min(state?.selEnd ?? state?.end ?? selStart, text.length));
  const selected = text.slice(selStart, selEnd);
  const rawLatex = String(latex ?? '');

  // Quy tắc 3: nếu có vùng bôi đen và mẫu có ▢, đưa vùng bôi đen vào ▢ đầu tiên
  let filledLatex = rawLatex;
  if (selected.length > 0) {
    if (filledLatex.includes(PLACEHOLDER)) {
      filledLatex = filledLatex.replace(PLACEHOLDER, selected);
    } else if (filledLatex === '') {
      filledLatex = selected;
    }
  }

  const ctx = mathContext(text, selStart);
  const before = text.slice(0, selStart);
  const after = text.slice(selEnd);

  let insertion = '';
  let contentOffsetInInsertion = 0;

  if (ctx !== null) {
    // Quy tắc 1: đang trong công thức → chèn mã trần
    insertion = filledLatex;
    contentOffsetInInsertion = 0;
  } else if (block) {
    // Quy tắc 2 (block): bọc $$\n...\n$$
    const needLeadNewline = before.length > 0 && !before.endsWith('\n');
    const needTrailNewline = after.length > 0 && !after.startsWith('\n');
    const lead = needLeadNewline ? '\n' : '';
    const trail = needTrailNewline ? '\n' : '';
    const openDelim = `${lead}$$\n`;
    const closeDelim = `\n$$${trail}`;
    insertion = `${openDelim}${filledLatex}${closeDelim}`;
    contentOffsetInInsertion = openDelim.length;
  } else {
    // Quy tắc 2 & 4 (inline): bọc $...$, thêm dấu cách nếu giáp chữ/số
    const prevChar = before[before.length - 1] || '';
    const nextChar = after[0] || '';
    const leadSpace = isWordOrDigit(prevChar) ? ' ' : '';
    const trailSpace = isWordOrDigit(nextChar) ? ' ' : '';
    const openDelim = `${leadSpace}$`;
    const closeDelim = `$${trailSpace}`;
    insertion = `${openDelim}${filledLatex}${closeDelim}`;
    contentOffsetInInsertion = openDelim.length;
  }

  const nextText = before + insertion + after;
  const contentStart = before.length + contentOffsetInInsertion;
  const contentEnd = contentStart + filledLatex.length;

  // Quy tắc 5: nếu còn ▢ trong phần vừa chèn → bôi đen ▢ đầu tiên
  const firstPlaceholderRel = filledLatex.indexOf(PLACEHOLDER);
  if (firstPlaceholderRel !== -1) {
    const phPos = contentStart + firstPlaceholderRel;
    return {
      text: nextText,
      selStart: phPos,
      selEnd: phPos + PLACEHOLDER.length,
    };
  }

  // Nếu mở công thức rỗng (vd bấm Ctrl+M khi không chọn mẫu), đặt con trỏ ở giữa $...$
  if (rawLatex === '' && selected === '') {
    return {
      text: nextText,
      selStart: contentStart,
      selEnd: contentStart,
    };
  }

  // Nếu chèn trong công thức có sẵn → đặt con trỏ ngay sau đoạn vừa chèn;
  // nếu vừa bọc công thức mới ở ngoài → đặt sau công thức (trước khoảng trắng cuối nếu có)
  if (ctx !== null) {
    return {
      text: nextText,
      selStart: contentEnd,
      selEnd: contentEnd,
    };
  }

  const afterClosingDollar = block ? contentEnd + 3 : contentEnd + 1;
  return {
    text: nextText,
    selStart: afterClosingDollar,
    selEnd: afterClosingDollar,
  };
}

/**
 * Nhảy sang ô trống `▢` kế tiếp (Tab) hoặc trước đó (Shift+Tab) (§7.2, §13.3).
 * - Nếu tìm thấy `▢` tiếp theo trong công thức (hoặc trong văn bản): trả `{ selStart, selEnd, found: true }`.
 * - Nếu đang ở trong công thức mà đã hết `▢` phía sau: nhảy con trỏ ra ngay sau dấu `$` hoặc `$$` đóng
 *   (`{ selStart: enclosing.end, selEnd: enclosing.end, found: false, exitedMath: true }`).
 * - Nếu không có `▢` và không ở trong công thức: trả `null`.
 */
export function nextPlaceholder(text, pos, { backward = false } = {}) {
  const s = String(text ?? '');
  const p = Math.max(0, Math.min(pos ?? 0, s.length));
  const enc = findEnclosingMath(s, p);

  if (backward) {
    const searchEnd = s[p] === PLACEHOLDER ? p : p;
    const minPos = enc ? enc.innerStart : 0;
    const sub = s.slice(minPos, searchEnd);
    const rel = sub.lastIndexOf(PLACEHOLDER);
    if (rel !== -1) {
      const idx = minPos + rel;
      return { selStart: idx, selEnd: idx + PLACEHOLDER.length, found: true };
    }
    return null;
  }

  // Tìm từ sau vị trí hiện tại (nếu đang bôi đen đúng ▢ tại p thì tìm từ p + 1)
  const startSearch = s.slice(p, p + PLACEHOLDER.length) === PLACEHOLDER ? p + PLACEHOLDER.length : p;

  if (enc) {
    const idxInMath = s.indexOf(PLACEHOLDER, startSearch);
    if (idxInMath !== -1 && idxInMath < enc.innerEnd) {
      return { selStart: idxInMath, selEnd: idxInMath + PLACEHOLDER.length, found: true };
    }
    // Hết ▢ trong công thức hiện tại → đưa con trỏ ra sau dấu đóng công thức
    return { selStart: enc.end, selEnd: enc.end, found: false, exitedMath: true };
  }

  const idxAny = s.indexOf(PLACEHOLDER, startSearch);
  if (idxAny !== -1) {
    return { selStart: idxAny, selEnd: idxAny + PLACEHOLDER.length, found: true };
  }
  return null;
}

export const jumpToNextPlaceholder = nextPlaceholder;

/**
 * Xử lý phím `$` tự động đóng cặp (auto-pair) hoặc nhảy qua `$` đóng (§7.1).
 * Trả về `{ text, selStart, selEnd }` mới.
 */
export function handleDollarKey(state) {
  const text = String(state?.text ?? '');
  const selStart = Math.max(0, Math.min(state?.selStart ?? 0, text.length));
  const selEnd = Math.max(selStart, Math.min(state?.selEnd ?? selStart, text.length));

  // Nếu đang bôi đen văn bản → bọc văn bản bằng $...$
  if (selEnd > selStart) {
    const selected = text.slice(selStart, selEnd);
    const nextText = text.slice(0, selStart) + '$' + selected + '$' + text.slice(selEnd);
    return {
      text: nextText,
      selStart: selStart + 1,
      selEnd: selEnd + 1,
    };
  }

  const prevChar = text[selStart - 1] || '';
  const nextChar = text[selStart] || '';

  // Nếu ký tự trước là '\' (gõ \$) → chỉ chèn 1 dấu $ bình thường
  if (prevChar === '\\') {
    const nextText = text.slice(0, selStart) + '$' + text.slice(selStart);
    return { text: nextText, selStart: selStart + 1, selEnd: selStart + 1 };
  }

  // Nếu vừa gõ $ tạo thành "$|$" rỗng rồi bấm $ tiếp → nâng cấp thành "$$|$$"
  if (prevChar === '$' && nextChar === '$' && text[selStart - 2] !== '$') {
    const nextText = text.slice(0, selStart) + '$$' + text.slice(selStart);
    return { text: nextText, selStart: selStart + 1, selEnd: selStart + 1 };
  }

  // Nếu con trỏ đang đứng ngay trước dấu $ đóng → nhảy qua dấu $ đó
  if (nextChar === '$') {
    return { text, selStart: selStart + 1, selEnd: selStart + 1 };
  }

  // Mặc định: chèn cặp $$ và đặt con trỏ ở giữa
  const nextText = text.slice(0, selStart) + '$$' + text.slice(selStart);
  return { text: nextText, selStart: selStart + 1, selEnd: selStart + 1 };
}

/**
 * Khi con trỏ đang ở giữa `$$|$$`, nhấn Enter sẽ tách thành khối nhiều dòng:
 * $$\n|\n$$ (§7.1). Trả về null nếu không ở giữa `$$|$$`.
 */
export function handleMathEnterKey(state) {
  const text = String(state?.text ?? '');
  const selStart = state?.selStart ?? 0;
  const selEnd = state?.selEnd ?? selStart;
  if (selStart !== selEnd) return null;
  if (text.slice(selStart - 2, selStart) === '$$' && text.slice(selStart, selStart + 2) === '$$') {
    const nextText = text.slice(0, selStart) + '\n\n' + text.slice(selStart);
    return { text: nextText, selStart: selStart + 1, selEnd: selStart + 1 };
  }
  return null;
}

