// Constantes globales de lesjeuxauburo.
// Tout est déterministe et sans serveur : la date (fuseau Europe/Paris) pilote tout.

export const APP_NAME = 'lesjeuxauburo';

// Date de lancement constante : sert à numéroter les puzzles (« Le Mot n°37 »).
// dayNumber = nombre de jours écoulés depuis cette date, en fuseau Paris.
export const LAUNCH_DATE = '2025-01-01';

// Heure (Paris) à laquelle tous les puzzles basculent. 2h du matin.
export const ROLLOVER_HOUR = 2;

// Préfixe des clés localStorage. Bump la version pour invalider proprement.
export const STORAGE_PREFIX = 'ljab:v1';

// Fuseau de référence unique pour tout le site.
export const TZ = 'Europe/Paris';

// URL publique du site, utilisée dans les textes de partage.
// Laisse vide pour utiliser l'adresse courante ; renseigne-la après déploiement
// (ex : 'https://lesjeuxauburo.netlify.app') — indispensable pour que les
// partages depuis l'app iOS pointent vers une vraie adresse.
export const SITE_URL = 'https://lesjeuxauburo.fr/';

// --- Classements (Supabase) ---
// Ces deux valeurs sont **publiques par conception** : elles vivent dans le
// code du site, et la sécurité repose sur les politiques d'accès du schéma
// (voir supabase/schema.sql), pas sur leur secret. La clé « service_role »,
// elle, ne doit jamais apparaître ici.
export const SUPABASE_URL = 'https://nhejzeslzefinbpexfcq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable__0_eC5ailkbvtqOoy9c66Q_wscAUvJg';

// Le classement est facultatif : sans connexion, le jeu fonctionne comme avant.
export const LEADERBOARD_ENABLED = true;

// --- Publicité ---
// Les emplacements **existent et occupent leur place** dès maintenant, mais
// restent entièrement transparents tant qu'aucune régie ne les remplit : ni
// cadre, ni fond, ni mot « Publicité ».
//
// C'est un choix de mise en page, pas d'affichage. La hauteur étant déjà prise,
// brancher une régie plus tard ne déplacera aucun écran d'un pixel — alors
// qu'un encart qui apparaît après coup pousse le contenu vers le bas, et sur un
// jeu cela veut dire un doigt qui tape à côté au moment où la grille saute.
//
// Rien n'est chargé, personne n'est contacté : la promesse « aucun traceur,
// aucune publicité » reste donc vraie tant que rien n'est branché.
//
// ⚠️ À `false`, les emplacements disparaissent complètement et les écrans se
//    resserrent. À ne basculer que si l'on renonce définitivement à la
//    publicité — sinon la mise en page bougera le jour du branchement.
export const PUB_ENABLED = true;
