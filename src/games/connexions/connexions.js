// Connexions — 16 mots à regrouper en 4 catégories cachées de 4 mots.
// 4 erreurs maximum. Difficulté par couleur (jaune facile → violet retors).

import { CONNEXIONS_BANK } from './data.js';
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

const GAME_ID = 'connexions';
const MAX_MISTAKES = 4;
const LEVEL_EMOJI = ['🟨', '🟩', '🟦', '🟪'];
const LEVEL_NAME = ['Jaune', 'Vert', 'Bleu', 'Violet'];

const HOW_TO = {
  title: '🧩 Connexions — comment jouer',
  html: `
    <p>Regroupe les <strong>16 mots</strong> en <strong>4 familles de 4</strong>. Sélectionne 4 mots puis valide.</p>
    <p>Chaque famille a une couleur selon sa difficulté :</p>
    <ul class="howto-legend">
      <li><span class="chip" style="background:#e9b949">🟨</span> Jaune — facile</li>
      <li><span class="chip" style="background:#81b29a">🟩</span> Vert</li>
      <li><span class="chip" style="background:#6d90c4">🟦</span> Bleu</li>
      <li><span class="chip" style="background:#9b6dc4">🟪</span> Violet — retors (jeux de mots, pièges)</li>
    </ul>
    <p>Attention aux <strong>pièges</strong> : certains mots semblent coller à deux familles. <strong>4 erreurs</strong> maximum !</p>
  `,
};

const WIN_MESSAGES = [
  'Tout relié ! Cerveau en pleine forme. 🧠',
  'Quatre familles, zéro pitié. Bravo ! 🎯',
  'Bien connecté — mieux que le wifi du bureau. 📶',
  'Rangé, classé, trié. Marie Kondo est jalouse. ✨',
];
const PERFECT_MESSAGE = 'Sans la moindre erreur ?! Respect total. 👑';
const LOSE_MESSAGES = [
  'Les pièges ont gagné cette fois. 🕳️',
  'Presque ! Ces mots jouent double jeu. 🎭',
  'Raté — comme le café de la machine. On y retourne demain. 🔁',
];

function parseGroup(str) {
  const [lvl, label, words] = str.split('|');
  return { level: +lvl, label, words: words.split(',') };
}

function todaysPuzzle(dayNumber, dateStr) {
  const entree = scheduledPuzzle(GAME_ID, dateStr)
    ?? CONNEXIONS_BANK[pickForDay(CONNEXIONS_BANK.length, dayNumber, GAME_ID)];
  const groups = entree.g.map(deobf).map(parseGroup)
    .sort((a, b) => a.level - b.level);
  const all = groups.flatMap((g) => g.words);
  const shuffled = seededShuffle(all, `${GAME_ID}:${dateStr}`);
  const wordToGroup = {};
  groups.forEach((g, gi) => g.words.forEach((w) => { wordToGroup[w] = gi; }));
  return { groups, shuffled, wordToGroup };
}

