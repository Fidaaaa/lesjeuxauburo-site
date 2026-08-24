// La Boîte à Lettres — douze lettres sur les quatre côtés d'un carré.
// On enchaîne des mots (chacun commence par la dernière lettre du précédent),
// sans jamais utiliser deux lettres consécutives d'un même côté. Objectif :
// utiliser les douze lettres.

import { BOITE_BANK } from './data.js';
import { DICTIONARY } from '../../data/dictionary_fr.js';
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

const GAME_ID = 'boite';
const MAX_WORDS = 6;   // au-delà, la grille perd son intérêt

const HOW_TO = {
  title: '🔠 La Boîte à Lettres — comment jouer',
  html: `
    <p>Douze lettres, trois par côté. Forme des mots pour <strong>utiliser les douze</strong>.</p>
    <ul class="howto-legend">
      <li>Chaque mot <strong>commence par la dernière lettre</strong> du mot précédent.</li>
      <li>Deux lettres qui se suivent <strong>ne peuvent pas venir du même côté</strong>.</li>
      <li>Une lettre peut resservir autant de fois que tu veux.</li>
    </ul>
    <p>Le puzzle du jour se résout toujours <strong>en 2 mots</strong> — mais tu as droit à ${MAX_WORDS}.</p>
  `,
};

const WIN_MESSAGES = [
  'Douze lettres, zéro reste. Élégant ! ✨',
  'Bien enchaîné — le vocabulaire au service de la pause. ☕',
  'Boîte vidée ! Ton cerveau a bien tourné. 🔠',
  'Joli parcours de lettres. Bravo ! 🎯',
];

function todaysPuzzle(dayNumber, dateStr) {
  const p = scheduledPuzzle(GAME_ID, dateStr)
    ?? BOITE_BANK[pickForDay(BOITE_BANK.length, dayNumber, GAME_ID)];
  const sideOf = {};
  p.s.forEach((side, index) => { for (const ch of side) sideOf[ch] = index; });
  return { sides: p.s, sideOf, solution: deobf(p.k).split('|') };
}

function normalize(s) {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, '');
}

