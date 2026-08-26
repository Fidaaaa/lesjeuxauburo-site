// L'Évasion — casse-tête de blocs coulissants (type Klotski / « Piège final »).
// Chaque bloc est un OBJET DE BUREAU d'une seule pièce (formes variées : L, T,
// croix…) qu'on fait glisser pour amener la tasse ☕ jusqu'à la sortie 🚪.
// Terrains parfois troués (cases bloquées « murs »).

import { EVASION_BANK } from './data.js';
import { baliser } from '../../core/balises.js';
import { pickForDay } from '../../core/rng.js';
import { scheduledPuzzle } from '../../core/schedule.js';
import { addDays } from '../../core/date.js';
import { el, clear } from '../../core/dom.js';
import { loadGameState, saveGameState, loadResult, saveResult, recordStats } from '../../core/storage.js';
import { toast, confetti } from '../../ui/effects.js';
import { buildEndPanel } from '../../ui/endpanel.js';
import { maybeShowHowTo, howToButton } from '../../ui/howto.js';
import { SPRITES, DULL_SPRITES } from './sprites.js';
import { PNG_SPRITES } from './sprite_manifest.js';
import { siteUrl } from '../../core/share.js';

const GAME_ID = 'evasion';
const SVGNS = 'http://www.w3.org/2000/svg';
// Blocs « ternes » (gris/taupe désaturés) — le café doit ressortir.
const DULL_COLORS = ['#a9adb4', '#b0aaa2', '#a3abb2', '#aca6ac', '#a7afa9', '#b2aca3'];
const COFFEE_COLOR = '#ef7d3a'; // café : couleur chaude qui se démarque

const HOW_TO = {
  title: '🚪 L\'Évasion — comment jouer',
  html: `
    <p>Dans cet open space, amène le <strong>café ☕</strong> (le bloc coloré) jusqu'à la <strong>zone verte « Arrivée »</strong>, pour filer en pause.</p>
    <p>Fais <strong>glisser les objets de bureau</strong> (dossiers, cartons, imprimante… aux formes variées : L, T, croix) d'une case à la fois vers les espaces libres. Ils ne tournent pas. Les cases <strong>hachurées</strong> sont des murs.</p>
    <p><strong>Sélectionne</strong> un bloc (clic), puis déplace-le avec les <strong>flèches</strong> (écran ou clavier), ou <strong>fais-le glisser</strong> directement.</p>
    <p>Vrai casse-tête : le nombre de coups « au mieux » est indiqué. 💪</p>
  `,
};

const WIN_MESSAGES = [
  'Évadé ! La pause café est méritée. ☕',
  'Sortie atteinte — liberté ! 🕊️',
  'Bloc par bloc, tu t’en es sorti. Chapeau. 🎩',
  'Casse-tête plié. Ton cerveau a bien chauffé. 🔥',
];

function shapeSig(cells) {
  const r0 = Math.min(...cells.map((x) => x[0]));
  const c0 = Math.min(...cells.map((x) => x[1]));
  return cells.map(([r, c]) => `${r - r0},${c - c0}`).sort().join(' ');
}

// Contour (polygone sur la grille) de l'union des cases d'une pièce, en
// coordonnées locales (cellules). Suppose une pièce sans « trou ».
function outline(cells) {
  const minR = Math.min(...cells.map((c) => c[0]));
  const minC = Math.min(...cells.map((c) => c[1]));
  const local = cells.map(([r, c]) => [r - minR, c - minC]);
  const lset = new Set(local.map(([r, c]) => `${r},${c}`));
  const has = (r, c) => lset.has(`${r},${c}`);
  const edges = new Map(); // "x,y" (départ) -> [x,y] (arrivée)
  const add = (x1, y1, x2, y2) => edges.set(`${x1},${y1}`, [x2, y2]);
  for (const [r, c] of local) {
    if (!has(r - 1, c)) add(c, r, c + 1, r);         // haut : gauche->droite
    if (!has(r, c + 1)) add(c + 1, r, c + 1, r + 1); // droite : haut->bas
    if (!has(r + 1, c)) add(c + 1, r + 1, c, r + 1); // bas : droite->gauche
    if (!has(r, c - 1)) add(c, r + 1, c, r);         // gauche : bas->haut
  }
  const startKey = edges.keys().next().value;
  const [sx, sy] = startKey.split(',').map(Number);
  const pts = [[sx, sy]];
  let cur = startKey;
  for (let i = 0; i < 4000; i++) {
    const nxt = edges.get(cur);
    if (!nxt) break;
    pts.push(nxt);
    cur = `${nxt[0]},${nxt[1]}`;
    if (cur === startKey) break;
  }
  const w = Math.max(...local.map((c) => c[1])) + 1;
  const h = Math.max(...local.map((c) => c[0])) + 1;
  return { pts, w, h, minR, minC };
}

