// Thème clair/sombre. Trois états : 'auto' (suit prefers-color-scheme),
// 'light', 'dark'. Le toggle manuel cycle et persiste le choix.

import { loadPref, savePref } from './storage.js';

const MODES = ['auto', 'light', 'dark'];

export function getThemeMode() {
  const m = loadPref('theme', 'auto');
  return MODES.includes(m) ? m : 'auto';
}

function systemPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Renvoie le thème effectivement appliqué ('light' | 'dark').
export function effectiveTheme() {
  const mode = getThemeMode();
  if (mode === 'auto') return systemPrefersDark() ? 'dark' : 'light';
  return mode;
}

export function applyTheme() {
  const mode = getThemeMode();
  const root = document.documentElement;
  if (mode === 'auto') {
    root.removeAttribute('data-theme'); // laisse le CSS suivre le média
  } else {
    root.setAttribute('data-theme', mode);
  }
  // Met à jour la couleur de la barre du navigateur mobile.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', effectiveTheme() === 'dark' ? '#151a21' : '#e9edf3');
}

export function cycleTheme() {
  const current = getThemeMode();
  const next = MODES[(MODES.indexOf(current) + 1) % MODES.length];
  savePref('theme', next);
  applyTheme();
  return next;
}

export function themeLabel(mode = getThemeMode()) {
  return { auto: 'Auto', light: 'Clair', dark: 'Sombre' }[mode];
}

export function themeIcon(mode = getThemeMode()) {
  return { auto: '🌗', light: '☀️', dark: '🌙' }[mode];
}

// Réagit aux changements système quand on est en mode auto.
export function watchSystemTheme() {
  if (!window.matchMedia) return;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemeMode() === 'auto') applyTheme();
  });
}
