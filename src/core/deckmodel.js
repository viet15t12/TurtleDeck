// src/core/deckmodel.js — thao tác trên mô hình bộ thẻ (hàm thuần, dùng chung main/renderer).
// GĐ1 chỉ cần imageRefs / collectImageRefs (để biết ảnh nào được tham chiếu khi đóng gói / nhập).
// Các thao tác soạn thảo (newDeck, addItem, undo/redo…) sẽ bổ sung ở GĐ2C (Deck Editor).

const MD_IMG = /!\[[^\]]*\]\(\s*([^)\s]+)/g;

// Tập đường dẫn ảnh mà một item tham chiếu: ![](img/..), image, answerImage, choices[].image
export function imageRefs(item) {
  const out = new Set();
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (key === 'image' || key === 'answerImage') { if (v.trim()) out.add(v.trim()); }
      for (const m of v.matchAll(MD_IMG)) out.add(m[1]);
    } else if (Array.isArray(v)) v.forEach(x => walk(x, key));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(item);
  return out;
}

export function collectImageRefs(deck) {
  const all = new Set();
  for (const it of deck?.items ?? []) for (const r of imageRefs(it)) all.add(r);
  return all;
}