export default {
  id: GAME_ID,
  name: 'Connexions',

  mount(view, ctx) {
    const puz = todaysPuzzle(ctx.dayNumber, ctx.dateStr);
    let state = loadGameState(GAME_ID, ctx.dateStr) || {
      solvedOrder: [], mistakes: 0, guessHistory: [], status: 'playing',
    };
    let selection = [];

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: 'Connexions' }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · 4 familles à trouver` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    const solvedBox = el('div.cnx-solved');
    const board = el('div.cnx-board', { role: 'group', 'aria-label': 'Les mots à regrouper' });
    const mistakesBox = el('div.cnx-mistakes', { 'aria-live': 'polite' });
    const controls = el('div.cnx-controls');
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    view.append(solvedBox, board, mistakesBox, controls, endSlot);

    function solvedWords() {
      const s = new Set();
      for (const gi of state.solvedOrder) puz.groups[gi].words.forEach((w) => s.add(w));
      return s;
    }

    function renderSolved() {
      clear(solvedBox);
      for (const gi of state.solvedOrder) {
        const g = puz.groups[gi];
        solvedBox.append(el('div.cnx-group', { 'data-level': g.level }, [
          el('div.cnx-group__label', { text: `${LEVEL_NAME[g.level]} · ${g.label}` }),
          el('div.cnx-group__words', { text: g.words.join(' · ') }),
        ]));
      }
    }

    function renderBoard() {
      clear(board);
      if (state.status !== 'playing') return;
      const solved = solvedWords();
      const remaining = puz.shuffled.filter((w) => !solved.has(w));
      for (const w of remaining) {
        const sel = selection.includes(w);
        board.append(el('button.cnx-tile', {
          type: 'button',
          'data-selected': sel ? '1' : '0',
          'aria-pressed': sel ? 'true' : 'false',
          onClick: () => toggle(w),
        }, [el('span', { text: w })]));
      }
    }

    function renderMistakes() {
      clear(mistakesBox);
      if (state.status !== 'playing') return;
      mistakesBox.append(el('span.cnx-mistakes__label', { text: 'Erreurs restantes : ' }));
      const dots = el('span.cnx-mistakes__dots', { 'aria-hidden': 'true' });
      for (let i = 0; i < MAX_MISTAKES; i++) {
        dots.append(el('span.cnx-dot', { 'data-used': i < state.mistakes ? '1' : '0' }));
      }
      mistakesBox.append(dots);
    }

    function renderControls() {
      clear(controls);
      if (state.status !== 'playing') return;
      controls.append(
        el('button.btn.btn--ghost', { type: 'button', text: '🔀 Mélanger', onClick: shuffleBoard }),
        el('button.btn.btn--ghost', { type: 'button', text: 'Désélectionner', disabled: selection.length === 0, onClick: () => { selection = []; renderBoard(); renderControls(); } }),
        el('button.btn.btn--primary', { type: 'button', text: 'Valider', disabled: selection.length !== 4, onClick: submit }),
      );
    }

    function toggle(w) {
      if (state.status !== 'playing') return;
      const i = selection.indexOf(w);
      if (i >= 0) selection.splice(i, 1);
      else { if (selection.length >= 4) return; selection.push(w); }
      renderBoard(); renderControls();
    }

    function shuffleBoard() {
      // mélange visuel des mots restants (réordonne shuffled aléatoirement).
      const solved = solvedWords();
      const remaining = puz.shuffled.filter((w) => !solved.has(w));
      for (let i = remaining.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
      }
      const solvedArr = puz.shuffled.filter((w) => solved.has(w));
      puz.shuffled = [...solvedArr, ...remaining];
      renderBoard();
    }

    function shakeSelection() {
      board.querySelectorAll('.cnx-tile[data-selected="1"]').forEach((t) => {
        t.classList.remove('cnx-tile--shake'); void t.offsetWidth; t.classList.add('cnx-tile--shake');
      });
    }

    function submit() {
      if (state.status !== 'playing' || selection.length !== 4) return;
      const levels = selection.map((w) => puz.groups[puz.wordToGroup[w]].level);
      state.guessHistory.push(levels.slice());

      // Le groupe correspondant ?
      let matched = -1;
      for (let gi = 0; gi < puz.groups.length; gi++) {
        if (state.solvedOrder.includes(gi)) continue;
        const gw = puz.groups[gi].words;
        if (selection.length === 4 && selection.every((w) => gw.includes(w))) { matched = gi; break; }
      }

      if (matched >= 0) {
        state.solvedOrder.push(matched);
        selection = [];
        if (state.solvedOrder.length === 4) state.status = 'win';
        saveGameState(GAME_ID, ctx.dateStr, state);
        renderAll();
        if (state.status === 'win') { commitResult(); confetti(); }
        return;
      }

      // Erreur.
      state.mistakes += 1;
      // « Il s'en faut d'un » : 3 mots dans une même famille non résolue.
      let oneAway = false;
      for (let gi = 0; gi < puz.groups.length; gi++) {
        if (state.solvedOrder.includes(gi)) continue;
        const inGroup = selection.filter((w) => puz.groups[gi].words.includes(w)).length;
        if (inGroup === 3) oneAway = true;
      }
      shakeSelection();
      if (state.mistakes >= MAX_MISTAKES) {
        // Défaite : on révèle les familles restantes.
        for (let gi = 0; gi < puz.groups.length; gi++) if (!state.solvedOrder.includes(gi)) state.solvedOrder.push(gi);
        state.solvedOrder.sort((a, b) => puz.groups[a].level - puz.groups[b].level);
        state.status = 'lose';
        selection = [];
        saveGameState(GAME_ID, ctx.dateStr, state);
        renderAll();
        commitResult();
      } else {
        if (oneAway) toast('Il s’en faut d’un ! 😬');
        else toast(`Raté — ${MAX_MISTAKES - state.mistakes} erreur(s) restante(s)`);
        saveGameState(GAME_ID, ctx.dateStr, state);
        renderMistakes();
      }
    }

    function buildShareText() {
      const won = state.status === 'win';
      const header = `lesjeuxauburo · Connexions n°${ctx.puzzleNumber} — ${won ? `${state.mistakes} err.` : 'raté'}`;
      const grid = state.guessHistory.map((lv) => lv.map((l) => LEVEL_EMOJI[l]).join('')).join('\n');
      return `${header}\n${grid}\n${siteUrl()}`;
    }

    // Enregistre résultat + stats (idempotent). Pas d'animation ici.
    function commitResult() {
      const won = state.status === 'win';
      if (loadResult(GAME_ID, ctx.dateStr)) return;
      const points = won ? ([100, 80, 60, 40][state.mistakes] ?? 40) : 0;
      saveResult(GAME_ID, ctx.dateStr, {
        status: won ? 'win' : 'lose', points,
        scoreLabel: won ? (state.mistakes === 0 ? '💯' : `${state.mistakes} err.`) : '✗',
        share: buildShareText(),
      });
      recordStats(GAME_ID, {
        dateStr: ctx.dateStr, won,
        distKey: won ? String(state.mistakes) : 'X',
        prevDateStr: addDays(ctx.dateStr, -1),
      });
    }

    function renderEnd() {
      const won = state.status === 'win';
      let message;
      if (won && state.mistakes === 0) message = PERFECT_MESSAGE;
      else if (won) message = WIN_MESSAGES[ctx.puzzleNumber % WIN_MESSAGES.length];
      else message = LOSE_MESSAGES[ctx.puzzleNumber % LOSE_MESSAGES.length];
      clear(endSlot);
      endSlot.append(buildEndPanel({
        won,
        title: won ? (state.mistakes === 0 ? 'Sans faute !' : `Trouvé — ${state.mistakes} erreur(s)`) : 'Perdu',
        message,
        shareText: buildShareText(),
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderAll() {
      renderSolved(); renderBoard(); renderMistakes(); renderControls();
      if (state.status !== 'playing') renderEnd(); else clear(endSlot);
    }

    renderAll();
    if (state.status === 'playing') {
      if (state.guessHistory.length === 0) maybeShowHowTo(GAME_ID, HOW_TO);
    } else {
      commitResult(); // reprise d'une partie déjà terminée : enregistre sans rejouer l'animation
    }
  },
};
