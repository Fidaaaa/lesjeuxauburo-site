// Modale accessible : focus piégé, fermeture Échap / clic sur l'overlay,
// restauration du focus. Sert aux règles « Comment jouer » et à l'écran de fin.

import { el, clear } from '../core/dom.js';

let openModal = null;

export function showModal({ title, body, actions = [], onClose, closable = true, className = '' }) {
  closeModal();
  const previousFocus = document.activeElement;

  const dialog = el('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialogue' });
  if (className) dialog.classList.add(className);

  const header = el('div.modal__head', {}, [
    el('h2.modal__title', { text: title || '' }),
    closable ? el('button.modal__close', {
      type: 'button', 'aria-label': 'Fermer', text: '✕',
      onClick: () => closeModal(),
    }) : null,
  ]);

  const content = el('div.modal__body');
  if (typeof body === 'string') content.innerHTML = body;
  else if (body) content.append(body);

  const footer = el('div.modal__actions');
  for (const a of actions) {
    footer.append(el('button', {
      type: 'button',
      class: `btn ${a.primary ? 'btn--primary' : 'btn--ghost'}`,
      text: a.label,
      onClick: () => { if (a.onClick) a.onClick(); if (a.close !== false) closeModal(); },
    }));
  }

  dialog.append(header, content);
  if (actions.length) dialog.append(footer);

  const overlay = el('div.modal-overlay', {
    onClick: (e) => { if (closable && e.target === overlay) closeModal(); },
  }, [dialog]);

  function onKey(e) {
    if (e.key === 'Escape' && closable) { e.preventDefault(); closeModal(); }
    else if (e.key === 'Tab') trapFocus(e, dialog);
  }
  document.addEventListener('keydown', onKey);

  document.body.append(overlay);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    const first = dialog.querySelector('button, [href], input, select, textarea, [tabindex]');
    if (first) first.focus();
  });

  openModal = () => {
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('is-open');
    document.body.classList.remove('modal-open');
    setTimeout(() => overlay.remove(), 180);
    if (previousFocus && previousFocus.focus) previousFocus.focus();
    if (onClose) onClose();
    openModal = null;
  };

  return { close: closeModal, dialog, body: content };
}

export function closeModal() {
  if (openModal) openModal();
}

function trapFocus(e, container) {
  const focusables = container.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
