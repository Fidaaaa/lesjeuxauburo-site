// Point d'entrée : thème, barre supérieure, démarrage du routeur.

import { applyTheme, watchSystemTheme, cycleTheme, themeIcon, themeLabel } from './core/theme.js';
import { startRouter, navigate, redessiner } from './core/router.js';
import { requestPersistentStorage } from './core/persistence.js';
import { maybeShowOnboarding } from './ui/onboarding.js';
import { primeSchedule } from './core/schedule.js';
import { rafraichirReglages, surveillerReglages } from './core/reglages.js';
import { captureRedirect } from './core/account.js';

function setupTopbar() {
  const home = document.getElementById('home');
  if (home) home.addEventListener('click', () => navigate('/'));

  const tt = document.getElementById('theme-toggle');
  if (tt) {
    const refresh = () => {
      tt.textContent = themeIcon();
      tt.setAttribute('aria-label', `Thème : ${themeLabel()} (cliquer pour changer)`);
      tt.title = `Thème : ${themeLabel()}`;
    };
    tt.addEventListener('click', () => { cycleTheme(); refresh(); });
    refresh();
  }
}

applyTheme();
watchSystemTheme();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  // Retour d'une connexion Apple ou Google : les jetons arrivent dans le
  // fragment d'URL. À traiter avant le routeur, qui le lirait comme une route.
  const revenantDeConnexion = captureRedirect();

  applyTheme();
  setupTopbar();
  startRouter(document.getElementById('view'));

  // Première visite : on présente le principe avant de laisser le hub. Jamais
  // au retour d'une connexion — le joueur vient précisément de le traverser.
  if (!revenantDeConnexion) maybeShowOnboarding();

  // Demande au navigateur de ne pas évincer la progression. Sans compte, c'est
  // la première ligne de défense ; l'installation sur l'écran d'accueil (voir
  // core/persistence.js) est la seconde, décisive sur iPhone.
  requestPersistentStorage();

  // Le calendrier des puzzles, quinze jours d'avance. Silencieux : sans réseau,
  // les banques embarquées prennent le relais et le jeu ne s'en aperçoit pas.
  primeSchedule().catch(() => {});

  // Quels jeux sont ouverts aujourd'hui. Le hub s'est déjà affiché avec le
  // dernier état connu — on ne le redessine que si la réponse le contredit,
  // pour éviter un clignotement à chaque ouverture.
  rafraichirReglages().then((change) => { if (change) redessiner(); });
  // Puis on continue de surveiller : une bascule doit se voir sans recharger,
  // sans quoi on croit que le bouton du tableau de bord n'a rien fait.
  surveillerReglages(redessiner);

  // Service worker : jeu disponible hors ligne. Absent en http:// non sécurisé,
  // d'où le garde-fou — le site reste parfaitement jouable sans lui.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sans effet */ });
    });
  }
}
