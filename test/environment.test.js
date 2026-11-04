const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('Tauri app entry files and renderer are present', () => {
  for (const file of ['src-tauri/src/main.rs', 'src-tauri/src/lib.rs', 'src/platform/tauri-api.js', 'src/index.html', 'src/app.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('Phase 1 core modules, views and dev tool are present', () => {
  for (const file of [
    'src/core/sdeck.ts', 'src/core/parser.ts', 'src/core/validate.ts', 'src/core/deckmodel.ts', 'src/core/fsutil.js',
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
    'src/core/grader.ts', 'src/core/builder.ts', 'src/core/richtext.js', 'src/views/session.js',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('Phase 2B modules, vendor assets and sample math deck are present', () => {
  for (const file of [
    'src/core/assetprotocol.js',
    'src/vendor/katex/katex.min.css',
    'src/vendor/katex/fonts',
    'src/vendor/katex/katex.mjs',
    'src/vendor/marked.esm.js',
    'src/vendor/purify.es.mjs',
    'src/vendor/marked-katex.js',
    'data/samples-src/math-sample/deck.json',
    'data/samples-src/math-sample/img/x2-graph.svg',
    'data/samples-src/math-sample/img/triangle.png',
    'data/samples-src/math-sample/img/circle.jpg',
    'data/samples/math-sample.sdeck',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('Phase 2C Deck Editor view is present', () => {
  assert.equal(fs.existsSync(path.join(root, 'src/views/editor.js')), true, 'src/views/editor.js should exist');
});

test('Phase 3 SRS, planner, settings view and simulation script are present', () => {
  for (const file of [
    'src/core/srs.ts',
    'src/core/planner.ts',
    'src/views/settings.js',
    'test/simulate.js',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('Phase 3B Lượt 1 deckkinds and deckstats modules are present', () => {
  for (const file of [
    'src/core/deckkinds.ts',
    'src/core/deckstats.js',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('Phase 3C refactored modules and styles are present', () => {
  for (const file of [
    'src/views/result.js',
    'src/views/notify.js',
    'src/views/components/stackedbar.js',
    'src/views/components/lightbox.js',
    'src/views/modals/sessionsetup.js',
    'src/views/modals/newdeck.js',
    'src/views/modals/deckinfo.js',
    'src/styles/base.css',
    'src/styles/home.css',
    'src/styles/deck.css',
    'src/styles/session.css',
    'src/styles/result.css',
    'src/styles/settings.css',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('Phase 5 Learn, Match, Exam and filters modules are present', () => {
  for (const file of [
    'src/core/learnplanner.ts',
    'src/core/matchgame.js',
    'src/core/exam.js',
    'src/core/filters.js',
    'src/views/learn.js',
    'src/views/match.js',
    'src/views/exam.js',
    'src/views/components/timer.js',
    'src/views/components/filterbar.js',
    'src/styles/match.css',
    'src/styles/exam.css',
    'src/styles/learn.css',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('Phase 6 Stats, progressio, library, shortcuts and linux tools are present', () => {
  for (const file of [
    'src/core/stats.ts',
    'src/core/progressio.js',
    'src/core/library.js',
    'src/views/stats.js',
    'src/styles/stats.css',
    'src/shortcuts.js',
    'src/theme-init.js',
    'src/vendor/chartjs/chart.umd.min.js',
    'tools/linux/install-dev-association.sh',
    'tools/linux/study-deck-mimetype.xml',
    'tools/linux/study-deck-dev.desktop',
  ]) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});