export default {
  id: GAME_ID,
  name: 'La Boîte à Lettres',

  mount(view, ctx) {
    const puz = todaysPuzzle(ctx.dayNumber, ctx.dateStr);
    const allLetters = new Set(Object.keys(puz.sideOf));
    let state = loadGameState(GAME_ID, ctx.dateStr) || { words: [], status: 'playing' };

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: 'La Boîte à Lettres' }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · utilise les 12 lettres` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    const boxWrap = el('div.boite-wrap');
    const inputZone = el('div.boite-inputzone');
    const wordsBox = el('div.boite-words');
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    view.append(boxWrap, inputZone, wordsBox, endSlot);

    /** Lettres déjà consommées par les mots validés. */
    function usedLetters() {
      const used = new Set();
      for (const w of state.words) for (const ch of w) used.add(ch);
      return used;
    }

    function renderBox(draft = '') {
      clear(boxWrap);
      const used = usedLetters();
      const box = el('div.boite-box', { role: 'img', 'aria-label': `Côtés : ${puz.sides.join(', ')}` });

      // Un côté = une rangée de trois pastilles, positionnée par CSS.
      const positions = ['top', 'right', 'bottom', 'left'];
      puz.sides.forEach((side, index) => {
        const row = el(`div.boite-side.boite-side--${positions[index]}`);
        for (const ch of side) {
          row.append(el('span.boite-letter', {
            'data-used': used.has(ch) ? '1' : '0',
            'data-draft': draft.includes(ch) ? '1' : '0',
            text: ch,
          }));
        }
        box.append(row);
      });

      const remaining = allLetters.size - used.size;
      box.append(el('div.boite-center', {}, [
        el('div.boite-center__count', { text: `${used.size}/12` }),
        el('div.boite-center__label', { text: remaining ? 'lettres utilisées' : 'terminé !' }),
      ]));
      boxWrap.append(box);
    }

    function renderWords() {
      clear(wordsBox);
      if (!state.words.length) return;
      wordsBox.append(el('div.boite-words__title', { text: 'Tes mots' }));
      const list = el('div.boite-words__list');
      state.words.forEach((w, i) => {
        list.append(el('span.boite-chip', { text: w }));
        if (i < state.words.length - 1) list.append(el('span.boite-arrow', { text: '→' }));
      });
      wordsBox.append(list);
    }

    /** Vérifie un mot proposé et renvoie la raison du refus, ou null. */
    function reject(word) {
      if (word.length < 3) return 'Trois lettres minimum';
      for (const ch of word) {
        if (!(ch in puz.sideOf)) return `La lettre ${ch} n'est pas dans la boîte`;
      }
      for (let i = 1; i < word.length; i++) {
        if (puz.sideOf[word[i]] === puz.sideOf[word[i - 1]]) {
          return `${word[i - 1]} et ${word[i]} sont du même côté`;
        }
      }
      const last = state.words[state.words.length - 1];
      if (last && word[0] !== last[last.length - 1]) {
        return `Le mot doit commencer par ${last[last.length - 1]}`;
      }
      if (!DICTIONARY.has(word)) return 'Mot inconnu au dictionnaire';
      return null;
    }

    function renderInput() {
      clear(inputZone);
      if (state.status !== 'playing') return;
      const last = state.words[state.words.length - 1];
      const input = el('input.boite-input', {
        type: 'text', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off',
        placeholder: last ? `Commence par ${last[last.length - 1]}…` : 'Un premier mot…',
        'aria-label': 'Ton mot', maxlength: '14',
        onInput: (e) => {
          e.target.value = normalize(e.target.value);
          renderBox(e.target.value);
        },
      });
      const form = el('form.boite-form', {
        onSubmit: (e) => { e.preventDefault(); submit(input.value); input.value = ''; input.focus(); },
      }, [input, el('button.btn.btn--primary', { type: 'submit', text: 'Valider' })]);

      inputZone.append(form, el('div.boite-actions', {}, [
        el('p.boite-count', { text: `${state.words.length}/${MAX_WORDS} mots` }),
        state.words.length
          ? el('button.cf-giveup', { type: 'button', text: '↩︎ Effacer le dernier', onClick: undoWord })
          : null,
        el('button.cf-giveup', { type: 'button', text: 'Donner sa langue au chat 🐱', onClick: giveUp }),
      ]));
      input.focus();
    }

    function submit(raw) {
      if (state.status !== 'playing') return;
      const word = normalize(raw || '');
      if (!word) { toast('Écris un mot'); return; }
      const why = reject(word);
      if (why) { toast(why); return; }

      state.words.push(word);
      const used = usedLetters();
      if (used.size === allLetters.size) {
        state.status = 'win';
      } else if (state.words.length >= MAX_WORDS) {
        state.status = 'lose';
      }
      persist();
      renderAll();
      if (state.status === 'win') confetti();
    }

    function undoWord() {
      if (state.status !== 'playing' || !state.words.length) return;
      state.words.pop();
      persist();
      renderAll();
    }

    function giveUp() {
      if (state.status !== 'playing') return;
      state.status = 'lose';
      persist();
      renderAll();
    }

    function persist() {
      saveGameState(GAME_ID, ctx.dateStr, state);
      if (state.status !== 'playing') commitResult();
    }

    function commitResult() {
      if (loadResult(GAME_ID, ctx.dateStr)) return;
      const won = state.status === 'win';
      const count = state.words.length;
      const points = won ? Math.max(50, 110 - count * 15) : 0;
      saveResult(GAME_ID, ctx.dateStr, {
        status: won ? 'win' : 'lose', points,
        scoreLabel: won ? `${count} mot${count > 1 ? 's' : ''}` : '✗',
        share: `lesjeuxauburo · La Boîte à Lettres n°${ctx.puzzleNumber}\n`
             + (won ? `🔠 Bouclée en ${count} mot(s)` : '🔠 Non résolue')
             + `\n${siteUrl()}`,
      });
      recordStats(GAME_ID, {
        dateStr: ctx.dateStr, won,
        distKey: won ? String(count) : 'X', prevDateStr: addDays(ctx.dateStr, -1),
      });
    }

    function renderEnd() {
      const won = state.status === 'win';
      const reveal = el('div.mot-reveal', {}, [
        el('span', { text: 'Une solution en 2 mots : ' }),
        el('strong', { text: puz.solution.join(' → ') }),
      ]);
      clear(endSlot);
      endSlot.append(buildEndPanel({
        gameId: GAME_ID,
        won,
        title: won ? `Bouclée en ${state.words.length} mot(s)` : 'Boîte non vidée',
        message: won
          ? WIN_MESSAGES[(ctx.puzzleNumber + state.words.length) % WIN_MESSAGES.length]
          : 'Ces douze lettres t’ont résisté. Voici une solution. 🤔',
        revealNode: reveal,
        shareText: '',
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderAll() {
      renderBox();
      renderInput();
      renderWords();
      if (state.status !== 'playing') renderEnd(); else clear(endSlot);
    }

    renderAll();
    if (state.status !== 'playing') commitResult();
    else if (!state.words.length) maybeShowHowTo(GAME_ID, HOW_TO);
  },
};
