// Onboarding : quatre écrans montrés **une seule fois**, au tout premier
// lancement. Objectif : dire en trente secondes ce qu'est le site, comment
// fonctionne la journée, et ce qu'on ne demande pas (compte, données).
//
// Volontairement séparé du « Comment jouer » de chaque jeu : celui-ci explique
// des règles, celui-là explique le produit.

import { el, clear } from '../core/dom.js';
import { loadPref, savePref } from '../core/storage.js';
import { jeuxOuverts } from '../core/registry.js';
import { authChoices } from './authbuttons.js';

const SEEN = 'onboarded';

const SLIDES = [
  {
    art: 'assets/logo.png',
    title: 'Bienvenue au buro',
    text: () => `${jeuxOuverts().length} mini-jeux en français, pensés pour la pause café. `
      + 'Comptez cinq minutes par jeu, moins une fois la main prise.',
  },
  {
    emoji: '🕑',
    title: 'Les mêmes puzzles pour tout le monde',
    text: () => 'Chaque jour à 2h du matin, une nouvelle série arrive — identique pour '
      + 'tous les joueurs. De quoi comparer ses résultats devant la machine à café.',
  },
  {
    emoji: '🏅',
    title: 'Finis ta tournée',
    text: () => 'Le hub suit ta progression du jour et te colle un grade maison, de '
      + '« Stagiaire du lundi » à « Boss de l’open space ». Tes séries sont conservées.',
  },
  {
    emoji: '🔒',
    title: 'Jouer ne demande rien',
    text: () => 'Pas de compte, pas de publicité, pas de traceur : les dix jeux tournent '
      + 'sur ton appareil, même hors ligne, et ta progression y reste.',
    note: () => 'Une seule chose sort d’ici, et seulement si tu la demandes : le classement. '
      + 'On t’expliquera à l’écran suivant.',
    lien: { texte: 'Lire la politique de confidentialité', href: 'confidentialite.html' },
  },
  {
    emoji: '🏆',
    title: 'Jouer avec les autres',
    text: () => 'Un point par jeu réussi, un classement remis à zéro chaque mois, et des '
      + 'groupes privés pour ton bureau. C’est la seule fonction qui a besoin d’un '
      + 'compte — et du réseau.',
    note: () => 'Ce qui part alors : un identifiant, ton pseudo, et la liste des jeux que '
      + 'tu as réussis. Rien d’autre, jamais revendu. Tu peux tout effacer en un bouton.',
    auth: true,
  },
];

export function hasSeenOnboarding() {
  return loadPref(SEEN, '0') === '1';
}

/** Affiche l'onboarding s'il n'a jamais été vu. Renvoie true s'il s'est ouvert. */
export function maybeShowOnboarding() {
  if (hasSeenOnboarding()) return false;
  showOnboarding();
  return true;
}

export function showOnboarding() {
  let index = 0;
  const previousFocus = document.activeElement;

  const overlay = el('div.onboarding', { role: 'dialog', 'aria-modal': 'true',
                                          'aria-label': 'Bienvenue sur lesjeuxauburo' });
  const panel = el('div.onboarding__panel');
  const media = el('div.onboarding__media', { 'aria-hidden': 'true' });
  const title = el('h2.onboarding__title');
  const text = el('p.onboarding__text');
  const note = el('p.onboarding__note');
  const lien = el('p.onboarding__lien');
  const dots = el('div.onboarding__dots', { 'aria-hidden': 'true' });
  const next = el('button.btn.btn--primary.onboarding__next', { type: 'button' });
  const skip = el('button.onboarding__skip', { type: 'button', text: 'Passer' });

  function finish() {
    savePref(SEEN, '1');
    document.body.classList.remove('modal-open');
    overlay.remove();
    if (previousFocus?.focus) previousFocus.focus();
  }

  const authSlot = el('div.onboarding__auth');

  function render() {
    const slide = SLIDES[index];
    clear(media);
    media.append(slide.art
      ? el('img.onboarding__logo', { src: slide.art, alt: '' })
      : el('span.onboarding__emoji', { text: slide.emoji }));
    title.textContent = slide.title;
    text.textContent = slide.text();
    note.textContent = slide.note ? slide.note() : '';
    note.hidden = !slide.note;
    clear(lien);
    lien.hidden = !slide.lien;
    if (slide.lien) {
      lien.append(el('a', { href: slide.lien.href, text: slide.lien.texte, target: '_blank',
                            rel: 'noopener' }));
    }

    clear(dots);
    SLIDES.forEach((_, i) => dots.append(el('span.onboarding__dot', { 'data-on': i === index ? '1' : '0' })));

    // Le dernier écran porte les trois façons d'entrer, et rien n'oblige à en
    // choisir une : « Plus tard » referme et laisse jouer.
    clear(authSlot);
    const last = index === SLIDES.length - 1;
    if (slide.auth) {
      authSlot.append(authChoices({
        onSignedIn: finish,
        // La connexion Apple ou Google quitte la page : on retient dès
        // maintenant que l'onboarding a été vu, sinon il se rouvre au retour.
        onLeaving: () => savePref(SEEN, '1'),
      }));
      next.hidden = true;
      skip.hidden = false;
      skip.textContent = 'Plus tard';
      skip.focus();
    } else {
      next.hidden = false;
      next.textContent = 'Suivant';
      skip.hidden = last;
      skip.textContent = 'Passer';
      next.focus();
    }
  }

  next.addEventListener('click', () => {
    if (index === SLIDES.length - 1) finish();
    else { index += 1; render(); }
  });
  skip.addEventListener('click', finish);
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') finish();
    if (e.key === 'ArrowRight' && index < SLIDES.length - 1) { index += 1; render(); }
    if (e.key === 'ArrowLeft' && index > 0) { index -= 1; render(); }
  });

  panel.append(media, title, text, note, lien, dots, authSlot, next, skip);
  overlay.append(panel);
  document.body.append(overlay);
  document.body.classList.add('modal-open');
  render();
}
