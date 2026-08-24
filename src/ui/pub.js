// Emplacements publicitaires — réservés, transparents, vides.
//
// Ce module ne charge rien et ne contacte personne. Il ne fait qu'une chose :
// **réserver la place** aux endroits choisis, pour qu'y brancher une régie un
// jour ne demande qu'un remplissage, sans redessiner les écrans.
//
// Les emplacements sont **entièrement transparents** tant qu'ils sont vides :
// ni cadre, ni fond, ni mot « Publicité ». Le joueur ne voit qu'un peu d'air ;
// le jour du branchement, rien ne bougera.
//
// Deux règles tenues ici :
//
//   * **la hauteur est réservée d'avance.** Un encart qui arrive après coup
//     pousse le contenu vers le bas ; sur un jeu, cela veut dire un doigt qui
//     tape à côté au moment où la grille saute. Chaque format a donc sa
//     hauteur fixe, occupée dès le premier rendu ;
//   * **jamais dans une grille de jeu, jamais entre un essai et sa réponse.**
//     Les emplacements vivent aux respirations : sous la liste des jeux, après
//     les boutons de fin de partie, en bas des pages annexes.
//
// ⚠️ Brancher une régie n'est pas un détail technique : le produit promet
//    aujourd'hui « aucun traceur, aucune publicité » dans sa politique de
//    confidentialité, dans sa fiche App Store et dans ses notes d'examen, et
//    son manifeste déclare `NSPrivacyTracking = false`. Voir la marche à
//    suivre dans docs/publicite.md.

import { el } from '../core/dom.js';
import { PUB_ENABLED } from '../core/config.js';

/**
 * Formats retenus, et leur hauteur réservée.
 *
 * Ce sont les tailles standard de l'IAB : n'importe quelle régie sait les
 * remplir, ce qui évite d'avoir à redessiner si l'on change de fournisseur.
 */
const FORMATS = {
  banniere: { largeur: 320, hauteur: 100 },   // sous le contenu, mobile
  rectangle: { largeur: 300, hauteur: 250 },  // fin de partie
  grattoir: { largeur: 160, hauteur: 600 },   // colonne latérale, grands écrans
};

/**
 * Un emplacement : de la place réservée, invisible tant qu'elle est vide.
 *
 * Renvoie `null` si `PUB_ENABLED` est à `false` — dans ce cas seulement les
 * écrans se resserrent.
 *
 * @param {'banniere'|'rectangle'|'grattoir'} format
 * @param {string} position  repère lisible, pour savoir plus tard quel
 *                           emplacement rapporte quoi
 */
export function emplacement(format, position) {
  if (!PUB_ENABLED) return null;
  const f = FORMATS[format];
  if (!f) throw new Error(`format publicitaire inconnu : ${format}`);

  return el('aside.pub', {
    'data-format': format,
    'data-position': position,
    // Vide, il n'a rien à annoncer : le masquer évite qu'un lecteur d'écran
    // lise « emplacement publicitaire » là où il n'y a rien. La régie qui le
    // remplira posera ses propres attributs.
    'aria-hidden': 'true',
    style: {
      '--pub-largeur': `${f.largeur}px`,
      '--pub-hauteur': `${f.hauteur}px`,
    },
  });
}

/**
 * La colonne latérale des grands écrans — le « autour du site ».
 *
 * Elle n'apparaît qu'au-delà de 1 180 px : en dessous, la colonne de jeu fait
 * 560 px et il ne reste pas la place d'un grattoir sans serrer le contenu.
 */
export function colonneLaterale() {
  if (!PUB_ENABLED) return null;
  return el('div.pub-rail', { 'aria-hidden': 'false' }, [
    emplacement('grattoir', 'rail-gauche'),
  ]);
}
