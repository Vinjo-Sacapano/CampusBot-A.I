/**
 * ============================================================================
 * CampusBot AI — Theme Management (Dark Mode & Light Mode)
 * Zero Glitch / Flash-Free Theme Engine for Aklan Catholic College
 * ============================================================================
 */

(function () {
  // 1. Immediately apply saved or system theme to prevent any white flash (FOUC)
  const STORAGE_KEY = 'campusbot_theme';
  let initialTheme = 'light';

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') {
      initialTheme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      initialTheme = 'dark';
    }
  } catch (_) {}

  document.documentElement.setAttribute('data-theme', initialTheme);

  // 2. Synchronize toggle button icon when DOM is ready
  function updateToggleIcon() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const btns = document.querySelectorAll('.theme-toggle-btn');
    btns.forEach(btn => {
      const icon = btn.querySelector('i');
      const label = btn.querySelector('.theme-btn-label');
      if (current === 'dark') {
        if (icon) icon.className = 'fa-solid fa-sun';
        if (label) label.textContent = 'Light';
        btn.setAttribute('title', 'Switch to light mode');
        btn.setAttribute('aria-label', 'Switch to light mode');
      } else {
        if (icon) icon.className = 'fa-solid fa-moon';
        if (label) label.textContent = 'Dark';
        btn.setAttribute('title', 'Switch to dark mode');
        btn.setAttribute('aria-label', 'Switch to dark mode');
      }
    });
  }

  // 3. Toggle action accessible globally
  window.toggleTheme = function () {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {}
    updateToggleIcon();
  };

  // Sync icon on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateToggleIcon);
  } else {
    updateToggleIcon();
  }

  // Optional: Respond to OS system theme changes if user hasn't explicitly set a preference
  try {
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem(STORAGE_KEY)) {
          const newTheme = e.matches ? 'dark' : 'light';
          document.documentElement.setAttribute('data-theme', newTheme);
          updateToggleIcon();
        }
      });
    }
  } catch (_) {}
})();
