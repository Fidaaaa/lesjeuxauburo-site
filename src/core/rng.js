// Générateur pseudo-aléatoire déterministe, seedé par une chaîne.
// Le même jour + le même jeu => la même graine => le même puzzle partout.

// Hash de chaîne -> entier 32 bits (xfnv1a).
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// PRNG mulberry32 : rapide, déterministe, suffisant pour un jeu.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Renvoie une fonction random() déterministe pour une graine textuelle.
export function seededRandom(seedStr) {
  return mulberry32(hashString(seedStr));
}

// Mélange de Fisher-Yates déterministe (ne modifie pas l'entrée).
export function seededShuffle(array, seedStr) {
  const a = array.slice();
  const rand = seededRandom(seedStr);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Tire un index dans une banque de taille `bankLength` pour le jour `dayNumber`.
// Garantit : aucune répétition pendant `bankLength` jours consécutifs, puis
// re-mélange proprement à chaque cycle. Le même (jeu, jour) donne toujours le
// même index pour tous les joueurs.
export function pickForDay(bankLength, dayNumber, gameId) {
  if (bankLength <= 0) return 0;
  const day = ((dayNumber % bankLength) + bankLength) % bankLength; // positif
  const cycle = Math.floor(dayNumber / bankLength);
  const perm = seededShuffle(
    Array.from({ length: bankLength }, (_, i) => i),
    `${gameId}:cycle:${cycle}`,
  );
  return perm[day];
}
