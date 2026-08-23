// L'Intrus — 9 mots, 8 partagent un point commun caché, 1 est l'intrus.
// 2 essais pour trouver l'intrus, puis proposer le point commun (champ libre,
// matching tolérant). Rapide (< 1 min).

import { INTRUS_BANK } from './data.js';
import { deobf } from '../../core/crypto.js';
import { pickForDay, seededShuffle } from '../../core/rng.js';
import { scheduledPuzzle } from '../../core/schedule.js';
import { addDays } from '../../core/date.js';
import { el, clear } from '../../core/dom.js';
import { loadGameState, saveGameState, loadResult, saveResult, recordStats } from '../../core/storage.js';
import { toast, confetti } from '../../ui/effects.js';
import { buildEndPanel } from '../../ui/endpanel.js';
import { maybeShowHowTo, howToButton } from '../../ui/howto.js';
import { siteUrl } from '../../core/share.js';

const GAME_ID = 'intrus';
const MAX_INTRUDER_TRIES = 2;
const MAX_THEME_TRIES = 2;

const HOW_TO = {
  title: '🕵️ L\'Intrus — comment jouer',
  html: `
    <p><strong>9 mots</strong> sont affichés. <strong>8 partagent un point commun</strong> caché, <strong>1 est l'intrus</strong>.</p>
    <p>1. Clique sur l'intrus. Tu as <strong>2 essais</strong>.</p>
    <p>2. Ensuite, devine le <strong>point commun</strong> des 8 autres dans le champ libre (l'orthographe exacte n'est pas exigée).</p>
    <p>Rapide, parfait pour finir la tournée. ⏱️</p>
  `,
};

const WIN_MESSAGES = [
  'Œil de lynx ! Rien ne t’échappe. 🔍',
  'Démasqué ! Tu ferais un bon manager. 🕵️',
  'Bien vu, fin limier du open space. 🎯',
  'L’intrus n’avait aucune chance. 💼',
];
const PERFECT_MESSAGE = 'Intrus ET point commun : sans-faute, chapeau ! 🎩';
const LOSE_MESSAGES = [
  'L’intrus t’a bien eu cette fois… 🥸',
  'Raté ! Il s’est fondu dans la masse. 🫥',
  'Pas vu, pas pris. Revanche demain. 🔁',
];

function todaysPuzzle(dayNumber, dateStr) {
  const p = scheduledPuzzle(GAME_ID, dateStr)
    ?? INTRUS_BANK[pickForDay(INTRUS_BANK.length, dayNumber, GAME_ID)];
  return {
    words: seededShuffle(p.w, `${GAME_ID}:${dateStr}`),
    intruder: deobf(p.i),
    theme: deobf(p.t),
    accept: deobf(p.a).split('|'),
    explain: deobf(p.e),
  };
}

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function themeMatches(input, accept) {
  const n = normalize(input);
  if (!n) return false;
  return accept.some((tok) => {
    const t = normalize(tok);
    return t && n.includes(t);
  });
}

function buildShareText(state, puzzleNumber) {
  const found = state.intruderFound;
  const attempts = state.intruderGuesses.length;
  let intrusRow;
  if (found) intrusRow = attempts === 1 ? '🟩' : '🟥🟩';
  else intrusRow = '🟥🟥';
  const themeRow = state.themeFound ? '🎯' : '⬛';
  const header = `lesjeuxauburo · L'Intrus n°${puzzleNumber}`;
  return `${header}\n🕵️ ${intrusRow}  Point commun ${themeRow}\n${siteUrl()}`;
}

