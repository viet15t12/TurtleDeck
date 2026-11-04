// tools/generate-screenshots.js — Tự động chụp 5 màn hình siêu nét của Turtle Deck
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const mathDeck = JSON.parse(fs.readFileSync('data/samples-src/math-sample/deck.json', 'utf8'));
const vocabDeck = JSON.parse(fs.readFileSync('data/samples-src/vocab-sample/deck.json', 'utf8'));
const lpicDeck = JSON.parse(fs.readFileSync('data/samples-src/lpic-sample/deck.json', 'utf8'));

// Cấu trúc dữ liệu & Thuật toán
const dsaDeck = {
  meta: {
    id: 'dsa-sample',
    title: 'Cấu trúc dữ liệu & Thuật toán',
    kind: 'quiz',
    lang: 'vi',
    format: 'studydeck',
    formatVersion: 1
  },
  items: [
    {
      id: 'dsa-001',
      type: 'single',
      topic: 'do-phuc-tap',
      tags: ['big-o', 'sorting'],
      question: 'Độ phức tạp thời gian trung bình của thuật toán **Quicksort** là gì?',
      choices: ['$O(N)$', '$O(N \\log N)$', '$O(N^2)$', '$O(\\log N)$'],
      answer: [1],
      explanation: 'Quicksort có độ phức tạp trung bình là $O(N \\log N)$ theo phương pháp chia để trị.'
    },
    {
      id: 'dsa-002',
      type: 'single',
      topic: 'cay-nhi-phan',
      tags: ['tree', 'avl'],
      question: 'Cây AVL là loại cây gì trong cấu trúc dữ liệu?',
      choices: [
        'Cây tìm kiếm nhị phân tự cân bằng',
        'Cây B-Tree bậc 3',
        'Cây đỏ đen (Red-Black)',
        'Đồ thị vô hướng liên thông'
      ],
      answer: [0],
      explanation: 'Cây AVL là Binary Search Tree tự cân bằng với chênh lệch độ cao tối đa giữa 2 cây con là 1.'
    }
  ]
};

const entries = [
  {
    uid: 'u-math',
    path: '/home/vfedora/Study/Toan-Giai-Tich.sdeck',
    deckKey: 'math-sample',
    status: 'ok',
    deck: mathDeck,
    issues: []
  },
  {
    uid: 'u-vocab',
    path: '/home/vfedora/Study/IELTS-Vocabulary-Advanced.sdeck',
    deckKey: 'vocab-sample',
    status: 'ok',
    deck: vocabDeck,
    issues: []
  },
  {
    uid: 'u-lpic',
    path: '/home/vfedora/Study/Linux-LPIC-1-System-Admin.sdeck',
    deckKey: 'lpic-sample',
    status: 'ok',
    deck: lpicDeck,
    issues: []
  },
  {
    uid: 'u-dsa',
    path: '/home/vfedora/Study/Cau-Truc-Du-Lieu-Va-Thuat-Toan.sdeck',
    deckKey: 'dsa-sample',
    status: 'ok',
    deck: dsaDeck,
    issues: []
  }
];

const now = Date.now();
const DAY_MS = 24 * 60 * 60 * 1000;
const logs = [];
const cards = {};

// 25 ngày streak học liên tục cho progress.log ({ t, rating, card, elapsedMs })
for (let d = 25; d >= 0; d--) {
  const dayTime = now - d * DAY_MS + 14 * 3600 * 1000;
  const count = 12 + Math.floor(Math.sin(d * 1.5) * 4 + 6);
  for (let i = 0; i < count; i++) {
    const deckId = i % 4 === 0 ? 'math-sample' : i % 4 === 1 ? 'vocab-sample' : i % 4 === 2 ? 'lpic-sample' : 'dsa-sample';
    const itemId = `item-${(i % 5) + 1}`;
    logs.push({
      t: dayTime + i * 45000,
      rating: i % 8 === 0 ? 1 : i % 4 === 0 ? 2 : 3,
      card: `${deckId}:${itemId}:fwd`,
      elapsedMs: 2800 + (i % 4) * 500
    });
  }
}

// Trạng thái thẻ SRS
[mathDeck, vocabDeck, lpicDeck, dsaDeck].forEach((d) => {
  d.items.forEach((item, idx) => {
    const key = `${d.meta.id}:${item.id}:fwd`;
    cards[key] = {
      reps: 3 + (idx % 5),
      interval: 2 + (idx % 14),
      factor: 2.5,
      due: now - (idx % 2 === 0 ? 3600000 : -86400000),
      state: idx % 4 === 0 ? 'learning' : idx % 4 === 1 ? 'review' : 'mature'
    };
  });
});

