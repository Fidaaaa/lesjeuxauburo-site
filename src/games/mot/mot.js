// Le Mot — type Motus/Sutom. Deviner le mot du jour (6 à 8 lettres) en 6 essais.
// Première lettre donnée, clavier AZERTY virtuel, validation par dictionnaire.

import { MOT_BANK } from './data.js';
import { DICTIONARY } from '../../data/dictionary_fr.js';
import { deobf } from '../../core/crypto.js';
import { pickForDay } from '../../core/rng.js';
import { scheduledPuzzle } from '../../core/schedule.js';
import { addDays } from '../../core/date.js';
import { el, clear } from '../../core/dom.js';
import { loadGameState, saveGameState, loadResult, saveResult, recordStats } from '../../core/storage.js';
import { showModal } from '../../ui/modal.js';
import { toast, confetti } from '../../ui/effects.js';
import { buildEndPanel } from '../../ui/endpanel.js';
import { maybeShowHowTo, howToButton } from '../../ui/howto.js';
import { siteUrl } from '../../core/share.js';

const GAME_ID = 'mot';
const MAX_TRIES = 6;
const STATES = { correct: 'correct', present: 'present', absent: 'absent' };
const RANK = { absent: 0, present: 1, correct: 2 };
const EMOJI = { correct: '🟥', present: '🟡', absent: '⬛' };
const MARK = { correct: '■', present: '●', absent: '·' }; // formes = info sans couleur

const HOW_TO = {
  title: '🔤 Le Mot — comment jouer',
  html: `
    <p>Devine le <strong>mot du jour</strong> (6 à 8 lettres) en <strong>6 essais</strong>. La première lettre t'est offerte.</p>
    <ul class="howto-legend">
      <li><span class="chip chip--correct">■</span> Lettre <strong>bien placée</strong> (rouge, carré)</li>
      <li><span class="chip chip--present">●</span> Lettre <strong>mal placée</strong> (jaune, rond)</li>
      <li><span class="chip chip--absent">·</span> Lettre <strong>absente</strong> du mot</li>
    </ul>
    <p>Les accents sont ignorés à la saisie. Chaque essai doit être un mot valide.</p>
    <p>Le même mot pour tout le bureau, remis à zéro à 2h du matin. 😉</p>
  `,
};

const WIN_MESSAGES = [
  'Trouvé ! Tu peux retourner à ta vraie réunion. 💼',
  'Bien joué, chef ! Café offert par la machine. ☕',
  'Impeccable. On note ça dans ton entretien annuel. ✅',
  'Mot déniché ! La productivité peut attendre. 🎯',
  'Champion de l’open space aujourd’hui. 🏆',
];
const WIN_ONE_SHOT = 'Du premier coup ?! Tu triches ou tu es un génie. 🤯';
const LOSE_MESSAGES = [
  'Raté… mais l’intention était là. On y croit demain. 🙃',
  'Le mot t’a résisté. Comme la photocopieuse le lundi. 🖨️',
  'Pas cette fois. Retour à la pile de dossiers. 📚',
  'Échec, mais un échec stylé. Demain, revanche. 🔁',
];

// --- Logique ---

function todaysAnswer(dayNumber, dateStr) {
  const publie = scheduledPuzzle(GAME_ID, dateStr);
  if (publie) return deobf(publie).toUpperCase();
  const idx = pickForDay(MOT_BANK.length, dayNumber, GAME_ID);
  return deobf(MOT_BANK[idx]).toUpperCase();
}

// Colore un essai face à la réponse (gère les lettres en double, à la Wordle).
function scoreGuess(guess, answer) {
  const n = answer.length;
  const res = new Array(n).fill(STATES.absent);
  const counts = {};
  for (const ch of answer) counts[ch] = (counts[ch] || 0) + 1;
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) { res[i] = STATES.correct; counts[guess[i]]--; }
  }
  for (let i = 0; i < n; i++) {
    if (res[i] === STATES.correct) continue;
    const c = guess[i];
    if (counts[c] > 0) { res[i] = STATES.present; counts[c]--; }
  }
  return res;
}

function keyboardStates(guesses, answer) {
  const map = {};
  for (const g of guesses) {
    const sc = scoreGuess(g, answer);
    for (let i = 0; i < g.length; i++) {
      const c = g[i];
      if (!(c in map) || RANK[sc[i]] > RANK[map[c]]) map[c] = sc[i];
    }
  }
  return map;
}

