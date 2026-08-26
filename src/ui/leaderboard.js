// Page « Classement » : général, par jeu, et par groupe privé.
//
// Tout y est facultatif. Sans connexion, la page explique à quoi elle sert et
// n'empêche rien : le jeu reste entier.

import { el, clear } from '../core/dom.js';
import { jeuxOuverts } from '../core/registry.js';
import {
  isSignedIn, isAnonymous, signIn, signInAnonymously, signOut, myProfile,
  setPseudo, deleteAccount, saveProfileDetails,
} from '../core/account.js';
import {
  globalRanking, gameRanking, groupRanking, myGroups, createGroup, joinGroup,
  leaveGroup, flush, pendingCount, myMonthlyPoints, previewGroup, groupInviteUrl,
} from '../core/leaderboard.js';
import { toast } from './effects.js';
import { showModal, closeModal } from './modal.js';
import { authChoices, upgradePanel } from './authbuttons.js';
import { navigate } from '../core/router.js';
import { copyText } from '../core/share.js';
import { niveauParRang } from '../core/xp.js';
import { ecusson } from './ecusson.js';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function monthLabel() {
  const now = new Date();
  return `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

export function renderLeaderboard(view) {
  clear(view);
  const wrap = el('div.board');
  wrap.append(el('div.stats__head', {}, [
    el('a.stats__back', { href: '#/', text: '← Retour au hub' }),
    el('h1.stats__title', { text: '🏆 Classement' }),
    el('p.board__month', { text: `XP gagnée en ${monthLabel()} · remise à zéro le 1er` }),
  ]));
  view.append(wrap);

  const body = el('div.board__body');
  wrap.append(body);

  if (!isSignedIn()) { renderSignedOut(body); return; }
  renderSignedIn(body);
}

// --- Déconnecté -------------------------------------------------------------

function renderSignedOut(body) {
  clear(body);
  body.append(el('div.board__intro', {}, [
    el('p', { text: 'Le classement compte l’XP gagnée ce mois-ci, tous joueurs confondus, '
      + 'et repart de zéro chaque mois. Chaque jeu réussi rapporte 10 XP, le double à '
      + 'partir de 3 jours d’affilée sur ce jeu, le quadruple à partir de 25. '
      + 'Il récompense donc la régularité plus que la performance.' }),
    el('p.board__note', { text: 'Les séries sont recalculées par le serveur à partir de '
      + 'tes parties enregistrées : personne ne peut s’attribuer un multiplicateur.' }),
    el('p.board__note', { text: 'Se connecter ne sert qu’à ça. Le jeu reste entièrement '
      + 'jouable sans compte, et ta progression locale n’est pas touchée.' }),
  ]));
  body.append(el('div.board__auth', {}, [
    authChoices({ onSignedIn: () => renderSignedIn(body) }),
  ]));
}

// --- Connecté ---------------------------------------------------------------

async function renderSignedIn(body) {
  clear(body);
  body.append(el('p.board__loading', { text: 'Chargement…' }));

  let profile = null;
  try {
    profile = await myProfile();
  } catch (error) {
    clear(body);
    body.append(errorCard(error));
    return;
  }

  if (!profile) { renderPseudoForm(body); return; }

  clear(body);
  body.append(el('div.board__me', {}, [
    el('span.board__pseudo', { text: profile.pseudo }),
    el('span.board__points', { text: '…' }),
  ]));
  if (isAnonymous()) {
    body.append(el('div.board__warn', {}, [
      el('p', { text: 'Compte sans identification : il n’existe que dans ce navigateur. '
        + 'Si tu y tiens, note ton pseudo — c’est tout ce qui te relie à ton XP.' }),
      upgradePanel({ onSignedIn: () => renderSignedIn(body) }),
    ]));
  }
  refreshMyPoints(body.querySelector('.board__points'));

  const tabs = el('div.board__tabs');
  const panel = el('div.board__panel', { 'aria-live': 'polite' });
  const views = [
    { id: 'global', label: 'Général', render: renderGlobal },
    { id: 'jeux', label: 'Par jeu', render: renderByGame },
    { id: 'groupes', label: 'Mes groupes', render: renderGroups },
  ];
  let active = 'global';

  function select(id) {
    active = id;
    [...tabs.children].forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'));
    views.find((v) => v.id === id).render(panel);
  }

  views.forEach((v) => tabs.append(el('button.board__tab', {
    type: 'button', 'data-tab': v.id, text: v.label,
    'aria-selected': v.id === active ? 'true' : 'false',
    onClick: () => select(v.id),
  })));

  body.append(tabs, panel, profileDetails(profile), accountFooter(body));
  select(active);
}

async function refreshMyPoints(node) {
  try {
    await flush();
    const points = await myMonthlyPoints();
    const waiting = pendingCount();
    node.textContent = `${points} XP`
      + (waiting ? ` (+${waiting} en attente)` : '');
  } catch (_) {
    node.textContent = '—';
  }
}

function renderPseudoForm(body) {
  clear(body);
  const input = el('input.cf-input', {
    type: 'text', maxlength: '18', placeholder: 'Ton pseudo',
    'aria-label': 'Choisis ton pseudo', autocomplete: 'nickname',
  });
  const form = el('form.board__pseudo-form', {
    onSubmit: async (e) => {
      e.preventDefault();
      try {
        await setPseudo(input.value);
        renderSignedIn(body);
      } catch (error) {
        toast(error.message);
      }
    },
  }, [input, el('button.btn.btn--primary', { type: 'submit', text: 'Valider' })]);

  body.append(el('div.board__intro', {}, [
    el('h2', { text: 'Choisis ton pseudo' }),
    el('p.board__note', { text: 'C’est lui qui apparaîtra au classement — pas ton nom '
      + 'ni ton adresse. Deux à dix-huit caractères, modifiable plus tard.' }),
  ]), form);
  input.focus();
}

// --- Onglets ----------------------------------------------------------------

async function renderGlobal(panel) {
  clear(panel);
  panel.append(el('p.board__loading', { text: 'Chargement…' }));
  try {
    const rows = await globalRanking();
    clear(panel);
    panel.append(rankingTable(rows, 'Personne n’a encore marqué ce mois-ci.'));
  } catch (error) {
    clear(panel); panel.append(errorCard(error));
  }
}

async function renderByGame(panel) {
  clear(panel);
  const select = el('select.board__select', { 'aria-label': 'Choisir un jeu' },
    jeuxOuverts().map((g) => el('option', { value: g.id, text: g.name })));
  const list = el('div.board__list');
  panel.append(select, list);

  async function load() {
    clear(list);
    list.append(el('p.board__loading', { text: 'Chargement…' }));
    try {
      const rows = await gameRanking(select.value);
      clear(list);
      list.append(rankingTable(rows, 'Aucune XP sur ce jeu ce mois-ci.'));
    } catch (error) {
      clear(list); list.append(errorCard(error));
    }
  }
  select.addEventListener('change', load);
  load();
}

async function renderGroups(panel) {
  clear(panel);
  panel.append(el('p.board__loading', { text: 'Chargement…' }));
  let groups = [];
  try {
    groups = await myGroups() || [];
  } catch (error) {
    clear(panel); panel.append(errorCard(error)); return;
  }

  clear(panel);
  if (!groups.length) {
    panel.append(el('p.board__note', { text: 'Tu n’as pas encore de groupe. '
      + 'Crée-le et envoie le code à tes collègues, ou entre le code qu’on t’a donné.' }));
  }

  for (const group of groups) {
    const box = el('section.board__group');
    box.append(el('div.board__group-head', {}, [
      el('div', {}, [
        el('div.board__group-name', { text: group.nom }),
        el('div.board__group-meta', { text: `${group.membres} membre${group.membres > 1 ? 's' : ''}` }),
      ]),
      el('button.cf-giveup', {
        type: 'button', text: '🔗 Copier le lien',
        onClick: () => copyInvite(group.code),
      }),
    ]));
    const list = el('div.board__list', {}, [el('p.board__loading', { text: 'Chargement…' })]);
    box.append(list);
    groupRanking(group.code)
      .then((rows) => { clear(list); list.append(rankingTable(rows, 'Aucune XP ce mois-ci.')); })
      .catch((error) => { clear(list); list.append(errorCard(error)); });
    box.append(el('button.cf-giveup', {
      type: 'button', text: 'Quitter le groupe',
      onClick: async () => {
        try { await leaveGroup(group.code); renderGroups(panel); }
        catch (error) { toast(error.message); }
      },
    }));
    panel.append(box);
  }

  panel.append(el('div.board__group-actions', {}, [
    el('button.btn', { type: 'button', text: '＋ Créer un groupe', onClick: () => askCreate(panel) }),
    el('button.btn', { type: 'button', text: 'Rejoindre avec un code', onClick: () => askJoin(panel) }),
  ]));
}

// --- Boîtes de dialogue des groupes ----------------------------------------

function askCreate(panel) {
  const name = el('input.cf-input', { type: 'text', placeholder: 'Nom du groupe', maxlength: '40' });
  const password = el('input.cf-input', { type: 'password', placeholder: 'Mot de passe (facultatif)', autocomplete: 'new-password' });
  showModal({
    title: 'Créer un groupe',
    body: el('div.board__form', {}, [
      name, password,
      el('p.board__note', { text: 'Un code d’invitation sera généré : il suffit de '
        + 'l’envoyer pour que quelqu’un rejoigne. Le mot de passe n’est utile que si '
        + 'tu crains que le code circule trop.' }),
    ]),
    actions: [{
      label: 'Créer', primary: true, close: false,
      onClick: async () => {
        if (name.value.trim().length < 2) { toast('Donne un nom au groupe'); return; }
        try {
          const code = await createGroup(name.value, password.value);
          closeModal();
          showInviteLink(code, name.value.trim(), () => renderGroups(panel));
        } catch (error) { toast(error.message); }
      },
    }],
  });
  name.focus();
}

/** Extrait le code d'un lien collé, sous ses deux formes, ou d'une saisie directe. */
function codeFrom(input) {
  const text = input.trim();
  const fromQuery = text.match(/[?&]g=([A-Za-z0-9]{6})/);
  const fromHash = text.match(/#\/groupe\/([A-Za-z0-9]{6})/);
  const bare = text.match(/^([A-Za-z0-9]{6})$/);
  return ((fromQuery || fromHash || bare)?.[1] ?? text).toUpperCase();
}

function askJoin(panel) {
  const code = el('input.cf-input', {
    type: 'text', placeholder: 'Lien reçu, ou code à 6 caractères',
    autocapitalize: 'characters', autocomplete: 'off',
  });
  const password = el('input.cf-input', { type: 'password', placeholder: 'Mot de passe (si demandé)', autocomplete: 'off' });
  showModal({
    title: 'Rejoindre un groupe',
    body: el('div.board__form', {}, [code, password]),
    actions: [{
      label: 'Rejoindre', primary: true, close: false,
      onClick: async () => {
        try {
          const nom = await joinGroup(codeFrom(code.value), password.value);
          closeModal();
          toast(`Bienvenue dans « ${nom} »`);
          renderGroups(panel);
        } catch (error) { toast(error.message); }
      },
    }],
  });
  code.focus();
}

async function copyInvite(code) {
  const url = groupInviteUrl(code);
  const done = await copyText(url);
  toast(done ? 'Lien copié — envoie-le à qui tu veux' : url);
}

/** Après création : le lien en grand, prêt à être envoyé. */
function showInviteLink(code, name, onClose) {
  const url = groupInviteUrl(code);
  showModal({
    title: `« ${name} » est créé`,
    body: el('div.board__form', {}, [
      el('p.board__note', { text: 'Envoie ce lien à qui tu veux inviter. Il suffit de '
        + "l'ouvrir pour rejoindre le groupe." }),
      el('div.board__invite', { text: url }),
    ]),
    actions: [
      { label: 'Copier le lien', primary: true, close: false, onClick: () => copyInvite(code) },
      { label: 'Terminé', onClick: onClose },
    ],
    onClose,
  });
}

/**
 * Page d'atterrissage d'un lien d'invitation : #/groupe/ABC123
 * On annonce le nom du groupe avant toute chose — un lien qui ne dit pas où il
 * mène n'inspire rien de bon.
 */
export async function renderGroupInvite(view, rawCode) {
  const code = rawCode.toUpperCase();
  clear(view);
  const wrap = el('div.board');
  wrap.append(el('div.stats__head', {}, [
    el('a.stats__back', { href: '#/', text: '← Retour au hub' }),
    el('h1.stats__title', { text: '👥 Invitation' }),
  ]));
  const body = el('div.board__body', {}, [el('p.board__loading', { text: 'Chargement…' })]);
  wrap.append(body);
  view.append(wrap);

  let group = null;
  try {
    group = await previewGroup(code);
  } catch (error) {
    clear(body); body.append(errorCard(error)); return;
  }

  clear(body);
  if (!group) {
    body.append(el('p.board__note', { text: `Aucun groupe ne correspond au code ${code}. `
      + "Vérifie le lien — il a peut-être été tronqué en route." }));
    return;
  }

  body.append(el('div.board__intro', {}, [
    el('h2', { text: `Rejoindre « ${group.nom} » ?` }),
    el('p.board__note', { text: 'Tu verras le classement du mois des membres de ce groupe, '
      + "et eux verront le tien. Rien d'autre n'est partagé." }),
  ]));

  if (!isSignedIn()) {
    body.append(el('p.board__note', { text: "Il faut d'abord un compte — le plus léger "
      + "suffit, tu peux jouer sans t'identifier." }));
    body.append(authChoices({ onSignedIn: () => renderGroupInvite(view, code) }));
    return;
  }

  const password = group.mot_de_passe_requis
    ? el('input.cf-input', { type: 'password', placeholder: 'Mot de passe du groupe', autocomplete: 'off' })
    : null;
  const join = el('button.btn.btn--primary', {
    type: 'button', text: 'Rejoindre',
    onClick: async () => {
      join.disabled = true;
      try {
        const nom = await joinGroup(code, password?.value);
        toast(`Bienvenue dans « ${nom} »`);
        navigate('/classement');
      } catch (error) {
        toast(error.message);
        join.disabled = false;
      }
    },
  });
  body.append(el('div.board__form', {}, [password, join].filter(Boolean)));
}

// --- Briques communes -------------------------------------------------------

/**
 * Une ligne de classement : la place, l'écusson du niveau, le titre au-dessus
 * du pseudo, et l'XP du mois seule à droite.
 *
 * Le titre passe avant le pseudo parce que c'est lui qui se compare : deux
 * pseudos ne disent rien l'un de l'autre, deux niveaux si.
 */
function rankingTable(rows, emptyText, moi = null) {
  if (!rows?.length) return el('p.board__note', { text: emptyText });
  const table = el('ol.board__ranking');
  for (const row of rows) {
    // Le serveur envoie un numéro ; les titres et les écussons vivent ici, ce
    // qui permet d'élargir la grille sans migration. Un rang inconnu d'un
    // client ancien retombe sur le plus haut niveau qu'il connaisse.
    const niveau = niveauParRang(row.niveau || 1);
    const estMoi = moi && row.pseudo === moi;
    table.append(el('li.board__row', { 'data-moi': estMoi ? '1' : '0' }, [
      el('span.board__rank', { text: `${row.rang}` }),
      ecusson(niveau, 34),
      el('span.board__who', {}, [
        el('span.board__titre', { text: niveau.titre }),
        el('span.board__name', { text: row.pseudo }),
      ]),
      el('span.board__score', { text: `${row.points}` }),
    ]));
  }
  return table;
}

function errorCard(error) {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return el('div.board__error', {}, [
    el('p', { text: offline
      ? 'Pas de réseau : le classement s’affichera à la prochaine connexion. Ton XP est gardée.'
      : `Le classement n’a pas répondu : ${error.message}` }),
  ]);
}

/**
 * Renseignements facultatifs. Repliés par défaut : personne ne doit avoir
 * l'impression qu'il reste un formulaire à remplir pour jouer.
 */
function profileDetails(profile) {
  const box = el('details.board__profile');
  box.append(el('summary', { text: 'Mon profil (facultatif)' }));

  const prenom = el('input.cf-input', { type: 'text', placeholder: 'Prénom',
    maxlength: '40', autocomplete: 'given-name', value: profile.prenom ?? '' });
  const nom = el('input.cf-input', { type: 'text', placeholder: 'Nom',
    maxlength: '40', autocomplete: 'family-name', value: profile.nom ?? '' });
  const annee = el('input.cf-input', { type: 'text', inputmode: 'numeric',
    placeholder: 'Année de naissance', maxlength: '4',
    value: profile.annee_naissance ?? '' });

  const save = el('button.btn.btn--primary', { type: 'submit', text: 'Enregistrer' });
  const form = el('form.board__form', {
    onSubmit: async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await saveProfileDetails({ prenom: prenom.value, nom: nom.value,
                                   anneeNaissance: annee.value });
        toast('Profil enregistré');
      } catch (error) {
        toast(error.message);
      }
      save.disabled = false;
    },
  }, [
    el('p.board__note', { text: 'Rien de tout cela n’est obligatoire, et rien n’apparaît '
      + 'au classement — seul ton pseudo est visible des autres joueurs. Ces informations '
      + 'servent uniquement à savoir qui joue. Vide un champ pour l’effacer.' }),
    prenom, nom, annee,
    profile.email
      ? el('p.board__note', { text: `Adresse liée à ton compte : ${profile.email}` })
      : el('p.board__note', { text: 'Aucune adresse : tu joues sans identification.' }),
    save,
  ]);

  box.append(form);
  return box;
}

function accountFooter(body) {
  return el('div.board__account', {}, [
    el('button.cf-giveup', {
      type: 'button', text: 'Se déconnecter',
      onClick: async () => { await signOut(); renderSignedOut(body); },
    }),
    el('button.cf-giveup', {
      type: 'button', text: 'Supprimer mon compte',
      onClick: () => showModal({
        title: 'Supprimer le compte ?',
        body: el('p', { text: 'Ton pseudo, ton XP et tes groupes seront effacés '
          + 'définitivement. Ta progression sur cet appareil, elle, reste intacte.' }),
        actions: [
          { label: 'Annuler' },
          {
            label: 'Supprimer', primary: true, close: false,
            onClick: async () => {
              try {
                await deleteAccount();
                closeModal();
                toast('Compte supprimé');
                renderSignedOut(body);
              } catch (error) { toast(error.message); }
            },
          },
        ],
      }),
    }),
    // Les pseudos sont filtrés à l'écriture, mais aucun filtre ne voit tout.
    // Un joueur doit pouvoir signaler ce qui passe au travers, et l'adresse
    // doit être publiée : c'est la règle 1.2 de l'App Store, et c'est de toute
    // façon la moindre des choses sur un classement public.
    el('a.hub__stats-link', {
      href: 'mailto:fida.mili@gmail.com'
        + '?subject=' + encodeURIComponent('Signalement d’un pseudo — lesjeuxauburo')
        + '&body=' + encodeURIComponent('Pseudo signalé : \n\nMotif : \n'),
      text: 'Signaler un pseudo',
    }),
  ]);
}
