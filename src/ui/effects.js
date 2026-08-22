// Effets discrets : confettis sobres sur victoire, toast pour les messages.
// Respecte prefers-reduced-motion.

import { el } from '../core/dom.js';

function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Confettis sobres : quelques particules dans les tons chaleureux du site.
export function confetti() {
  if (reducedMotion()) return;
  const colors = ['#e07a5f', '#f2cc8f', '#81b29a', '#6d90c4', '#c4a35a'];
  const layer = el('div.confetti-layer', { 'aria-hidden': 'true' });
  const N = 70;
  for (let i = 0; i < N; i++) {
    const piece = el('span.confetti-piece');
    const c = colors[i % colors.length];
    piece.style.background = c;
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.animationDelay = Math.random() * 0.3 + 's';
    piece.style.animationDuration = 1.6 + Math.random() * 1.4 + 's';
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    if (Math.random() > 0.5) piece.style.borderRadius = '50%';
    layer.append(piece);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3200);
}

let toastTimer = null;
export function toast(message, duration = 1600) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div.toast', { role: 'status', 'aria-live': 'polite' });
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('is-visible'), duration);
}
