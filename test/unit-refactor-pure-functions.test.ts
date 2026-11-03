// test/unit-refactor-pure-functions.test.ts — Unit tests cho các hàm logic thuần sau khi refactor

import test from 'node:test';
import assert from 'node:assert/strict';

import { selectSubfolders, selectDecks } from '../src/views/home/query.js';
import { canMoveFolderInto } from '../src/views/home/dnd.js';
import { gradeAnswer } from '../src/views/session/submit.js';
import { validateSettingsForm } from '../src/views/settings/form-state.js';
import { planApplyResult } from '../src/app/entries.js';
import { stripAccents } from '../src/core/deckmodel.js';
import { kindOf } from '../src/core/deckkinds.js';
import type { Entry, Folder, Deck } from '../src/core/types.js';

test('dnd: canMoveFolderInto kiểm tra hợp lệ việc di chuyển thư mục', () => {
  const rootA: Folder = { id: 'f1', name: 'A', parentId: null, path: 'A', depth: 0, createdAt: 0, updatedAt: 0 };
  const childA: Folder = { id: 'f2', name: 'Child', parentId: 'f1', path: 'A/Child', depth: 1, createdAt: 0, updatedAt: 0 };
  const siblingAB: Folder = { id: 'f3', name: 'AB', parentId: null, path: 'AB', depth: 0, createdAt: 0, updatedAt: 0 };

  // Tự thân: không được
  assert.equal(canMoveFolderInto(rootA, rootA), false);

  // Thả vào con của chính mình: không được
  assert.equal(canMoveFolderInto(rootA, childA), false);

  // Thư mục tên có tiền tố giống (AB không phải con của A): được phép
  assert.equal(canMoveFolderInto(rootA, siblingAB), true);

  // Thả ra gốc (null): được phép
  assert.equal(canMoveFolderInto(childA, null), true);
});

test('query: selectSubfolders và selectDecks lọc và sắp xếp chính xác', () => {
  const f1: Folder = { id: 'f1', name: 'Toán học', parentId: null, path: 'Toan', depth: 0, createdAt: 0, updatedAt: 0 };
  const f2: Folder = { id: 'f2', name: 'Hình học', parentId: 'f1', path: 'Toan/Hinh', depth: 1, createdAt: 0, updatedAt: 0 };
  const flatFolders = [f1, f2];

  const subfolders = selectSubfolders({
    entries: [],
    flatFolders,
    locationsByDeckId: new Map(),
    selectedFolderId: 'f1',
    filterKind: 'all',
    searchQuery: '',
    sortBy: 'due',
    statsByUid: new Map(),
    stripAccents,
    kindOf,
    findFolder: id => flatFolders.find(f => f.id === id) || null,
  });
  assert.equal(subfolders.length, 1);
  assert.equal(subfolders[0].name, 'Hình học');

  // Kiểm tra tìm kiếm không dấu
  const searchedSubfolders = selectSubfolders({
    entries: [],
    flatFolders,
    locationsByDeckId: new Map(),
    selectedFolderId: 'all',
    filterKind: 'all',
    searchQuery: 'toan',
    sortBy: 'due',
    statsByUid: new Map(),
    stripAccents,
    kindOf,
    findFolder: id => flatFolders.find(f => f.id === id) || null,
  });
  assert.equal(searchedSubfolders.length, 1);
  assert.equal(searchedSubfolders[0].name, 'Toán học');

  // Lọc decks và kiểm tra deck lỗi luôn ở cuối
  const entryOk: Entry = {
    uid: 1,
    path: '/path/1.sdeck',
    status: 'ok',
    deck: { meta: { id: 'd1', title: 'Toán Đại số' }, items: [] },
    issues: [],
  };
  const entryErr: Entry = {
    uid: 2,
    path: '/path/err.sdeck',
    status: 'error',
    issues: [],
  };

  const decks = selectDecks({
    entries: [entryErr, entryOk],
    flatFolders,
    locationsByDeckId: new Map([['d1', 'f1']]),
    selectedFolderId: 'f1',
    filterKind: 'all',
    searchQuery: '',
    sortBy: 'title',
    statsByUid: new Map(),
    stripAccents,
    kindOf,
    findFolder: id => flatFolders.find(f => f.id === id) || null,
  });
  assert.equal(decks.length, 1);
  assert.equal(decks[0].uid, 1);
});

