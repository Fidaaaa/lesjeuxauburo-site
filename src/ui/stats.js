// Page statistiques : parties jouées, % de victoires, streak actuelle et record,
// répartition des scores — par jeu et en global.

import { GAMES, AVAILABLE_GAMES } from '../core/registry.js';
import { loadStats } from '../core/storage.js';
import { el, clear } from '../core/dom.js';
import { showModal } from './modal.js';
import { STORAGE_PREFIX } from '../core/config.js';
import { exportBackup, importBackup, progressAtRisk } from '../core/persistence.js';
import { copyText } from '../core/share.js';
import { carriere, effectiveStreak, multiplierFor, XP_BASE } from '../core/xp.js';
import { getPuzzleDate } from '../core/date.js';
import { ecusson } from './ecusson.js';
import { nombre } from '../core/format.js';

// Ordre d'affichage des clés de répartition, par jeu.
const DIST_ORDER = {
  mot: ['1', '2', '3', '4', '5', '6', 'X'],
  allumettes: ['1', '2', 'X'],
  pays: ['1', '2', '3', '4', '5', '6', 'X'],
  connexions: ['0', '1', '2', '3', 'X'],
  intrus: ['2', '1', 'X'],
  chaudfroid: ['1-5', '6-10', '11-20', '21-40', '40+', 'X'],
  evasion: ['★★★', '★★', '★', 'X'],
  boite: ['2', '3', '4', '5', '6', 'X'],
  gaufre: ['5', '4', '3', '2', '1', '0', 'X'],
  tango: ['5', '4', '3', '2', '1', 'X'],
};
const DIST_LABEL = {
  intrus: { '2': 'Sans-faute', '1': 'Intrus seul', X: 'Échec' },
  connexions: { 0: '0 err.', 1: '1 err.', 2: '2 err.', 3: '3 err.', X: 'Échec' },
  allumettes: { 1: '1 coup', 2: '2 coups', X: 'Abandon' },
  evasion: { '★★★': 'Au mieux', '★★': 'Efficace', '★': 'Résolu', X: 'Abandon' },
  boite: { 2: '2 mots', 3: '3 mots', 4: '4 mots', 5: '5 mots', 6: '6 mots', X: 'Échec' },
  gaufre: { 5: '5 ★', 4: '4 ★', 3: '3 ★', 2: '2 ★', 1: '1 ★', 0: '0 ★', X: 'Échec' },
  tango: { 5: '5 ★', 4: '4 ★', 3: '3 ★', 2: '2 ★', 1: '1 ★', X: 'Abandon' },
};

function pct(n, d) { return d ? Math.round((100 * n) / d) : 0; }

