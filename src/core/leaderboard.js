// Classements : un point par jeu réussi, remis à zéro chaque mois.
//
// Le jeu se joue hors ligne : un point gagné dans le métro doit partir plus
// tard, pas se perdre. Toute victoire est donc d'abord écrite dans une file
// locale, vidée dès qu'une occasion se présente (fin de partie suivante,
// ouverture du classement, retour du réseau).

import { SUPABASE_URL, SUPABASE_KEY, LEADERBOARD_ENABLED, STORAGE_PREFIX } from './config.js';
import { acceptable, REFUS } from './moderation.js';
import { isSignedIn, request, rpc, currentUserId } from './account.js';
import { siteUrl } from './share.js';

const QUEUE_KEY = `${STORAGE_PREFIX}:scorequeue`;
// Au-delà, c'est que le compte est resté déconnecté longtemps : les vieux
// points ne seraient de toute façon plus acceptés (le serveur refuse une date
// qui s'écarte d'aujourd'hui de plus d'un jour).
const QUEUE_MAX = 40;

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch (_) {
    return [];
  }
}

function writeQueue(items) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-QUEUE_MAX)));
  } catch (_) { /* sans effet : on perdra ce point, pas la partie */ }
}

/**
 * Enregistre une victoire. Ne lève jamais : une panne de classement ne doit
 * pas gâcher une fin de partie.
 */
export function recordWin(gameId, dateStr) {
  if (!LEADERBOARD_ENABLED) return;
  const queue = readQueue();
  if (queue.some((s) => s.jeu === gameId && s.jour === dateStr)) return;
  queue.push({ jeu: gameId, jour: dateStr });
  writeQueue(queue);
  flush().catch(() => {});
}

/**
 * Envoie ce qui attend. Les points déjà connus du serveur sont ignorés.
 *
 * On n'écrit plus directement dans la table : `enregistrer_scores` recalcule
 * la série de chaque jeu depuis les lignes déjà en base et en déduit l'XP.
 * L'app n'envoie donc toujours que « tel jeu, tel jour » — elle n'a aucun
 * moyen de s'attribuer un multiplicateur qu'elle n'a pas mérité.
 */
export async function flush() {
  if (!LEADERBOARD_ENABLED || !isSignedIn()) return 0;
  const queue = readQueue();
  if (!queue.length) return 0;
  const profil = currentUserId();
  if (!profil) return 0;

  try {
    await rpc('enregistrer_scores', {
      entrees: queue.map((s) => ({ jeu: s.jeu, jour: s.jour })),
    });
  } catch (error) {
    // On ne jette la file que sur un 400 : une requête malformée le restera,
    // la réessayer ne mènerait nulle part.
    //
    // Tout le reste se garde, y compris le 404. Il signale que la fonction
    // n'est pas encore en base — un site déployé avant son schéma — et jeter
    // la file à ce moment-là ferait perdre pour de bon l'XP des joueurs, alors
    // qu'il suffit d'attendre. Une session expirée (401) se rattrape de même à
    // la reconnexion.
    if (error.status === 400) writeQueue([]);
    return 0;
  }
  writeQueue([]);
  return queue.length;
}

export function pendingCount() {
  return readQueue().length;
}

// --- Lecture des classements ------------------------------------------------

export function globalRanking(limit = 100) {
  return rpc('classement_global', { limite: limit });
}

export function gameRanking(gameId, limit = 100) {
  return rpc('classement_jeu', { id_jeu: gameId, limite: limit });
}

export function groupRanking(code) {
  return rpc('classement_groupe', { code_groupe: code.toUpperCase() });
}

// --- Groupes ----------------------------------------------------------------

/** Nom du groupe et présence d'un mot de passe, pour la page d'invitation. */
export async function previewGroup(code) {
  const rows = await rpc('apercu_groupe', { code_groupe: code.toUpperCase() });
  return rows?.[0] ?? null;
}

/**
 * Lien à envoyer pour rejoindre un groupe.
 *
 * On vise une vraie page plutôt que le fragment `#/groupe/CODE` : iOS décide
 * d'ouvrir l'app à partir du chemin de l'URL et ignore le fragment. Sans ça,
 * le lien ouvrirait Safari même quand l'app est installée.
 */
export function groupInviteUrl(code) {
  const base = siteUrl().replace(/index\.html$/, '');
  return `${base}rejoindre.html?g=${code.toUpperCase()}`;
}

export function myGroups() {
  return rpc('mes_groupes');
}

export function createGroup(name, password) {
  const clean = name.trim();
  // Un nom de groupe est lu par tous ses membres : même filtre que le pseudo.
  if (!acceptable(clean)) throw new Error(REFUS.replace('pseudo', 'nom'));
  return rpc('creer_groupe', { nom_groupe: clean, mot_de_passe: password || null });
}

export function joinGroup(code, password) {
  return rpc('rejoindre_groupe', {
    code_groupe: code.trim().toUpperCase(),
    mot_de_passe: password || null,
  });
}

export async function leaveGroup(code) {
  await request(`/rest/v1/membres?groupe=eq.${encodeURIComponent(code.toUpperCase())}`
    + `&profil=eq.${currentUserId()}`, { method: 'DELETE' });
}

// --- Mon score du mois ------------------------------------------------------

export async function myMonthlyPoints() {
  const id = currentUserId();
  if (!id) return 0;
  const firstOfMonth = new Date();
  firstOfMonth.setDate(1);
  const since = firstOfMonth.toISOString().slice(0, 10);
  // On somme l'XP, et non plus le nombre de lignes : une partie en série vaut
  // deux ou quatre fois une partie isolée.
  const rows = await request(
    `/rest/v1/scores?profil=eq.${id}&jour=gte.${since}&select=xp`,
  );
  return Array.isArray(rows) ? rows.reduce((total, r) => total + (r.xp || 0), 0) : 0;
}

// Le réseau revient : on tente de vider la file, sans bruit.
if (typeof window !== 'undefined' && LEADERBOARD_ENABLED) {
  window.addEventListener('online', () => { flush().catch(() => {}); });
}

export { SUPABASE_URL, SUPABASE_KEY };
