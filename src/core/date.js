// Gestion du temps en fuseau Europe/Paris, sans dépendance.
// Le « jour de puzzle » bascule à ROLLOVER_HOUR (2h Paris) : entre minuit et 2h,
// on joue encore le puzzle de la veille.

import { LAUNCH_DATE, ROLLOVER_HOUR, TZ } from './config.js';

// Permet de simuler une date pour les tests : ?date=YYYY-MM-DD dans l'URL,
// ou window.__LJAB_DATE. La valeur force la date de puzzle affichée.
function getDateOverride() {
  try {
    const params = new URLSearchParams(location.search);
    const q = params.get('date');
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  } catch (_) { /* pas d'URL (tests) */ }
  if (typeof window !== 'undefined' && window.__LJAB_DATE && /^\d{4}-\d{2}-\d{2}$/.test(window.__LJAB_DATE)) {
    return window.__LJAB_DATE;
  }
  return null;
}

// Extrait les composants horaires de Paris pour un instant donné.
function parisParts(d = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = {};
  for (const p of fmt.formatToParts(d)) if (p.type !== 'literal') parts[p.type] = p.value;
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0; // certains moteurs renvoient 24 à minuit
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour, minute: +parts.minute, second: +parts.second,
  };
}

function isoFromUTC(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Chaîne YYYY-MM-DD du puzzle actif à l'instant `d` (Paris, bascule à 2h).
export function getPuzzleDate(d = new Date()) {
  const override = getDateOverride();
  if (override) return override;
  const p = parisParts(d);
  // On travaille à midi UTC pour éviter les surprises de changement d'heure.
  const dt = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
  if (p.hour < ROLLOVER_HOUR) dt.setUTCDate(dt.getUTCDate() - 1);
  return isoFromUTC(dt);
}

// Nombre de jours entiers entre deux dates YYYY-MM-DD.
export function daysBetween(fromISO, toISO) {
  const [fy, fm, fd] = fromISO.split('-').map(Number);
  const [ty, tm, td] = toISO.split('-').map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86400000);
}

// Numéro de puzzle (1-indexé) pour une date de puzzle donnée.
export function getPuzzleNumber(dateStr = getPuzzleDate()) {
  return daysBetween(LAUNCH_DATE, dateStr) + 1;
}

// Numéro de jour (0-indexé depuis le lancement) : sert aux tirages déterministes.
export function getDayNumber(dateStr = getPuzzleDate()) {
  return daysBetween(LAUNCH_DATE, dateStr);
}

// Secondes restantes avant la prochaine bascule (2h Paris).
export function secondsUntilRollover(d = new Date()) {
  const p = parisParts(d);
  const nowWallUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = nowWallUTC - d.getTime(); // décalage Paris ↔ UTC réel
  const target = new Date(Date.UTC(p.year, p.month - 1, p.day, ROLLOVER_HOUR, 0, 0));
  if (p.hour >= ROLLOVER_HOUR) target.setUTCDate(target.getUTCDate() + 1);
  const targetReal = target.getTime() - offset;
  return Math.max(0, Math.round((targetReal - d.getTime()) / 1000));
}

// Formate un nombre de secondes en HH:MM:SS.
export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

// Même attente, dite comme on la dirait à voix haute : « dans 4 h », « dans
// 23 minutes ». Les secondes qui défilent transforment une pause en échéance,
// alors on ne les montre que dans la dernière minute, où elles amusent.
export function humanCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 2) return `dans ${h} h`;
  if (h === 1) return m ? `dans 1 h ${m}` : 'dans 1 h';
  if (m >= 1) return `dans ${m} minute${m > 1 ? 's' : ''}`;
  return `dans ${s} seconde${s > 1 ? 's' : ''}`;
}

// Date lisible en français : « jeudi 21 août 2026 ».
export function humanDate(dateStr = getPuzzleDate()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(dt);
}

export function isDateOverridden() {
  return getDateOverride() !== null;
}

// Décale une date YYYY-MM-DD de `delta` jours (peut être négatif).
export function addDays(dateStr, delta) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return isoFromUTC(dt);
}
