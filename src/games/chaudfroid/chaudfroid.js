// Chaud-Froid — deviner le mot secret du jour. Chaque proposition reçoit un
// score de proximité sémantique (froid / tiède / chaud / brûlant + un rang),
// pré-calculé par familles thématiques. Essais illimités, historique trié.

import {
  CHAUDFROID_BANK, CF_CATEGORIES, CF_DOMAINS, CF_RELATED, CF_FILLER, CF_LIST_SIZE,
} from './data.js';
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
    <p>Le jeu reconnaît quelques milliers de <strong>noms communs</strong>, mais il
    ne sait situer que ceux de ses propres thèmes. Hors de là, il répond
    <strong>« hors thème »</strong> sans donner de température : il préfère avouer
    qu'il ne sait pas plutôt que t'annoncer « froid » sur un mot qui brûlait.
    Un mot qu'il ne connaît pas du tout est refusé.</p>
  `,
};

// Température affichée : -20° (glacial) à 99° (tout proche).
//
// L'échelle ne court que sur les cercles sémantiques. Au-delà, la liste est
// classée par ordre **alphabétique** : y étaler un dégradé donnerait au joueur
// un signal qui n'existe pas — « abricot » ne serait pas plus proche de
// « moto » que « zèbre ». Tous ces mots partagent donc le même -20°, ce qui est
// la seule chose vraie qu'on puisse en dire.
export const CF_CAP = CF_LIST_SIZE; // fin des cercles utiles
export function tempFor(rank) {
  // `null` plutôt que −20 : hors des cercles, le jeu n'a pas de thermomètre à
  // proposer. L'affichage montre alors le palier, sans degré inventé.
  if (rank == null || rank > CF_CAP) return null;
  const t = Math.round(99 - (rank - 2) * (114 / (CF_CAP - 2)));
  return Math.max(-15, Math.min(99, t));
}

// Les paliers se lisent sur la **température**, pas sur le rang.
//
// Les deux étaient réglés séparément, et ils se contredisaient : le rang 131
// sortait « 🔵 Froid » avec 53° affichés à côté. Une seule échelle, dérivée du
// thermomètre, rend la contradiction impossible.
const BANDS = [
  { name: 'Brûlant', emoji: '🔥', cls: 'brulant', min: 90 },
  { name: 'Chaud', emoji: '🟠', cls: 'chaud', min: 70 },
  { name: 'Tiède', emoji: '🟡', cls: 'tiede', min: 35 },
  { name: 'Froid', emoji: '🔵', cls: 'froid', min: -Infinity },
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

// La connaissance du jeu s'arrête aux cercles sémantiques.
//
// Au-delà, il **reconnaît** le mot — il est dans son vocabulaire — mais il ne
// sait pas le situer : l'ordre y est alphabétique. Lui coller « froid −20° »
// serait une affirmation qu'il ne peut pas soutenir, et parfois fausse :
// « bicyclette » n'est pas loin de « moto », le jeu ne sait simplement pas les
// rapprocher. Le joueur, lui, en conclurait qu'il fait fausse route.
//
// On l'annonce donc « hors thème », sans température. Moins satisfaisant qu'un
// chiffre, mais c'est la seule chose vraie — et surtout ça n'écarte personne
// d'une piste qui était la bonne.
const HORS_THEME = { name: 'Hors thème', emoji: '❔', cls: 'inconnu', rank: '—' };

export function bandFor(rank) {
  if (rank == null || rank > CF_CAP) return { ...HORS_THEME };
  const t = tempFor(rank);
  for (const b of BANDS) if (t >= b.min) return { ...b, rank };
  return { ...BANDS[BANDS.length - 1], rank };
}

export function proximityPct(rank) {
  if (rank == null || rank > CF_CAP) return 0;
  return Math.max(3, Math.round(100 * (1 - (rank - 1) / 300)));
}

// Domaine de chaque catégorie, déduit de CF_DOMAINS.
const DOMAIN_OF = {};
for (const [domain, names] of Object.entries(CF_DOMAINS)) {
  for (const name of names) DOMAIN_OF[name] = domain;
}

// Tout ce que le jeu sait nommer : les mots des catégories et le remplissage.
// Sert à distinguer « loin » de « inconnu » — sans cette liste, les deux se
// confondent, et le joueur n'a plus aucun signal.
export const VOCABULAIRE = [...new Set([
  ...Object.values(CF_CATEGORIES).flat(),
  ...CF_FILLER,
])].sort();

// Reconstruit la liste de voisins d'un secret, du plus proche au plus lointain.
// L'ordre des cercles doit rester IDENTIQUE à celui du portage Swift : mêmes
// tris, mêmes cercles, même remplissage.
export function buildNeighbours(secret) {
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

  // Au-delà des cercles utiles, le reste du vocabulaire par ordre
  // alphabétique. Ces mots-là sont loin — la température le dira — mais le jeu
  // les **connaît**, et c'est toute la différence : les tronquer les renvoyait
  // dans le même sac que les mots qu'il ignore.
  for (const w of VOCABULAIRE) add(w);
  return ordered;
}

function todaysSecret(dayNumber, dateStr) {
  // Les voisins sont reconstruits ici, jamais transportés : ce serait des
  // méga-octets pour rien, et l'algorithme est le même des deux côtés.
  const encode = scheduledPuzzle(GAME_ID, dateStr)
    ?? CHAUDFROID_BANK[pickForDay(CHAUDFROID_BANK.length, dayNumber, GAME_ID)];
  const secret = deobf(encode);
  const list = buildNeighbours(secret);
  const rank = new Map();
  list.forEach((w, i) => rank.set(w, i + 1));
  return { secret, rank };
}

export default {
  id: GAME_ID,
  name: 'Chaud-Froid',

  mount(view, ctx) {
    const { secret, rank } = todaysSecret(ctx.dayNumber, ctx.dateStr);
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
          // Pas de degré hors des cercles : le palier suffit à dire ce
          // que le jeu sait, c'est-à-dire rien de précis.
          el('span.cf-entry__rank', {
            text: tempFor(g.rank) == null ? '' : `${tempFor(g.rank)}°`,
          }),
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

      // Un mot hors vocabulaire est refusé plutôt que noté −20°. Les essais
      // sont illimités : refuser ne coûte rien au joueur, alors que lui
      // répondre « froid » lui ment sur la direction à prendre.
      if (!rank.has(word)) {
        toast('Ce mot n’est pas dans le jeu — essaie un nom commun courant');
        return;
      }

      const prevBest = state.guesses.reduce((m, g) => (g.rank != null && g.rank < m ? g.rank : m), Infinity);
      const r = rank.get(word);
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
        gameId: GAME_ID,
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
