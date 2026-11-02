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

test('Phase 1 core modules, views and dev tool are present', () => {
  for (const file of [
    'src/core/sdeck.js', 'src/core/parser.js', 'src/core/validate.js', 'src/core/deckmodel.js', 'src/core/fsutil.js',
    'src/views/home.js', 'src/views/deck.js', 'tools/sdeck.mjs',
    'data/samples-src/lpic-sample/deck.json', 'data/samples-src/vocab-sample/deck.json',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
  const corePkg = JSON.parse(fs.readFileSync(path.join(root, 'src/core/package.json'), 'utf8'));
  assert.equal(corePkg.type, 'module');
});

test('Phase 2 core modules and views are present', () => {
  for (const file of [
    'src/core/grader.js', 'src/core/builder.js', 'src/core/richtext.js', 'src/views/session.js',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});
