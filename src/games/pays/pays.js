// Le Pays — type Worldle. Deviner un pays à partir de sa silhouette (SVG issus
// de Natural Earth). Après chaque essai : distance en km, direction (flèche) et
// pourcentage de proximité. 6 essais. Autocomplétion des noms en français.

import { PAYS } from './data.js';
import { pickForDay } from '../../core/rng.js';
import { scheduledPuzzle } from '../../core/schedule.js';
import { addDays } from '../../core/date.js';
import { el, clear } from '../../core/dom.js';
import { loadGameState, saveGameState, loadResult, saveResult, recordStats } from '../../core/storage.js';
import { toast, confetti } from '../../ui/effects.js';
import { buildEndPanel } from '../../ui/endpanel.js';
import { maybeShowHowTo, howToButton } from '../../ui/howto.js';
import { siteUrl } from '../../core/share.js';

const GAME_ID = 'pays';
const MAX_TRIES = 6;
const MAX_DIST = 20000; // km, ~ antipode
const DIRS = [
  { emoji: '⬆️', name: 'nord' }, { emoji: '↗️', name: 'nord-est' },
  { emoji: '➡️', name: 'est' }, { emoji: '↘️', name: 'sud-est' },
  { emoji: '⬇️', name: 'sud' }, { emoji: '↙️', name: 'sud-ouest' },
  { emoji: '⬅️', name: 'ouest' }, { emoji: '↖️', name: 'nord-ouest' },
];

const HOW_TO = {
  title: '🗺️ Le Pays — comment jouer',
  html: `
    <p>Devine le <strong>pays du jour</strong> d'après sa <strong>silhouette</strong>, en <strong>6 essais</strong>.</p>
    <p>Après chaque proposition, tu obtiens :</p>
    <ul class="howto-legend">
      <li>📏 la <strong>distance</strong> jusqu'au bon pays</li>
      <li>🧭 la <strong>direction</strong> à suivre (flèche)</li>
      <li>🎯 un <strong>pourcentage de proximité</strong></li>
    </ul>
    <p>Tape les premières lettres : l'autocomplétion propose les pays. Silhouette du jour identique pour tout le bureau. 🌍</p>
  `,
};

const WIN_MESSAGES = [
  'Géographe de génie ! 🌍',
  'Pays localisé — le GPS peut aller se rhabiller. 🛰️',
  'Bravo, grand voyageur du open space ! ✈️',
  'Trouvé ! Prochaine étape : la machine à café. ☕',
];
const WIN_ONE_SHOT = 'Du premier coup ?! Tu as vécu là-bas ou quoi ? 🤯';
const LOSE_MESSAGES = [
  'Perdu dans la géographie… ça arrive aux meilleurs. 🧭',
  'Raté ! Ce pays gardait bien son secret. 🗺️',
  'Pas trouvé — révise ton atlas ce soir. 📚',
];

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, ' ').trim();
}

