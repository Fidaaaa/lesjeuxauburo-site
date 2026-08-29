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
const VERSION = '886988c76534';
const CACHE = `lesjeuxauburo-${VERSION}`;

// Coquille minimale mise en cache dès l'installation : de quoi démarrer hors
// ligne. Le reste (modules de jeu, banques) s'ajoute au fil de la navigation.
const SHELL = [
  './',
  './index.html',
  './support.html',
  './confidentialite.html',
  './credits.html',
  // admin.html n'est volontairement pas préchargée : un tableau de bord servi
  // depuis un cache dirait l'état d'hier, et on y déciderait sur du faux.
  './styles/admin.css',
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

  // Servir puis rafraîchir : on rend le cache tout de suite — instantané, et
  // hors ligne par nature — mais on va **quand même** chercher la version
  // fraîche en tâche de fond, pour la visite suivante.
  //
  // ⚠️ La version précédente s'arrêtait au cache. Une ressource entrée dedans
  //    n'en ressortait qu'au changement de nom de cache, c'est-à-dire jamais
  //    si l'on oubliait d'incrémenter la version. Constaté en vrai : les
  //    balises ont vécu onze commits sans qu'une seule soit enregistrée,
  //    parce que le `storage.js` servi aux joueurs restait celui d'avant.
  //
  //    Le nom de cache est désormais calculé sur le contenu du site par
  //    deploy_site.py, ce qui règle le cas à la racine. Ceci en est la
  //    ceinture : même si ce calcul tombait en panne, une mise à jour finirait
  //    par arriver — avec une visite de retard, jamais jamais.
  event.respondWith(
    caches.match(request).then((hit) => {
      const frais = fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      // Hors ligne, `frais` échoue : on ne le laisse pas remonter si l'on a
      // déjà de quoi répondre.
      return hit ? (frais.catch(() => {}), hit) : frais;
    }),
  );
});
