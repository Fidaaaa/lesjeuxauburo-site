// « Comment jouer » : une modale au premier lancement de chaque jeu, plus un
// bouton (?) toujours accessible dans l'en-tête du jeu.

import { el } from '../core/dom.js';
import { showModal } from './modal.js';
import { hasSeenHowTo, markHowToSeen } from '../core/storage.js';

export function showHowTo(howTo) {
  showModal({
    title: howTo.title,
    body: howTo.html,
    className: 'modal--howto',
    actions: [{ label: 'C’est parti !', primary: true }],
  });
}

// Affiche automatiquement les règles au tout premier lancement du jeu.
export function maybeShowHowTo(gameId, howTo) {
  if (hasSeenHowTo(gameId)) return;
  markHowToSeen(gameId);
  showHowTo(howTo);
}

// Bouton (?) pour rouvrir les règles à la demande.
export function howToButton(gameId, howTo) {
  return el('button.iconbtn.howto-btn', {
    type: 'button',
    'aria-label': 'Comment jouer',
    title: 'Comment jouer',
    text: '?',
    onClick: () => showHowTo(howTo),
  });
}
