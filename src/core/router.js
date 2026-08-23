// Routeur minimal basé sur le hash (#/, #/mot, ...). Sans dépendance.
// Gère le contexte de puzzle (date Paris, numéro) et le nettoyage entre vues.

import { getGame } from './registry.js';
import { getPuzzleDate, getDayNumber, getPuzzleNumber } from './date.js';
import { renderHub } from '../ui/hub.js';
import { renderStats } from '../ui/stats.js';
import { renderLeaderboard, renderGroupInvite } from '../ui/leaderboard.js';
import { clear } from './dom.js';

let viewEl = null;
let currentCleanup = null;

export function navigate(path) {
  const clean = path.startsWith('#') ? path.slice(1) : path;
  location.hash = clean.startsWith('/') ? clean : `/${clean}`;
}

function puzzleContext(game) {
  const dateStr = getPuzzleDate();
  return {
    gameId: game.id,
    gameName: game.name,
    dateStr,
    dayNumber: getDayNumber(dateStr),
    puzzleNumber: getPuzzleNumber(dateStr),
  };
}

function parseRoute() {
  const h = location.hash.replace(/^#/, '') || '/';
  const parts = h.split('/').filter(Boolean);
  // #/groupe/ABC123 → { id: 'groupe', param: 'ABC123' }
  return { id: parts[0] || null, param: parts[1] ? decodeURIComponent(parts[1]) : null };
}

async function render() {
  if (currentCleanup) { try { currentCleanup(); } catch (_) { /* ignore */ } currentCleanup = null; }
  clear(viewEl);
  window.scrollTo(0, 0);

  const { id: routeId, param } = parseRoute();

  if (!routeId) {
    viewEl.dataset.route = 'hub';
    renderHub(viewEl);
    return;
  }

  if (routeId === 'stats') {
    viewEl.dataset.route = 'stats';
    renderStats(viewEl);
    return;
  }

  if (routeId === 'classement') {
    viewEl.dataset.route = 'classement';
    renderLeaderboard(viewEl);
    return;
  }

  // Lien d'invitation à un groupe : #/groupe/ABC123
  if (routeId === 'groupe' && param) {
    viewEl.dataset.route = 'groupe';
    renderGroupInvite(viewEl, param);
    return;
  }

  const game = getGame(routeId);
  if (!game || !game.available) {
    navigate('/');
    return;
  }

  viewEl.dataset.route = game.id;
  viewEl.append(document.createTextNode('')); // placeholder
  try {
    const mod = await game.load();
    const impl = mod.default;
    clear(viewEl);
    const cleanup = impl.mount(viewEl, puzzleContext(game));
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    console.error('Erreur de chargement du jeu', err);
    clear(viewEl);
    const p = document.createElement('p');
    p.className = 'error-note';
    p.textContent = 'Oups, ce jeu n’a pas voulu démarrer. Recharge la page.';
    viewEl.append(p);
  }
}

export function startRouter(mountPoint) {
  viewEl = mountPoint;
  window.addEventListener('hashchange', render);
  render();
}
