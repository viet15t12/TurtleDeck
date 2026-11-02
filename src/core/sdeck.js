// src/core/sdeck.js — đọc/ghi gói .sdeck (ZIP đơn giản, không mã hoá). Chạy ở main; test bằng node --test.
// Gói được đọc hoàn toàn vào bộ nhớ, không bao giờ giải nén ra đĩa (study-app.md mục 3.0, 7.3b).
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { collectImageRefs } from './deckmodel.js';
import { kindOf } from './deckkinds.js';

export const LIMITS = { entries: 2000, deckJson: 20e6, image: 5e6, total: 500e6 };
export const FORMAT = 'studydeck';
export const FORMAT_VERSION = 1;

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg)$/i;
const fail = error => ({ ok: false, error, issues: [error] });

// tên entry hợp lệ: không rỗng, không tuyệt đối, không '\', không ký tự điều khiển, không '.', '..' hay đoạn rỗng
export function isSafeEntry(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name)) return false;
  return name.split('/').every(seg => seg !== '' && seg !== '.' && seg !== '..');
}

// đường dẫn ảnh hợp lệ trong gói: img/<...>.<đuôi ảnh>, tên an toàn
export const isImageEntry = name => isSafeEntry(name) && name.startsWith('img/') && IMG_EXT.test(name);

