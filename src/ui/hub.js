// Page d'accueil = hub. Une carte par jeu avec l'état du jour, le score et la
// streak. Objectif : donner envie de « finir sa tournée » quotidienne.

import { GAMES, AVAILABLE_GAMES } from '../core/registry.js';
import { getPuzzleDate, humanDate, isDateOverridden } from '../core/date.js';
import { loadStats } from '../core/storage.js';
import { tourneeSummary, gameDayState } from '../core/tournee.js';
import { el, clear } from '../core/dom.js';
import { bindHumanCountdown } from './countdown.js';
import { navigate } from '../core/router.js';

const STATE_BADGE = {
  win: { icon: '✅', label: 'Réussi' },
  lose: { icon: '❌', label: 'Raté' },
  progress: { icon: '⏳', label: 'En cours' },
  none: { icon: '⭕', label: 'À jouer' },
};

// Une partie finie porte un tampon, comme un dossier traité. C'est plus
// parlant qu'une pastille verte, et ça donne envie d'en tamponner d'autres.
const STAMP = {
  win: { text: 'Fait', tone: 'win' },
  lose: { text: 'Vu', tone: 'lose' },
};

/** Où en est la tournée, dit comme un collègue le dirait. */
function tourneeMeta(summary) {
  if (summary.done === 0) return 'Rien de commencé — le premier café est toujours le meilleur.';
  if (summary.done === summary.total) {
    return `Tournée complète, ${summary.avg} pts de moyenne. Tu peux ranger la tasse.`;
  }
  const reste = summary.total - summary.done;
  return `${summary.done} sur ${summary.total} · ${summary.avg} pts de moyenne · ${reste} à faire`;
}

export function renderHub(view) {
  const dateStr = getPuzzleDate();
  clear(view);

  const hub = el('div.hub');

  // --- Héro ---
  const countdownValue = el('span.countdown__value', { text: '—' });
  bindHumanCountdown(countdownValue);
  const hero = el('header.hub__hero', {}, [
    el('h1.hub__brand', {}, [
      // Le SVG plutôt que le PNG : sa vapeur monte pour de vrai.
      el('img.hub__brand-logo', { src: 'assets/logo.svg', alt: '', width: 56, height: 56 }),
      ' lesjeuxauburo',
    ]),
    el('p.hub__tagline', { text: `${AVAILABLE_GAMES.length} mini-jeux pour la pause café. De nouveaux chaque matin.` }),
    el('p.hub__date', { text: capitalize(humanDate(dateStr)) + (isDateOverridden() ? ' (date simulée)' : '') }),
    el('p.hub__countdown', {}, [el('span', { text: 'Prochaine fournée ' }), countdownValue]),
  ]);

  // --- Carte tournée ---
  const summary = tourneeSummary(dateStr);
  const tourneeCard = el('section.tournee-card', { 'aria-label': 'Ma tournée du jour' }, [
    el('div.tournee-card__grade', {}, [
      el('span.tournee-card__emoji', { 'aria-hidden': 'true', text: summary.grade.emoji }),
      el('div', {}, [
        el('div.tournee-card__label', { text: summary.grade.label }),
        el('div.tournee-card__meta', { text: tourneeMeta(summary) }),
      ]),
    ]),
    el('div.tournee-card__bar', {
      'aria-hidden': 'true', 'data-empty': summary.done === 0 ? '1' : '0',
    }, [
      el('div.tournee-card__fill', { style: { width: `${(summary.done / summary.total) * 100}%` } }),
    ]),
  ]);

  // --- Grille des jeux ---
  const grid = el('div.hub__grid');
  GAMES.forEach((game, index) => grid.append(gameCard(game, dateStr, index)));

  hub.append(hero, tourneeCard, el('h2.hub__section', { text: 'Ta tournée' }), grid,
    el('footer.hub__footer', {}, [
      el('a.hub__stats-link', { href: '#/stats', text: '📊 Mes statistiques' }),
      el('a.hub__stats-link', { href: '#/classement', text: '🏆 Classement du mois' }),
      el('div.hub__links', {}, [
        el('a', { href: 'support.html', text: 'Aide' }),
        ' · ',
        el('a', { href: 'confidentialite.html', text: 'Confidentialité' }),
      ]),
    ]));
  view.append(hub);
}

// Vignette d'un jeu : l'illustration générée, avec repli sur l'emoji si l'image
// n'a pas (encore) été chargée. Mêmes visuels que l'application iOS.
function gameArtwork(game, index = 0) {
  const box = el('div.gamecard__art', {
    'aria-hidden': 'true',
    // Un demi-degré d'inclinaison, alterné : les vignettes cessent d'être
    // alignées à la règle, comme des photos posées sur un tableau de liège.
    style: { '--game-color': game.color, '--tilt': `${index % 2 ? 1.6 : -1.6}deg` },
  });
  if (game.art) {
    box.append(el('img', {
      src: game.art, alt: '', loading: 'lazy', decoding: 'async',
      onError: (e) => {
        e.target.remove();
        box.append(el('span.gamecard__emoji', { text: game.emoji }));
      },
    }));
  } else {
    box.append(el('span.gamecard__emoji', { text: game.emoji }));
  }
  return box;
}

function gameCard(game, dateStr, index = 0) {
  if (!game.available) {
    return el('div.gamecard.gamecard--soon', {
      'aria-disabled': 'true', style: { '--i': index },
    }, [
      gameArtwork(game, index),
      el('div.gamecard__body', {}, [
        el('div.gamecard__name', { text: game.name }),
        el('div.gamecard__tag', { text: game.tagline }),
      ]),
      el('div.gamecard__soon', { text: 'Bientôt' }),
    ]);
  }

  const st = gameDayState(game.id, dateStr);
  const stats = loadStats(game.id);
  const badge = STATE_BADGE[st.status] || STATE_BADGE.none;

  const stamp = STAMP[st.status];

  const card = el('button.gamecard', {
    type: 'button',
    'data-state': st.status,
    style: { '--game-color': game.color, '--i': index },
    'aria-label': `${game.name} — ${badge.label}`,
    onClick: () => navigate(`/${game.id}`),
  }, [
    gameArtwork(game, index),
    el('div.gamecard__body', {}, [
      el('div.gamecard__name', {}, [game.name]),
      el('div.gamecard__tag', { text: game.tagline }),
      el('div.gamecard__stats', {}, [
        stats.currentStreak > 0 ? el('span.gamecard__streak', { text: `🔥 ${stats.currentStreak}` }) : null,
        st.label ? el('span.gamecard__score', { text: st.label }) : null,
      ]),
    ]),
    // Terminé : un tampon incliné. En cours ou à jouer : la pastille d'état,
    // qui doit rester discrète pour ne pas concurrencer les tampons.
    stamp
      ? el('div.gamecard__state', {}, [
          el('span.gamecard__stamp', { 'data-tone': stamp.tone, text: stamp.text }),
          el('span.sr-only', { text: badge.label }),
        ])
      : el('div.gamecard__state', { 'data-state': st.status }, [
          el('span.gamecard__badge', { 'aria-hidden': 'true', text: badge.icon }),
          el('span.gamecard__badge-label', { text: badge.label }),
        ]),
  ]);
  return card;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
