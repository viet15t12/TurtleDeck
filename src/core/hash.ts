// src/core/hash.ts — SHA-1 thuần JavaScript và sinh id ổn định cho từ vựng (ES module).
// Chạy được ở cả Node.js (main/test) và trình duyệt (renderer), không phụ thuộc node:crypto.

// Chuyển chuỗi UTF-8 sang mảng Uint8Array
export function utf8Encode(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const utf8: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let charcode = str.charCodeAt(i);
    if (charcode < 0x80) utf8.push(charcode);
    else if (charcode < 0x800) {
      utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      // surrogate pair
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      utf8.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }
  return new Uint8Array(utf8);
}

// Hàm SHA-1 thuần JS theo chuẩn FIPS PUB 180-4
export function sha1(input: string | Uint8Array | ArrayBuffer): string {
  const bytes = typeof input === 'string' ? utf8Encode(input) : new Uint8Array(input);
  const byteLength = bytes.length;
  const bitLength = byteLength * 8;

  // Tính số khối 64-byte: thông điệp + 1 byte 0x80 + padding 0x00 + 8 byte chiều dài (bits)
  const paddedLength = (((byteLength + 8) >> 6) + 1) << 6;
  const words = new Uint32Array(paddedLength >> 2);

  for (let i = 0; i < byteLength; i++) {
    words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  }
  words[byteLength >> 2] |= 0x80 << (24 - (byteLength & 3) * 8);
  // 64-bit chiều dài ở cuối (chỉ cần 32-bit cao và thấp, JS bitwise 32-bit)
  words[words.length - 1] = bitLength >>> 0;
  words[words.length - 2] = Math.floor(bitLength / 0x100000000) >>> 0;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const w = new Uint32Array(80);

  const rotl = (n: number, s: number) => (n << s) | (n >>> (32 - s));

  for (let i = 0; i < words.length; i += 16) {
    for (let t = 0; t < 16; t++) {
      w[t] = words[i + t];
    }
    for (let t = 16; t < 80; t++) {
      w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let t = 0; t < 80; t++) {
      let f: number, k: number;
      if (t < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotl(a, 5) + f + e + k + w[t]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
}

// Chuẩn hoá term: NFC → trim → gộp khoảng trắng → chữ thường
export function normalizeTerm(term: unknown): string {
  return String(term ?? '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Sinh id ổn định: w- + 10 ký tự hex đầu của SHA-1(normalize(term))
export function stableVocabId(term: unknown): string {
  const norm = normalizeTerm(term);
  return 'w-' + sha1(norm).slice(0, 10);
}