// nhận dạng ảnh bằng nội dung (không tin đuôi file): 'png'|'jpg'|'gif'|'webp'|'svg'|null
export function detectImageType(b) {
  if (!b || typeof b.length !== 'number') return null;
  const at = (i, str) => b.length >= i + str.length && [...str].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (b.length >= 8 && b[0] === 0x89 && at(1, 'PNG')) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
  const head = strFromU8(b.subarray(0, 2048)).replace(/^\uFEFF/, '');
  if (/^(?:\s|<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)*<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

// bytes (Uint8Array của file .sdeck) -> { ok, deckText, assets: Map<'img/..', Uint8Array>, issues[] }
export function readPackage(bytes) {
  if (!(bytes?.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b))
    return fail('Không phải file .sdeck (không phải gói nén ZIP).');
  const issues = [];
  let count = 0, total = 0, files;
  try {
    files = unzipSync(bytes, {
      filter(f) {                                          // chạy TRƯỚC khi giải nén từng entry
        if (f.name.endsWith('/')) return false;            // bỏ thư mục
        if (++count > LIMITS.entries) throw new Error('Gói có quá nhiều tập tin.');
        if (!isSafeEntry(f.name)) { issues.push(`Bỏ qua tập tin có tên không an toàn: ${f.name}`); return false; }
        const isDeck = f.name === 'deck.json';
        if (!isDeck && !isImageEntry(f.name)) {
          issues.push(`Bỏ qua tập tin lạ trong gói: ${f.name}`); return false;
        }
        if (f.originalSize > (isDeck ? LIMITS.deckJson : LIMITS.image)) {
          issues.push(`Bỏ qua ${f.name}: dung lượng quá lớn.`); return false;
        }
        total += f.originalSize;
        if (total > LIMITS.total) throw new Error('Dung lượng giải nén quá lớn.');
        return true;
      },
    });
  } catch (e) {
    return fail('File hỏng hoặc không đọc được: ' + e.message);
  }
  // header có thể khai sai kích thước → đối chiếu lại kích thước thật
  let real = 0;
  for (const [name, u8] of Object.entries(files)) {
    real += u8.length;
    if (u8.length > (name === 'deck.json' ? LIMITS.deckJson : LIMITS.image))
      return fail(`${name} lớn hơn khai báo trong gói.`);
  }
  if (real > LIMITS.total) return fail('Dung lượng giải nén quá lớn.');
  if (!files['deck.json']) return fail('Gói không có deck.json — đây không phải bộ thẻ hợp lệ.');

  const deckText = strFromU8(files['deck.json']).replace(/^\uFEFF/, '');
  const assets = new Map(Object.entries(files).filter(([n]) => n !== 'deck.json'));
  for (const [n, u8] of [...assets])
    if (!detectImageType(u8)) { assets.delete(n); issues.push(`Bỏ qua ${n}: nội dung không phải ảnh.`); }
  return { ok: true, deckText, assets, issues };
}

// deckText (chuỗi JSON) + assets -> { ok, bytes, keptAssets }; prune=true bỏ ảnh không còn được tham chiếu
export function writePackage(deckText, assets = new Map(), { prune = true } = {}) {
  let deck;
  try { deck = JSON.parse(deckText); } catch (e) { return fail('deck.json không hợp lệ: ' + e.message); }
  if (!deck?.meta?.id || !Array.isArray(deck.items)) return fail('Thiếu meta.id hoặc danh sách items.');
  deck.meta.format = FORMAT;
  deck.meta.formatVersion = FORMAT_VERSION;
  deck.meta.kind = kindOf(deck);
  const deckBytes = strToU8(JSON.stringify(deck, null, 2));
  if (deckBytes.length > LIMITS.deckJson) return fail('deck.json vượt quá 20 MB.');

  const used = collectImageRefs(deck);
  const keptAssets = new Map();
  let total = deckBytes.length;
  for (const [name, data] of assets) {
    if (prune && !used.has(name)) continue;
    // không tin dữ liệu đầu vào: chỉ giữ ảnh thật, tên hợp lệ, đúng giới hạn
    if (!isImageEntry(name) || !detectImageType(data) || data.length > LIMITS.image) continue;
    total += data.length;
    keptAssets.set(name, data);
  }
  if (keptAssets.size + 1 > LIMITS.entries) return fail('Gói có quá nhiều tập tin.');
  if (total > LIMITS.total) return fail('Tổng dung lượng bộ thẻ vượt quá 500 MB.');

  const files = { 'deck.json': deckBytes };
  for (const [name, data] of keptAssets)
    files[name] = [data, { level: /\.(png|jpe?g|gif|webp)$/i.test(name) ? 0 : 6 }];   // ảnh đã nén sẵn → lưu nguyên
  return { ok: true, bytes: zipSync(files), keptAssets };
}

// thêm ảnh vào gói đang mở (nút Chèn ảnh / kéo thả / dán) → { ok, path:'img/<hash>-<tên>.<đuôi>' }
export function addImage(assets, originalName, bytes) {
  const type = detectImageType(bytes);
  if (!type) return { ok: false, error: 'Không phải ảnh hợp lệ (png, jpg, gif, webp, svg).' };
  if (bytes.length > LIMITS.image) return { ok: false, error: 'Ảnh lớn hơn 5 MB.' };
  const hash = createHash('sha1').update(bytes).digest('hex').slice(0, 8);
  const slug = String(originalName).replace(/\.[^.]*$/, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'anh';
  const name = `img/${hash}-${slug}.${type}`;
  if (!assets.has(name)) assets.set(name, new Uint8Array(bytes));      // cùng nội dung → cùng tên → chỉ lưu 1 bản
  return { ok: true, path: name, size: bytes.length };
}

// Nhập từ thư mục nguồn (deck.json + img/): đọc các ảnh được deck tham chiếu.
// Mỗi ảnh: tên hợp lệ dưới img/, realpath phải nằm trong `dir` (chặn symlink / ../), đúng đuôi + nội dung ảnh, ≤ 5 MB.
// Ảnh nhập từ nguồn cũ giữ tên gốc. Trả { assets: Map, issues: string[] } — ảnh lỗi chỉ là cảnh báo.
export async function collectAssetsFromDir(dir, deckText) {
  const assets = new Map();
  const issues = [];
  let deck;
  try { deck = JSON.parse(String(deckText).replace(/^\uFEFF/, '')); } catch { return { assets, issues }; }

  let root;
  try { root = await fs.realpath(dir); } catch { issues.push(`Không mở được thư mục nguồn: ${dir}`); return { assets, issues }; }
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  let total = 0;

  for (const ref of collectImageRefs(deck)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) {
      issues.push(`Bỏ qua ảnh ngoài gói (không tải từ internet/đĩa ngoài): ${ref}`); continue;
    }
    if (!isImageEntry(ref)) { issues.push(`Bỏ qua ảnh có đường dẫn không hợp lệ (phải nằm trong img/, đuôi png/jpg/gif/webp/svg): ${ref}`); continue; }
    if (assets.size + 1 >= LIMITS.entries) { issues.push('Quá nhiều ảnh, bỏ qua phần còn lại.'); break; }
    let real;
    try { real = await fs.realpath(path.join(root, ...ref.split('/'))); }
    catch { issues.push(`Không tìm thấy ảnh: ${ref}`); continue; }
    if (!real.startsWith(prefix)) { issues.push(`Bỏ qua ảnh nằm ngoài thư mục nguồn: ${ref}`); continue; }
    try {
      const st = await fs.stat(real);
      if (!st.isFile()) { issues.push(`Không phải tập tin ảnh: ${ref}`); continue; }
      if (st.size > LIMITS.image) { issues.push(`Bỏ qua ${ref}: ảnh lớn hơn 5 MB.`); continue; }
      const data = new Uint8Array(await fs.readFile(real));
      if (data.length > LIMITS.image) { issues.push(`Bỏ qua ${ref}: ảnh lớn hơn 5 MB.`); continue; }
      if (!detectImageType(data)) { issues.push(`Bỏ qua ${ref}: nội dung không phải ảnh.`); continue; }
      if (total + data.length > LIMITS.total) { issues.push('Tổng dung lượng ảnh quá lớn, bỏ qua phần còn lại.'); break; }
      total += data.length;
      assets.set(ref, data);
    } catch (e) {
      issues.push(`Không đọc được ảnh ${ref}: ${e.message}`);
    }
  }
  return { assets, issues };
}

