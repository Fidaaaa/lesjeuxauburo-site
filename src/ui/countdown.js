// Compte à rebours « prochains jeux dans HH:MM:SS ». Un seul timer partagé,
// les abonnés reçoivent la mise à jour chaque seconde.

import { secondsUntilRollover, formatCountdown } from '../core/date.js';

const subscribers = new Set();
let timer = null;

function tick() {
  const secs = secondsUntilRollover();
  const text = formatCountdown(secs);
  for (const cb of subscribers) cb(text, secs);
  // À 0, on laisse tourner : le rechargement/refresh naturel prendra le relais.
}

// Abonne un élément : sa textContent devient le countdown. Renvoie un unsub.
export function bindCountdown(node) {
  const cb = (text) => { node.textContent = text; };
  subscribers.add(cb);
  cb(formatCountdown(secondsUntilRollover()));
  if (!timer) timer = setInterval(tick, 1000);
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && timer) { clearInterval(timer); timer = null; }
  };
}
