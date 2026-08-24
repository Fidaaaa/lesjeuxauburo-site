// Séries, multiplicateurs et carrière.
//
// Trois idées, volontairement séparées :
//
//   * la **série** d'un jeu est son nombre de jours de réussite consécutifs.
//     Elle est propre à chaque jeu : réussir Le Mot dix jours d'affilée ne
//     fait rien pour Tango ;
//   * le **multiplicateur** découle de la série qu'on a *en arrivant*. Trois
//     jours en poche et le jeu rapporte double aujourd'hui, avant même d'y
//     avoir touché — c'est ce qui donne envie d'y aller ;
//   * l'**XP** accumulée dessine une carrière, du stage non rémunéré à la
//     direction générale.
//
// Le même barème vaut côté serveur (voir supabase/schema.sql) : il recalcule
// la série depuis ses propres lignes plutôt que de croire le client, mais les
// seuils et le socle sont identiques, pour que les deux affichent la même
// chose.

import { addDays } from './date.js';

/** XP d'un jeu réussi, avant multiplicateur. */
export const XP_BASE = 10;

// Paliers de multiplication, du plus exigeant au plus accessible : le premier
// atteint gagne.
const PALIERS = [
  { serie: 25, facteur: 4 },
  { serie: 3, facteur: 2 },
];

/** Multiplicateur accordé par une série de `serie` jours. */
export function multiplierFor(serie) {
  for (const p of PALIERS) if (serie >= p.serie) return p.facteur;
  return 1;
}

/** Ce que rapporte une victoire, compte tenu de la série déjà en cours. */
export function xpFor(serie) {
  return XP_BASE * multiplierFor(serie);
}

/** Série qu'il faut atteindre pour le palier suivant, ou null au sommet. */
export function nextPalier(serie) {
  const restants = PALIERS.filter((p) => serie < p.serie).map((p) => p.serie);
  return restants.length ? Math.min(...restants) : null;
}

/**
 * Série réellement en cours aujourd'hui.
 *
 * `stats.currentStreak` n'est recalculée qu'au moment où l'on joue : après
 * trois jours d'absence elle vaut encore ce qu'elle valait avant, et la carte
 * du jeu afficherait fièrement une série morte. On la confronte donc à la
 * date : une série ne tient que si le dernier jour gagné est aujourd'hui ou
 * hier.
 */
export function effectiveStreak(stats, dateStr) {
  if (!stats?.currentStreak || !stats.lastWonDate) return 0;
  const hier = addDays(dateStr, -1);
  return (stats.lastWonDate === dateStr || stats.lastWonDate === hier)
    ? stats.currentStreak
    : 0;
}

// ------------------------------------------------------------------ carrière

// L'échelle interne, du premier jour de stage à la direction. Les seuils sont
// cumulatifs et valent pour l'XP de toute la vie du joueur, tous jeux
// confondus — à ne pas confondre avec le grade du jour (core/tournee.js), qui
// ne juge que la tournée en cours.
export const NIVEAUX = [
  { seuil: 0, titre: 'Stagiaire non rémunéré', emoji: '📎' },
  { seuil: 300, titre: 'Stagiaire', emoji: '🖇️' },
  { seuil: 900, titre: 'Alternant', emoji: '📔' },
  { seuil: 2000, titre: 'CDD', emoji: '📄' },
  { seuil: 4000, titre: 'CDI', emoji: '🗂️' },
  { seuil: 7000, titre: 'Responsable de service', emoji: '📋' },
  { seuil: 11000, titre: 'Cadre', emoji: '💼' },
  { seuil: 17000, titre: 'Cadre supérieur', emoji: '🕴️' },
  { seuil: 26000, titre: 'Directeur', emoji: '🏢' },
  { seuil: 40000, titre: 'PDG', emoji: '👑' },
];

/**
 * Où en est la carrière, pour une XP totale donnée : le poste occupé, le
 * suivant, et la progression vers lui.
 */
export function carriere(xpTotal) {
  const xp = Math.max(0, Math.floor(xpTotal || 0));
  let index = 0;
  for (let i = 0; i < NIVEAUX.length; i++) if (xp >= NIVEAUX[i].seuil) index = i;

  const actuel = NIVEAUX[index];
  const suivant = NIVEAUX[index + 1] || null;
  const parcouru = xp - actuel.seuil;
  const palier = suivant ? suivant.seuil - actuel.seuil : 0;

  return {
    xp,
    niveau: index + 1,
    total: NIVEAUX.length,
    titre: actuel.titre,
    emoji: actuel.emoji,
    suivant: suivant ? suivant.titre : null,
    manquant: suivant ? suivant.seuil - xp : 0,
    progression: suivant ? Math.min(1, parcouru / palier) : 1,
  };
}
