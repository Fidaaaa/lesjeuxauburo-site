// Filtre des pseudonymes et des noms de groupe
// Fichier généré par tools/ — ne pas éditer à la main.
// Les réponses sont encodées (voir src/core/crypto.js). Pour ajouter des
// puzzles, édite le générateur Python puis relance-le. Voir README.md.


// Le pseudo s'affiche sur un classement public : c'est du contenu écrit par un
// joueur et lu par les autres. La règle 1.2 de l'App Store demande alors de
// pouvoir filtrer ce qui n'a pas à s'afficher, et de pouvoir le signaler.
//
// Ce filtre répond tout de suite, pour que le joueur corrige avant d'envoyer.
// Il ne protège rien à lui seul — un client se contourne. La barrière qui
// compte est la même fonction côté PostgreSQL, seule à ne pas être
// contournable : le pseudo part en REST direct vers /rest/v1/profils.
//
// Trois listes, qui ne diffèrent que par leur mode de correspondance :
// RACINES partout, MOTS sur un mot entier, EXACTS sur le pseudo entier.

const LEET = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  '$': 's',
  '€': 'e',
};

export const RACINES = [
  'encule',
  'enculer',
  'enfoire',
  'salope',
  'salopard',
  'connard',
  'connasse',
  'batard',
  'pouffiasse',
  'poufiasse',
  'putain',
  'couille',
  'burnes',
  'zizi',
  'bite',
  'vagin',
  'clito',
  'sodomi',
  'branler',
  'branleur',
  'branlette',
  'gouine',
  'pedale',
  'tapette',
  'tarlouze',
  'niquer',
  'nique',
  'niqu',
  'tgueule',
  'tafiole',
  'chibre',
  'foutre',
  'queutard',
  'suceuse',
  'suceur',
  'salaud',
  'merdeux',
  'chiasse',
  'trouduc',
  'trouduq',
  'ducon',
  'gogole',
  'mongol',
  'attarde',
  'debile',
  'cretin',
  'abruti',
  'conard',
  'couillon',
  'emmerd',
  'boloss',
  'bouffon',
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'whore',
  'slut',
  'dick',
  'pussy',
  'asshole',
  'bastard',
  'nigger',
  'nigga',
  'faggot',
  'wanker',
  'motherf',
  'blowjob',
  'handjob',
  'cumshot',
  'titties',
  'boobs',
  'porn',
  'hentai',
  'rape',
  'rapist',
  'pedo',
  'pedophile',
  'incest',
  'hitler',
  'swastika',
  'heilhitler',
  'sieg heil',
  'genocide',
  'holocaust',
  'shoah',
  'negro',
  'bougnoule',
  'youpin',
  'feuj',
  'chinetoque',
  'sale juif',
  'sale arabe',
  'sale noir',
  'sale blanc',
  'islamophob',
  'antisemite',
  'suprem',
  'isis',
  'daesh',
  'terroriste',
  'kuklux',
  'lolita',
  'childporn',
  'cocaine',
  'heroine',
  'methamph',
  'crackhead',
  'lesjeuxauburo',
  'administrateur',
  'moderateur',
  'moderation',
  'support officiel',
  'equipe officielle',
];

export const MOTS = [
  'pute',
  'putes',
  'cock',
  'coke',
  'cul',
  'culs',
  'con',
  'cons',
  'pd',
  'pede',
  'pedes',
  'bite',
  'bites',
  'chatte',
  'sexe',
  'sex',
  'anus',
  'penis',
  'nazi',
  'nazis',
  'viol',
  'violeur',
  'negre',
  'negres',
  'suicide',
  'drogue',
  'weed',
  'crack',
  'fdp',
  'ntm',
  'cp',
  'tg',
  'ftg',
];

export const EXACTS = [
  'porno',
  'chier',
  'merde',
  'caca',
  'pipi',
  'prout',
  'cochon',
  'tuer',
  'admin',
  'root',
  'system',
  'null',
  'undefined',
  'moderator',
  'mod',
  'staff',
  'officiel',
  'official',
  'test',
  'anonyme',
];


/**
 * Ramène un pseudo à sa forme comparable.
 *
 * Toute répétition est ramenée à une seule lettre — « saloooope » devient
 * « salope » — et la même règle s'applique aux mots des listes, sinon
 * « connard » y resterait à deux n et ne correspondrait plus à rien.
 */
export function normaliser(texte) {
  let plat = String(texte).toLowerCase();
  plat = [...plat].map((c) => LEET[c] ?? c).join('');
  plat = plat.normalize('NFD').replace(/\p{Mn}/gu, '');
  plat = [...plat].map((c) => (/[a-z0-9]/.test(c) ? c : ' ')).join('');
  plat = plat.replace(/(.)\1+/g, '$1');
  return plat.split(/\s+/).filter(Boolean).join(' ');
}

/** Faux si le pseudo ne doit pas s'afficher sur un classement public. */
export function acceptable(pseudo) {
  const plat = normaliser(pseudo);
  const compact = plat.replace(/ /g, '');
  // Un pseudo sans deux lettres n'est pas un pseudo : « !!! », « 123 ».
  if ([...compact].filter((c) => /[a-z]/.test(c)).length < 2) return false;
  for (const racine of RACINES) {
    if (compact.includes(normaliser(racine).replace(/ /g, ''))) return false;
  }
  // Les mots entiers se lisent sur les morceaux, jamais sur la chaîne
  // entière : c'est ce qui distingue « sale pute » d'« amputer ».
  const morceaux = new Set(plat.split(' '));
  if (MOTS.some((m) => morceaux.has(normaliser(m)))) return false;
  if (EXACTS.some((e) => normaliser(e).replace(/ /g, '') === compact)) return false;
  return true;
}

/** Le message montré au joueur. Il ne cite pas ce qui a déclenché le refus. */
export const REFUS = 'Ce pseudo ne peut pas être affiché sur le classement. '
  + 'Choisis-en un autre.';
