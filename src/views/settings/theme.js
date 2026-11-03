// src/views/settings/theme.js — Cập nhật và áp dụng theme giao diện (Light/Dark/System)

export function applyTheme(t) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem('studyapp_theme', t);
    } catch {}
  }
  const isDark =
    t === 'dark' ||
    (t === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
}
