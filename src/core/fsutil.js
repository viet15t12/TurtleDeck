// src/core/fsutil.js — ghi file atomic (ghi .tmp → fsync → rename). Chỉ dùng ở main và tools (Node), không dùng ở renderer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const queues = new Map();   // file -> Promise: tuần tự hoá các lần ghi cùng một file

async function writeNow(file, data) {
  const tmp = `${file}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    const fh = await fs.open(tmp, 'w');
    try { await fh.writeFile(data); await fh.sync(); }   // dữ liệu xuống đĩa trước khi rename
    finally { await fh.close(); }
    await fs.rename(tmp, file);                          // rename là atomic trên cùng hệ thống file
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
  try {                                                  // fsync thư mục để rename bền vững (best-effort)
    const dh = await fs.open(path.dirname(file), 'r');
    try { await dh.sync(); } finally { await dh.close(); }
  } catch { /* một số hệ thống file không hỗ trợ */ }
}

export function atomicWrite(file, data) {
  const prev = queues.get(file) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeNow(file, data));
  queues.set(file, next);
  next.finally(() => { if (queues.get(file) === next) queues.delete(file); }).catch(() => {});
  return next;
}

// Giữ 1 bản sao lần lưu trước: file → file.bak (chép ra .tmp rồi rename). Chưa có file cũ → bỏ qua.
export async function backupFile(file, bak = file + '.bak') {
  const tmp = `${bak}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.copyFile(file, tmp);
    await fs.rename(tmp, bak);
    return true;
  } catch (e) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}

