// Chaud-Froid — deviner le mot secret du jour. Chaque proposition reçoit un
// score de proximité sémantique (froid / tiède / chaud / brûlant + un rang),
// pré-calculé par familles thématiques. Essais illimités, historique trié.

import {
  CHAUDFROID_BANK, CF_CATEGORIES, CF_DOMAINS, CF_RELATED, CF_FILLER, CF_LIST_SIZE,
} from './data.js';
import { deobf } from '../../core/crypto.js';
import { pickForDay } from '../../core/rng.js';
import { addDays } from '../../core/date.js';
import { el, clear } from '../../core/dom.js';
import { loadGameState, saveGameState, loadResult, saveResult, recordStats } from '../../core/storage.js';
import { toast, confetti } from '../../ui/effects.js';
import { buildEndPanel } from '../../ui/endpanel.js';
import { maybeShowHowTo, howToButton } from '../../ui/howto.js';
import { siteUrl } from '../../core/share.js';

const GAME_ID = 'chaudfroid';

const HOW_TO = {
  title: '🌡️ Chaud-Froid — comment jouer',
  html: `
    <p>Devine le <strong>mot secret du jour</strong>. À chaque proposition, tu vois à quel point tu es <strong>proche du sens</strong> — pas de l'orthographe.</p>
    <ul class="howto-legend">
      <li><span class="chip" style="background:#d1495b">🔥</span> <strong>Brûlant</strong> — tout proche !</li>
      <li><span class="chip" style="background:#e8833a">🟠</span> <strong>Chaud</strong></li>
      <li><span class="chip" style="background:#e0a52f">🟡</span> <strong>Tiède</strong></li>
      <li><span class="chip" style="background:#5b8fd1">🔵</span> <strong>Froid</strong></li>
    </ul>
    <p>Un <strong>thermomètre de -20° (glacial) à 99° (tout proche)</strong> indique ta chaleur. Essais illimités, l'historique se trie du plus chaud au plus froid.</p>
  `,
};

const BANDS = [
  { name: 'Brûlant', emoji: '🔥', cls: 'brulant', max: 13 },
  { name: 'Chaud', emoji: '🟠', cls: 'chaud', max: 45 },
  { name: 'Tiède', emoji: '🟡', cls: 'tiede', max: 130 },
  { name: 'Froid', emoji: '🔵', cls: 'froid', max: Infinity },
];

const WIN_MESSAGES = [
  'Dans le mille ! Ton cerveau chauffe bien. 🔥',
  'Trouvé ! La sémantique n’a plus de secret pour toi. 🧠',
  'Bravo — pile dans le sens ! 🎯',
  'Mot secret capturé. Prochain café mérité. ☕',
];

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function bandFor(rank) {
  if (rank == null) return { name: 'Froid', emoji: '🔵', cls: 'froid', rank: '>1000' };
  for (const b of BANDS) if (rank <= b.max) return { ...b, rank };
  return { ...BANDS[BANDS.length - 1], rank };
}

function proximityPct(rank) {
  if (rank == null) return 2;
  return Math.max(3, Math.round(100 * (1 - (rank - 1) / 300)));
}

// Température affichée : -20° (glacial, hors liste) à 99° (tout proche).
const CF_CAP = CF_LIST_SIZE; // même échelle que la liste reconstruite
function tempFor(rank) {
  if (rank == null) return -20;
  const t = Math.round(99 - (rank - 2) * (114 / (CF_CAP - 2)));
  return Math.max(-15, Math.min(99, t));
}

// Domaine de chaque catégorie, déduit de CF_DOMAINS.
const DOMAIN_OF = {};
for (const [domain, names] of Object.entries(CF_DOMAINS)) {
  for (const name of names) DOMAIN_OF[name] = domain;
}

