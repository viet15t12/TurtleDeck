// test/hash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha1, normalizeTerm, stableVocabId } from '../src/core/hash.js';

test('hash: vector chuẩn SHA-1', () => {
  assert.equal(sha1(''), 'da39a3ee5e6b4b0d3255bfef95601890afd80709');
  assert.equal(sha1('abc'), 'a9993e364706816aba3e25717850c26c9cd0d89d');
  assert.equal(
    sha1('The quick brown fox jumps over the lazy dog'),
    '2fd4e1c67a2d28fced849ee1bb76e7391b93eb12'
  );
});

test('hash: normalizeTerm và stableVocabId ổn định', () => {
  assert.equal(normalizeTerm('  Mitigate  '), 'mitigate');
  assert.equal(normalizeTerm('ice   cream'), 'ice cream');
  assert.equal(normalizeTerm('Cà  phê'), 'cà phê');

  const id1 = stableVocabId('Mitigate ');
  const id2 = stableVocabId('mitigate');
  const id3 = stableVocabId('  MITIGATE   ');

  assert.equal(id1, id2);
  assert.equal(id2, id3);
  assert.match(id1, /^w-[a-f0-9]{10}$/);
});

