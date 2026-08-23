// Les Allumettes — une équation FAUSSE est dessinée en allumettes. Il faut la
// rendre VRAIE en déplaçant exactement N allumettes (retirer N, reposer N — le
// total est conservé). On clique une allumette pour la retirer, un emplacement
// vide pour en poser une.

import { ALLUMETTES_BANK } from './data.js';
import { pickForDay } from '../../core/rng.js';
import { scheduledPuzzle } from '../../core/schedule.js';
import { addDays } from '../../core/date.js';
import { el, clear } from '../../core/dom.js';
import { loadGameState, saveGameState, loadResult, saveResult, recordStats } from '../../core/storage.js';
import { toast, confetti } from '../../ui/effects.js';
import { buildEndPanel } from '../../ui/endpanel.js';
import { maybeShowHowTo, howToButton } from '../../ui/howto.js';
import { siteUrl } from '../../core/share.js';

const GAME_ID = 'allumettes';
const SVGNS = 'http://www.w3.org/2000/svg';

// Segments d'un 7-segments (a haut, b h-droite, c b-droite, d bas, e b-gauche,
// f h-gauche, g milieu) et de l'opérateur +/- (h horizontal, v vertical).
const DIGIT_SEGS = {
  0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc',
  5: 'afgcd', 6: 'afgecd', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
};
const OP_SEGS = { '+': 'hv', '-': 'h' };

const REV_DIGIT = {};
for (const [d, s] of Object.entries(DIGIT_SEGS)) REV_DIGIT[keyOf(s)] = d;
const REV_OP = {};
for (const [o, s] of Object.entries(OP_SEGS)) REV_OP[keyOf(s)] = o;

function keyOf(segs) { return [...segs].sort().join(''); }

// Géométrie des allumettes (rect x,y,w,h) par segment, selon le type de cellule.
const GEO = {
  digit: {
    vb: [0, 0, 50, 92],
    a: [10, 3, 30, 9], f: [3, 10, 9, 30], b: [38, 10, 9, 30], g: [10, 41, 30, 9],
    e: [3, 49, 9, 30], c: [38, 49, 9, 30], d: [10, 80, 30, 9],
  },
  op: { vb: [0, 0, 40, 92], h: [5, 41, 30, 9], v: [16, 26, 9, 40] },
  eq: { vb: [0, 0, 40, 92], t: [5, 31, 30, 9], b: [5, 55, 30, 9] },
};

// Écran tactile : le pointeur est « grossier ». On adapte alors la visée et la
// taille du plateau, sans rien changer à l'expérience à la souris.
const COARSE_POINTER = typeof window !== 'undefined'
  && window.matchMedia?.('(pointer: coarse)').matches === true;

/** Distance d'un point à un rectangle (0 s'il est dedans). */
function distanceToRect(px, py, [x, y, w, h]) {
  const dx = Math.max(x - px, 0, px - (x + w));
  const dy = Math.max(y - py, 0, py - (y + h));
  return Math.hypot(dx, dy);
}

/** Segment le plus proche du point touché, dans le repère du SVG. */
function nearestSegment(svg, geo, event) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const { x, y } = point.matrixTransform(ctm.inverse());

  let best = null;
  let bestDistance = Infinity;
  for (const [seg, rect] of Object.entries(geo)) {
    if (seg === 'vb') continue;
    const distance = distanceToRect(x, y, rect);
    if (distance < bestDistance) { bestDistance = distance; best = seg; }
  }
  return best;
}

const HOW_TO = {
  title: '🔥 Les Allumettes — comment jouer',
  html: `
    <p>L'équation est dessinée en <strong>allumettes</strong> et elle est <strong>fausse</strong>.</p>
    <p>Rends-la <strong>vraie</strong> en <strong>déplaçant</strong> le nombre d'allumettes indiqué : clique une allumette pour la <strong>retirer</strong>, un emplacement vide (en pointillés) pour en <strong>poser</strong> une.</p>
    <p>« Déplacer » = tu dois en retirer autant que tu en reposes : le <strong>nombre total d'allumettes ne change pas</strong>.</p>
    <p>Astuce : un <strong>+</strong> devient un <strong>−</strong> en retirant sa barre verticale. 😉</p>
  `,
};

const WIN_MESSAGES = [
  'Étincelant ! L’équation est rétablie. ✨',
  'Bien vu — pas besoin d’allumer le feu au bureau. 🔥',
  'Allumette bien placée, calcul sauvé ! 🧮',
  'Résolu ! Ton QI vient de prendre un café. ☕',
];
const LOSE_MESSAGE = 'Tu as soufflé sur l’allumette… Voici une solution. 💨';

