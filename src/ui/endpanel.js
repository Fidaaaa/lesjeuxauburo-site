// Panneau de fin de partie commun à tous les jeux : résultat, message,
// retour au hub et compte à rebours vers les prochains jeux.

import { el } from '../core/dom.js';
import { bindCountdown } from './countdown.js';
import { navigate } from '../core/router.js';

// `shareText` est encore produit par les jeux et conservé dans les résultats
// (utile pour un futur partage), mais aucun bouton ne l'expose.
export function buildEndPanel({ won, title, message, revealNode, nextGameHint }) {
  const badge = el('div.endpanel__badge', {
    'data-state': won ? 'win' : 'lose',
  }, [won ? '🏆' : '😵', ' ', title]);

  const msg = el('p.endpanel__msg', { text: message });

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
    nextGameHint ? el('p.endpanel__hint', { text: nextGameHint }) : null,
    actions,
    countdown,
  ]);
}
