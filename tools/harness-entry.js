// tools/harness-entry.js — Bundle các view và mock data để render offline qua file://
import { renderHome } from '../src/views/home/index.js';
import { renderSession } from '../src/views/session/index.js';
import { renderEditor } from '../src/views/editor/editor.js';
import { renderStats } from '../src/views/stats.js';
import { renderMatch } from '../src/views/match.js';

console.log('Harness entry loaded');
window.__VIEWS__ = {
  renderHome,
  renderSession,
  renderEditor,
  renderStats,
  renderMatch
};