function parseStart(str) {
  const cells = [];
  for (const ch of str) {
    if (ch === '=') cells.push({ type: 'eq', char: '=', active: new Set('tb'), locked: true });
    else if (ch === '+' || ch === '-') cells.push({ type: 'op', char: ch, active: new Set(OP_SEGS[ch]) });
    else cells.push({ type: 'digit', char: ch, active: new Set(DIGIT_SEGS[ch]) });
  }
  return cells;
}

function recognize(cell) {
  if (cell.type === 'eq') return '=';
  const k = keyOf(cell.active);
  if (cell.type === 'digit') return REV_DIGIT[k] ?? null;
  return REV_OP[k] ?? null;
}

// Évalue "nombre op nombre = nombre" à partir des chiffres reconnus.
function evaluateCells(cells) {
  let leftNum = ''; let op = null; let rightNum = ''; let seenEq = false; let firstNum = '';
  for (const cell of cells) {
    const c = recognize(cell);
    if (c === null) return { ok: false, valid: false };
    if (c === '=') { seenEq = true; continue; }
    if (c === '+' || c === '-') {
      if (seenEq || op) return { ok: false, valid: false };
      op = c; firstNum = leftNum; leftNum = '';
      continue;
    }
    if (seenEq) rightNum += c; else leftNum += c;
  }
  if (op === null || !seenEq || firstNum === '' || leftNum === '' || rightNum === '') return { ok: false, valid: false };
  const a = parseInt(firstNum, 10); const b = parseInt(leftNum, 10); const r = parseInt(rightNum, 10);
  const val = op === '+' ? a + b : a - b;
  return { ok: val === r, valid: true, str: `${firstNum}${op}${leftNum}=${rightNum}` };
}

function movesFrom(startCells, cells) {
  let added = 0; let removed = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].locked) continue;
    const start = startCells[i].active; const cur = cells[i].active;
    for (const s of cur) if (!start.has(s)) added++;
    for (const s of start) if (!cur.has(s)) removed++;
  }
  return { added, removed };
}

// Cherche une solution (même forme, même nb d'allumettes, N déplacements, vraie).
function solve(startCells, need) {
  const idxDigits = []; const idxOp = [];
  startCells.forEach((c, i) => { if (c.type === 'digit') idxDigits.push(i); else if (c.type === 'op') idxOp.push(i); });
  const startSticks = startCells.reduce((s, c) => s + c.active.size, 0);
  const digitChoices = '0123456789'.split('');
  const opIdx = idxOp[0];
  let best = null;
  const rec = (pos, assign) => {
    if (best) return;
    if (pos === idxDigits.length) {
      for (const opc of ['+', '-']) {
        const cells = startCells.map((c) => ({ ...c, active: new Set(c.active) }));
        idxDigits.forEach((ci, k) => { cells[ci] = { type: 'digit', char: assign[k], active: new Set(DIGIT_SEGS[assign[k]]) }; });
        cells[opIdx] = { type: 'op', char: opc, active: new Set(OP_SEGS[opc]) };
        const sticks = cells.reduce((s, c) => s + c.active.size, 0);
        if (sticks !== startSticks) continue;
        const ev = evaluateCells(cells);
        if (!ev.valid || !ev.ok) continue;
        // pas de zéro inutile en tête (multi-chiffres)
        if (/(^|[+\-=])0\d/.test(ev.str)) continue;
        const mv = movesFrom(startCells, cells);
        if (mv.added === mv.removed && mv.added === need) { best = ev.str; return; }
      }
      return;
    }
    for (const d of digitChoices) { assign[pos] = d; rec(pos + 1, assign); if (best) return; }
  };
  rec(0, []);
  return best;
}

function todaysPuzzle(dayNumber, dateStr) {
  const publie = scheduledPuzzle(GAME_ID, dateStr);
  if (publie) return publie;
  const idx = pickForDay(ALLUMETTES_BANK.length, dayNumber, GAME_ID);
  return ALLUMETTES_BANK[idx];
}

