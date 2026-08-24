// Tango — grille logique 6×6 de soleils et de lunes.
// Trois règles : 3 soleils et 3 lunes par ligne et par colonne, jamais trois
// symboles identiques côte à côte, et les paires reliées par = ou × imposent
// des symboles identiques ou opposés. Une seule solution par grille.

import { TANGO_BANK } from './data.js';
import { deobf } from '../../core/crypto.js';
import { pickForDay } from '../../core/rng.js';
import { scheduledPuzzle } from '../../core/schedule.js';
import { addDays } from '../../core/date.js';
import { el, clear } from '../../core/dom.js';
import { loadGameState, saveGameState, loadResult, saveResult, recordStats } from '../../core/storage.js';
import { toast, confetti } from '../../ui/effects.js';
import { buildEndPanel } from '../../ui/endpanel.js';
import { maybeShowHowTo, howToButton } from '../../ui/howto.js';
import { siteUrl } from '../../core/share.js';

const GAME_ID = 'tango';
const N = 6;
const HALF = N / 2;
const EMPTY = '.';
const SUN = 'S';
const MOON = 'M';
const GLYPH = { S: '☀️', M: '🌙' };

const HOW_TO = {
  title: '🌗 Tango — comment jouer',
  html: `
    <p>Remplis la grille de <strong>soleils ☀️</strong> et de <strong>lunes 🌙</strong>.
    Touche une case pour la faire changer : vide → soleil → lune → vide.</p>
    <ul class="howto-legend">
      <li><strong>3 soleils et 3 lunes</strong> sur chaque ligne et chaque colonne.</li>
      <li><strong>Jamais trois</strong> symboles identiques côte à côte.</li>
      <li><strong>=</strong> entre deux cases : symboles identiques. <strong>×</strong> : symboles opposés.</li>
    </ul>
    <p>Les cases grisées sont données au départ. Une erreur s'affiche en rouge — il n'y a
    qu'une seule solution possible.</p>
  `,
};

const WIN_MESSAGES = [
  'Logique implacable ! 🌗',
  'Soleils et lunes réconciliés. ✨',
  'Grille bouclée — la pause est méritée. ☕',
  'Pas une case de travers. Bravo ! 🎯',
];

function parseConstraints(raw) {
  if (!raw) return [];
  return raw.split(';').map((chunk) => {
    const [a, b, kind] = chunk.split(',');
    return { a: Number(a), b: Number(b), kind };
  });
}

function todaysPuzzle(dayNumber, dateStr) {
  const p = scheduledPuzzle(GAME_ID, dateStr)
    ?? TANGO_BANK[pickForDay(TANGO_BANK.length, dayNumber, GAME_ID)];
  return { given: p.g, constraints: parseConstraints(p.c), solution: deobf(p.k) };
}

/** Indices des cases en infraction, pour l'affichage en rouge. */
function findErrors(cells, constraints) {
  const bad = new Set();

  const checkLine = (indices) => {
    const values = indices.map((i) => cells[i]);
    for (const symbol of [SUN, MOON]) {
      if (values.filter((v) => v === symbol).length > HALF) {
        indices.forEach((i, k) => { if (values[k] === symbol) bad.add(i); });
      }
    }
    for (let k = 0; k + 2 < N; k++) {
      if (values[k] !== EMPTY && values[k] === values[k + 1] && values[k] === values[k + 2]) {
        bad.add(indices[k]); bad.add(indices[k + 1]); bad.add(indices[k + 2]);
      }
    }
  };

  for (let r = 0; r < N; r++) {
    checkLine(Array.from({ length: N }, (_, c) => r * N + c));
  }
  for (let c = 0; c < N; c++) {
    checkLine(Array.from({ length: N }, (_, r) => r * N + c));
  }
  for (const { a, b, kind } of constraints) {
    if (cells[a] === EMPTY || cells[b] === EMPTY) continue;
    const same = cells[a] === cells[b];
    if ((kind === '=' && !same) || (kind === 'x' && same)) { bad.add(a); bad.add(b); }
  }
  return bad;
}

