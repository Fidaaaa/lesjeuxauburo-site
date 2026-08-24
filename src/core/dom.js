// Mini-utilitaires DOM, pour éviter la verbosité sans framework.

// Applique un objet de styles. `Object.assign(node.style, …)` avale
// silencieusement les propriétés personnalisées : `style['--x'] = 'rouge'` ne
// fait rien du tout, sans la moindre erreur. Il faut passer par setProperty,
// d'où ce détour — c'est ce qui empêchait la couleur propre à chaque jeu
// d'apparaître sur les cartes du hub.
function setStyle(node, styles) {
  for (const [prop, value] of Object.entries(styles)) {
    if (value == null) continue;
    if (prop.startsWith('--')) node.style.setProperty(prop, String(value));
    else node.style[prop] = value;
  }
}

// Crée un élément : el('div.classe#id', { attrs }, [enfants|texte]).
export function el(selector, attrs = {}, children = []) {
  const parts = selector.split(/(?=[.#])/);
  const tag = parts[0].match(/^[a-z0-9]+/i) ? parts[0].replace(/[.#].*$/, '') : 'div';
  const node = document.createElement(tag || 'div');
  for (const p of parts) {
    if (p.startsWith('.')) node.classList.add(p.slice(1));
    else if (p.startsWith('#')) node.id = p.slice(1);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className += (node.className ? ' ' : '') + v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') setStyle(node, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function qs(sel, root = document) {
  return root.querySelector(sel);
}
