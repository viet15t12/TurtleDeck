const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('Electron app entry files and renderer are present', () => {
  for (const file of ['main.js', 'preload.js', 'src/index.html', 'src/app.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});
