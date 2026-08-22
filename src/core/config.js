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
