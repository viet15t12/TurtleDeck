// src/theme-init.js — Áp dụng theme ngay khi nạp trang (tránh nháy màu, tuân thủ CSP script-src 'self').
(function() {
  try {
    const theme = localStorage.getItem('studyapp_theme') || 'system';
    function applyTheme(t) {
      const isDark = t === 'dark' || (t === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    }
    applyTheme(theme);
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const cur = localStorage.getItem('studyapp_theme') || 'system';
        if (cur === 'system') applyTheme('system');
      });
    }
  } catch {}
})();

