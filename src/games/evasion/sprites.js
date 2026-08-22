// Sprites vectoriels (SVG) des objets de bureau pour L'Évasion.
// Chaque entrée est le contenu interne d'un <svg viewBox="0 0 64 64">.
// Le café est volontairement coloré ; les autres objets restent ternes.

export const SPRITES = {
  // ★ La tasse de café : couleur chaude, se démarque de tout le reste.
  coffee: `
    <g stroke="#5a3a26" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M17 25 q5 -6 0 -11" fill="none" stroke="#d8c7ba"/>
      <path d="M26 25 q5 -6 0 -11" fill="none" stroke="#d8c7ba"/>
      <path d="M12 28 h30 v11 a15 15 0 0 1-15 15 a15 15 0 0 1-15-15 z" fill="#fbf6ef"/>
      <ellipse cx="27" cy="28" rx="15" ry="4.5" fill="#6f4a30"/>
      <path d="M42 31 a9 9 0 0 1 0 15" fill="none"/>
      <path d="M9 57 h36" />
    </g>`,
  box: `
    <g stroke="#7a5c34" stroke-width="2.4" stroke-linejoin="round">
      <path d="M12 24 L32 31 L52 24 L32 17 Z" fill="#d8bd90"/>
      <path d="M12 24 V45 L32 53 V31 Z" fill="#c4a570"/>
      <path d="M52 24 V45 L32 53 V31 Z" fill="#b0925f"/>
      <path d="M32 31 V53" />
      <path d="M23 20.5 L43 27.5" opacity=".45"/>
    </g>`,
  folder: `
    <g stroke="#8a6d2c" stroke-width="2.4" stroke-linejoin="round">
      <path d="M10 22 h15 l4 4 h25 v26 h-44 z" fill="#e3c56f"/>
      <path d="M10 31 h44" opacity=".4"/>
    </g>`,
  books: `
    <g stroke="#3a4048" stroke-width="2.1" stroke-linejoin="round">
      <rect x="13" y="41" width="38" height="10" rx="2" fill="#9a938a"/>
      <rect x="16" y="31" width="34" height="10" rx="2" fill="#8a9490"/>
      <rect x="12" y="21" width="38" height="10" rx="2" fill="#94858f"/>
    </g>`,
  printer: `
    <g stroke="#474d55" stroke-width="2.3" stroke-linejoin="round">
      <rect x="14" y="16" width="24" height="13" fill="#ccd0d5"/>
      <rect x="10" y="28" width="44" height="20" rx="3" fill="#b3b8bf"/>
      <rect x="18" y="42" width="28" height="13" fill="#e9ebed"/>
      <circle cx="47" cy="35" r="2" fill="#6f757d"/>
    </g>`,
  cabinet: `
    <g stroke="#474d55" stroke-width="2.3" stroke-linejoin="round">
      <rect x="18" y="11" width="28" height="42" rx="2" fill="#9ba0a8"/>
      <line x1="18" y1="25" x2="46" y2="25"/><line x1="18" y1="39" x2="46" y2="39"/>
      <rect x="28" y="16" width="8" height="3.5" rx="1" fill="#474d55"/>
      <rect x="28" y="30" width="8" height="3.5" rx="1" fill="#474d55"/>
      <rect x="28" y="44" width="8" height="3.5" rx="1" fill="#474d55"/>
    </g>`,
  clipboard: `
    <g stroke="#5a4a2c" stroke-width="2.3" stroke-linejoin="round">
      <rect x="16" y="16" width="32" height="40" rx="3" fill="#c6995a"/>
      <rect x="22" y="21" width="20" height="30" fill="#f3eee3"/>
      <rect x="25" y="11" width="14" height="8" rx="2.5" fill="#868b93"/>
      <line x1="26" y1="30" x2="38" y2="30" stroke="#c2bcae"/><line x1="26" y1="37" x2="38" y2="37" stroke="#c2bcae"/><line x1="26" y1="44" x2="34" y2="44" stroke="#c2bcae"/>
    </g>`,
  stapler: `
    <g stroke="#3a4048" stroke-width="2.3" stroke-linejoin="round">
      <path d="M12 42 h36 a4 4 0 0 1 4 4 v5 h-44 v-5 a4 4 0 0 1 4-4z" fill="#797f87"/>
      <path d="M14 42 l3 -12 h26 l3 12" fill="#9ba0a8"/>
      <line x1="20" y1="35" x2="40" y2="35" opacity=".5"/>
    </g>`,
  binder: `
    <g stroke="#5a2e2e" stroke-width="2.3" stroke-linejoin="round">
      <rect x="18" y="13" width="28" height="39" rx="2" fill="#a95d5d"/>
      <rect x="18" y="13" width="9" height="39" fill="#8a4a4a"/>
      <circle cx="22.5" cy="25" r="2" fill="#f0ece4"/><circle cx="22.5" cy="33" r="2" fill="#f0ece4"/><circle cx="22.5" cy="41" r="2" fill="#f0ece4"/>
    </g>`,
  phone: `
    <g stroke="#3a4048" stroke-width="2.3" stroke-linejoin="round">
      <rect x="15" y="34" width="34" height="17" rx="3" fill="#868b93"/>
      <path d="M17 34 q15 -15 30 0" fill="none"/>
      <rect x="24" y="23" width="16" height="8" rx="4" fill="#6c727a"/>
    </g>`,
  pencils: `
    <g stroke="#3a4048" stroke-width="2.3" stroke-linejoin="round">
      <line x1="27" y1="30" x2="24" y2="13" stroke="#c6995a" stroke-width="3.2"/>
      <line x1="33" y1="30" x2="35" y2="11" stroke="#7a8a86" stroke-width="3.2"/>
      <line x1="39" y1="30" x2="41" y2="15" stroke="#a95d5d" stroke-width="3.2"/>
      <path d="M21 30 h22 l-2 23 h-18 z" fill="#8f959d"/>
    </g>`,
  mug2: `
    <g stroke="#3a4048" stroke-width="2.4" stroke-linejoin="round">
      <path d="M18 26 h20 l-2 27 a3 3 0 0 1-3 3 h-10 a3 3 0 0 1-3-3 z" fill="#9aa0a8"/>
      <path d="M15 26 h26" />
      <path d="M23 26 v-5 h10 v5" fill="none"/>
    </g>`,
};

// Objets ternes disponibles pour les blocs (hors café).
export const DULL_SPRITES = ['box', 'folder', 'books', 'printer', 'cabinet', 'clipboard', 'stapler', 'binder', 'phone', 'pencils', 'mug2'];