export function renderStats(view) {
  clear(view);
  const wrap = el('div.stats');

  wrap.append(el('div.stats__head', {}, [
    el('a.stats__back', { href: '#/', text: '← Retour au hub' }),
    el('h1.stats__title', { text: '📊 Mes statistiques' }),
  ]));

  // Global
  let played = 0; let wins = 0; let bestStreak = 0; let xpTotal = 0;
  for (const g of AVAILABLE_GAMES) {
    const s = loadStats(g.id);
    played += s.played; wins += s.wins; xpTotal += s.xp || 0;
    bestStreak = Math.max(bestStreak, s.maxStreak);
  }

  // Carrière : le poste atteint depuis le début, tous jeux confondus.
  const poste = carriere(xpTotal);
  wrap.append(el('section.carriere-detail', {}, [
    el('div.carriere-detail__head', {}, [
      ecusson(poste, 58),
      el('div', {}, [
        el('div.carriere-detail__titre', { text: poste.titre }),
        el('div.carriere-detail__rang', {
          text: `Niveau ${poste.rang} sur ${poste.total} · ${nombre(poste.xp)} XP`,
        }),
      ]),
    ]),
    el('div.carriere-detail__bar', { 'aria-hidden': 'true' }, [
      el('div.carriere-detail__fill', { style: { width: `${poste.progression * 100}%` } }),
    ]),
    el('p.carriere-detail__next', {
      text: poste.suivant
        ? `Encore ${nombre(poste.manquant)} XP avant « ${poste.suivant} ».`
        : 'Plus rien au-dessus. La direction, c’est toi.',
    }),
    el('p.carriere-detail__regle', {
      text: `Chaque jeu réussi rapporte ${XP_BASE} XP. À partir de 3 jours d’affilée `
          + `sur un même jeu, il en rapporte le double ; à partir de 25 jours, le quadruple. `
          + `Un jour sauté ou un abandon remet la série de ce jeu à zéro.`,
    }),
  ]));

  wrap.append(el('section.stats-global', {}, [
    statTile('Parties jouées', String(played)),
    statTile('Victoires', `${pct(wins, played)}%`),
    statTile('Meilleure série', `🏆 ${bestStreak}`),
  ]));

  // Par jeu
  wrap.append(el('h2.stats__section', { text: 'Par jeu' }));
  const list = el('div.stats-games');
  for (const g of GAMES) {
    if (!g.available) continue;
    list.append(gameStatCard(g));
  }
  wrap.append(list);

  wrap.append(el('h2.stats__section', { text: 'Ma progression' }));
  wrap.append(backupCard());

  wrap.append(el('div.stats__reset', {}, [
    el('button.cf-giveup', { type: 'button', text: 'Réinitialiser mes statistiques', onClick: confirmReset }),
  ]));

  view.append(wrap);
}

/// Sauvegarde sans compte : un code à copier, à coller sur un autre appareil.
/// Rappelle aussi d'installer le jeu sur l'écran d'accueil quand c'est utile —
/// sur iPhone, c'est ce qui empêche Safari d'effacer la progression.
function backupCard() {
  const card = el('section.stats-card');

  if (progressAtRisk()) {
    card.append(el('div.backup__warn', {}, [
      el('strong', { text: '📲 Installe le jeu sur ton écran d’accueil' }),
      el('p', {
        text: 'Sur iPhone, Safari efface la progression d’un site après 7 jours '
            + 'sans visite. Une fois installé, le jeu y échappe — et fonctionne hors ligne. '
            + 'Bouton Partager, puis « Sur l’écran d’accueil ».',
      }),
    ]));
  }

  card.append(
    el('p.backup__intro', {
      text: 'Pas de compte ici : ta progression reste sur cet appareil. '
          + 'Pour la transférer ou la mettre à l’abri, copie ce code et garde-le.',
    }),
    el('div.backup__actions', {}, [
      el('button.btn.btn--primary', {
        type: 'button', text: '📋 Copier mon code de sauvegarde',
        onClick: async (e) => {
          const ok = await copyText(exportBackup());
          e.target.textContent = ok ? '✅ Code copié !' : '❌ Copie impossible';
          setTimeout(() => { e.target.textContent = '📋 Copier mon code de sauvegarde'; }, 2500);
        },
      }),
      el('button.btn.btn--ghost', {
        type: 'button', text: '↩︎ Restaurer depuis un code', onClick: askRestore,
      }),
    ]),
  );
  return card;
}

function askRestore() {
  const field = el('textarea.backup__field', {
    rows: '4', placeholder: 'Colle ici ton code de sauvegarde…',
    'aria-label': 'Code de sauvegarde',
  });
  const feedback = el('p.backup__feedback');

  showModal({
    title: 'Restaurer ma progression',
    body: el('div', {}, [
      el('p', {
        text: 'Colle le code copié depuis ton autre appareil. Tes parties actuelles '
            + 'ne seront pas supprimées : seules celles présentes dans le code sont rétablies.',
      }),
      field, feedback,
    ]),
    actions: [
      { label: 'Annuler' },
      {
        label: 'Restaurer', primary: true, close: false,
        onClick: () => {
          const result = importBackup(field.value);
          if (!result.ok) {
            feedback.textContent = `❌ ${result.reason}`;
            feedback.dataset.state = 'error';
            return;
          }
          feedback.textContent = `✅ ${result.restored} élément(s) restauré(s). Rechargement…`;
          feedback.dataset.state = 'ok';
          setTimeout(() => { location.hash = '#/'; location.reload(); }, 900);
        },
      },
    ],
  });
}