// Reconstruit la liste de voisins d'un secret, du plus proche au plus lointain.
// L'ordre doit rester IDENTIQUE à celui de tools/gen_chaudfroid.py (et du
// portage Swift) : mêmes tris, mêmes cercles, même remplissage.
function buildNeighbours(secret) {
  const ordered = [];
  const seen = new Set();
  const add = (word) => {
    if (word && !seen.has(word)) { seen.add(word); ordered.push(word); }
  };

  add(secret);

  const own = Object.keys(CF_CATEGORIES)
    .filter((name) => CF_CATEGORIES[name].includes(secret))
    .sort();
  for (const name of own) for (const w of CF_CATEGORIES[name]) add(w);

  const domains = [...new Set(own.map((n) => DOMAIN_OF[n]).filter(Boolean))].sort();
  for (const d of domains) {
    for (const name of CF_DOMAINS[d] || []) for (const w of CF_CATEGORIES[name]) add(w);
  }

  const near = [...new Set(domains.flatMap((d) => CF_RELATED[d] || [])
    .filter((d) => CF_DOMAINS[d]))].sort();
  for (const d of near) {
    for (const name of CF_DOMAINS[d] || []) for (const w of CF_CATEGORIES[name]) add(w);
  }

  for (const w of CF_FILLER) {
    add(w);
    if (ordered.length >= CF_LIST_SIZE) break;
  }
  return ordered.slice(0, CF_LIST_SIZE);
}

function todaysSecret(dayNumber) {
  const idx = pickForDay(CHAUDFROID_BANK.length, dayNumber, GAME_ID);
  const secret = deobf(CHAUDFROID_BANK[idx]);
  const list = buildNeighbours(secret);
  const rank = new Map();
  list.forEach((w, i) => rank.set(w, i + 1));
  return { secret, rank };
}

