// Registre des jeux. Une entrée par jeu, avec métadonnées pour le hub et un
// chargeur dynamique (import à la volée) pour le module de jeu.
//
// Deux notions distinctes, qu'il ne faut pas confondre :
//
//   * `available` — le jeu **existe** dans cette version. À `false`, il n'est
//     pas encore écrit ;
//   * `jeuActif()` (voir reglages.js) — le jeu est **ouvert aujourd'hui**.
//     Piloté depuis le tableau de bord, sans republier quoi que ce soit.
//
// Le nombre de jeux n'est écrit nulle part : il se compte. Il a valu 7, puis
// 10, il en vaut 8 à la publication et en vaudra peut-être 12 — chaque endroit
// qui l'aurait recopié serait devenu faux sans prévenir.

import { jeuActif } from './reglages.js';

export const GAMES = [
  {
    id: 'mot',
    name: 'Le Mot',
    emoji: '🔤',
    art: 'assets/art/art_mot.png',
    color: '#e07a5f',
    tagline: 'Devine le mot du jour en 6 essais',
    available: true,
    load: () => import('../games/mot/mot.js'),
  },
  {
    id: 'connexions',
    name: 'Connexions',
    emoji: '🧩',
    art: 'assets/art/art_connexions.png',
    color: '#81b29a',
    tagline: 'Regroupe 16 mots en 4 familles cachées',
    available: true,
    load: () => import('../games/connexions/connexions.js'),
  },
  {
    id: 'allumettes',
    name: 'Les Allumettes',
    emoji: '🔥',
    art: 'assets/art/art_allumettes.png',
    color: '#c98a3f',
    tagline: 'Déplace une allumette pour rétablir l’équation',
    available: true,
    load: () => import('../games/allumettes/allumettes.js'),
  },
  {
    id: 'intrus',
    name: "L'Intrus",
    emoji: '🕵️',
    art: 'assets/art/art_intrus.png',
    color: '#c4a35a',
    tagline: 'Trouve le mot qui ne colle pas avec les autres',
    available: true,
    load: () => import('../games/intrus/intrus.js'),
  },
  {
    id: 'chaudfroid',
    name: 'Chaud-Froid',
    emoji: '🌡️',
    art: 'assets/art/art_chaudfroid.png',
    color: '#d1495b',
    tagline: 'Trouve le mot secret à la proximité sémantique',
    available: true,
    load: () => import('../games/chaudfroid/chaudfroid.js'),
  },
  {
    id: 'pays',
    name: 'Le Pays',
    emoji: '🗺️',
    art: 'assets/art/art_pays.png',
    color: '#3d9a8b',
    tagline: 'Devine le pays à partir de sa silhouette',
    available: true,
    load: () => import('../games/pays/pays.js'),
  },
  {
    id: 'evasion',
    name: 'L\'Évasion',
    emoji: '🚪',
    art: 'assets/art/art_evasion.png',
    color: '#c0426f',
    tagline: 'Fais glisser les blocs pour libérer la tasse (difficile !)',
    available: true,
    load: () => import('../games/evasion/evasion.js'),
  },
  {
    id: 'boite',
    name: 'La Boîte à Lettres',
    emoji: '🔠',
    art: 'assets/art/art_boite.png',
    color: '#6f7fb5',
    tagline: 'Enchaîne des mots pour épuiser les douze lettres',
    available: true,
    load: () => import('../games/boite/boite.js'),
  },
  {
    id: 'gaufre',
    name: 'La Gaufre',
    emoji: '🧇',
    art: 'assets/art/art_gaufre.png',
    color: '#d99a2b',
    tagline: 'Remets six mots croisés d’aplomb en 15 échanges',
    available: true,
    load: () => import('../games/gaufre/gaufre.js'),
  },
  {
    id: 'tango',
    name: 'Tango',
    emoji: '🌗',
    art: 'assets/art/art_tango.png',
    color: '#7a6bab',
    tagline: 'Soleils et lunes : une grille, une seule logique',
    available: true,
    load: () => import('../games/tango/tango.js'),
  },
];

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}

/** Les jeux écrits — indépendamment de leur ouverture du jour. */
export const GAMES_ECRITS = GAMES.filter((g) => g.available);

/**
 * Les jeux à montrer aujourd'hui.
 *
 * Une **fonction** et non une constante : les réglages arrivent du réseau
 * après le premier rendu, et une liste figée à l'import ne se mettrait jamais
 * à jour.
 */
export function jeuxOuverts() {
  return GAMES_ECRITS.filter((g) => jeuActif(g.id));
}
