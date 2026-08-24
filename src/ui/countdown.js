// Compte à rebours jusqu'à la prochaine fournée. Un seul timer partagé, les
// abonnés reçoivent la mise à jour chaque seconde.
//
// Deux façons de le dire, selon l'endroit : `bindCountdown` affiche le chrono
// précis (fin de partie, où l'attente est le sujet), `bindHumanCountdown` la
// version parlée (le hub, où elle ne doit être qu'une note de bas de page).

import { secondsUntilRollover, formatCountdown, humanCountdown } from '../core/date.js';

const subscribers = new Set();
let timer = null;

function tick() {
  const secs = secondsUntilRollover();
  for (const cb of subscribers) cb(secs);
  // À 0, on laisse tourner : le rechargement/refresh naturel prendra le relais.
}

function subscribe(node, format) {
  const cb = (secs) => { node.textContent = format(secs); };
  subscribers.add(cb);
  cb(secondsUntilRollover());
  if (!timer) timer = setInterval(tick, 1000);
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && timer) { clearInterval(timer); timer = null; }
  };
}

// Abonne un élément : sa textContent devient le chrono. Renvoie un unsub.
export function bindCountdown(node) {
  return subscribe(node, formatCountdown);
}

// Même chose, en français parlé : « dans 4 h ».
export function bindHumanCountdown(node) {
  return subscribe(node, humanCountdown);
}
