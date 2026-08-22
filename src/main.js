// Point d'entrée : thème, barre supérieure, démarrage du routeur.

import { applyTheme, watchSystemTheme, cycleTheme, themeIcon, themeLabel } from './core/theme.js';
import { startRouter, navigate } from './core/router.js';

function setupTopbar() {
  const home = document.getElementById('home');
  if (home) home.addEventListener('click', () => navigate('/'));

  const tt = document.getElementById('theme-toggle');
  if (tt) {
    const refresh = () => {
      tt.textContent = themeIcon();
      tt.setAttribute('aria-label', `Thème : ${themeLabel()} (cliquer pour changer)`);
      tt.title = `Thème : ${themeLabel()}`;
    };
    tt.addEventListener('click', () => { cycleTheme(); refresh(); });
    refresh();
  }
}

applyTheme();
watchSystemTheme();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  applyTheme();
  setupTopbar();
  startRouter(document.getElementById('view'));
}
