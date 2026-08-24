// Service worker : rend le site jouable hors ligne, comme l'application iOS.
//
// Stratégie volontairement simple, adaptée à un site sans backend :
//   * navigations (HTML) → réseau d'abord, cache en secours (hors ligne) ;
//   * tout le reste (JS, CSS, images, banques) → cache d'abord, ce sont des
//     fichiers versionnés par déploiement.
//
// Le cache ne contient QUE des fichiers du jeu. La progression du joueur, elle,
// vit dans localStorage et n'est jamais touchée ici — vider le cache ne fait
// donc jamais perdre une partie.

// À incrémenter à chaque déploiement qui modifie un fichier déjà en cache :
// sans cela, les visiteurs de retour garderaient l'ancienne version.
const VERSION = 'v12';
const CACHE = `lesjeuxauburo-${VERSION}`;

// Coquille minimale mise en cache dès l'installation : de quoi démarrer hors
// ligne. Le reste (modules de jeu, banques) s'ajoute au fil de la navigation.
const SHELL = [
  './',
  './index.html',
  './support.html',
  './confidentialite.html',
  './rejoindre.html',
  './manifest.webmanifest',
  './styles/main.css',
  './src/main.js',
  './assets/office-pattern.svg',
  './assets/logo.svg',
  './assets/fonts/Fraunces-Bold.woff2',
  './assets/fonts/Fraunces-SemiBold.woff2',
  './assets/fonts/InstrumentSans-Regular.woff2',
  './assets/fonts/InstrumentSans-SemiBold.woff2',
  './assets/fonts/InstrumentSans-Bold.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()), // une ressource manquante ne doit pas bloquer
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n.startsWith('lesjeuxauburo-') && n !== CACHE)
          .map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // on ne touche pas aux tiers

  if (request.mode === 'navigate') {
    // Réseau d'abord : le joueur voit tout de suite une mise à jour du site.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('./index.html'))),
    );
    return;
  }

  // Cache d'abord pour les ressources : instantané, et hors ligne par nature.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