export default {
  id: GAME_ID,
  name: 'Chaud-Froid',

  mount(view, ctx) {
    const { secret, rank } = todaysSecret(ctx.dayNumber);
    let state = loadGameState(GAME_ID, ctx.dateStr) || { guesses: [], found: false, revealed: false, status: 'playing' };

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: 'Chaud-Froid' }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · mot secret du jour` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    const inputZone = el('div.cf-inputzone');
    const lastZone = el('div.cf-last', { 'aria-live': 'polite' });
    const historyBox = el('div.cf-history');
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    view.append(inputZone, lastZone, el('h2.cf-history__title', { text: 'Tes propositions' }), historyBox, endSlot);

    function renderInput() {
      clear(inputZone);
      if (state.status !== 'playing') return;
      const input = el('input.cf-input', {
        type: 'text', placeholder: 'Un mot…', 'aria-label': 'Ta proposition',
        autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', maxlength: '30',
      });
      const form = el('form.cf-form', { onSubmit: (e) => { e.preventDefault(); submit(input.value); input.value = ''; input.focus(); } }, [
        input,
        el('button.btn.btn--primary', { type: 'submit', text: 'Proposer' }),
      ]);
      const giveUp = el('button.cf-giveup', {
        type: 'button', text: 'Donner sa langue au chat 🐱',
        onClick: reveal,
      });
      const best = state.guesses.reduce((m, g) => (g.rank != null && g.rank < m ? g.rank : m), Infinity);
      const bestTxt = best === Infinity ? '' : ` · meilleur : ${bandFor(best).emoji} ${tempFor(best)}°`;
      inputZone.append(form, el('p.cf-count', { text: `${state.guesses.length} proposition(s)${bestTxt}` }), giveUp);
      input.focus();
    }

    function entryNode(g, highlight = false) {
      const b = bandFor(g.rank);
      const pct = proximityPct(g.rank);
      const node = el('div.cf-entry', { 'data-band': b.cls, 'data-hi': highlight ? '1' : '0' }, [
        el('div.cf-entry__bar', { 'aria-hidden': 'true' }, [
          el('div.cf-entry__fill', { 'data-band': b.cls, style: { width: pct + '%' } }),
        ]),
        el('div.cf-entry__row', {}, [
          el('span.cf-entry__word', { text: g.word }),
          el('span.cf-entry__band', {}, [`${b.emoji} ${b.name}`]),
          el('span.cf-entry__rank', { text: `${tempFor(g.rank)}°` }),
        ]),
      ]);
      return node;
    }

    function renderHistory() {
      clear(historyBox);
      const sorted = state.guesses.slice().sort((a, b) => {
        const ra = a.rank == null ? 99999 : a.rank;
        const rb = b.rank == null ? 99999 : b.rank;
        return ra - rb;
      });
      for (const g of sorted) historyBox.append(entryNode(g, g.word === state.lastWord));
    }

    function renderLast() {
      clear(lastZone);
      if (!state.lastWord) return;
      const g = state.guesses.find((x) => x.word === state.lastWord);
      if (g) lastZone.append(el('div.cf-last__label', { text: 'Dernier essai' }), entryNode(g, true));
    }

    function submit(value) {
      if (state.status !== 'playing') return;
      const word = normalize(value || '');
      if (!word) { toast('Écris un mot'); return; }
      const existing = state.guesses.find((g) => g.word === word);
      if (existing) { toast('Déjà proposé !'); state.lastWord = word; renderLast(); renderHistory(); return; }
      const prevBest = state.guesses.reduce((m, g) => (g.rank != null && g.rank < m ? g.rank : m), Infinity);
      const r = rank.has(word) ? rank.get(word) : null;
      state.guesses.push({ word, rank: r });
      state.lastWord = word;
      if (r === 1) {
        state.found = true;
        state.status = 'win';
        saveGameState(GAME_ID, ctx.dateStr, state);
        renderAll();
        commitResult(); confetti();
        return;
      }
      if (r != null && r < prevBest) {
        toast(r <= 13 ? '🔥 Ça brûle, ton meilleur essai !' : '📈 Ton meilleur essai, tu chauffes !');
      }
      saveGameState(GAME_ID, ctx.dateStr, state);
      renderInput(); renderLast(); renderHistory();
    }

    function reveal() {
      if (state.status !== 'playing') return;
      state.revealed = true;
      state.status = 'lose';
      saveGameState(GAME_ID, ctx.dateStr, state);
      renderAll();
      commitResult();
    }

    function commitResult() {
      if (loadResult(GAME_ID, ctx.dateStr)) return;
      const won = state.status === 'win';
      const g = state.guesses.length;
      const points = won ? (g <= 5 ? 100 : g <= 10 ? 90 : g <= 20 ? 75 : g <= 35 ? 60 : g <= 60 ? 45 : 35) : 0;
      saveResult(GAME_ID, ctx.dateStr, {
        status: won ? 'win' : 'lose', points,
        scoreLabel: won ? `${g} ess.` : '✗',
        share: buildShareText(),
      });
      recordStats(GAME_ID, {
        dateStr: ctx.dateStr, won,
        distKey: won ? bucket(g) : 'X',
        prevDateStr: addDays(ctx.dateStr, -1),
      });
    }

    function bucket(g) {
      if (g <= 5) return '1-5';
      if (g <= 10) return '6-10';
      if (g <= 20) return '11-20';
      if (g <= 40) return '21-40';
      return '40+';
    }

    function buildShareText() {
      const won = state.status === 'win';
      const g = state.guesses.length;
      const tally = { brulant: 0, chaud: 0, tiede: 0, froid: 0 };
      for (const x of state.guesses) tally[bandFor(x.rank).cls]++;
      const head = `lesjeuxauburo · Chaud-Froid n°${ctx.puzzleNumber} — ${won ? `🎯 ${g} essais` : 'abandon'}`;
      const line = `🔥${tally.brulant} 🟠${tally.chaud} 🟡${tally.tiede} 🔵${tally.froid}`;
      return `${head}\n${line}\n${siteUrl()}`;
    }

    function renderEnd() {
      const won = state.status === 'win';
      const message = won
        ? WIN_MESSAGES[(ctx.puzzleNumber + state.guesses.length) % WIN_MESSAGES.length]
        : 'Tu as donné ta langue au chat. Le mot te fait un clin d’œil. 🐱';
      const reveal = el('div.mot-reveal', {}, [
        el('span', { text: 'Le mot secret était ' }),
        el('strong', { text: secret.toUpperCase() }),
      ]);
      clear(endSlot);
      endSlot.append(buildEndPanel({
        won,
        title: won ? `Trouvé en ${state.guesses.length} essai(s)` : 'Abandon',
        message, revealNode: reveal, shareText: buildShareText(),
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderAll() {
      renderInput(); renderLast(); renderHistory();
      if (state.status !== 'playing') renderEnd(); else clear(endSlot);
    }

    renderAll();
    if (state.status === 'playing') {
      if (state.guesses.length === 0) maybeShowHowTo(GAME_ID, HOW_TO);
    } else {
      commitResult();
    }
  },
};
