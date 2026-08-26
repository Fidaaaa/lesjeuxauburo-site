// Balises : ce que la table des scores ne dit pas.
//
// `scores` n'enregistre que les **parties gagnées**. C'est ce qu'il faut pour
// l'XP et le classement, et rien de plus. Mais dans les chiffres, un jeu que
// personne n'ouvre et un jeu qu'on ouvre puis qu'on referme se ressemblent —
// alors qu'ils appellent des corrections opposées : le premier manque de
// visite, le second déçoit ceux qui viennent.
//
// Six balises suffisent à faire la différence :
//
//   ouvert · gagne · perdu · abandon · indice · partage
//
// ## Ce qui n'est PAS collecté, et pourquoi ça compte
//
//   * **rien sans compte.** Un joueur qui n'a pas de profil ne laisse aucune
//     trace. C'est une promesse tenue à l'App Store, et elle vaut plus que la
//     précision d'une statistique ;
//   * **aucun contenu de partie** — ni les mots proposés, ni le secret, ni la
//     grille. Seulement des comptes et, pour une victoire, le nombre d'essais ;
//   * **aucun horodatage fin.** Le jour, pas l'heure : savoir qu'on joue à
//     11 h 42 n'apprend rien qu'on ait le droit de vouloir savoir.
//
// Le type de donnée « interaction avec le produit » est déjà déclaré à Apple.
// Ces balises ne l'élargissent pas, elles le précisent.
//
// ## Hors ligne
//
// Comme les scores : on écrit d'abord dans une file locale, vidée dès qu'une
// occasion se présente. Une balise perdue n'est qu'une statistique en moins ;
// une balise qui bloque une fin de partie serait un bug.

import { LEADERBOARD_ENABLED, STORAGE_PREFIX } from './config.js';
import { isSignedIn, rpc } from './account.js';

const FILE = `${STORAGE_PREFIX}:balises`;

// Au-delà, c'est un compte resté déconnecté longtemps. Le serveur refuse de
// toute façon une date qui s'écarte d'aujourd'hui de plus d'un jour.
const MAX = 60;

export const TYPES = ['ouvert', 'gagne', 'perdu', 'abandon', 'indice', 'partage'];

function lire() {
  try {
    return JSON.parse(localStorage.getItem(FILE) || '[]');
  } catch {
    return [];
  }
}

function ecrire(items) {
  try {
    localStorage.setItem(FILE, JSON.stringify(items.slice(-MAX)));
  } catch {
    // Stockage plein : on perdra cette balise, pas la partie.
  }
}

/**
 * Pose une balise. Ne lève jamais, ne bloque jamais.
 *
 * @param {string} jeu     identifiant du jeu
 * @param {string} jour    date du puzzle (AAAA-MM-JJ)
 * @param {string} type    l'un de TYPES
 * @param {number} [valeur] essais, indices… selon le type
 */
export function baliser(jeu, jour, type, valeur) {
  if (!LEADERBOARD_ENABLED || !TYPES.includes(type)) return;
  // Sans compte, rien ne part. C'est la règle, pas une optimisation.
  if (!isSignedIn()) return;

  const file = lire();
  // Une balise par jeu, par jour et par type : rouvrir un jeu dix fois ne doit
  // pas peser dix fois dans les chiffres.
  const index = file.findIndex(
    (b) => b.jeu === jeu && b.jour === jour && b.type === type,
  );
  const entree = { jeu, jour, type };
  if (Number.isFinite(valeur)) entree.valeur = Math.max(0, Math.round(valeur));
  if (index >= 0) file[index] = entree;
  else file.push(entree);
  ecrire(file);
  vider().catch(() => {});
}

/** Envoie ce qui attend. Silencieux : une panne ne doit rien gâcher. */
export async function vider() {
  if (!LEADERBOARD_ENABLED || !isSignedIn()) return 0;
  const file = lire();
  if (!file.length) return 0;
  try {
    await rpc('enregistrer_evenements', { entrees: file });
    ecrire([]);
    return file.length;
  } catch (erreur) {
    // On ne jette la file que sur un 400 : une requête malformée le restera,
    // alors qu'une coupure réseau se répare toute seule.
    if (erreur?.status === 400) ecrire([]);
    return 0;
  }
}

/** Combien de balises attendent. Sert aux tests et au diagnostic. */
export function enAttente() {
  return lire().length;
}
