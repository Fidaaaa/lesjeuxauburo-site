// Classements : un point par jeu réussi, remis à zéro chaque mois.
//
// Le jeu se joue hors ligne : un point gagné dans le métro doit partir plus
// tard, pas se perdre. Toute victoire est donc d'abord écrite dans une file
// locale, vidée dès qu'une occasion se présente (fin de partie suivante,
// ouverture du classement, retour du réseau).

import { SUPABASE_URL, SUPABASE_KEY, LEADERBOARD_ENABLED, STORAGE_PREFIX } from './config.js';
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

/** Envoie ce qui attend. Les points déjà connus du serveur sont ignorés. */
export async function flush() {
  if (!LEADERBOARD_ENABLED || !isSignedIn()) return 0;
  const queue = readQueue();
  if (!queue.length) return 0;
  const profil = currentUserId();
  if (!profil) return 0;

  try {
    await request('/rest/v1/scores', {
      method: 'POST',
      body: queue.map((s) => ({ profil, jeu: s.jeu, jour: s.jour })),
      // Un point déjà enregistré n'est pas une erreur : on l'ignore.
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    });
  } catch (error) {
    // 4xx : le serveur refuse (date trop vieille, profil absent). Inutile de
    // réessayer indéfiniment. 5xx ou réseau : on garde pour plus tard.
    if (error.status >= 400 && error.status < 500) writeQueue([]);
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
  return rpc('creer_groupe', { nom_groupe: name.trim(), mot_de_passe: password || null });
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
  const rows = await request(
    `/rest/v1/scores?profil=eq.${id}&jour=gte.${since}&select=jeu`,
    { headers: { Prefer: 'count=exact' } },
  );
  return Array.isArray(rows) ? rows.length : 0;
}

// Le réseau revient : on tente de vider la file, sans bruit.
if (typeof window !== 'undefined' && LEADERBOARD_ENABLED) {
  window.addEventListener('online', () => { flush().catch(() => {}); });
}

export { SUPABASE_URL, SUPABASE_KEY };