export default {
  id: GAME_ID,
  name: 'Les Allumettes',

  mount(view, ctx) {
    const puzzle = todaysPuzzle(ctx.dayNumber, ctx.dateStr);
    const need = puzzle.n;
    const startCells = parseStart(puzzle.e);

    let saved = loadGameState(GAME_ID, ctx.dateStr);
    let cells;
    if (saved && Array.isArray(saved.cells) && saved.cells.length === startCells.length) {
      cells = startCells.map((c, i) => ({ ...c, active: new Set(saved.cells[i]) }));
    } else {
      cells = startCells.map((c) => ({ ...c, active: new Set(c.active) }));
      saved = { status: 'playing', usedHint: false };
    }
    let status = saved.status || 'playing';
    let usedHint = !!saved.usedHint;

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: 'Les Allumettes' }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · déplace ${need} allumette${need > 1 ? 's' : ''}` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    const instruction = el('p.allu-instruction', {
      text: `Déplace ${need} allumette${need > 1 ? 's' : ''} pour rendre l'équation vraie.`,
    });
    const boardEl = el('div.allu-board', { role: 'group', 'aria-label': 'Équation en allumettes' });
    const statusEl = el('p.allu-status', { 'aria-live': 'polite' });
    const controls = el('div.allu-controls');
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    view.append(instruction, boardEl, statusEl, controls, endSlot);

    function persist() {
      saveGameState(GAME_ID, ctx.dateStr, {
        cells: cells.map((c) => [...c.active]), status, usedHint,
      });
    }

    function toggleSeg(cell, seg) {
      if (status !== 'playing' || cell.locked) return;
      if (cell.active.has(seg)) cell.active.delete(seg); else cell.active.add(seg);
      persist();
      renderBoard(); renderStatus();
      checkWin();
    }

    function makeCellSvg(cell, ci) {
      const geo = GEO[cell.type];
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', geo.vb.join(' '));
      svg.setAttribute('class', `allu-cell allu-cell--${cell.type}`);
      const playable = !cell.locked && status === 'playing';

      // Au doigt, une allumette ne mesure que quelques millimètres : viser
      // juste est impossible. On accepte donc le toucher n'importe où dans la
      // case et on agit sur l'allumette la plus proche. À la souris, on garde
      // le clic exact, qui marche déjà très bien.
      if (playable && COARSE_POINTER) {
        svg.addEventListener('click', (e) => {
          const seg = nearestSegment(svg, geo, e);
          if (seg) toggleSeg(cell, seg);
        });
      }

      for (const [seg, rect] of Object.entries(geo)) {
        if (seg === 'vb') continue;
        const on = cell.active.has(seg);
        const r = document.createElementNS(SVGNS, 'rect');
        const [x, y, w, h] = rect;
        r.setAttribute('x', x); r.setAttribute('y', y);
        r.setAttribute('width', w); r.setAttribute('height', h);
        r.setAttribute('rx', Math.min(w, h) / 2);
        r.setAttribute('class', `allu-stick ${on ? 'is-on' : 'is-off'}`);
        if (playable) {
          r.setAttribute('tabindex', '0');
          r.setAttribute('role', 'button');
          r.setAttribute('aria-label', on ? 'Allumette posée, cliquer pour la retirer' : 'Emplacement vide, cliquer pour poser une allumette');
          if (!COARSE_POINTER) r.addEventListener('click', () => toggleSeg(cell, seg));
          r.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSeg(cell, seg); } });
        } else {
          r.setAttribute('aria-hidden', 'true');
        }
        svg.append(r);
        if (on) {
          // tête d'allumette (petit rond) à une extrémité
          const head = document.createElementNS(SVGNS, 'circle');
          const horiz = w > h;
          head.setAttribute('cx', horiz ? x + w - h / 2 : x + w / 2);
          head.setAttribute('cy', horiz ? y + h / 2 : y + h - w / 2);
          head.setAttribute('r', (horiz ? h : w) / 2 - 0.5);
          head.setAttribute('class', 'allu-head');
          head.setAttribute('aria-hidden', 'true');
          svg.append(head);
        }
      }
      return svg;
    }

    function renderBoard() {
      clear(boardEl);
      cells.forEach((c, i) => boardEl.append(makeCellSvg(c, i)));
      fitBoard();
    }

    /* Dimensionne les cases pour occuper toute la largeur disponible : une
       équation courte s'affiche donc plus grand qu'une longue, au lieu d'une
       taille unique calculée pour le pire cas. Sur écran tactile on autorise
       nettement plus grand — c'est là que la précision manque. */
    function fitBoard() {
      const style = getComputedStyle(boardEl);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap) || 0;
      const available = boardEl.clientWidth - padding - gap * (cells.length - 1);
      if (available <= 0) return;
      const units = cells.reduce((sum, c) => sum + (c.type === 'digit' ? 50 : 40), 0);
      const height = (available * 92) / units;
      const max = COARSE_POINTER ? 140 : 104;
      boardEl.style.setProperty('--allu-h', `${Math.max(64, Math.min(max, height))}px`);
    }

    function renderStatus() {
      if (status !== 'playing') { statusEl.textContent = ''; return; }
      const mv = movesFrom(startCells, cells);
      const ev = evaluateCells(cells);
      let txt;
      if (mv.added === 0 && mv.removed === 0) txt = `À déplacer : ${need}`;
      else if (mv.added !== mv.removed) {
        const diff = mv.added - mv.removed;
        txt = diff > 0 ? `Repose ${diff} allumette(s) ailleurs (conserve le total)`
          : `Il te manque ${-diff} allumette(s) à reposer`;
      } else if (mv.added !== need) txt = `${mv.added} déplacée(s) — il en faut ${need}`;
      else if (!ev.valid) txt = 'Un chiffre n’est pas lisible…';
      else txt = 'Bien déplacé, mais l’équation est encore fausse';
      statusEl.textContent = txt;
    }

    function checkWin() {
      if (status !== 'playing') return;
      const mv = movesFrom(startCells, cells);
      if (mv.added !== need || mv.removed !== need) return;
      const ev = evaluateCells(cells);
      if (ev.valid && ev.ok) {
        status = 'win'; persist();
        renderBoard(); renderControls(); statusEl.textContent = '';
        commitResult(true); confetti();
      }
    }

    function renderControls() {
      clear(controls);
      if (status !== 'playing') return;
      controls.append(
        el('button.btn.btn--ghost', {
          type: 'button', text: '↺ Réinitialiser',
          onClick: () => {
            cells = startCells.map((c) => ({ ...c, active: new Set(c.active) }));
            persist(); renderBoard(); renderStatus();
          },
        }),
        el('button.btn.btn--ghost', {
          type: 'button', text: 'Donner sa langue au chat 🐱',
          onClick: giveUp,
        }),
      );
    }

    function giveUp() {
      if (status !== 'playing') return;
      const sol = solve(startCells, need);
      usedHint = true;
      status = 'lose';
      // affiche la solution sur le plateau
      if (sol) {
        const solCells = parseStart(sol);
        cells = solCells.map((c) => ({ ...c, active: new Set(c.active) }));
      }
      persist();
      renderBoard(); renderControls();
      commitResult(false, sol);
    }

    function commitResult(won, solStr) {
      if (loadResult(GAME_ID, ctx.dateStr)) { renderEnd(won, solStr); return; }
      const points = won ? (usedHint ? 60 : 100) : 0;
      saveResult(GAME_ID, ctx.dateStr, {
        status: won ? 'win' : 'lose', points,
        scoreLabel: won ? (usedHint ? '✓*' : '✓') : '✗',
        share: buildShareText(won),
      });
      recordStats(GAME_ID, {
        dateStr: ctx.dateStr, won,
        distKey: won ? String(need) : 'X', prevDateStr: addDays(ctx.dateStr, -1),
      });
      renderEnd(won, solStr);
    }

    function buildShareText(won) {
      const head = `lesjeuxauburo · Les Allumettes n°${ctx.puzzleNumber}`;
      const line = won
        ? `✅ Résolu en déplaçant ${need} allumette${need > 1 ? 's' : ''} 🔥${usedHint ? ' (avec indice)' : ''}`
        : '❌ J’ai séché sur celui-là 💨';
      return `${head}\n${line}\n${siteUrl()}`;
    }

    function renderEnd(won, solStr) {
      const message = won ? WIN_MESSAGES[(ctx.puzzleNumber + need) % WIN_MESSAGES.length] : LOSE_MESSAGE;
      const reveal = won ? null : el('div.mot-reveal', {}, [
        el('span', { text: 'Une solution : ' }),
        el('strong', { text: solStr || solve(startCells, need) || '—' }),
      ]);
      clear(endSlot);
      endSlot.append(buildEndPanel({
        won,
        title: won ? 'Équation rétablie !' : 'Pas résolu',
        message, revealNode: reveal, shareText: buildShareText(won),
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    renderBoard(); renderControls();
    if (status !== 'playing') {
      renderEnd(status === 'win', status === 'lose' ? solve(startCells, need) : null);
    } else {
      renderStatus();
      maybeShowHowTo(GAME_ID, HOW_TO);
    }

    // Rotation de l'écran, fenêtre redimensionnée, plateau enfin visible : on
    // observe la largeur réelle plutôt que celle de la fenêtre. On ignore les
    // changements de hauteur, que fitBoard provoque lui-même — sinon boucle.
    let lastWidth = 0;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width === lastWidth) return;
      lastWidth = width;
      fitBoard();
    });
    observer.observe(boardEl);
    return () => observer.disconnect();
  },
};