function haversine(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearing(a, b) {
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function dirFor(a, b) {
  const idx = Math.round(bearing(a, b) / 45) % 8;
  return DIRS[idx];
}

function findCountry(input) {
  const q = normalize(input);
  if (!q) return null;
  // 1. correspondance exacte (nom ou alias)
  const exact = PAYS.find((p) => p.a.includes(q) || normalize(p.n) === q);
  if (exact) return exact;
  // 2. préfixe unique
  const pref = PAYS.filter((p) => normalize(p.n).startsWith(q) || p.a.some((a) => a.startsWith(q)));
  if (pref.length === 1) return pref[0];
  // 3. mot entier présent dans le nom ou un alias, si sans ambiguïté
  //    (ex : « chine » dans « République populaire de Chine » ; « corée » reste ambigu)
  if (q.length >= 3) {
    const word = PAYS.filter((p) => {
      const tokens = new Set([...normalize(p.n).split(' '), ...p.a.flatMap((a) => a.split(' '))]);
      return tokens.has(q);
    });
    if (word.length === 1) return word[0];
  }
  return null;
}

function todaysCountry(dayNumber, dateStr) {
  const publie = scheduledPuzzle(GAME_ID, dateStr);
  if (publie) return publie;
  const answers = PAYS.filter((p) => p.d);
  const idx = pickForDay(answers.length, dayNumber, GAME_ID);
  return answers[idx];
}

export default {
  id: GAME_ID,
  name: 'Le Pays',

  mount(view, ctx) {
    const answer = todaysCountry(ctx.dayNumber, ctx.dateStr);
    let state = loadGameState(GAME_ID, ctx.dateStr) || { guesses: [], status: 'playing' };

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: 'Le Pays' }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · quelle est cette silhouette ?` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    // Silhouette
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `-4 -4 ${answer.vw + 8} ${answer.vh + 8}`);
    svg.setAttribute('class', 'pays-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Silhouette du pays à deviner');
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', answer.d);
    path.setAttribute('class', 'pays-shape');
    svg.append(path);
    const silhouetteBox = el('div.pays-silhouette', {}, [svg]);
    view.append(silhouetteBox);

    const inputZone = el('div.pays-inputzone');
    const guessesBox = el('div.pays-guesses');
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });

    // Datalist d'autocomplétion (une fois).
    const listId = 'pays-datalist';
    const datalist = el('datalist', { id: listId });
    for (const p of PAYS) datalist.append(el('option', { value: p.n }));

    view.append(datalist, inputZone, guessesBox, endSlot);
    const liveMsg = el('div.sr-only', { 'aria-live': 'assertive' });
    view.append(liveMsg);

    function renderInput() {
      clear(inputZone);
      if (state.status !== 'playing') return;
      const input = el('input.pays-input', {
        type: 'text', placeholder: 'Nom du pays…', 'aria-label': 'Ta proposition de pays',
        list: listId, autocomplete: 'off', maxlength: '40',
      });
      const form = el('form.pays-form', {
        onSubmit: (e) => { e.preventDefault(); submit(input.value); input.value = ''; input.focus(); },
      }, [input, el('button.btn.btn--primary', { type: 'submit', text: 'Deviner' })]);
      inputZone.append(form, el('p.pays-count', { text: `${state.guesses.length}/${MAX_TRIES} essais` }));
      input.focus();
    }

    function proximityPct(dist) {
      return Math.max(0, Math.round(100 * (1 - dist / MAX_DIST)));
    }

    function renderGuesses() {
      clear(guessesBox);
      for (const g of state.guesses) {
        const correct = g.code === answer.c;
        guessesBox.append(el('div.pays-guess', { 'data-correct': correct ? '1' : '0' }, [
          el('span.pays-guess__name', { text: g.name }),
          el('span.pays-guess__dist', { text: correct ? '0 km' : `${g.dist.toLocaleString('fr-FR')} km` }),
          el('span.pays-guess__dir', { 'aria-label': correct ? 'trouvé' : `direction ${g.dirName}`, text: correct ? '🎉' : g.dir }),
          el('span.pays-guess__pct', { text: `${g.pct}%` }),
        ]));
      }
      // lignes vides restantes
      for (let i = state.guesses.length; i < MAX_TRIES && state.status === 'playing'; i++) {
        guessesBox.append(el('div.pays-guess.pays-guess--empty', {}, [el('span', { text: '·' })]));
      }
    }

    function submit(value) {
      if (state.status !== 'playing') return;
      const country = findCountry(value);
      if (!country) { toast('Pays inconnu — utilise la liste'); return; }
      if (state.guesses.some((g) => g.code === country.code)) { toast('Déjà proposé !'); return; }
      const dist = Math.round(haversine(country, answer));
      const correct = country.c === answer.c;
      const d = correct ? { emoji: '🎉', name: 'ici' } : dirFor(country, answer);
      state.guesses.push({
        code: country.c, name: country.n, dist,
        dir: d.emoji, dirName: d.name, pct: proximityPct(dist),
      });
      if (correct) state.status = 'win';
      else if (state.guesses.length >= MAX_TRIES) state.status = 'lose';
      saveGameState(GAME_ID, ctx.dateStr, state);
      liveMsg.textContent = correct ? `Trouvé : ${answer.n}` : `${country.n} : ${dist} km, ${d.name}`;
      renderInput(); renderGuesses();
      if (state.status !== 'playing') finish();
    }

    function buildShareText() {
      const won = state.status === 'win';
      const score = won ? `${state.guesses.length}/${MAX_TRIES}` : `X/${MAX_TRIES}`;
      const header = `lesjeuxauburo · Le Pays n°${ctx.puzzleNumber} — ${score}`;
      const rows = state.guesses.map((g) => {
        if (g.code === answer.c) return '🟩🟩🟩🟩🟩🎉';
        const filled = Math.round(g.pct / 20);
        return '🟩'.repeat(filled) + '⬜'.repeat(5 - filled) + g.dir;
      });
      return `${header}\n${rows.join('\n')}\n${siteUrl()}`;
    }

    function finish() {
      const won = state.status === 'win';
      if (!loadResult(GAME_ID, ctx.dateStr)) {
        const tries = state.guesses.length;
        const points = won ? Math.round((100 * (MAX_TRIES - tries + 1)) / MAX_TRIES) : 0;
        saveResult(GAME_ID, ctx.dateStr, {
          status: won ? 'win' : 'lose', tries: won ? tries : null,
          points, scoreLabel: won ? `${tries}/${MAX_TRIES}` : `X/${MAX_TRIES}`,
          share: buildShareText(),
        });
        recordStats(GAME_ID, {
          dateStr: ctx.dateStr, won,
          distKey: won ? String(tries) : 'X', prevDateStr: addDays(ctx.dateStr, -1),
        });
      }
      renderEnd();
      if (won) confetti();
    }

    function renderEnd() {
      const won = state.status === 'win';
      let message;
      if (won && state.guesses.length === 1) message = WIN_ONE_SHOT;
      else if (won) message = WIN_MESSAGES[(ctx.puzzleNumber + state.guesses.length) % WIN_MESSAGES.length];
      else message = LOSE_MESSAGES[ctx.puzzleNumber % LOSE_MESSAGES.length];
      const reveal = el('div.mot-reveal', {}, [
        el('span', { text: 'Le pays était ' }), el('strong', { text: answer.n }),
      ]);
      clear(endSlot);
      endSlot.append(buildEndPanel({
        gameId: GAME_ID,
        won,
        title: won ? `Trouvé en ${state.guesses.length}/${MAX_TRIES}` : 'Perdu',
        message, revealNode: reveal, shareText: buildShareText(),
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    renderInput(); renderGuesses();
    if (state.status !== 'playing') finish();
    else if (state.guesses.length === 0) maybeShowHowTo(GAME_ID, HOW_TO);
  },
};
