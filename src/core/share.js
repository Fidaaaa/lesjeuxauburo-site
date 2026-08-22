// Partage emoji : chaque fin de partie produit un résumé copiable, sans spoiler
// la réponse. Format compact pensé pour Slack/Teams.

import { APP_NAME, SITE_URL } from './config.js';

// Adresse à coller dans les partages. Dans l'app native, l'origine est un
// scheme interne (ljab://) : on retombe alors sur SITE_URL ou le nom du site.
export function siteUrl() {
  if (SITE_URL) return SITE_URL;
  try {
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      return `${location.origin}${location.pathname}`;
    }
  } catch (_) { /* ignore */ }
  return APP_NAME;
}

// Copie du texte dans le presse-papier, avec repli si l'API n'est pas dispo.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (_) { /* on tente le repli */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

// En-tête commun d'un partage : « lesjeuxauburo · Le Mot n°37 — 4/6 ».
export function shareHeader(gameName, puzzleNumber, scoreLine) {
  const num = `n°${puzzleNumber}`;
  return scoreLine
    ? `${APP_NAME} · ${gameName} ${num} — ${scoreLine}`
    : `${APP_NAME} · ${gameName} ${num}`;
}

// Pied de partage : l'URL du site (sans query de test).
export function shareFooter() {
  try {
    return `${location.origin}${location.pathname}`;
  } catch (_) {
    return APP_NAME;
  }
}

// Assemble un bloc de partage complet.
export function buildShare(lines) {
  return lines.filter((l) => l != null).join('\n');
}