function parsePuzzle(p) {
  const rows = p.g.split('|').map((r) => r.split(''));
  const R = rows.length; const C = rows[0].length;
  const blocked = [];
  const cellsById = {};
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const ch = rows[r][c];
    if (ch === '#') blocked.push([r, c]);
    else if (ch !== '.') (cellsById[ch] = cellsById[ch] || []).push([r, c]);
  }
  let ci = 0; let oi = 0;
  const pieces = Object.entries(cellsById).map(([id, cells]) => {
    const target = id === p.t;
    return {
      id, cells: cells.map(([r, c]) => [r, c]), target,
      color: target ? COFFEE_COLOR : DULL_COLORS[ci++ % DULL_COLORS.length],
      sprite: target ? 'coffee' : DULL_SPRITES[oi++ % DULL_SPRITES.length],
    };
  });
  const goal = p.gc.split(';').map((s) => s.split(',').map(Number));
  return { R, C, blocked, pieces, goal, target: p.t };
}

function todaysPuzzle(dayNumber, dateStr) {
  return scheduledPuzzle(GAME_ID, dateStr)
    ?? EVASION_BANK[pickForDay(EVASION_BANK.length, dayNumber, GAME_ID)];
}

export default {
  id: GAME_ID,
  name: 'L\'Évasion',

  mount(view, ctx) {
    const raw = todaysPuzzle(ctx.dayNumber, ctx.dateStr);
    const par = raw.m;
    const puz = parsePuzzle(raw);
    const { R, C, blocked, goal } = puz;
    const goalSet = new Set(goal.map(([r, c]) => `${r},${c}`));

    let pieces = puz.pieces.map((p) => ({ ...p, cells: p.cells.map((x) => x.slice()) }));
    let moves = 0; let status = 'playing'; let selected = null;

    const saved = loadGameState(GAME_ID, ctx.dateStr);
    if (saved && saved.cells) {
      for (const p of pieces) if (saved.cells[p.id]) p.cells = saved.cells[p.id].map((x) => x.slice());
      moves = saved.moves || 0; status = saved.status || 'playing';
    }

    clear(view);
    view.append(el('div.game-head', {}, [
      el('div.game-head__titles', {}, [
        el('h1.game-title', { text: 'L\'Évasion' }),
        el('p.game-sub', { text: `n°${ctx.puzzleNumber} · au mieux en ${par} coups` }),
      ]),
      howToButton(GAME_ID, HOW_TO),
    ]));

    const boardWrap = el('div.evasion-wrap');
    const board = el('div.evasion-board', { role: 'group', 'aria-label': 'Plateau de blocs coulissants' });
    board.style.setProperty('--cols', C);
    board.style.setProperty('--rows', R);
    board.style.width = 'calc(var(--cell) * var(--cols))';
    board.style.height = 'calc(var(--cell) * var(--rows))';
    boardWrap.append(board);
    const counter = el('p.evasion-counter', { 'aria-live': 'polite' });
    const dpad = el('div.evasion-dpad');
    const controls = el('div.allu-controls');
    const endSlot = el('div.end-slot', { 'aria-live': 'polite' });
    const hint = el('p.evasion-goalhint', { text: '🎯 Amène le café dans la zone verte en faisant glisser les blocs.' });
    view.append(hint, boardWrap, counter, dpad, controls, endSlot);

    function occupied(exceptId) {
      const set = new Set(blocked.map(([r, c]) => `${r},${c}`));
      for (const p of pieces) { if (p.id === exceptId) continue; for (const [r, c] of p.cells) set.add(`${r},${c}`); }
      return set;
    }
    function canMove(p, dr, dc) {
      const occ = occupied(p.id);
      for (const [r, c] of p.cells) {
        const nr = r + dr; const nc = c + dc;
        if (nr < 0 || nr >= R || nc < 0 || nc >= C) return false;
        if (occ.has(`${nr},${nc}`)) return false;
      }
      return true;
    }
    // Nombre de cases libres devant la pièce dans une direction (pour le glissé).
    function maxSteps(p, dr, dc) {
      const occ = occupied(p.id);
      let k = 0;
      for (let step = 1; step <= Math.max(R, C); step++) {
        let ok = true;
        for (const [r, c] of p.cells) {
          const nr = r + dr * step; const nc = c + dc * step;
          if (nr < 0 || nr >= R || nc < 0 || nc >= C || occ.has(`${nr},${nc}`)) { ok = false; break; }
        }
        if (!ok) break;
        k = step;
      }
      return k;
    }
    function isSolved() {
      const t = pieces.find((p) => p.target);
      return t.cells.length === goalSet.size && t.cells.every(([r, c]) => goalSet.has(`${r},${c}`));
    }
    function persist() {
      const cells = {};
      for (const p of pieces) cells[p.id] = p.cells;
      saveGameState(GAME_ID, ctx.dateStr, { cells, moves, status });
    }
    function applyMove(p, dr, dc) { p.cells = p.cells.map(([r, c]) => [r + dr, c + dc]); }
    function doMove(p, dr, dc) {
      if (status !== 'playing' || !canMove(p, dr, dc)) return false;
      applyMove(p, dr, dc); moves += 1; persist(); layout(); renderCounter();
      if (isSolved()) win();
      return true;
    }
    function slide(p, dr, dc, maxSteps) {
      let n = 0;
      while (n < maxSteps && canMove(p, dr, dc)) { applyMove(p, dr, dc); n++; }
      if (n) { moves += n; persist(); layout(); renderCounter(); if (isSolved()) win(); }
      return n;
    }
    function select(p) { selected = p; layout(); renderCounter(); }

    let dragging = null;

    function makePieceEl(p) {
      const ol = outline(p.cells);
      const svg = document.createElementNS(SVGNS, 'svg');
      svg.setAttribute('class', 'evasion-piece');
      svg.setAttribute('viewBox', `-0.15 -0.15 ${ol.w + 0.3} ${ol.h + 0.3}`);
      svg.dataset.id = p.id;
      if (p.target) svg.dataset.target = '1';
      svg.style.width = `calc(var(--cell) * ${ol.w})`;
      svg.style.height = `calc(var(--cell) * ${ol.h})`;
      const path = document.createElementNS(SVGNS, 'path');
      path.setAttribute('d', ol.pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') + 'Z');
      path.setAttribute('class', 'evasion-path');
      path.style.fill = p.color;
      svg.append(path);
      p.node = svg; p.path = path; p.ow = ol.w; p.oh = ol.h;

      // Sprite : image PNG générée si disponible, sinon repli vectoriel SVG.
      let icon;
      if (PNG_SPRITES.has(p.sprite)) {
        icon = el('img.evasion-obj', {
          src: `assets/sprites/${p.sprite}.png`, alt: '', 'aria-hidden': 'true', draggable: 'false',
        });
      } else {
        icon = document.createElementNS(SVGNS, 'svg');
        icon.setAttribute('viewBox', '0 0 64 64');
        icon.setAttribute('class', 'evasion-obj');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = SPRITES[p.sprite] || '';
      }
      if (p.target) icon.dataset.target = '1';
      p.icon2 = icon;

      svg.setAttribute('role', 'button');
      svg.setAttribute('tabindex', '0');
      svg.setAttribute('aria-label', p.target ? 'Tasse (à sortir)' : 'Bloc de bureau');
      svg.addEventListener('click', () => { if (!svg.dataset.dragged) select(p); svg.removeAttribute('data-dragged'); });
      svg.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p); }
        else if (e.key.startsWith('Arrow')) { e.preventDefault(); select(p); moveByKey(e.key); }
      });
      attachDrag(svg, p);
      return { svg, icon };
    }

    function renderBoard() {
      clear(board);
      for (const [r, c] of blocked) {
        const b = el('div.evasion-block', { 'aria-hidden': 'true' });
        b.style.left = `calc(var(--cell) * ${c})`; b.style.top = `calc(var(--cell) * ${r})`;
        board.append(b);
      }
      // Zone d'arrivée : un seul rectangle vert unifié (là où amener le café).
      const gr = goal.map((x) => x[0]); const gc = goal.map((x) => x[1]);
      const zr = Math.min(...gr); const zc = Math.min(...gc);
      const zh = Math.max(...gr) - zr + 1; const zw = Math.max(...gc) - zc + 1;
      const zone = el('div.evasion-zone', { 'aria-hidden': 'true' }, [el('span.evasion-zone__label', { text: 'ARRIVÉE' })]);
      zone.style.left = `calc(var(--cell) * ${zc})`;
      zone.style.top = `calc(var(--cell) * ${zr})`;
      zone.style.width = `calc(var(--cell) * ${zw})`;
      zone.style.height = `calc(var(--cell) * ${zh})`;
      board.append(zone);

      for (const p of pieces) {
        const { svg, icon } = makePieceEl(p);
        board.append(svg, icon);
      }
      layout();
    }

    function layout() {
      for (const p of pieces) {
        const minR = Math.min(...p.cells.map((x) => x[0]));
        const minC = Math.min(...p.cells.map((x) => x[1]));
        p.node.style.left = `calc(var(--cell) * ${minC})`;
        p.node.style.top = `calc(var(--cell) * ${minR})`;
        p.node.dataset.selected = selected && selected.id === p.id ? '1' : '0';
        // sprite au centre de gravité des cases (évite le « trou » des formes en L)
        const avgR = p.cells.reduce((a, [r]) => a + r, 0) / p.cells.length + 0.5;
        const avgC = p.cells.reduce((a, [, c]) => a + c, 0) / p.cells.length + 0.5;
        p.icon2.style.left = `calc(var(--cell) * ${avgC})`;
        p.icon2.style.top = `calc(var(--cell) * ${avgR})`;
        p.icon2.dataset.selected = selected && selected.id === p.id ? '1' : '0';
      }
    }

    // Glissé fluide : la pièce suit le doigt (verrouillée sur un axe, bornée par
    // l'espace libre) puis s'aimante à la case la plus proche au relâchement.
    function setDragTransform(p, offx, offy) {
      if (!offx && !offy) { p.node.style.transform = ''; p.icon2.style.transform = ''; return; }
      p.node.style.transform = `translate(${offx}px, ${offy}px)`;
      p.icon2.style.transform = `translate(-50%, -50%) translate(${offx}px, ${offy}px)`;
    }
    function endDrag(commitAxis) {
      if (!dragging) return;
      const p = dragging.p;
      p.node.classList.remove('is-dragging'); p.icon2.classList.remove('is-dragging');
      let n = 0;
      if (dragging.axis === 'x') {
        const steps = Math.round(dragging.offx / dragging.cell);
        const clamped = Math.max(-dragging.maxLeft, Math.min(dragging.maxRight, steps));
        if (clamped) { slide(p, 0, Math.sign(clamped), Math.abs(clamped)); n = Math.abs(clamped); }
      } else if (dragging.axis === 'y') {
        const steps = Math.round(dragging.offy / dragging.cell);
        const clamped = Math.max(-dragging.maxUp, Math.min(dragging.maxDown, steps));
        if (clamped) { slide(p, Math.sign(clamped), 0, Math.abs(clamped)); n = Math.abs(clamped); }
      }
      setDragTransform(p, 0, 0);
      layout();
      if (n > 0) p.node.dataset.dragged = '1';
      dragging = null;
    }
    function attachDrag(node, p) {
      node.addEventListener('pointerdown', (e) => {
        if (status !== 'playing') return;
        select(p);
        const cell = board.getBoundingClientRect().width / C || 64; // taille réelle d'une case
        dragging = {
          p, startX: e.clientX, startY: e.clientY, cell, axis: null, offx: 0, offy: 0,
          maxUp: maxSteps(p, -1, 0), maxDown: maxSteps(p, 1, 0),
          maxLeft: maxSteps(p, 0, -1), maxRight: maxSteps(p, 0, 1),
        };
        node.classList.add('is-dragging'); p.icon2.classList.add('is-dragging');
        try { node.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      });
      node.addEventListener('pointermove', (e) => {
        if (!dragging || dragging.p !== p) return;
        const dx = e.clientX - dragging.startX; const dy = e.clientY - dragging.startY;
        if (!dragging.axis) {
          if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
          dragging.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        }
        const cell = dragging.cell;
        if (dragging.axis === 'x') {
          dragging.offx = Math.max(-dragging.maxLeft * cell, Math.min(dragging.maxRight * cell, dx));
          setDragTransform(p, dragging.offx, 0);
        } else {
          dragging.offy = Math.max(-dragging.maxUp * cell, Math.min(dragging.maxDown * cell, dy));
          setDragTransform(p, 0, dragging.offy);
        }
      });
      node.addEventListener('pointerup', () => endDrag());
      node.addEventListener('pointercancel', () => {
        if (dragging) { dragging.p.node.classList.remove('is-dragging'); dragging.p.icon2.classList.remove('is-dragging'); setDragTransform(dragging.p, 0, 0); }
        dragging = null;
      });
    }

    function moveByKey(key) {
      if (!selected) return;
      const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      const [dr, dc] = map[key] || [0, 0];
      if (dr || dc) doMove(selected, dr, dc);
    }

    function renderDpad() {
      clear(dpad);
      const mk = (cls, glyph, dr, dc, label) => el('button.evasion-arrow', {
        type: 'button', class: `evasion-arrow ${cls}`, text: glyph, 'aria-label': label,
        onClick: () => { if (!selected) { toast('Choisis d’abord un bloc'); return; } doMove(selected, dr, dc); },
      });
      dpad.append(mk('up', '▲', -1, 0, 'Monter'), mk('left', '◀', 0, -1, 'Gauche'),
        mk('right', '▶', 0, 1, 'Droite'), mk('down', '▼', 1, 0, 'Descendre'));
    }

    function renderCounter() {
      if (status !== 'playing') { counter.textContent = ''; return; }
      counter.textContent = selected ? `Coups : ${moves} · au mieux ${par}`
        : `Coups : ${moves} · au mieux ${par} — sélectionne un bloc`;
    }

    function renderControls() {
      clear(controls);
      if (status !== 'playing') return;
      controls.append(
        el('button.btn.btn--ghost', {
          type: 'button', text: '↺ Recommencer',
          onClick: () => { pieces = puz.pieces.map((p) => ({ ...p, cells: p.cells.map((x) => x.slice()) })); moves = 0; selected = null; persist(); renderBoard(); renderCounter(); },
        }),
        el('button.btn.btn--ghost', { type: 'button', text: 'Abandonner 🏳️', onClick: giveUp }),
      );
    }

    function win() { status = 'win'; persist(); renderControls(); renderCounter(); dpad.style.display = 'none'; commitResult(true); confetti(); }
    function giveUp() { if (status !== 'playing') return; status = 'lose';
      baliser(GAME_ID, ctx.dateStr, 'abandon'); persist(); renderControls(); dpad.style.display = 'none'; commitResult(false); }

    function stars() {
      if (moves <= par) return '★★★';
      if (moves <= Math.round(par * 1.4)) return '★★';
      return '★';
    }
    function commitResult(won) {
      if (!loadResult(GAME_ID, ctx.dateStr)) {
        const points = won ? Math.max(40, Math.round((100 * par) / Math.max(moves, par))) : 0;
        saveResult(GAME_ID, ctx.dateStr, {
          status: won ? 'win' : 'lose', points, scoreLabel: won ? stars() : '✗', share: buildShareText(won),
        });
        recordStats(GAME_ID, { dateStr: ctx.dateStr, won, distKey: won ? stars() : 'X', prevDateStr: addDays(ctx.dateStr, -1) });
      }
      renderEnd(won);
    }
    function buildShareText(won) {
      const head = `lesjeuxauburo · L'Évasion n°${ctx.puzzleNumber}`;
      const line = won ? `🚪 Évadé en ${moves} coups (au mieux ${par}) ${stars()}` : '🔒 Bloqué cette fois…';
      return `${head}\n${line}\n${siteUrl()}`;
    }
    function renderEnd(won) {
      const message = won ? WIN_MESSAGES[(ctx.puzzleNumber + moves) % WIN_MESSAGES.length]
        : `Le meilleur chemin faisait ${par} coups. Reviens demain plus reposé. ☕`;
      clear(endSlot);
      endSlot.append(buildEndPanel({
        gameId: GAME_ID,
        won, title: won ? `Évadé en ${moves} coups !` : 'Abandon',
        message, shareText: buildShareText(won),
        nextGameHint: 'Continue ta tournée : il reste des jeux à faire ! →',
      }));
      endSlot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function onKeyDown(e) {
      if (status !== 'playing' || document.body.classList.contains('modal-open')) return;
      if (e.key.startsWith('Arrow') && selected) { e.preventDefault(); moveByKey(e.key); }
    }
    document.addEventListener('keydown', onKeyDown);

    renderBoard(); renderDpad(); renderControls(); renderCounter();
    if (status !== 'playing') { dpad.style.display = 'none'; renderEnd(status === 'win'); }
    else maybeShowHowTo(GAME_ID, HOW_TO);

    return () => document.removeEventListener('keydown', onKeyDown);
  },
};
