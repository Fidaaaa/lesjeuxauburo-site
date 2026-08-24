// Panneau de fin de partie commun à tous les jeux : résultat, message,
// retour au hub et compte à rebours vers les prochains jeux.

import { el } from '../core/dom.js';
import { bindCountdown } from './countdown.js';
import { navigate } from '../core/router.js';
import { loadStats } from '../core/storage.js';
import { xpFor, multiplierFor, nextPalier, effectiveStreak, XP_BASE } from '../core/xp.js';
import { getPuzzleDate, addDays } from '../core/date.js';
import { emplacement } from './pub.js';

/**
 * Ligne d'XP affichée après une victoire.
 *
 * On ne peut pas se contenter de lire `currentStreak` : selon le chemin, les
 * statistiques sont déjà à jour ou non. Une victoire en direct enregistre
 * avant de dessiner ; rouvrir une partie déjà finie dessine avant
 * d'enregistrer. La date tranche sans ambiguïté — si le dernier jour gagné est
 * aujourd'hui, la victoire est déjà comptée.
 */
function ligneXP(gameId) {
  const stats = loadStats(gameId);
  const aujourdhui = getPuzzleDate();
  const dejaCompte = stats.lastWonDate === aujourdhui;

  const serieAvant = dejaCompte
    ? Math.max(0, (stats.currentStreak || 1) - 1)
    : effectiveStreak(stats, addDays(aujourdhui, -1));
  const serie = serieAvant + 1;

  const facteur = multiplierFor(serieAvant);
  const gagne = xpFor(serieAvant);

  const bloc = el('div.endpanel__xp', {}, [
    el('span.endpanel__xp-gain', { text: `+${gagne} XP` }),
    facteur > 1 ? el('span.endpanel__xp-mult', { text: `×${facteur}` }) : null,
    el('span.endpanel__xp-serie', {
      text: `🔥 ${serie} jour${serie > 1 ? 's' : ''} d’affilée`,
    }),
  ]);

  // Deux nouvelles méritent d'être annoncées, et une seule à la fois : venir
  // de franchir un palier, ou en approcher un.
  const facteurDemain = multiplierFor(serie);
  const prochain = nextPalier(serie);
  const restant = prochain ? prochain - serie : 0;

  let promesse = null;
  if (facteurDemain > facteur) {
    promesse = `Palier franchi : ce jeu rapportera ${XP_BASE * facteurDemain} XP `
             + `par partie tant que la série tient.`;
  } else if (prochain && restant <= 3) {
    promesse = `Encore ${restant} jour${restant > 1 ? 's' : ''} et ce jeu passera `
             + `à ${XP_BASE * multiplierFor(prochain)} XP par partie.`;
  }

  return el('div', {}, [
    bloc,
    promesse ? el('p.endpanel__xp-next', { text: promesse }) : null,
  ]);
}

// `shareText` est encore produit par les jeux et conservé dans les résultats
// (utile pour un futur partage), mais aucun bouton ne l'expose.
export function buildEndPanel({ won, title, message, revealNode, nextGameHint, gameId }) {
  const badge = el('div.endpanel__badge', {
    'data-state': won ? 'win' : 'lose',
  }, [won ? '🏆' : '😵', ' ', title]);

  const msg = el('p.endpanel__msg', { text: message });
  const xp = won && gameId ? ligneXP(gameId) : null;

  const countdownValue = el('strong.countdown__value', { text: '—' });
  bindCountdown(countdownValue);
  const countdown = el('div.endpanel__countdown', {}, [
    el('span', { text: 'Prochains jeux dans ' }), countdownValue,
  ]);

  const actions = el('div.endpanel__actions', {}, [
    el('button.btn.btn--primary', {
      type: 'button', text: '🏠 Retour au hub',
      onClick: () => navigate('/'),
    }),
  ]);

  return el('div.endpanel', { role: 'region', 'aria-label': 'Résultat de la partie' }, [
    badge,
    revealNode || null,
    msg,
    xp,
    nextGameHint ? el('p.endpanel__hint', { text: nextGameHint }) : null,
    actions,
    // Après les boutons : la partie est finie, le joueur n'attend plus rien du
    // jeu. C'est la seule vraie respiration d'un écran de jeu.
    emplacement('rectangle', 'fin-de-partie'),
    countdown,
  ]);
}