function statTile(label, value) {
  return el('div.stat-tile', {}, [
    el('div.stat-tile__value', { text: value }),
    el('div.stat-tile__label', { text: label }),
  ]);
}

// Même vignette que sur le hub, en plus petit.
function statsArtwork(game) {
  const box = el('div.stats-card__art', {
    'aria-hidden': 'true', style: { '--game-color': game.color },
  });
  box.append(game.art
    ? el('img', { src: game.art, alt: '', loading: 'lazy' })
    : el('span', { text: game.emoji }));
  return box;
}

function gameStatCard(g) {
  const s = loadStats(g.id);
  const card = el('section.stats-card', { style: { '--game-color': g.color } });
  card.append(el('div.stats-card__head', {}, [
    statsArtwork(g),
    el('span.stats-card__name', { text: g.name }),
  ]));
  // La série affichée est celle qui vaut aujourd'hui : celle enregistrée n'est
  // remise à jour qu'en jouant, et survivrait à plusieurs jours d'absence.
  const serie = effectiveStreak(s, getPuzzleDate());
  const facteur = multiplierFor(serie);
  card.append(el('div.stats-card__row', {}, [
    miniStat(String(s.played), 'jouées'),
    miniStat(`${pct(s.wins, s.played)}%`, 'victoires'),
    miniStat(`🔥 ${serie}`, facteur > 1 ? `série · ×${facteur}` : 'série'),
    miniStat(`🏆 ${s.maxStreak}`, 'record'),
    miniStat(nombre(s.xp), 'XP'),
  ]));

  // Répartition
  const order = DIST_ORDER[g.id] || Object.keys(s.dist);
  const keys = order.filter((k) => k in s.dist);
  if (keys.length) {
    const maxCount = Math.max(...keys.map((k) => s.dist[k]));
    const chart = el('div.dist-chart');
    for (const k of keys) {
      const count = s.dist[k];
      const label = (DIST_LABEL[g.id] && DIST_LABEL[g.id][k]) || k;
      chart.append(el('div.dist-row', {}, [
        el('span.dist-row__key', { text: label }),
        el('div.dist-row__bar', {}, [
          el('div.dist-row__fill', {
            'data-fail': k === 'X' ? '1' : '0',
            style: { width: `${Math.max(8, pct(count, maxCount))}%` },
          }, [el('span.dist-row__count', { text: String(count) })]),
        ]),
      ]));
    }
    card.append(chart);
  } else {
    // Le message dépend du nombre de parties, pas de la répartition : afficher
    // « pas encore de partie » sous un compteur qui affiche 5 jouées était un
    // démenti pur et simple.
    card.append(el('p.stats-card__empty', {
      text: s.played
        ? 'Pas encore de quoi tracer une courbe — reviens demain.'
        : 'Pas encore de partie. Lance-toi !',
    }));
  }
  return card;
}

function miniStat(value, label) {
  return el('div.mini-stat', {}, [
    el('div.mini-stat__value', { text: value }),
    el('div.mini-stat__label', { text: label }),
  ]);
}

function confirmReset() {
  showModal({
    title: 'Réinitialiser ?',
    body: '<p>Cela efface définitivement toutes tes statistiques, parties et résultats sur cet appareil. Action irréversible.</p>',
    actions: [
      { label: 'Annuler' },
      {
        label: 'Tout effacer', primary: true, onClick: () => {
          try {
            const toRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith(STORAGE_PREFIX)) toRemove.push(k);
            }
            toRemove.forEach((k) => localStorage.removeItem(k));
          } catch (_) { /* ignore */ }
          location.hash = '#/';
          location.reload();
        },
      },
    ],
  });
}
