// Compte joueur — facultatif, il ne sert qu'aux classements.
//
// Le jeu doit rester entièrement jouable sans compte : aucune fonction d'ici
// n'est appelée sur le chemin critique d'une partie, et toutes échouent en
// silence si le réseau manque.
//
// Supabase s'utilise ici en **REST pur**, sans bibliothèque : le site n'a pas
// d'empaqueteur, et une dépendance servie par un CDN casserait le mode hors
// ligne. Trois points d'entrée suffisent :
//   /auth/v1/authorize   ouvre la connexion Apple ou Google
//   /auth/v1/token       renouvelle une session expirée
//   /rest/v1/…           lit et écrit, sous l'identité du jeton

import { SUPABASE_URL, SUPABASE_KEY, STORAGE_PREFIX } from './config.js';
import { acceptable, REFUS } from './moderation.js';

const SESSION_KEY = `${STORAGE_PREFIX}:session`;
// On renouvelle un peu avant l'expiration : une requête qui part pile à
// l'échéance reviendrait en 401.
const REFRESH_MARGIN_S = 60;

let cached = null;

// --- Session locale ---------------------------------------------------------

function readSession() {
  if (cached) return cached;
  try {
    cached = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch (_) {
    cached = null;
  }
  return cached;
}

function writeSession(session) {
  cached = session;
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch (_) { /* navigation privée : on reste en mémoire */ }
}

function shapeSession(raw) {
  if (!raw?.access_token) return null;
  const lifetime = Number(raw.expires_in) || 3600;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + lifetime,
    userId: raw.user?.id ?? readSession()?.userId ?? null,
    email: raw.user?.email ?? readSession()?.email ?? null,
    anonymous: raw.user?.is_anonymous ?? readSession()?.anonymous ?? false,
  };
}

export function isSignedIn() {
  return Boolean(readSession()?.refreshToken);
}

export function currentUserId() {
  return readSession()?.userId ?? null;
}

/** Vrai pour un compte créé sans Apple ni Google. */
export function isAnonymous() {
  return readSession()?.anonymous === true;
}

// --- Compte sans identification --------------------------------------------

// Alphabet sans caractères ambigus : ni o/0, ni i/l/1. Un pseudo se lit à voix
// haute au bureau, autant qu'il ne prête pas à confusion.
const HANDLE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function randomHandle() {
  const values = new Uint8Array(5);
  crypto.getRandomValues(values);
  const suffix = [...values].map((v) => HANDLE_ALPHABET[v % HANDLE_ALPHABET.length]).join('');
  return `employe_${suffix}`;
}

/**
 * Crée un compte **anonyme** : pas d'Apple, pas de Google, pas d'adresse. Le
 * joueur reçoit un pseudo tiré au sort du genre « employe_b42cj », et peut
 * figurer aux classements comme les autres.
 *
 * Limite assumée, dite à l'écran : ce compte vit dans ce navigateur. Effacer
 * les données du site, ou changer d'appareil, le perd — c'est le prix de ne
 * rien avoir à donner.
 */
export async function signInAnonymously() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (payload?.error_code === 'anonymous_provider_disabled') {
      throw new Error('Le jeu sans compte n’est pas encore activé côté serveur.');
    }
    throw new Error(payload?.msg || `connexion impossible (${response.status})`);
  }
  writeSession(shapeSession(payload));

  // Un pseudo tiré au sort, avec quelques tentatives en cas de collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await setPseudo(randomHandle());
    } catch (error) {
      if (!/déjà pris/.test(error.message)) throw error;
    }
  }
  throw new Error('Impossible de trouver un pseudo libre, réessaie');
}

// --- Connexion --------------------------------------------------------------

/** Adresse de retour après la connexion : la page classement. */
function redirectTarget() {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/classement`;
}

/** Ouvre la connexion Apple ou Google (redirection plein écran). */
export function signIn(provider) {
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set('provider', provider);
  url.searchParams.set('redirect_to', redirectTarget());
  window.location.href = url.toString();
}

/**
 * Récupère les jetons que Supabase renvoie dans le fragment d'URL après une
 * connexion réussie, puis nettoie l'adresse — un jeton n'a rien à faire dans
 * l'historique du navigateur ni dans un lien copié.
 *
 * Renvoie true si une connexion vient d'aboutir.
 */
export function captureRedirect() {
  const hash = window.location.hash || '';
  const start = hash.indexOf('access_token=');
  if (start < 0) return false;

  const params = new URLSearchParams(hash.slice(start));
  const session = shapeSession({
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    expires_in: params.get('expires_in'),
  });
  if (!session) return false;
  writeSession(session);

  history.replaceState(null, '', `${window.location.pathname}#/classement`);
  // L'identité complète n'est pas dans le fragment : on la demande.
  loadUser().catch(() => {});
  return true;
}

