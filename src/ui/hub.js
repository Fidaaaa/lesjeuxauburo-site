// Page d'accueil = hub. Une carte par jeu avec l'état du jour, le score et la
// streak. Objectif : donner envie de « finir sa tournée » quotidienne.

import { GAMES } from '../core/registry.js';
import { getPuzzleDate, humanDate, isDateOverridden } from '../core/date.js';
import { loadStats } from '../core/storage.js';
import { tourneeSummary, gameDayState } from '../core/tournee.js';
import { el, clear } from '../core/dom.js';
import { bindCountdown } from './countdown.js';
import { navigate } from '../core/router.js';

const STATE_BADGE = {
  win: { icon: '✅', label: 'Réussi' },
  lose: { icon: '❌', label: 'Raté' },
  progress: { icon: '⏳', label: 'En cours' },
  none: { icon: '⭕', label: 'À jouer' },
};

export function renderHub(view) {
  const dateStr = getPuzzleDate();
  clear(view);

  const hub = el('div.hub');

  // --- Héro ---
  const countdownValue = el('strong.countdown__value', { text: '—' });
  bindCountdown(countdownValue);
  const hero = el('header.hub__hero', {}, [
    el('h1.hub__brand', {}, [
      el('span.hub__brand-emoji', { 'aria-hidden': 'true', text: '☕' }),
      ' lesjeuxauburo',
    ]),
    el('p.hub__tagline', { text: 'La pause café en 7 mini-jeux. Nouveaux puzzles chaque jour à 2h.' }),
    el('p.hub__date', { text: capitalize(humanDate(dateStr)) + (isDateOverridden() ? ' (date simulée)' : '') }),
    el('div.hub__countdown', {}, [el('span', { text: 'Prochains jeux dans ' }), countdownValue]),
  ]);

  // --- Carte tournée ---
  const summary = tourneeSummary(dateStr);
  const tourneeCard = el('section.tournee-card', { 'aria-label': 'Ma tournée du jour' }, [
    el('div.tournee-card__grade', {}, [
      el('span.tournee-card__emoji', { 'aria-hidden': 'true', text: summary.grade.emoji }),
      el('div', {}, [
        el('div.tournee-card__label', { text: summary.grade.label }),
        el('div.tournee-card__meta', {
          text: `${summary.done}/${summary.total} jeux · ${summary.done ? summary.avg + ' pts moy.' : 'tournée à démarrer'}`,
        }),
      ]),
    ]),
    el('div.tournee-card__bar', { 'aria-hidden': 'true' }, [
      el('div.tournee-card__fill', { style: { width: `${(summary.done / summary.total) * 100}%` } }),
    ]),
  ]);

  // --- Grille des jeux ---
  const grid = el('div.hub__grid');
  for (const game of GAMES) {
    grid.append(gameCard(game, dateStr));
  }

  hub.append(hero, tourneeCard, el('h2.hub__section', { text: 'Ta tournée' }), grid,
    el('footer.hub__footer', {}, [
      el('a.hub__stats-link', { href: '#/stats', text: '📊 Mes statistiques' }),
      el('div.hub__links', {}, [
        el('a', { href: 'support.html', text: 'Aide' }),
        ' · ',
        el('a', { href: 'confidentialite.html', text: 'Confidentialité' }),
      ]),
    ]));
  view.append(hub);
}

function gameCard(game, dateStr) {
  if (!game.available) {
    return el('div.gamecard.gamecard--soon', { 'aria-disabled': 'true' }, [
      el('div.gamecard__emoji', { 'aria-hidden': 'true', text: game.emoji }),
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

  const card = el('button.gamecard', {
    type: 'button',
    style: { '--game-color': game.color },
    'aria-label': `${game.name} — ${badge.label}`,
    onClick: () => navigate(`/${game.id}`),
  }, [
    el('div.gamecard__emoji', { 'aria-hidden': 'true', text: game.emoji }),
    el('div.gamecard__body', {}, [
      el('div.gamecard__name', {}, [game.name]),
      el('div.gamecard__tag', { text: game.tagline }),
      el('div.gamecard__stats', {}, [
        stats.currentStreak > 0 ? el('span.gamecard__streak', { text: `🔥 ${stats.currentStreak}` }) : null,
        st.label ? el('span.gamecard__score', { text: st.label }) : null,
      ]),
    ]),
    el('div.gamecard__state', { 'data-state': st.status }, [
      el('span.gamecard__badge', { 'aria-hidden': 'true', text: badge.icon }),
      el('span.gamecard__badge-label', { text: badge.label }),
    ]),
  ]);
  return card;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
