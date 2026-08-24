// La Gaufre — six mots de cinq lettres entrecroisés, dont les lettres ont été
// mélangées. On les remet en place en échangeant deux lettres, 15 fois au plus.
// Les couleurs suivent la logique du Mot, mot par mot : vert bien placé, jaune
// présent ailleurs dans le mot, gris absent.

import { GAUFRE_BANK, GAUFRE_SWAPS } from './data.js';
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

const GAME_ID = 'gaufre';
const SIZE = 5;
const HOLES = new Set(['1,1', '1,3', '3,1', '3,3']);
// Les 21 cases, lues ligne par ligne en sautant les trous.
const CELLS = [];
for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) if (!HOLES.has(`${r},${c}`)) CELLS.push([r, c]);
}
const INDEX_OF = new Map(CELLS.map(([r, c], i) => [`${r},${c}`, i]));

const HOW_TO = {
  title: '🧇 La Gaufre — comment jouer',
  html: `
    <p>Six mots de cinq lettres se croisent, mais les lettres sont mélangées.
    Remets-les en place en <strong>échangeant deux lettres</strong> : touche l'une, puis l'autre.</p>
    <ul class="howto-legend">
      <li><span class="chip chip--correct">■</span> Lettre <strong>bien placée</strong> (rouge, carré)</li>
      <li><span class="chip chip--present">●</span> Lettre <strong>du mot, mais mal placée</strong> (jaune, rond)</li>
      <li><span class="chip chip--absent">·</span> Lettre <strong>à sortir de ce mot</strong> (grise)</li>
    </ul>
    <p>Tu as <strong>${GAUFRE_SWAPS} échanges</strong>. Chaque échange non utilisé rapporte une étoile ⭐</p>
  `,
};

const WIN_MESSAGES = [
  'Gaufre parfaitement dressée ! 🧇',
  'Tout est à sa place — chapeau. ✨',
  'Six mots remis d’aplomb. Bien joué ! 🎯',
  'Résolu ! Le petit-déjeuner peut commencer. ☕',
];

/** Les six mots : indices des cases de chaque ligne puis de chaque colonne. */
const WORDS = (() => {
  const words = [];
  for (const r of [0, 2, 4]) {
    words.push(Array.from({ length: SIZE }, (_, c) => INDEX_OF.get(`${r},${c}`)));
  }
  for (const c of [0, 2, 4]) {
    words.push(Array.from({ length: SIZE }, (_, r) => INDEX_OF.get(`${r},${c}`)));
  }
  return words;
})();

function todaysPuzzle(dayNumber, dateStr) {
  const p = scheduledPuzzle(GAME_ID, dateStr)
    ?? GAUFRE_BANK[pickForDay(GAUFRE_BANK.length, dayNumber, GAME_ID)];
  return { start: p.d, solution: deobf(p.k), par: p.p };
}

/**
 * Couleur de chaque case : on évalue chaque mot séparément, à la manière du Mot
 * (les doublons sont comptés), puis on garde la meilleure des deux évaluations
 * pour les cases situées à un croisement.
 */
function colourize(current, solution) {
  const rank = { absent: 0, present: 1, correct: 2 };
  const colours = new Array(current.length).fill('absent');

  for (const word of WORDS) {
    const guess = word.map((i) => current[i]);
    const answer = word.map((i) => solution[i]);
    const marks = new Array(SIZE).fill('absent');
    const counts = {};
    answer.forEach((ch) => { counts[ch] = (counts[ch] || 0) + 1; });
    guess.forEach((ch, k) => {
      if (ch === answer[k]) { marks[k] = 'correct'; counts[ch] -= 1; }
    });
    guess.forEach((ch, k) => {
      if (marks[k] === 'correct') return;
      if (counts[ch] > 0) { marks[k] = 'present'; counts[ch] -= 1; }
    });
    word.forEach((cellIndex, k) => {
      if (rank[marks[k]] > rank[colours[cellIndex]]) colours[cellIndex] = marks[k];
    });
  }
  return colours;
}

