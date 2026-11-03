// test/services-purity.test.mjs — Kiểm tra các service trong src/main/services không import electron
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

test('services purity: src/main/services must NOT import electron', async () => {
  const servicesDir = path.resolve('src/main/services');
  const files = await fs.readdir(servicesDir);

  for (const f of files) {
    if (!f.endsWith('.ts')) continue;
    const content = await fs.readFile(path.join(servicesDir, f), 'utf8');
    const importElectron = /import\s+.*from\s+['"]electron['"]|require\(['"]electron['"]\)/g;
    const matches = [...content.matchAll(importElectron)];
    assert.equal(
      matches.length,
      0,
      `File src/main/services/${f} must NOT import 'electron'. Found: ${JSON.stringify(matches)}`
    );
  }
});
