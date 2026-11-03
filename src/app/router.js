// src/app/router.js — Router điều hướng và render các view dựa trên state.route

import { renderHome, detachHomeKeyboard } from '../views/home.js';
import { renderDeck } from '../views/deck.js';
import { renderSession, disposeSession } from '../views/session.js';
import { renderEditor } from '../views/editor.js';
import { renderSettings } from '../views/settings.js';
import { renderStats } from '../views/stats.js';
import { renderLearn } from '../views/learn.js';
import { renderMatch } from '../views/match.js';
import { renderExam } from '../views/exam.js';
import { setShortcutScope } from '../shortcuts.js';
import { handleRecordReview } from './progress.js';

const api = window.api;

export function createRouter({ state, actions, root }) {
  return function render() {
    if (state.route.name !== 'home') {
      detachHomeKeyboard();
    }
    if (state.route.name !== 'session') {
      disposeSession();
    }

    document.body.classList.toggle('in-editor', state.route.name === 'editor');

    if (state.route.name === 'stats') {
      document.title = 'Thống kê học tập — Turtle Deck';
      setShortcutScope('stats', {
        onEscape: () => actions.home(),
      });
      renderStats(
        root,
        {
          progress: state.progress,
          entries: state.entries,
          settings: state.settings,
        },
        actions
      );
      if (state.modal) root.append(state.modal);
      return;
    }

    if (state.route.name === 'settings') {
      document.title = 'Cài đặt — Turtle Deck';
      setShortcutScope('settings', {
        onEscape: () => actions.home(),
      });
      renderSettings(
        root,
        {
          settings: state.settings,
          progress: state.progress,
          entries: state.entries,
        },
        actions
      );
      if (state.modal) root.append(state.modal);
      return;
    }

    if (state.route.name === 'editor') {
      const entry = state.entries.find(e => e.uid === state.route.uid);
      if (entry?.status === 'ok') {
        document.title = `Soạn thảo: ${entry.deck.meta.title} — Turtle Deck`;
        setShortcutScope('editor');
        renderEditor(root, { entry, initialItemId: state.route.itemId || null }, actions);
        if (state.modal) root.append(state.modal);
        return;
      }
      state.route = { name: 'home' };
      document.body.classList.remove('in-editor');
    }

    if (state.route.name === 'session') {
      const entry = state.entries.find(e => e.uid === state.route.uid);
      if (entry?.status === 'ok') {
        const effectiveEntry = state.route.trialDeck
          ? { ...entry, deck: state.route.trialDeck }
          : entry;
        document.title = `Học: ${effectiveEntry.deck.meta.title} — Turtle Deck`;
        const sessionActions = state.route.fromEditor
          ? { ...actions, openDeckView: () => actions.openEditor(entry) }
          : actions;
        renderSession(
          root,
          {
            entry: effectiveEntry,
            config: state.route.config,
            progress: state.progress,
            settings: state.settings,
            onRecordReview: handleRecordReview,
          },
          sessionActions
        );
        if (state.modal) root.append(state.modal);
        return;
      }
      state.route = { name: 'home' };
    }

    if (state.route.name === 'learn') {
      const entry = state.entries.find(e => e.uid === state.route.uid);
      if (entry?.status === 'ok') {
        document.title = `Học thích ứng: ${entry.deck.meta.title} — Turtle Deck`;
        setShortcutScope('session');
        renderLearn(
          root,
          {
            entry,
            progress: state.progress,
            onSaveProgress: async newProg => {
              state.progress = newProg;
              await api.saveProgress(state.progress);
            },
          },
          actions
        );
        if (state.modal) root.append(state.modal);
        return;
      }
      state.route = { name: 'home' };
    }

    if (state.route.name === 'match') {
      const entry = state.entries.find(e => e.uid === state.route.uid);
      if (entry?.status === 'ok') {
        document.title = `Ghép thẻ: ${entry.deck.meta.title} — Turtle Deck`;
        setShortcutScope('session');
        renderMatch(
          root,
          {
            entry,
            progress: state.progress,
            onRecordMatch: async res => {
              if (res?.progress) {
                state.progress = res.progress;
                await api.saveProgress(state.progress);
              }
            },
          },
          actions
        );
        if (state.modal) root.append(state.modal);
        return;
      }
      state.route = { name: 'home' };
    }

    if (state.route.name === 'exam') {
      const entry = state.entries.find(e => e.uid === state.route.uid);
      if (entry?.status === 'ok') {
        document.title = `Thi thử: ${entry.deck.meta.title} — Turtle Deck`;
        setShortcutScope('session');
        renderExam(
          root,
          {
            entry,
            config: state.route.config,
            progress: state.progress,
            onSaveProgress: async newProg => {
              state.progress = newProg;
              await api.saveProgress(state.progress);
            },
          },
          actions
        );
        if (state.modal) root.append(state.modal);
        return;
      }
      state.route = { name: 'home' };
    }

    if (state.route.name === 'deck') {
      const entry = state.entries.find(e => e.uid === state.route.uid);
      if (entry?.status === 'ok') {
        document.title = `${entry.deck.meta.title} — Turtle Deck`;
        setShortcutScope('deck', {
          onEscape: () => actions.home(),
        });
        renderDeck(root, entry, actions, { progress: state.progress, settings: state.settings });
        if (state.modal) root.append(state.modal);
        return;
      }
      state.route = { name: 'home' };
    }

    document.title = 'Turtle Deck';
    setShortcutScope('home');
    renderHome(
      root,
      {
        entries: state.entries,
        busy: state.busy,
        progress: state.progress,
        settings: state.settings,
      },
      actions
    );
    if (state.modal) root.append(state.modal);
  };
}