function buildShareText(guesses, answer, puzzleNumber, won) {
  const score = won ? `${guesses.length}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
  const header = `lesjeuxauburo · Le Mot n°${puzzleNumber} — ${score}`;
  const grid = guesses.map((g) => scoreGuess(g, answer).map((s) => EMOJI[s]).join('')).join('\n');
  return `${header}\n${grid}\n${siteUrl()}`;
}

// --- Rendu ---

export default {
  id: GAME_ID,
  name: 'Le Mot',

  mount(view, ctx) {
    const answer = todaysAnswer(ctx.dayNumber, ctx.dateStr);
    const N = answer.length;
    const firstLetter = answer[0];

    let state = loadGameState(GAME_ID, ctx.dateStr) || { guesses: [], status: 'playing' };
    // Sécurité : si la longueur enregistrée ne colle pas (banque modifiée), on repart.
    if (state.guesses.some((g) => g.length !== N)) state = { guesses: [], status: 'playing' };

    let current = state.status === 'playing' ? [firstLetter] : [];
    let boardEl, keyboardEl, endSlot;

    clear(view);
    const header = el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: `Le Mot` }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · mot de ${N} lettres` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]);

    boardEl = el('div.mot-board', { role: 'grid', 'aria-label': 'Grille du Mot' });
    keyboardEl = el('div.keyboard', { 'aria-label': 'Clavier' });
    endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    const liveMsg = el('div.sr-only', { 'aria-live': 'assertive' });

    view.append(header, boardEl, keyboardEl, endSlot, liveMsg);

    function renderBoard(animateRow = -1) {
      clear(boardEl);
      for (let r = 0; r < MAX_TRIES; r++) {
        const row = el('div.mot-row', { role: 'row' });
        const submitted = state.guesses[r];
        const scores = submitted ? scoreGuess(submitted, answer) : null;
        for (let c = 0; c < N; c++) {
          let letter = '';
          let st = null;
          if (submitted) { letter = submitted[c]; st = scores[c]; }
          else if (r === state.guesses.length && state.status === 'playing') {
            letter = current[c] || '';
          }
          const tile = el('div.tile', {
            role: 'gridcell',
            'data-state': st || (letter ? 'filled' : 'empty'),
          }, [
            el('span.tile__letter', { text: letter }),
            st ? el('span.tile__mark', { 'aria-hidden': 'true', text: MARK[st] }) : null,
          ]);
          if (c === 0 && !submitted && r >= state.guesses.length && state.status === 'playing') tile.classList.add('tile--given');
          if (st) {
            tile.setAttribute('aria-label',
              `${letter}, ${st === 'correct' ? 'bien placée' : st === 'present' ? 'mal placée' : 'absente'}`);
          }
          if (submitted && r === animateRow) {
            tile.classList.add('tile--reveal');
            tile.style.animationDelay = `${c * 0.18}s`;
          }
          row.append(tile);
        }
        boardEl.append(row);
      }
    }

    function renderKeyboard() {
      clear(keyboardEl);
      const kstates = keyboardStates(state.guesses, answer);
      const rows = [
        'AZERTYUIOP'.split(''),
        'QSDFGHJKLM'.split(''),
        ['ENTER', ...'WXCVBN'.split(''), 'DEL'],
      ];
      const locked = state.status !== 'playing';
      for (const kr of rows) {
        const rowEl = el('div.keyboard__row');
        for (const k of kr) {
          if (k === 'ENTER') {
            rowEl.append(el('button.key.key--wide', {
              type: 'button', text: 'Entrée', 'aria-label': 'Valider', disabled: locked,
              onClick: () => submit(),
            }));
          } else if (k === 'DEL') {
            rowEl.append(el('button.key.key--wide', {
              type: 'button', text: '⌫', 'aria-label': 'Effacer', disabled: locked,
              onClick: () => backspace(),
            }));
          } else {
            const st = kstates[k];
            rowEl.append(el('button.key', {
              type: 'button', text: k, 'data-state': st || '', disabled: locked,
              'aria-label': st ? `${k}, ${st === 'correct' ? 'bien placée' : st === 'present' ? 'mal placée' : 'absente'}` : k,
              onClick: () => typeLetter(k),
            }));
          }
        }
        keyboardEl.append(rowEl);
      }
    }

    function typeLetter(ch) {
      if (state.status !== 'playing') return;
      if (current.length >= N) return;
      current.push(ch);
      renderBoard();
    }

    function backspace() {
      if (state.status !== 'playing') return;
      if (current.length > 1) { current.pop(); renderBoard(); } // pos 0 = lettre donnée, verrouillée
    }

    function shakeRow() {
      const row = boardEl.children[state.guesses.length];
      if (!row) return;
      row.classList.remove('mot-row--shake');
      void row.offsetWidth;
      row.classList.add('mot-row--shake');
    }

    function submit() {
      if (state.status !== 'playing') return;
      const word = current.join('');
      if (word.length !== N) { shakeRow(); toast(`Il faut ${N} lettres`); return; }
      if (!DICTIONARY.has(word)) { shakeRow(); toast('Mot inconnu au dictionnaire'); return; }

      state.guesses.push(word);
      const won = word === answer;
      const rowIdx = state.guesses.length - 1;

      if (won) state.status = 'win';
      else if (state.guesses.length >= MAX_TRIES) state.status = 'lose';

      saveGameState(GAME_ID, ctx.dateStr, state);
      current = state.status === 'playing' ? [firstLetter] : [];
      renderBoard(rowIdx);
      renderKeyboard();

      const sc = scoreGuess(word, answer);
      liveMsg.textContent = sc.map((s, i) => `${word[i]} ${s}`).join(', ');

      if (state.status !== 'playing') {
        setTimeout(() => finish(), N * 180 + 250);
      }
    }

    function finish() {
      const won = state.status === 'win';
      const shareText = buildShareText(state.guesses, answer, ctx.puzzleNumber, won);
      // Persiste le résultat (idempotent) pour le hub et les stats.
      if (!loadResult(GAME_ID, ctx.dateStr)) {
        const tries = state.guesses.length;
        const points = won ? Math.round((100 * (MAX_TRIES - tries + 1)) / MAX_TRIES) : 0;
        saveResult(GAME_ID, ctx.dateStr, {
          status: won ? 'win' : 'lose',
          tries: won ? tries : null,
          maxTries: MAX_TRIES,
          points,
          scoreLabel: won ? `${tries}/${MAX_TRIES}` : `X/${MAX_TRIES}`,
          share: shareText,
        });
        recordStats(GAME_ID, {
          dateStr: ctx.dateStr,
          won,
          distKey: won ? String(state.guesses.length) : 'X',
          prevDateStr: addDays(ctx.dateStr, -1),
        });
      }
      renderEnd(won, shareText);
      if (won) confetti();
    }

    function renderEnd(won, shareText) {
      let message;
      if (won && state.guesses.length === 1) message = WIN_ONE_SHOT;
      else if (won) message = WIN_MESSAGES[(ctx.puzzleNumber + state.guesses.length) % WIN_MESSAGES.length];
      else message = LOSE_MESSAGES[ctx.puzzleNumber % LOSE_MESSAGES.length];

      const reveal = el('div.mot-reveal', {}, [
        el('span', { text: won ? 'Le mot était bien ' : 'Le mot était ' }),
        el('strong', { text: answer }),
      ]);

      clear(endSlot);
      endSlot.append(buildEndPanel({
        gameId: GAME_ID,
        won,
        title: won ? `Trouvé en ${state.guesses.length}/${MAX_TRIES}` : 'Perdu',
        message,
        revealNode: reveal,
        shareText,
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Saisie clavier physique.
    function onKeyDown(e) {
      if (state.status !== 'playing') return;
      if (document.body.classList.contains('modal-open')) return; // règles ouvertes
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'Enter') { e.preventDefault(); submit(); }
      else if (k === 'Backspace') { e.preventDefault(); backspace(); }
      else if (/^[a-zA-ZàâäéèêëîïôöùûüçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]$/.test(k)) {
        // Normalise l'accent -> lettre simple.
        const norm = k.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
        if (/^[A-Z]$/.test(norm)) typeLetter(norm);
      }
    }
    document.addEventListener('keydown', onKeyDown);

    // Premier rendu.
    renderBoard();
    renderKeyboard();
    if (state.status !== 'playing') {
      const won = state.status === 'win';
      renderEnd(won, buildShareText(state.guesses, answer, ctx.puzzleNumber, won));
    } else {
      maybeShowHowTo(GAME_ID, HOW_TO);
    }

    // Nettoyage quand on quitte la vue.
    return () => document.removeEventListener('keydown', onKeyDown);
  },
};
