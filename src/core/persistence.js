// Durabilité de la progression, sans aucun compte.
//
// Trois garde-fous, du plus automatique au plus manuel :
//
// 1. **Stockage persistant** — on demande au navigateur de ne pas évincer nos
//    données (`navigator.storage.persist()`). Chrome et Firefox l'accordent
//    volontiers à un site visité régulièrement.
// 2. **Installation sur l'écran d'accueil** — c'est le point important sur
//    iPhone : Safari efface le stockage d'un site web après 7 jours sans
//    visite, mais une app installée depuis « Sur l'écran d'accueil » y échappe.
//    On propose donc l'installation aux joueurs réguliers.
// 3. **Code de sauvegarde** — un texte à copier qui contient toute la
//    progression, pour la transférer sur un autre appareil ou la restaurer.
//    C'est le remplaçant du compte utilisateur : rien à créer, rien à retenir.

import { STORAGE_PREFIX } from './config.js';

// --- 1. Stockage persistant -------------------------------------------------

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return 'indisponible';
    if (await navigator.storage.persisted()) return 'déjà accordé';
    return (await navigator.storage.persist()) ? 'accordé' : 'refusé';
  } catch (_) {
    return 'indisponible';
  }
}

// --- 2. Détection de l'environnement ---------------------------------------

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/// Vrai si la progression risque d'être effacée : iPhone, dans Safari, sans
/// installation sur l'écran d'accueil.
export function progressAtRisk() {
  return isIOS() && !isStandalone();
}

// --- 3. Sauvegarde et restauration -----------------------------------------

/** Toutes les données du jeu, sous forme d'objet simple. */
export function collectData() {
  const data = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) data[key] = localStorage.getItem(key);
    }
  } catch (_) { /* stockage inaccessible */ }
  return data;
}

/** Encode la progression en un texte compact, copiable et collable. */
export function exportBackup() {
  const payload = JSON.stringify({ v: 1, at: new Date().toISOString(), data: collectData() });
  // btoa n'accepte que du latin-1 : on passe par l'UTF-8 encodé en octets.
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=+$/, '');
}

/**
 * Restaure une sauvegarde. Ne supprime rien : les données existantes sont
 * conservées quand la sauvegarde ne les contient pas, ce qui rend l'opération
 * sûre même si le joueur se trompe de code.
 */
export function importBackup(code) {
  const cleaned = (code || '').trim().replace(/\s+/g, '');
  if (!cleaned) return { ok: false, reason: 'Code vide' };
  try {
    const binary = atob(cleaned);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || parsed.v !== 1 || typeof parsed.data !== 'object') {
      return { ok: false, reason: 'Ce code ne vient pas de lesjeuxauburo' };
    }
    let restored = 0;
    for (const [key, value] of Object.entries(parsed.data)) {
      if (!key.startsWith(STORAGE_PREFIX)) continue; // n'écrit rien hors de notre espace
      localStorage.setItem(key, value);
      restored += 1;
    }
    return { ok: true, restored, at: parsed.at };
  } catch (_) {
    return { ok: false, reason: 'Code illisible ou incomplet' };
  }
}