export default {
  id: GAME_ID,
  name: 'Tango',

  mount(view, ctx) {
    const puz = todaysPuzzle(ctx.dayNumber, ctx.dateStr);
    const locked = new Set();
    puz.given.split('').forEach((v, i) => { if (v !== EMPTY) locked.add(i); });
    const blanks = N * N - locked.size;

    let state = loadGameState(GAME_ID, ctx.dateStr)
      || { cells: puz.given, taps: 0, status: 'playing' };
    if (state.cells.length !== N * N) {
      state = { cells: puz.given, taps: 0, status: 'playing' };
    }

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: 'Tango' }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · ${blanks} cases à remplir` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    const board = el('div.tango-board', { role: 'group', 'aria-label': 'Grille Tango' });
    const status = el('p.tango-status', { 'aria-live': 'polite' });
    const actions = el('div.tango-actions');
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    view.append(board, status, actions, endSlot);

    // Une lune coûte deux touchers (vide → soleil → lune) : le « sans-faute »
    // n'est donc pas le nombre de cases vides, mais celui-ci.
    const minTaps = puz.solution.split('')
      .reduce((n, v, i) => n + (locked.has(i) ? 0 : (v === MOON ? 2 : 1)), 0);

    function stars() {
      const excess = Math.max(0, state.taps - minTaps);
      if (excess <= 2) return 5;
      if (excess <= 6) return 4;
      if (excess <= 12) return 3;
      if (excess <= 24) return 2;
      return 1;
    }

    function renderBoard() {
      clear(board);
      const cells = state.cells;
      const errors = state.status === 'playing' ? findErrors(cells, puz.constraints) : new Set();
      const done = state.status !== 'playing';

      for (let i = 0; i < N * N; i++) {
        const value = cells[i];
        const isLocked = locked.has(i);
        board.append(el('button.tango-cell', {
          type: 'button',
          'data-value': value,
          'data-locked': isLocked ? '1' : '0',
          'data-error': errors.has(i) ? '1' : '0',
          disabled: done || isLocked,
          'aria-label': `Ligne ${Math.floor(i / N) + 1}, colonne ${(i % N) + 1} : `
            + (value === SUN ? 'soleil' : value === MOON ? 'lune' : 'vide')
            + (isLocked ? ', donnée' : ''),
          onClick: () => cycle(i),
        }, [
          el('span.tango-cell__glyph', { 'aria-hidden': 'true', text: GLYPH[value] || '' }),
        ]));
      }

      // Les contraintes se posent par-dessus la grille, sur la frontière commune
      // aux deux cases concernées.
      for (const { a, b, kind } of puz.constraints) {
        const ra = Math.floor(a / N);
        const ca = a % N;
        const horizontal = b === a + 1;
        const x = horizontal ? ca + 1 : ca + 0.5;
        const y = horizontal ? ra + 0.5 : ra + 1;
        board.append(el('span.tango-link', {
          'aria-hidden': 'true',
          text: kind === '=' ? '=' : '×',
          style: `left:${(x / N) * 100}%;top:${(y / N) * 100}%`,
        }));
      }
    }

    function cycle(index) {
      if (state.status !== 'playing' || locked.has(index)) return;
      const cells = state.cells.split('');
      cells[index] = cells[index] === EMPTY ? SUN : cells[index] === SUN ? MOON : EMPTY;
      state.cells = cells.join('');
      state.taps += 1;

      if (!state.cells.includes(EMPTY)) {
        if (state.cells === puz.solution) state.status = 'win';
        else toast('Grille complète, mais une règle est enfreinte');
      }
      persist();
      renderAll();
      if (state.status === 'win') confetti();
    }

    function reset() {
      if (state.status !== 'playing') return;
      state.cells = puz.given;
      persist();
      renderAll();
    }

    function giveUp() {
      if (state.status !== 'playing') return;
      state.status = 'lose';
      state.cells = puz.solution;
      persist();
      renderAll();
    }

    function persist() {
      saveGameState(GAME_ID, ctx.dateStr, state);
      if (state.status !== 'playing') commitResult();
    }

    /** Le résumé partageable, sans rien dévoiler de la solution. */
    function partageDuJour(won) {
      return `lesjeuxauburo · Tango n°${ctx.puzzleNumber}\n`
           + (won ? `🌗 Résolu, ${stars()} étoile(s)` : '🌗 Abandonné')
           + `\n${siteUrl()}`;
    }

    function commitResult() {
      if (loadResult(GAME_ID, ctx.dateStr)) return;
      const won = state.status === 'win';
      saveResult(GAME_ID, ctx.dateStr, {
        status: won ? 'win' : 'lose',
        points: won ? Math.max(50, 100 - Math.max(0, state.taps - minTaps) * 2) : 0,
        scoreLabel: won ? '⭐'.repeat(stars()) : '✗',
        share: partageDuJour(won),
      });
      recordStats(GAME_ID, {
        dateStr: ctx.dateStr, won,
        distKey: won ? String(stars()) : 'X', prevDateStr: addDays(ctx.dateStr, -1),
      });
    }

    function renderStatus() {
      if (state.status !== 'playing') { status.textContent = ''; return; }
      const left = state.cells.split('').filter((v) => v === EMPTY).length;
      status.textContent = left
        ? `${left} case${left > 1 ? 's' : ''} à remplir`
        : 'Grille complète — vérifie les cases en rouge';
    }

    function renderActions() {
      clear(actions);
      if (state.status !== 'playing') return;
      actions.append(
        el('button.cf-giveup', { type: 'button', text: '↩︎ Recommencer', onClick: reset }),
        el('button.cf-giveup', { type: 'button', text: 'Donner sa langue au chat 🐱', onClick: giveUp }),
      );
    }

    function renderEnd() {
      const won = state.status === 'win';
      clear(endSlot);
      endSlot.append(buildEndPanel({
        gameId: GAME_ID,
        won,
        title: won ? `Résolu — ${stars()} ⭐` : 'Solution révélée',
        message: won
          ? WIN_MESSAGES[(ctx.puzzleNumber + state.taps) % WIN_MESSAGES.length]
          : 'La grille est affichée. Demain, une nouvelle logique. 🔁',
        revealNode: null,
        shareText: partageDuJour(won),
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderAll() {
      renderBoard();
      renderStatus();
      renderActions();
      if (state.status !== 'playing') renderEnd(); else clear(endSlot);
    }

    renderAll();
    if (state.status !== 'playing') commitResult();
    else if (state.taps === 0) maybeShowHowTo(GAME_ID, HOW_TO);
  },
};