test('submit: gradeAnswer chấm điểm thuần đúng cho các dạng câu hỏi', () => {
  // Trắc nghiệm single
  const qSingle: any = { kind: 'single', answers: [2] };
  const resSingleRight = gradeAnswer(qSingle, 2);
  assert.equal(resSingleRight.grade.ok, true);
  const resSingleWrong = gradeAnswer(qSingle, 0);
  assert.equal(resSingleWrong.grade.ok, false);

  // Điền / Text
  const qFill: any = { kind: 'fill', answers: ['hello', 'hi'], match: 'text' };
  const resFillRight = gradeAnswer(qFill, '  Hello  ');
  assert.equal(resFillRight.grade.ok, true);

  // Flashcard với rating cụ thể
  const qCard: any = { kind: 'card' };
  const resCardAgain = gradeAnswer(qCard, false, 1);
  assert.equal(resCardAgain.grade.ok, false);
  assert.equal(resCardAgain.grade.rating, 1);

  const resCardEasy = gradeAnswer(qCard, true, 4);
  assert.equal(resCardEasy.grade.ok, true);
  assert.equal(resCardEasy.grade.rating, 4);
});

test('settings form: validateSettingsForm kiểm tra tính hợp lệ', () => {
  // Hợp lệ
  const valid = validateSettingsForm({
    newCardsVal: '25',
    stepsVal: '1, 10, 30',
    ttsLangVal: 'en-US',
    ttsVoiceNameVal: '',
    themeVal: 'dark',
    libraryDirVal: '/home/user/decks',
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.value.newCardsPerDay, 25);
    assert.deepEqual(valid.value.learnSteps, [1, 10, 30]);
  }

  // Số thẻ mới âm
  const invalidCards = validateSettingsForm({
    newCardsVal: '-5',
    stepsVal: '1, 10',
    ttsLangVal: 'en-US',
    ttsVoiceNameVal: '',
    themeVal: 'system',
    libraryDirVal: '',
  });
  assert.equal(invalidCards.ok, false);
  if (!invalidCards.ok) {
    assert.equal(invalidCards.field, 'newCards');
  }

  // Steps không hợp lệ (có số 0 hoặc chữ cái)
  const invalidSteps = validateSettingsForm({
    newCardsVal: '20',
    stepsVal: '0, 10',
    ttsLangVal: 'en-US',
    ttsVoiceNameVal: '',
    themeVal: 'system',
    libraryDirVal: '',
  });
  assert.equal(invalidSteps.ok, false);
  if (!invalidSteps.ok) {
    assert.equal(invalidSteps.field, 'steps');
  }
});

test('entries: planApplyResult phát hiện trùng meta.id và lập kế hoạch gộp', () => {
  const existingDeck: Deck = { meta: { id: 'deck-alpha', title: 'Alpha' }, items: [] };
  const existingEntry: Entry = {
    uid: 1,
    path: '/path/deck-a.sdeck',
    deckKey: 'key-1',
    status: 'ok',
    deck: existingDeck,
    issues: [],
  };

  // Nạp 1 file khác đường dẫn nhưng trùng meta.id
  const conflictResult = {
    ok: true,
    path: '/path/deck-b.sdeck',
    deckKey: 'key-2',
    deck: { meta: { id: 'deck-alpha', title: 'Alpha Duplicate' }, items: [] },
    issues: [],
  };

  const plan = planApplyResult([existingEntry], conflictResult);
  assert.equal(plan.fields.status, 'error');
  assert.ok(plan.toClose.includes('key-2'));
  assert.ok(plan.fields.error?.includes('Trùng mã bộ thẻ'));
  assert.ok(plan.warnMessage?.includes('có cùng mã bộ thẻ'));

  // Nạp lại cùng file (update)
  const updateResult = {
    ok: true,
    path: '/path/deck-a.sdeck',
    deckKey: 'key-3',
    deck: { meta: { id: 'deck-alpha', title: 'Alpha Updated' }, items: [] },
    issues: [],
  };
  const updatePlan = planApplyResult([existingEntry], updateResult);
  assert.equal(updatePlan.fields.status, 'ok');
  assert.equal(updatePlan.targetEntry?.uid, 1);
  assert.ok(updatePlan.toClose.includes('key-1'));
});