export default {
  id: GAME_ID,
  name: "L'Intrus",

  mount(view, ctx) {
    const puz = todaysPuzzle(ctx.dayNumber, ctx.dateStr);
    let state = loadGameState(GAME_ID, ctx.dateStr) || {
      intruderGuesses: [], intruderFound: false,
      phase: 'A', themeGuesses: [], themeFound: false, status: 'playing',
    };

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: "L'Intrus" }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · trouve l'intrus` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    const instruction = el('p.intrus-instruction', { 'aria-live': 'polite' });
    const triesDots = el('div.intrus-tries', { 'aria-hidden': 'true' });
    const grid = el('div.intrus-grid', { role: 'group', 'aria-label': 'Les neuf mots' });
    const themeZone = el('div.intrus-theme');
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    view.append(instruction, triesDots, grid, themeZone, endSlot);

    function renderTries() {
      clear(triesDots);
      if (state.phase !== 'A') return;
      const left = MAX_INTRUDER_TRIES - state.intruderGuesses.length;
      for (let i = 0; i < MAX_INTRUDER_TRIES; i++) {
        triesDots.append(el('span.intrus-dot', { 'data-used': i >= left ? '1' : '0' }));
      }
    }

    function renderGrid() {
      clear(grid);
      const finished = state.status !== 'playing';
      for (const w of puz.words) {
        const wrong = state.intruderGuesses.includes(w) && w !== puz.intruder;
        const isIntruder = w === puz.intruder;
        const revealIntruder = (state.phase !== 'A') && isIntruder;
        const tile = el('button.intrus-tile', {
          type: 'button',
          disabled: state.phase !== 'A',
          'data-state': wrong ? 'wrong' : revealIntruder ? 'intruder' : 'idle',
          'aria-label': wrong ? `${w}, pas l'intrus` : revealIntruder ? `${w}, c'était l'intrus` : w,
          onClick: () => pickIntruder(w),
        }, [
          el('span.intrus-tile__word', { text: w }),
          wrong ? el('span.intrus-tile__mark', { 'aria-hidden': 'true', text: '✕' }) : null,
          revealIntruder ? el('span.intrus-tile__mark', { 'aria-hidden': 'true', text: '🎯' }) : null,
        ]);
        grid.append(tile);
      }
    }

    function renderInstruction() {
      if (state.phase === 'A') {
        instruction.textContent = `Clique sur l'intrus — ${MAX_INTRUDER_TRIES - state.intruderGuesses.length} essai(s) restant(s)`;
      } else if (state.phase === 'B') {
        instruction.textContent = state.intruderFound
          ? 'Bien vu ! Maintenant, quel est le point commun des 8 autres ?'
          : `L'intrus était « ${puz.intruder} ». Quel était le point commun ?`;
      } else {
        instruction.textContent = '';
      }
    }

    function renderThemeZone() {
      clear(themeZone);
      if (state.phase !== 'B') return;
      const input = el('input.intrus-input', {
        type: 'text', placeholder: 'ex : des fruits, des villes…',
        'aria-label': 'Ton point commun', autocomplete: 'off', autocapitalize: 'off',
        maxlength: '40',
      });
      const form = el('form.intrus-form', {
        onSubmit: (e) => { e.preventDefault(); submitTheme(input.value); },
      }, [
        input,
        el('button.btn.btn--primary', { type: 'submit', text: 'Valider' }),
      ]);
      const tries = el('p.intrus-theme__tries', {
        text: `${MAX_THEME_TRIES - state.themeGuesses.length} proposition(s) restante(s)`,
      });
      themeZone.append(form, tries);
      input.focus();
    }

    function pickIntruder(word) {
      if (state.phase !== 'A') return;
      if (state.intruderGuesses.includes(word)) return;
      state.intruderGuesses.push(word);
      if (word === puz.intruder) {
        state.intruderFound = true;
        state.phase = 'B';
      } else if (state.intruderGuesses.length >= MAX_INTRUDER_TRIES) {
        state.intruderFound = false;
        state.phase = 'B';
      } else {
        toast('Non, celui-là fait partie des 8 !');
      }
      saveGameState(GAME_ID, ctx.dateStr, state);
      renderAll();
    }

    function submitTheme(value) {
      if (state.phase !== 'B') return;
      const val = (value || '').trim();
      if (!val) { toast('Écris ta proposition'); return; }
      state.themeGuesses.push(val);
      if (themeMatches(val, puz.accept)) {
        state.themeFound = true;
        endGame();
      } else if (state.themeGuesses.length >= MAX_THEME_TRIES) {
        state.themeFound = false;
        endGame();
      } else {
        toast('Pas tout à fait… reformule !');
        saveGameState(GAME_ID, ctx.dateStr, state);
        renderThemeZone();
      }
    }

    function endGame() {
      state.phase = 'done';
      state.status = state.intruderFound ? 'win' : 'lose';
      saveGameState(GAME_ID, ctx.dateStr, state);
      if (!loadResult(GAME_ID, ctx.dateStr)) {
        const base = state.intruderFound ? (state.intruderGuesses.length === 1 ? 60 : 40) : 0;
        const bonus = state.themeFound ? 40 : 0;
        saveResult(GAME_ID, ctx.dateStr, {
          status: state.status,
          points: base + bonus,
          scoreLabel: state.intruderFound ? (state.themeFound ? '★★' : '★') : '✗',
          share: buildShareText(state, ctx.puzzleNumber),
        });
        recordStats(GAME_ID, {
          dateStr: ctx.dateStr, won: state.intruderFound,
          distKey: state.intruderFound ? (state.themeFound ? '2' : '1') : 'X',
          prevDateStr: addDays(ctx.dateStr, -1),
        });
      }
      renderAll();
      if (state.intruderFound) confetti();
    }

    function renderEnd() {
      const won = state.status === 'win';
      let message;
      if (won && state.themeFound) message = PERFECT_MESSAGE;
      else if (won) message = WIN_MESSAGES[ctx.puzzleNumber % WIN_MESSAGES.length];
      else message = LOSE_MESSAGES[ctx.puzzleNumber % LOSE_MESSAGES.length];

      const reveal = el('div.intrus-reveal', {}, [
        el('p', {}, [el('strong', { text: 'Le point commun : ' }), puz.theme]),
        el('p.intrus-reveal__explain', { text: `L'intrus « ${puz.intruder} » — ${puz.explain}` }),
        el('p.intrus-reveal__theme', {
          text: state.themeFound ? '🎯 Tu as trouvé le point commun !' : 'Point commun manqué.',
        }),
      ]);
      clear(endSlot);
      endSlot.append(buildEndPanel({
        won,
        title: won ? (state.themeFound ? 'Sans-faute !' : 'Intrus démasqué') : 'Intrus non trouvé',
        message, revealNode: reveal,
        shareText: buildShareText(state, ctx.puzzleNumber),
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderAll() {
      renderInstruction();
      renderTries();
      renderGrid();
      renderThemeZone();
      if (state.status !== 'playing') renderEnd(); else clear(endSlot);
    }

    renderAll();
    if (state.status === 'playing' && state.phase === 'A' && state.intruderGuesses.length === 0) {
      maybeShowHowTo(GAME_ID, HOW_TO);
    }
  },
};
