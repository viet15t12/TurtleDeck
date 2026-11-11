// src/views/session/qr-svg.js — Trình tạo mã QR dạng SVG thuần không phụ thuộc thư viện ngoài
// Dựa trên thuật toán mã hoá QR chuẩn (ISO/IEC 18004) cho chuỗi URL ngắn (< 120 ký tự)

/**
 * Tạo thẻ SVG hiển thị mã QR
 * @param {string} text - Nội dung chuỗi URL
 * @param {number} [size=200] - Kích thước pixel hiển thị
 * @returns {string} Chuỗi SVG hợp lệ
 */
export function generateQrSvg(text, size = 200) {
  const qr = createQrMatrix(text);
  const moduleCount = qr.length;
  const cellSize = size / moduleCount;

  let rects = '';
  for (let r = 0; r < moduleCount; r++) {
    for (let c = 0; c < moduleCount; c++) {
      if (qr[r][c]) {
        const x = (c * cellSize).toFixed(2);
        const y = (r * cellSize).toFixed(2);
        const w = (cellSize + 0.05).toFixed(2);
        const h = (cellSize + 0.05).toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges">
    <rect width="${size}" height="${size}" fill="#ffffff" />
    <g fill="#000000">${rects}</g>
  </svg>`;
}

// Bảng Galois Field GF(256) cho Reed-Solomon Error Correction
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
(function initGF256() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
})();

function gfMul(x, y) {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    const factor = GF256_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], factor);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecCount) {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(data.length + ecCount);
  res.set(data);

  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        res[i + j] ^= gfMul(gen[j], coef);
      }
    }
  }
  return Array.from(res.slice(data.length));
}

// Bảng dung lượng QR Version 1-4 Level L
const QR_VERSIONS = [
  { version: 1, size: 21, dataBytes: 19, ecBytes: 7 },
  { version: 2, size: 25, dataBytes: 34, ecBytes: 10 },
  { version: 3, size: 29, dataBytes: 55, ecBytes: 15 },
  { version: 4, size: 33, dataBytes: 80, ecBytes: 20 },
  { version: 5, size: 37, dataBytes: 108, ecBytes: 26 },
];

function selectVersion(byteCount) {
  for (const v of QR_VERSIONS) {
    // 4 bit mode + 8/16 bit count + data bytes
    const totalRequired = byteCount + 2;
    if (totalRequired <= v.dataBytes) return v;
  }
  return QR_VERSIONS[QR_VERSIONS.length - 1];
}

/**
 * Tạo ma trận boolean 2D cho mã QR
 */
export function createQrMatrix(text) {
  const utf8Bytes = new TextEncoder().encode(text);
  const cfg = selectVersion(utf8Bytes.length);
  const size = cfg.size;

  // 1. Bitstream
  const bits = [];
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count
  pushBits(utf8Bytes.length, cfg.version < 10 ? 8 : 16);
  // Data bytes
  for (const b of utf8Bytes) {
    pushBits(b, 8);
  }
  // Terminator
  const dataBitCap = cfg.dataBytes * 8;
  const termLen = Math.min(4, dataBitCap - bits.length);
  pushBits(0, termLen);
  // Pad to byte boundary
  while (bits.length % 8 !== 0) bits.push(0);
  // Pad bytes
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < dataBitCap) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // Chuyển bitstream thành mảng byte
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }

  // Error Correction bytes
  const ecBytes = rsEncode(dataBytes, cfg.ecBytes);
  const finalCodewords = dataBytes.concat(ecBytes);

  // 2. Ma trận và mẫu định vị (Finder patterns)
  const matrix = Array.from({ length: size }, () => new Array(size).fill(null));

  function addFinder(top, left) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row < 0 || row >= size || col < 0 || col >= size) continue;
        const isBlack =
          (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
          (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        matrix[row][col] = isBlack;
      }
    }
  }

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Alignment pattern cho version >= 2
  if (cfg.version >= 2) {
    const alignPos = size - 7;
    for (let r = -2; r <= 2; r++) {
      for (let c = -2; c <= 2; c++) {
        const isBlack = Math.max(Math.abs(r), Math.abs(c)) !== 1;
        matrix[alignPos + r][alignPos + c] = isBlack;
      }
    }
  }

  // Dark module
  matrix[4 * cfg.version + 9][8] = true;

  // Dự trữ Format Info
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  // 3. Đặt các bit dữ liệu ziczac
  const finalBits = [];
  for (const byte of finalCodewords) {
    for (let i = 7; i >= 0; i--) finalBits.push((byte >> i) & 1);
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Bỏ qua timing column

    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          // Áp dụng Mask 0: (row + col) % 2 == 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit === 1) ^ mask;
        }
      }
    }
    upwards = !upwards;
  }

  // 4. Ghi format bits (Mask 0, Level L: 0b111011111000100)
  const formatBits = [
    true, true, true, false, true, true, true, true, true, false, false, false, true, false, false
  ];
  // Vùng format góc trên bên trái
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i];
  matrix[8][7] = formatBits[6];
  matrix[8][8] = formatBits[7];
  matrix[7][8] = formatBits[8];
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i];

  // Vùng format ở cạnh còn lại
  for (let i = 0; i < 7; i++) matrix[size - 1 - i][8] = formatBits[i];
  for (let i = 7; i < 15; i++) matrix[8][size - 15 + i] = formatBits[i];

  return matrix;
}