const progress = {
  version: 1,
  cards,
  meta: {
    'math-sample:m-001': { starred: true, note: 'Công thức tích phân Newton-Leibniz quan trọng' },
    'vocab-sample:w-0001': { starred: true, note: 'Từ vựng cốt lõi cho Task 2 Writing' }
  },
  log: logs
};

const settings = {
  decks: entries.map((e) => e.path),
  theme: 'dark',
  newPerDay: 20,
  maxReviewsPerDay: 100,
  learnSteps: [1, 10],
  defaultGraduatingInterval: 1,
  defaultEasyInterval: 4,
  defaultStartingEase: 2.5,
  defaultLapseInterval: 1,
  leechThreshold: 8,
  matchTimerLimit: 60,
  examQuestionCount: 20
};

const folders = [
  {
    id: 'f-math',
    name: 'Môn Đại Cương & Toán học',
    children: []
  },
  {
    id: 'f-tech',
    name: 'Công nghệ & Hệ thống',
    children: []
  },
  {
    id: 'f-lang',
    name: 'Ngoại ngữ & IELTS',
    children: []
  }
];

const deckLocations = [
  { deckId: 'math-sample', folderId: 'f-math', isLink: false },
  { deckId: 'lpic-sample', folderId: 'f-tech', isLink: false },
  { deckId: 'dsa-sample', folderId: 'f-tech', isLink: false },
  { deckId: 'vocab-sample', folderId: 'f-lang', isLink: false }
];

// Gom CSS
const cssFiles = [
  'dist/vendor/katex/katex.min.css',
  'dist/styles/tokens.css',
  'dist/styles/controls.css',
  'dist/styles/base.css',
  'dist/styles/home.css',
  'dist/styles/deck.css',
  'dist/styles/session.css',
  'dist/styles/result.css',
  'dist/styles/settings.css',
  'dist/styles/editor.css',
  'dist/styles/stats.css',
  'dist/styles/learn.css',
  'dist/styles/match.css',
  'dist/styles/exam.css'
];

let allCss = cssFiles.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
allCss += `
  html, body {
    height: 100%;
    margin: 0;
    padding: 0;
    background: var(--c-bg);
    color: var(--c-text);
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  /* Animation tắt trong chụp ảnh để Chart.js vẽ ngay lập tức */
  * {
    animation-duration: 0s !important;
    transition-duration: 0s !important;
  }
`;

const chartJs = fs.readFileSync('dist/vendor/chartjs/chart.umd.min.js', 'utf8');
const harnessBundle = fs.readFileSync('/tmp/harness-bundle.js', 'utf8');

function renderAndCapture(viewName, renderCode, outFile, width = 1600, height = 1000) {
  const html = `<!DOCTYPE html>
<html data-theme="dark">
<head>
  <meta charset="utf-8">
  <title>Turtle Deck — ${viewName}</title>
  <style>${allCss}</style>
</head>
<body>
  <div id="notices"></div>
  <main id="app" class="app"></main>
  <script>${chartJs}</script>
  <script>${harnessBundle}</script>
  <script>
    const root = document.querySelector("#app");
    if (window.Chart) {
      window.Chart.defaults.animation = false;
      window.Chart.defaults.responsive = true;
      window.Chart.defaults.maintainAspectRatio = false;
    }
    const entries = ${JSON.stringify(entries)};
    const progress = ${JSON.stringify(progress)};
    const settings = ${JSON.stringify(settings)};
    const folders = ${JSON.stringify(folders)};
    const deckLocations = ${JSON.stringify(deckLocations)};

    window.api = {
      platform: 'linux',
      loadSettings: async () => settings,
      saveSettings: async () => ({ ok: true }),
      loadProgress: async () => progress,
      saveProgress: async () => ({ ok: true }),
      openDecks: async () => entries.map(e => ({
        ok: true,
        path: e.path,
        deckKey: e.deckKey,
        deck: e.deck,
        issues: []
      })),
      getFolderTree: async () => folders,
      getDeckLocations: async () => deckLocations,
      scanLibrary: async () => [],
      getLibraryDir: async () => '/home/vfedora/Study',
      listDrafts: async () => [],
      getItemMeta: async (deckId, itemId) => progress.meta[deckId + ':' + itemId] || null,
      setItemStarred: async () => ({ ok: true }),
      setItemNote: async () => ({ ok: true }),
      getOverallStreak: async () => 25,
      getDeckReport: async () => ({ reviews: 180, retention: 94.6 }),
      notifyReady: () => {},
      onDeckChanged: () => () => {},
      onFolderChanged: () => () => {},
      onDeckMoved: () => () => {},
      onDeckLinked: () => () => {},
      onDeckUnlinked: () => () => {},
      onWatchError: () => () => {},
      onFileAdded: () => () => {},
      onFileRemoved: () => () => {},
      onOpenExternal: () => () => {},
      onEvent: () => () => {}
    };

    const actions = {
      home: () => {},
      openStats: () => {},
      openSettings: () => {},
      openDeckView: () => {},
      openEditor: () => {},
      scanLibrary: () => {},
      startSrsSession: () => {},
      startLearnSession: () => {},
      startMatchSession: () => {},
      startExamSession: () => {}
    };

    ${renderCode}
  </script>
</body>
</html>`;

  const htmlPath = `/tmp/render_${viewName}.html`;
  fs.writeFileSync(htmlPath, html, 'utf8');

  const outPath = path.resolve(`docs/screenshots/${outFile}`);
  console.log(`[Capture] Chụp ${viewName} -> ${outFile}...`);

  const cmd = `MOZ_DISABLE_CONTENT_SANDBOX=1 MOZ_DISABLE_GMP_SANDBOX=1 XDG_RUNTIME_DIR=/tmp/runtime-vfedora firefox --headless --no-remote --profile /tmp/ff-profile --window-size=${width},${height} --screenshot="${outPath}" file://${htmlPath}`;
  execSync(cmd, { stdio: 'pipe' });

  const stat = fs.statSync(outPath);
  console.log(`  ✓ Thành công: ${outFile} (${(stat.size / 1024).toFixed(1)} KB)`);
}

