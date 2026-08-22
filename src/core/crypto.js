// Anti-triche léger : les réponses ne sont jamais en clair dans le bundle ni
// dans le network. Les banques stockent des chaînes encodées (XOR + base64),
// décodées à la volée en mémoire. Ce n'est pas de la vraie crypto — juste de
// quoi décourager le curieux qui ouvre l'onglet Réseau. C'est un jeu de bureau.
//
// L'encodage est produit côté Python (tools/lib.py, fonction obf) avec la MÊME
// clé et le MÊME schéma d'octets, pour que deobf() ci-dessous soit son inverse.

const KEY = 'auburo';

// Décode une chaîne encodée (base64 d'octets XORés) vers du texte UTF-8.
export function deobf(encoded) {
  const bin = atob(encoded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i) ^ KEY.charCodeAt(i % KEY.length);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// Encode côté client (utile pour tests / génération ponctuelle). Inverse de deobf.
export function obf(plain) {
  const utf8 = new TextEncoder().encode(plain);
  const out = new Uint8Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) {
    out[i] = utf8[i] ^ KEY.charCodeAt(i % KEY.length);
  }
  let bin = '';
  for (let i = 0; i < out.length; i++) bin += String.fromCharCode(out[i]);
  return btoa(bin);
}

// Petit hash FNV-1a en hexadécimal : compare des hash plutôt que du texte clair.
export function fnv1aHex(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
