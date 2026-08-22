// Couche localStorage : sauvegarde des parties en cours, résultats du jour,
// stats persistantes, préférences. Tout est namespacé et tolérant aux erreurs
// (mode navigation privée, quota plein, etc.).

import { STORAGE_PREFIX } from './config.js';

function key(...parts) {
  return [STORAGE_PREFIX, ...parts].join(':');
}

function readJSON(k, fallback) {
  try {
    const raw = localStorage.getItem(k);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function writeJSON(k, value) {
  try {
    localStorage.setItem(k, JSON.stringify(value));
    return true;
  } catch (_) {
    return false;
  }
}

// --- État de partie du jour (reprise exacte là où on s'est arrêté) ---

export function loadGameState(gameId, dateStr) {
  return readJSON(key('state', gameId, dateStr), null);
}

export function saveGameState(gameId, dateStr, state) {
  return writeJSON(key('state', gameId, dateStr), state);
}

export function clearGameState(gameId, dateStr) {
  try { localStorage.removeItem(key('state', gameId, dateStr)); } catch (_) { /* ignore */ }
}

// --- Résultat du jour (utilisé par le hub pour l'état des cartes) ---
// { status: 'win'|'lose', score, guesses, share } — figé une fois la partie finie.

export function loadResult(gameId, dateStr) {
  return readJSON(key('result', gameId, dateStr), null);
}

export function saveResult(gameId, dateStr, result) {
  return writeJSON(key('result', gameId, dateStr), result);
}

// --- Statistiques persistantes par jeu ---

const EMPTY_STATS = {
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastPlayedDate: null, // date de puzzle du dernier résultat enregistré
  lastWonDate: null,
  dist: {}, // répartition des scores (ex: nb d'essais -> compte)
};

export function loadStats(gameId) {
  return { ...EMPTY_STATS, dist: {}, ...readJSON(key('stats', gameId), {}) };
}

export function saveStats(gameId, stats) {
  return writeJSON(key('stats', gameId), stats);
}

// Enregistre un résultat dans les stats. `distKey` classe le résultat dans la
// répartition (ex: '4' pour 4 essais, 'X' pour un échec). Idempotent par jour :
// on ne compte pas deux fois le même jour de puzzle.
export function recordStats(gameId, { dateStr, won, distKey, prevDateStr }) {
  const stats = loadStats(gameId);
  if (stats.lastPlayedDate === dateStr) return stats; // déjà comptabilisé

  stats.played += 1;
  if (won) stats.wins += 1;

  // Streak : on continue si le dernier jour gagné est la veille (prevDateStr).
  if (won) {
    if (stats.lastWonDate === prevDateStr) stats.currentStreak += 1;
    else stats.currentStreak = 1;
    stats.lastWonDate = dateStr;
    if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
  } else {
    stats.currentStreak = 0;
  }

  if (distKey != null) {
    stats.dist[distKey] = (stats.dist[distKey] || 0) + 1;
  }
  stats.lastPlayedDate = dateStr;
  saveStats(gameId, stats);
  return stats;
}

// --- Préférences (thème) ---

export function loadPref(name, fallback) {
  try {
    const v = localStorage.getItem(key('pref', name));
    return v == null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

export function savePref(name, value) {
  try { localStorage.setItem(key('pref', name), value); } catch (_) { /* ignore */ }
}

// --- Onboarding « Comment jouer » (une modale au premier lancement par jeu) ---

export function hasSeenHowTo(gameId) {
  return loadPref(`howto:${gameId}`, '0') === '1';
}

export function markHowToSeen(gameId) {
  savePref(`howto:${gameId}`, '1');
}
