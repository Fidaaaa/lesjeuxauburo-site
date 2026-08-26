// Réglages à distance : quels jeux sont ouverts aujourd'hui.
//
// Un jeu qui déçoit ne peut pas attendre trois jours de validation Apple. Le
// site et l'app lisent la même table Supabase : une bascule dans le tableau de
// bord agit sur les deux à la fois.
//
// ## L'ordre de préséance, et pourquoi il est dans ce sens
//
//   1. **la réponse du serveur**, quand elle arrive ;
//   2. **le dernier état connu**, gardé dans le stockage local ;
//   3. **le défaut embarqué** ci-dessous.
//
// Jamais l'inverse. Le jeu doit rester jouable dans le métro, et un serveur
// injoignable ne doit surtout pas vider la liste des jeux — ce serait
// remplacer une déception par une app cassée.
//
// Le défaut embarqué porte donc **l'état voulu au moment de la publication**,
// pas « tout ouvert » : une première installation hors ligne montre ce qu'on
// a décidé de montrer, sans attendre le réseau.

import { SUPABASE_URL, SUPABASE_KEY, STORAGE_PREFIX } from './config.js';

const CLE = `${STORAGE_PREFIX}:reglages`;

// L'état voulu à la publication. Ce qui n'est pas listé est ouvert.
//
// Chaud-Froid et La Boîte à Lettres attendent : le premier demande encore du
// vocabulaire pour que les mots courants cessent de tomber « hors thème », le
// second est le plus exigeant des dix et fait un mauvais premier jour.
export const DEFAUTS = {
  chaudfroid: false,
  boite: false,
};

/** L'état connu, sans réseau : le cache s'il existe, le défaut sinon. */
function connus() {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) {
      const { jeux } = JSON.parse(brut);
      if (jeux && typeof jeux === 'object') return jeux;
    }
  } catch {
    // Stockage illisible ou plein : le défaut fera l'affaire.
  }
  return DEFAUTS;
}

let etat = connus();

/**
 * Ce jeu est-il ouvert ? Réponse **synchrone** : le hub s'affiche sans
 * attendre le réseau, quitte à se redessiner si la réponse le contredit.
 */
export function jeuActif(id) {
  return etat[id] !== false;
}

/** La note à montrer à la place d'un jeu fermé, s'il y en a une. */
export function noteDuJeu(id) {
  return (etat[`${id}:note`] || '').trim() || null;
}

/**
 * Va lire les réglages, met le cache à jour, et dit si quelque chose a changé.
 *
 * Ne rejette jamais : appelée au démarrage, elle ne doit pas pouvoir empêcher
 * l'app de s'ouvrir.
 */
export async function rafraichirReglages() {
  try {
    const reponse = await fetch(
      `${SUPABASE_URL}/rest/v1/reglages_jeux?select=jeu,actif,note`,
      { headers: { apikey: SUPABASE_KEY, Accept: 'application/json' } },
    );
    if (!reponse.ok) return false;
    const lignes = await reponse.json();
    if (!Array.isArray(lignes) || !lignes.length) return false;

    const frais = {};
    for (const l of lignes) {
      if (typeof l.jeu !== 'string') continue;
      frais[l.jeu] = l.actif !== false;
      if (l.note) frais[`${l.jeu}:note`] = l.note;
    }
    const change = JSON.stringify(frais) !== JSON.stringify(etat);
    etat = frais;
    try {
      localStorage.setItem(CLE, JSON.stringify({ jeux: frais, le: Date.now() }));
    } catch {
      // Pas de cache : on garde au moins l'état en mémoire pour cette session.
    }
    return change;
  } catch {
    // Hors ligne : on garde ce qu'on savait.
    return false;
  }
}

/** Remet l'état en mémoire au niveau du cache. Sert aux tests. */
export function relireCache() {
  etat = connus();
  return etat;
}

// Toutes les combien de secondes on revérifie, onglet visible. Une minute :
// assez pour qu'une bascule se voie « tout de suite » quand on la teste,
// assez peu pour qu'un onglet oublié ne pèse rien — c'est une ligne de JSON.
const PERIODE = 60_000;

let minuterie = null;
let enCours = false;

async function revalider(quandChange) {
  if (enCours) return;
  enCours = true;
  try {
    if (await rafraichirReglages()) quandChange();
  } finally {
    enCours = false;
  }
}

/**
 * Garde les réglages à jour tant que la page est visible.
 *
 * Sans cela, une bascule dans le tableau de bord ne se voyait qu'au prochain
 * chargement : on pouvait fermer un jeu et le voir encore, ce qui donne
 * l'impression que le bouton ne marche pas.
 *
 * Deux déclencheurs, et le second compte plus que le premier :
 *
 *   * un rappel périodique, pour l'onglet laissé ouvert ;
 *   * le **retour sur l'onglet**, parce que c'est exactement ce qu'on fait
 *     après avoir basculé un jeu dans le tableau de bord.
 *
 * Rien ne tourne quand l'onglet est caché : un onglet en arrière-plan n'a
 * personne à qui montrer le changement.
 */
export function surveillerReglages(quandChange) {
  const demarrer = () => {
    if (minuterie) return;
    minuterie = setInterval(() => revalider(quandChange), PERIODE);
  };
  const arreter = () => {
    clearInterval(minuterie);
    minuterie = null;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      arreter();
    } else {
      revalider(quandChange);
      demarrer();
    }
  });

  if (!document.hidden) demarrer();
  return () => arreter();
}
