// Mise en forme des nombres.
//
// `toLocaleString('fr-FR')` sépare les milliers par une **espace fine
// insécable** (U+202F). Ni Fraunces ni Instrument Sans ne dessinent ce
// caractère : le navigateur va le chercher dans une police système, et le
// résultat est une espace si étroite qu'on lit « 4300 » au lieu de « 4 300 ».
//
// On impose donc l'espace insécable ordinaire (U+00A0), que les deux polices
// possèdent. Le nombre reste insécable — il ne se coupera pas en fin de ligne —
// et la typographie française est respectée, sans repli de police au milieu
// d'un chiffre.
//
// Pendant de `Nombre.format` côté iOS, qui règle son `groupingSeparator` sur
// le même caractère pour la même raison.

const FINE_INSECABLE = / /g;
const INSECABLE = ' ';

/** « 4300 » → « 4 300 ». */
export function nombre(valeur) {
  return Number(valeur || 0).toLocaleString('fr-FR').replace(FINE_INSECABLE, INSECABLE);
}