export default {
  id: GAME_ID,
  name: 'La Gaufre',

  mount(view, ctx) {
    const puz = todaysPuzzle(ctx.dayNumber, ctx.dateStr);
    let state = loadGameState(GAME_ID, ctx.dateStr)
      || { letters: puz.start, swaps: 0, status: 'playing' };
    if (state.letters.length !== puz.start.length) {
      state = { letters: puz.start, swaps: 0, status: 'playing' };
    }
    let selected = null;

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: 'La Gaufre' }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · ${GAUFRE_SWAPS} échanges` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    const board = el('div.gaufre-board', { role: 'group', 'aria-label': 'Grille de la gaufre' });
    const counter = el('p.gaufre-counter', { 'aria-live': 'polite' });
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    view.append(board, counter, endSlot);

    const swapsLeft = () => GAUFRE_SWAPS - state.swaps;

    function renderBoard() {
      clear(board);
      const colours = colourize(state.letters, puz.solution);
      const done = state.status !== 'playing';
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (HOLES.has(`${r},${c}`)) { board.append(el('div.gaufre-hole')); continue; }
          const index = INDEX_OF.get(`${r},${c}`);
          const colour = colours[index];
          const tile = el('button.gaufre-tile', {
            type: 'button',
            'data-colour': colour,
            'data-selected': selected === index ? '1' : '0',
            disabled: done || colour === 'correct',
            'aria-label': `${state.letters[index]}, ${
              colour === 'correct' ? 'bien placée' : colour === 'present' ? 'mal placée' : 'absente'}`,
            onClick: () => pick(index),
          }, [
            el('span.gaufre-tile__letter', { text: state.letters[index] }),
            el('span.gaufre-tile__mark', {
              'aria-hidden': 'true',
              text: colour === 'correct' ? '■' : colour === 'present' ? '●' : '·',
            }),
          ]);
          board.append(tile);
        }
      }
    }

    function pick(index) {
      if (state.status !== 'playing') return;
      if (selected === null || selected === index) {
        selected = selected === index ? null : index;
        renderBoard(); renderCounter();
        return;
      }

      const letters = state.letters.split('');
      [letters[selected], letters[index]] = [letters[index], letters[selected]];
      state.letters = letters.join('');
      state.swaps += 1;
      selected = null;

      if (state.letters === puz.solution) state.status = 'win';
      else if (swapsLeft() <= 0) state.status = 'lose';

      persist();
      renderAll();
      if (state.status === 'win') confetti();
    }

    function renderCounter() {
      counter.textContent = state.status === 'playing'
        ? `${swapsLeft()} échange${swapsLeft() > 1 ? 's' : ''} restant${swapsLeft() > 1 ? 's' : ''}`
          + (selected !== null ? ' · choisis la seconde lettre' : '')
        : '';
    }

    function persist() {
      saveGameState(GAME_ID, ctx.dateStr, state);
      if (state.status !== 'playing') commitResult();
    }

    function stars() {
      return state.status === 'win' ? Math.max(0, Math.min(5, swapsLeft())) : 0;
    }

    /** Le résumé partageable, sans rien dévoiler de la solution. */
    function partageDuJour(won) {
      return `lesjeuxauburo · La Gaufre n°${ctx.puzzleNumber}\n`
           + (won ? `🧇 Résolue, ${stars()} étoile(s)` : '🧇 Gaufre ratée')
           + `\n${siteUrl()}`;
    }

    function commitResult() {
      if (loadResult(GAME_ID, ctx.dateStr)) return;
      const won = state.status === 'win';
      saveResult(GAME_ID, ctx.dateStr, {
        status: won ? 'win' : 'lose',
        points: won ? Math.min(100, 60 + stars() * 8) : 0,
        scoreLabel: won ? '⭐'.repeat(stars() || 1) : '✗',
        share: partageDuJour(won),
      });
      recordStats(GAME_ID, {
        dateStr: ctx.dateStr, won,
        distKey: won ? String(stars()) : 'X', prevDateStr: addDays(ctx.dateStr, -1),
      });
    }

    function renderEnd() {
      const won = state.status === 'win';
      const reveal = won ? null : el('div.mot-reveal', {}, [
        el('span', { text: 'Il fallait former : ' }),
        el('strong', { text: [0, 2, 4].map((r) => WORDS[r / 2].map((i) => puz.solution[i]).join('')).join(' · ') }),
      ]);
      clear(endSlot);
      endSlot.append(buildEndPanel({
        gameId: GAME_ID,
        won,
        title: won ? `Résolue — ${stars()} ⭐` : 'Échanges épuisés',
        message: won
          ? WIN_MESSAGES[(ctx.puzzleNumber + state.swaps) % WIN_MESSAGES.length]
          : `La gaufre se résolvait en ${puz.par} échanges. Demain, tu la retournes. 🔁`,
        revealNode: reveal,
        shareText: partageDuJour(won),
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderAll() {
      renderBoard();
      renderCounter();
      if (state.status !== 'playing') renderEnd(); else clear(endSlot);
    }

    renderAll();
    if (state.status !== 'playing') commitResult();
    else if (state.swaps === 0) maybeShowHowTo(GAME_ID, HOW_TO);
  },
};
