// Score de tournée : agrège les résultats du jour sur tous les jeux disponibles
// et attribue un grade « bureau » fun. Enrichi au fil des phases.

import { AVAILABLE_GAMES } from './registry.js';
import { loadResult, loadGameState } from './storage.js';

// État d'un jeu pour un jour donné, vu par le hub.
export function gameDayState(gameId, dateStr) {
  const result = loadResult(gameId, dateStr);
  if (result) {
    return {
      status: result.status, // 'win' | 'lose'
      points: typeof result.points === 'number' ? result.points : (result.status === 'win' ? 60 : 0),
      label: result.scoreLabel || null,
    };
  }
  // Une partie entamée. On se contente de l'existence de l'état sauvegardé :
  // aucun jeu n'enregistre au montage, tous attendent un geste du joueur, donc
  // un état présent veut dire « commencé ».
  //
  // L'ancienne version exigeait un tableau `guesses`, que seuls Le Mot,
  // Chaud-Froid et Le Pays possèdent : les sept autres jeux restaient affichés
  // « À jouer » même à trois cases de la fin.
  const inProgress = loadGameState(gameId, dateStr);
  if (inProgress && inProgress.status === 'playing') {
    return { status: 'progress', points: 0, label: null };
  }
  if (inProgress && inProgress.status && inProgress.status !== 'playing') {
    // partie finie mais sans result (jeu sans persistance de result) : neutre
    return { status: inProgress.status, points: 0, label: null };
  }
  return { status: 'none', points: 0, label: null };
}

const GRADES = [
  { min: 90, label: 'Boss de l’open space', emoji: '👑' },
  { min: 75, label: 'Employé du mois', emoji: '🏅' },
  { min: 55, label: 'Chef d’équipe', emoji: '📈' },
  { min: 35, label: 'Employé modèle', emoji: '🙂' },
  { min: 15, label: 'Stagiaire motivé', emoji: '☕' },
  { min: 1, label: 'Stagiaire du lundi', emoji: '😴' },
];

export function gradeFor(metric) {
  for (const g of GRADES) if (metric >= g.min) return g;
  return { label: 'Pointeuse en panne', emoji: '🛌' };
}

// Résumé de la tournée du jour.
export function tourneeSummary(dateStr) {
  const total = AVAILABLE_GAMES.length;
  let done = 0;
  let wins = 0;
  let sumPoints = 0;
  const perGame = {};
  for (const g of AVAILABLE_GAMES) {
    const s = gameDayState(g.id, dateStr);
    perGame[g.id] = s;
    if (s.status === 'win' || s.status === 'lose') {
      done += 1;
      sumPoints += s.points;
      if (s.status === 'win') wins += 1;
    }
  }
  const avg = done ? Math.round(sumPoints / done) : 0;
  // Métrique de grade : moyenne des points pondérée par le taux de complétion.
  const metric = done ? Math.round(avg * (done / total)) : 0;
  const grade = gradeFor(done ? metric : 0);
  return { total, done, wins, avg, metric, grade, perGame };
}