async function loadUser() {
  const me = await request('/auth/v1/user');
  const session = readSession();
  if (session && me?.id) {
    writeSession({ ...session, userId: me.id, email: me.email ?? null });
  }
  return me;
}

export async function signOut() {
  try {
    await request('/auth/v1/logout', { method: 'POST' });
  } catch (_) { /* la session locale part quand même */ }
  writeSession(null);
}

/** Efface le compte et tout ce qui s'y rattache (exigé par Apple dans l'app). */
export async function deleteAccount() {
  await rpc('supprimer_mon_compte');
  writeSession(null);
}

// --- Jeton ------------------------------------------------------------------

async function freshToken() {
  const session = readSession();
  if (!session) return null;
  if (session.expiresAt - REFRESH_MARGIN_S > Date.now() / 1000) return session.accessToken;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!response.ok) {
    // Jeton de renouvellement révoqué ou expiré : on repart de zéro.
    if (response.status === 400 || response.status === 401) writeSession(null);
    throw new Error(`renouvellement impossible (${response.status})`);
  }
  const shaped = shapeSession(await response.json());
  writeSession({ ...session, ...shaped });
  return shaped.accessToken;
}

// --- Requêtes ---------------------------------------------------------------

/** Appel authentifié. Lève une erreur explicite, jamais silencieuse. */
export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = await freshToken();
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204 || response.headers.get('content-length') === '0') return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || payload?.error_description || `erreur ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

/** Appelle une fonction du schéma (classements, groupes). */
export function rpc(name, args = {}) {
  return request(`/rest/v1/rpc/${name}`, { method: 'POST', body: args });
}

// --- Profil -----------------------------------------------------------------

export async function myProfile() {
  const id = currentUserId();
  if (!id) return null;
  const rows = await request(
    `/rest/v1/profils?id=eq.${id}&select=pseudo,prenom,nom,email,annee_naissance`);
  return rows?.[0] ?? null;
}

/**
 * Enregistre les renseignements facultatifs. Un champ vidé est effacé, pas
 * ignoré : c'est la seule façon de se rétracter.
 */
export async function saveProfileDetails({ prenom, nom, anneeNaissance }) {
  const id = currentUserId();
  if (!id) throw new Error('connexion requise');
  const annee = String(anneeNaissance ?? '').trim();
  if (annee && !/^\d{4}$/.test(annee)) throw new Error('Année de naissance : quatre chiffres');
  await request(`/rest/v1/profils?id=eq.${id}`, {
    method: 'PATCH',
    body: {
      prenom: prenom?.trim() || null,
      nom: nom?.trim() || null,
      annee_naissance: annee ? Number(annee) : null,
    },
    headers: { Prefer: 'return=minimal' },
  });
}

/**
 * Enregistre le pseudo choisi. Le premier appel crée le profil, les suivants
 * le renomment. Renvoie une erreur lisible si le pseudo est déjà pris.
 */
export async function setPseudo(pseudo) {
  const id = currentUserId();
  if (!id) throw new Error('connexion requise');
  const clean = pseudo.trim();
  if (clean.length < 2 || clean.length > 18) {
    throw new Error('Le pseudo doit faire entre 2 et 18 caractères');
  }
  // Le pseudo s'affiche sur un classement public. Ce contrôle-ci sert à
  // répondre tout de suite ; celui qui protège vraiment est le déclencheur
  // PostgreSQL, seul à ne pas être contournable.
  if (!acceptable(clean)) {
    throw new Error(REFUS);
  }
  try {
    await request('/rest/v1/profils', {
      method: 'POST',
      body: { id, pseudo: clean },
      headers: { Prefer: 'resolution=merge-duplicates' },
    });
  } catch (error) {
    if (error.status === 409 || /duplicate|unique/i.test(error.message)) {
      throw new Error('Ce pseudo est déjà pris');
    }
    throw error;
  }
  return clean;
}
