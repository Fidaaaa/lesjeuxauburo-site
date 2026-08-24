// L'écusson d'un niveau de carrière, partagé par le hub, les statistiques et
// le classement.
//
// Les images sont produites par `tools/gen_niveaux.py`. Elles peuvent manquer
// — une grille élargie avant que ses écussons soient dessinés, ou un cache
// incomplet — d'où le repli sur le numéro du rang, qui reste lisible et ne
// casse pas la mise en page.

import { el } from '../core/dom.js';

/**
 * @param {{rang:number, titre:string, ecusson:string}} niveau
 * @param {number} taille  côté en pixels
 */
export function ecusson(niveau, taille = 40) {
  const cadre = el('span.ecusson', {
    'aria-hidden': 'true',
    style: { '--ecusson-taille': `${taille}px` },
    'data-rang': String(niveau.rang),
  });

  if (niveau.ecusson) {
    cadre.append(el('img', {
      src: niveau.ecusson, alt: '', width: taille, height: taille,
      loading: 'lazy', decoding: 'async',
      onError: (e) => {
        e.target.remove();
        cadre.append(el('span.ecusson__repli', { text: String(niveau.rang) }));
      },
    }));
  } else {
    cadre.append(el('span.ecusson__repli', { text: String(niveau.rang) }));
  }
  return cadre;
}