// 1. Màn hình Home (Thư viện)
renderAndCapture(
  'home',
  `
  window.__VIEWS__.renderHome(root, {
    entries,
    busy: false,
    progress,
    settings
  }, actions);
`,
  '01-home.png'
);

// 2. Màn hình Session (Flashcard SRS với công thức Toán KaTeX)
renderAndCapture(
  'session',
  `
  const mathEntry = entries.find(e => e.deck.meta.id === 'math-sample');
  window.__VIEWS__.renderSession(root, {
    entry: mathEntry,
    config: { mode: 'srs', persist: true },
    progress,
    settings,
    onRecordReview: () => {}
  }, actions);
  const choices = document.querySelectorAll('.choice-btn, .choice-item, input[type="radio"]');
  if (choices.length > 1) {
    choices[1].click();
    const submitBtn = document.querySelector('.submit-btn, button[class*="primary"]');
    if (submitBtn) submitBtn.click();
  }
`,
  '02-session.png'
);

// 3. Màn hình Editor (Trình soạn thảo thẻ KaTeX)
renderAndCapture(
  'editor',
  `
  const mathEntry = entries.find(e => e.deck.meta.id === 'math-sample');
  document.body.classList.add('in-editor');
  window.__VIEWS__.renderEditor(root, {
    entry: mathEntry,
    initialItemId: 'm-001'
  }, actions);
`,
  '03-editor.png'
);

// 4. Màn hình Stats (Thống kê, Heatmap & Streak)
renderAndCapture(
  'stats',
  `
  window.__VIEWS__.renderStats(root, {
    progress,
    entries,
    settings
  }, actions);
`,
  '04-stats.png'
);

// 5. Màn hình Match Game (Trò chơi ghép thẻ)
renderAndCapture(
  'match',
  `
  const vocabDeckCustom = {
    meta: { id: 'vocab-match', title: 'IELTS Vocabulary — Match Game' },
    items: [
      { id: 'v1', term: 'mitigate', definition: 'giảm nhẹ, làm dịu' },
      { id: 'v2', term: 'abundant', definition: 'dồi dào, phong phú' },
      { id: 'v3', term: 'deteriorate', definition: 'xấu đi, suy giảm' },
      { id: 'v4', term: 'inevitable', definition: 'không thể tránh khỏi' },
      { id: 'v5', term: 'resilient', definition: 'kiên cường, bền bỉ' },
      { id: 'v6', term: 'diligent', definition: 'chăm chỉ, cần cù' }
    ]
  };
  const matchEntry = { deck: vocabDeckCustom };
  window.__VIEWS__.renderMatch(root, {
    entry: matchEntry,
    progress: { matchRecords: { 'vocab-match': 14800 } },
    onRecordMatch: () => {}
  }, actions);

  // Cập nhật kỷ lục và đồng hồ thời gian để ảnh trông sinh động
  const badge = document.querySelector('.match-record-badge span');
  if (badge) badge.textContent = '14.8s';
  const timer = document.querySelector('.match-header-stats span[style*="font-family"]');
  if (timer) timer.textContent = '08.4s';

  const tiles = document.querySelectorAll('.match-tile');
  if (tiles.length >= 2) {
    tiles[0].classList.add('selected');
  }
`,
  '05-match.png'
);

console.log('\n[Done] Đã hoàn thành chụp toàn bộ 5 màn hình siêu nét!');
