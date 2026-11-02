#!/usr/bin/env node
// tools/sdeck.mjs — công cụ cho dev làm việc với gói .sdeck (study-app.md mục 3.0).
//   node tools/sdeck.mjs pack <thư-mục> [file.sdeck]      đóng gói thư mục (deck.json + img/)
//   node tools/sdeck.mjs unpack <file.sdeck> [thư-mục]    giải nén để xem / gỡ lỗi
//   node tools/sdeck.mjs check <file.sdeck>               kiểm tra gói + nội dung
//   node tools/sdeck.mjs pack-all <thư-mục-nguồn> <thư-mục-ra>   đóng gói mọi thư mục con có deck.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { readPackage, writePackage, collectAssetsFromDir } from '../src/core/sdeck.js';
import { parseDeck } from '../src/core/parser.js';
import { atomicWrite } from '../src/core/fsutil.js';

const USAGE = `Cách dùng:
  node tools/sdeck.mjs pack <thư-mục> [file.sdeck]
  node tools/sdeck.mjs unpack <file.sdeck> [thư-mục]
  node tools/sdeck.mjs check <file.sdeck>
  node tools/sdeck.mjs pack-all <thư-mục-nguồn> <thư-mục-ra>`;

class CliError extends Error {}

function printIssues(issues, indent = '  ') {
  for (const i of issues) {
    const it = typeof i === 'string' ? { level: 'warn', msg: i } : i;
    console.log(`${indent}${it.level === 'error' ? '✕' : '⚠'} ${it.itemId && !it.skipped ? `[${it.itemId}] ` : ''}${it.msg}`);
  }
}

async function pack(dir, out) {
  if (!dir) throw new CliError(USAGE);
  const src = path.resolve(dir);
  const target = path.resolve(out || `${src.replace(/[\\/]+$/, '')}.sdeck`);
  let deckText;
  try { deckText = (await fs.readFile(path.join(src, 'deck.json'), 'utf8')).replace(/^\uFEFF/, ''); }
  catch { throw new CliError(`Không đọc được ${path.join(src, 'deck.json')}`); }

  const parsed = parseDeck(deckText);
  if (!parsed.ok) throw new CliError(`${dir}: ${parsed.error}`);
  const { assets, issues: assetIssues } = await collectAssetsFromDir(src, deckText);
  const built = writePackage(deckText, assets, { prune: true });
  if (!built.ok) throw new CliError(`${dir}: ${built.error}`);
  const check = readPackage(built.bytes);
  if (!check.ok || !parseDeck(check.deckText).ok) throw new CliError(`${dir}: gói vừa nén không đọc lại được.`);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await atomicWrite(target, built.bytes);
  console.log(`✓ ${path.relative(process.cwd(), target) || target}: "${parsed.deck.meta.title}" — ` +
    `${parsed.deck.items.length}/${parsed.total} mục, ${built.keptAssets.size} ảnh, ${(built.bytes.length / 1024).toFixed(1)} KB`);
  printIssues([...assetIssues, ...parsed.issues]);
  return parsed.issues.some(i => i.level === 'error') ? 1 : 0;
}

async function load(file) {
  if (!file) throw new CliError(USAGE);
  let bytes;
  try { bytes = await fs.readFile(file); } catch (e) { throw new CliError(`Không đọc được ${file}: ${e.message}`); }
  return readPackage(bytes);
}

async function unpack(file, outDir) {
  const pkg = await load(file);
  if (!pkg.ok) throw new CliError(`${file}: ${pkg.error}`);
  const dir = path.resolve(outDir || file.replace(/\.sdeck$/i, ''));
  await fs.mkdir(path.join(dir, 'img'), { recursive: true });
  await fs.writeFile(path.join(dir, 'deck.json'), pkg.deckText);
  for (const [name, data] of pkg.assets) {
    const dest = path.resolve(dir, ...name.split('/'));        // tên đã được isSafeEntry kiểm tra
    if (!dest.startsWith(dir + path.sep)) continue;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, data);
  }
  console.log(`✓ Đã giải nén ${file} → ${dir} (deck.json + ${pkg.assets.size} ảnh)`);
  printIssues(pkg.issues);
  return 0;
}

async function check(file) {
  const pkg = await load(file);
  if (!pkg.ok) { console.log(`✕ ${file}: ${pkg.error}`); return 1; }
  const parsed = parseDeck(pkg.deckText);
  if (!parsed.ok) { console.log(`✕ ${file}: ${parsed.error}`); printIssues(pkg.issues); return 1; }
  const { meta, items } = parsed.deck;
  console.log(`✓ ${file}\n  id: ${meta.id}\n  tiêu đề: ${meta.title}\n  loại: ${meta.kind}` +
    `\n  phiên bản định dạng: ${meta.formatVersion ?? '(không ghi)'}\n  mục học được: ${items.length}/${parsed.total}\n  ảnh: ${pkg.assets.size}`);
  const all = [...pkg.issues, ...parsed.issues];
  if (all.length) { console.log(`  cảnh báo (${all.length}):`); printIssues(all, '    '); }
  return parsed.skipped ? 1 : 0;
}

async function packAll(srcRoot, outRoot) {
  if (!srcRoot || !outRoot) throw new CliError(USAGE);
  const entries = await fs.readdir(srcRoot, { withFileTypes: true });
  let failed = 0, count = 0;
  for (const d of entries.filter(e => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(srcRoot, d.name);
    try { await fs.access(path.join(dir, 'deck.json')); } catch { continue; }
    count++;
    try { failed += await pack(dir, path.join(outRoot, `${d.name}.sdeck`)); }
    catch (e) { failed++; console.error(`✕ ${e.message}`); }
  }
  if (!count) console.log(`(Không có thư mục con nào chứa deck.json trong ${srcRoot})`);
  return failed ? 1 : 0;
}

const [cmd, a, b] = process.argv.slice(2);
const commands = { pack, unpack, check, 'pack-all': packAll };
if (!commands[cmd]) { console.log(USAGE); process.exit(cmd ? 2 : 0); }
try {
  process.exitCode = await commands[cmd](a, b);
} catch (e) {
  console.error(e instanceof CliError ? e.message : e);
  process.exitCode = 2;
}
