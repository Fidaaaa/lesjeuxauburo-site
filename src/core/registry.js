// Registre des jeux. Une entrée par jeu, avec métadonnées pour le hub et un
// chargeur dynamique (import à la volée) pour le module de jeu.
//
// `available: false` => carte « Bientôt » sur le hub (site fonctionnel à chaque
// phase). Passe à true au fur et à mesure des phases.

export const GAMES = [
  {
    id: 'mot',
    name: 'Le Mot',
    emoji: '🔤',
    color: '#e07a5f',
    tagline: 'Devine le mot du jour en 6 essais',
    available: true,
    load: () => import('../games/mot/mot.js'),
  },
  {
    id: 'connexions',
    name: 'Connexions',
    emoji: '🧩',
    color: '#81b29a',
    tagline: 'Regroupe 16 mots en 4 familles cachées',
    available: true,
    load: () => import('../games/connexions/connexions.js'),
  },
  {
    id: 'allumettes',
    name: 'Les Allumettes',
    emoji: '🔥',
    color: '#c98a3f',
    tagline: 'Déplace une allumette pour rétablir l’équation',
    available: true,
    load: () => import('../games/allumettes/allumettes.js'),
  },
  {
    id: 'intrus',
    name: "L'Intrus",
    emoji: '🕵️',
    color: '#c4a35a',
    tagline: 'Trouve le mot qui ne colle pas avec les autres',
    available: true,
    load: () => import('../games/intrus/intrus.js'),
  },
  {
    id: 'chaudfroid',
    name: 'Chaud-Froid',
    emoji: '🌡️',
    color: '#d1495b',
    tagline: 'Trouve le mot secret à la proximité sémantique',
    available: true,
    load: () => import('../games/chaudfroid/chaudfroid.js'),
  },
  {
    id: 'pays',
    name: 'Le Pays',
    emoji: '🗺️',
    color: '#3d9a8b',
    tagline: 'Devine le pays à partir de sa silhouette',
    available: true,
    load: () => import('../games/pays/pays.js'),
  },
  {
    id: 'evasion',
    name: 'L\'Évasion',
    emoji: '🚪',
    color: '#c0426f',
    tagline: 'Fais glisser les blocs pour libérer la tasse (difficile !)',
    available: true,
    load: () => import('../games/evasion/evasion.js'),
  },
];

export function getGame(id) {
  return GAMES.find((g) => g.id === id) || null;
}

export const AVAILABLE_GAMES = GAMES.filter((g) => g.available);
