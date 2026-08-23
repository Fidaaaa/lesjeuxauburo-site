// Les trois façons d'entrer, en un seul bloc réutilisable : elles apparaissent
// à l'onboarding **et** sur la page classement, et doivent se comporter pareil
// aux deux endroits.
//
// Aucune n'est obligatoire pour jouer. Le texte le rappelle à chaque fois : un
// joueur qui refuse de s'identifier ne doit jamais avoir l'impression de
// forcer un passage.

import { el, clear } from '../core/dom.js';
import { signIn, signInAnonymously, isAnonymous } from '../core/account.js';
import { toast } from './effects.js';

const ANONYMOUS_NOTE = 'On te tire alors un pseudo au sort (« employe_b42cj ») et tu figures '
  + 'au classement comme les autres. Ce compte vit dans ce navigateur : effacer les données '
  + 'du site ou changer d’appareil le perd. Apple ou Google, eux, te suivent partout.';

// Passer d'un compte invité à un compte identifié crée un **nouveau** compte :
// les points ne suivent pas. Autant le dire avant le clic plutôt qu'après.
const SWITCH_WARNING = 'Attention : tu joues actuellement sans identification. Te connecter '
  + 'crée un compte distinct — les points déjà gagnés ne seront pas transférés.';

/**
 * @param {object} options
 * @param {() => void} options.onSignedIn  appelé après une connexion réussie
 * @param {boolean} [options.upgrading]    vrai si le joueur est déjà invité
 */
export function authChoices({ onSignedIn, upgrading = isAnonymous() }) {
  const box = el('div.auth');

  if (upgrading) {
    box.append(el('p.auth__warn', { text: SWITCH_WARNING }));
  }

  box.append(
    el('button.btn.btn--primary', {
      type: 'button', text: 'Se connecter avec Apple',
      onClick: () => signIn('apple'),
    }),
    el('button.btn', {
      type: 'button', text: 'Continuer avec Google',
      onClick: () => signIn('google'),
    }),
  );

  // Un joueur déjà invité n'a rien à faire du bouton « sans identification ».
  if (!upgrading) {
    const guest = el('button.btn', {
      type: 'button', text: 'Jouer sans m’identifier',
      onClick: async () => {
        guest.disabled = true;
        const label = guest.textContent;
        guest.textContent = 'Création…';
        try {
          const pseudo = await signInAnonymously();
          toast(`Bienvenue, ${pseudo}`);
          onSignedIn?.();
        } catch (error) {
          toast(error.message);
          guest.disabled = false;
          guest.textContent = label;
        }
      },
    });
    box.append(el('div.board__or', { text: 'ou' }), guest,
               el('p.board__note', { text: ANONYMOUS_NOTE }));
  }

  return box;
}

/** Bloc « je m'identifie finalement », montré à un joueur invité. */
export function upgradePanel({ onSignedIn }) {
  const box = el('details.auth__upgrade');
  box.append(el('summary', { text: 'M’identifier avec Apple ou Google' }));
  box.append(authChoices({ onSignedIn, upgrading: true }));
  return box;
}

export { clear };
