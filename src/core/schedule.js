// Le calendrier des puzzles, servi par l'API.
//
// La table `puzzles` de Supabase est désormais la **source de vérité** : on
// peut y corriger une entrée, ou prolonger le jeu au-delà de ce que couvrent
// les banques embarquées, sans republier le site ni l'app.
//
// Les banques restent un **filet**, et ce n'est pas une redondance inutile :
//   * on joue hors ligne, dans le métro, au premier lancement ;
//   * si l'API tombe, le jeu du jour continue ;
//   * les deux sources disent aujourd'hui exactement la même chose — le
//     calendrier publié est celui que produit l'algorithme déterministe
//     (parité vérifiée sur 100 tirages, 10 jeux × 10 dates sur deux ans).
//
// On récupère quinze jours d'avance : passer une nuit hors ligne, ou partir en
// week-end sans réseau, ne prive alors de rien.

import { SUPABASE_URL, SUPABASE_KEY, STORAGE_PREFIX } from './config.js';
import { getPuzzleDate, addDays } from './date.js';

const CACHE_KEY = `${STORAGE_PREFIX}:schedule`;
const JOURS_DAVANCE = 15;
// Au-delà, on redemande : de quoi voir arriver une correction publiée en base.
const FRAICHEUR_H = 6;

let memoire = null;

function lire() {
  if (memoire) return memoire;
  try {
    memoire = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch (_) {
    memoire = null;
  }
  return memoire;
}

function ecrire(cache) {
  memoire = cache;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (_) { /* stockage plein ou navigation privée : on garde en mémoire */ }
}

/**
 * Puzzle publié pour ce jeu et ce jour, ou `null` si le calendrier ne l'a pas
 * (jamais téléchargé, hors de la fenêtre, API muette). L'appelant retombe
 * alors sur sa banque embarquée.
 */
export function scheduledPuzzle(gameId, dateStr = getPuzzleDate()) {
  const cache = lire();
  return cache?.jours?.[dateStr]?.[gameId] ?? null;
}

/** Vrai si le calendrier couvre déjà le jour demandé. */
export function hasSchedule(dateStr = getPuzzleDate()) {
  return Boolean(lire()?.jours?.[dateStr]);
}

/**
 * Récupère la fenêtre à venir. Silencieux par construction : une panne de
 * réseau ne doit jamais empêcher de jouer, seulement laisser le filet agir.
 */
export async function primeSchedule() {
  const aujourdhui = getPuzzleDate();
  const cache = lire();

  const recent = cache?.recupereLe
    && (Date.now() - cache.recupereLe) < FRAICHEUR_H * 3600 * 1000;
  if (recent && cache.jours?.[aujourdhui]) return false;

  const fin = addDays(aujourdhui, JOURS_DAVANCE);
  const url = `${SUPABASE_URL}/rest/v1/puzzles`
    + `?jour=gte.${aujourdhui}&jour=lte.${fin}&select=jeu,jour,charge`;

  try {
    const reponse = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!reponse.ok) return false;
    const lignes = await reponse.json();
    if (!Array.isArray(lignes) || !lignes.length) return false;

    const jours = {};
    for (const ligne of lignes) {
      (jours[ligne.jour] ||= {})[ligne.jeu] = ligne.charge;
    }
    ecrire({ jours, recupereLe: Date.now() });
    return true;
  } catch (_) {
    return false;   // hors ligne : le filet suffit
  }
}
