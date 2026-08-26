// Tableau de bord — ouvrir et fermer les jeux, regarder ce qui se passe.
//
// ## Ce que cette page n'est pas
//
// Elle n'est **pas** la sécurité. C'est du JavaScript servi publiquement :
// n'importe qui peut l'ouvrir, lire son code et appeler les mêmes fonctions à
// la main. Toute la protection vit dans PostgreSQL — voir supabase/admin.sql :
// les politiques d'écriture et chaque fonction de statistiques vérifient
// `est_admin()`. Sans le drapeau, l'API répond « aucune ligne » ou refuse.
//
// La page se contente donc d'être honnête : si le serveur ne renvoie rien,
// elle le dit et propose de se connecter, plutôt que de faire semblant.
//
// ## Une bascule agit sur les deux plateformes
//
// Le site et l'app iOS lisent la même table `reglages_jeux`. Fermer un jeu ici
// le retire de la tournée des deux côtés, sans republier quoi que ce soit —
// c'est tout l'intérêt : une validation Apple prend des jours, un jeu qui
// déçoit ne peut pas attendre.

import { el, clear } from '../core/dom.js';
import { GAMES } from '../core/registry.js';
import {
  isSignedIn, isAnonymous, signIn, signInAnonymously, signOut, rpc, request,
} from '../core/account.js';
import { nombre } from '../core/format.js';

const racine = document.getElementById('admin');

/** Nom lisible d'un jeu, à partir de son identifiant. */
function nomDe(id) {
  return GAMES.find((g) => g.id === id)?.name || id;
}

function carte(titre, contenu) {
  return el('section.page__card', {}, [
    el('h2.admin__titre', { text: titre }),
    ...(Array.isArray(contenu) ? contenu : [contenu]),
  ]);
}

/** Un tableau simple : en-têtes, puis lignes déjà mises en forme. */
function tableau(entetes, lignes) {
  return el('div.admin__scroll', {}, [
    el('table.admin__table', {}, [
      el('thead', {}, [el('tr', {}, entetes.map((t) => el('th', { text: t })))]),
      el('tbody', {}, lignes.map((cells) => el('tr', {}, cells.map(
        (c) => (c instanceof Node ? el('td', {}, [c]) : el('td', { text: String(c) })),
      )))),
    ]),
  ]);
}

// ------------------------------------------------------------------ écrans

function ecranConnexion(message) {
  clear(racine);
  racine.append(
    el('h1.page__title', { text: 'Tableau de bord' }),
    carte('Connexion requise', [
      el('p', { text: message || 'Cette page est réservée à l’administrateur du jeu.' }),
      el('div.admin__boutons', {}, [
        el('button.btn.btn--primary', {
          type: 'button', text: 'Continuer avec Apple',
          onClick: () => signIn('apple'),
        }),
        el('button.btn', {
          type: 'button', text: 'Continuer avec Google',
          onClick: () => signIn('google'),
        }),
      ]),
      el('p.admin__note', {
        text: 'Le compte doit porter le drapeau « admin », qui ne se donne que '
            + 'depuis l’éditeur SQL de Supabase. Voir supabase/admin.sql.',
      }),
    ]),
  );
}

function ecranErreur(texte) {
  clear(racine);
  racine.append(
    el('h1.page__title', { text: 'Tableau de bord' }),
    carte('Ça n’a pas répondu', [
      el('p', { text: texte }),
      el('button.btn', { type: 'button', text: 'Réessayer', onClick: demarrer }),
      el('button.cf-giveup', {
        type: 'button', text: 'Se déconnecter',
        onClick: async () => { await signOut(); demarrer(); },
      }),
    ]),
  );
}

// ------------------------------------------------------------------ données

async function chargerTout() {
  const [bilan, parJeu, courbe, comptes, reglages] = await Promise.all([
    rpc('bilan_admin'),
    rpc('bilan_par_jeu', { jours: 30 }),
    rpc('courbe_admin', { jours: 30 }),
    rpc('comptes_admin'),
    request('/rest/v1/reglages_jeux?select=jeu,actif,note,modifie_le&order=jeu'),
  ]);
  return { bilan, parJeu, courbe, comptes: comptes?.[0] || null, reglages };
}

// ------------------------------------------------------------------ rendu

function blocReglages(reglages, recharger) {
  const ouverts = reglages.filter((r) => r.actif).length;
  const lignes = reglages.map((r) => {
    const bouton = el('button', {
      type: 'button',
      class: `admin__bascule ${r.actif ? 'admin__bascule--on' : 'admin__bascule--off'}`,
      text: r.actif ? 'Ouvert' : 'Fermé',
      onClick: async () => {
        bouton.disabled = true;
        bouton.textContent = '…';
        try {
          await rpc('basculer_jeu', { id_jeu: r.jeu, nouvel_etat: !r.actif });
          await recharger();
        } catch (erreur) {
          bouton.disabled = false;
          bouton.textContent = r.actif ? 'Ouvert' : 'Fermé';
          alert(`Impossible : ${erreur.message}`);
        }
      },
    });
    return [nomDe(r.jeu), bouton,
      r.modifie_le ? new Date(r.modifie_le).toLocaleDateString('fr-FR') : '—'];
  });

  return carte('Les jeux', [
    el('p.admin__note', {
      text: `${ouverts} ouvert${ouverts > 1 ? 's' : ''} sur ${reglages.length}. `
          + 'Une bascule agit sur le site et sur l’application, tout de suite '
          + 'pour un nouveau visiteur, à la prochaine ouverture pour les autres.',
    }),
    tableau(['Jeu', 'État', 'Modifié le'], lignes),
    el('p.admin__note', {
      text: '⚠️ Fermer un jeu ne retire pas les parties déjà jouées ni l’XP '
          + 'gagnée : elles restent aux statistiques et au classement.',
    }),
  ]);
}

function blocResume(bilan, comptes) {
  const cases = (bilan || []).map((b) => el('div.admin__stat', {}, [
    el('div.admin__stat-nombre', { text: nombre(b.joueurs) }),
    el('div.admin__stat-libelle', { text: `joueurs · ${b.periode}` }),
    el('div.admin__stat-detail', {
      text: `${nombre(b.parties)} parties · ${nombre(b.xp)} XP`,
    }),
  ]));
  const c = comptes;
  return carte('En un coup d’œil', [
    el('div.admin__stats', {}, cases),
    c ? el('p.admin__note', {
      text: `${nombre(c.comptes)} comptes, dont ${nombre(c.avec_pseudo)} avec un `
          + `pseudo. ${nombre(c.actifs_7j)} ont joué cette semaine, `
          + `${nombre(c.actifs_30j)} ce mois-ci.`,
    }) : el('p.admin__note', { text: 'Aucun compte pour l’instant.' }),
  ]);
}

function blocParJeu(parJeu) {
  if (!parJeu?.length) return carte('Par jeu', el('p', { text: 'Rien encore.' }));
  const lignes = parJeu.map((j) => [
    nomDe(j.jeu),
    j.actif ? 'ouvert' : 'fermé',
    nombre(j.parties),
    nombre(j.joueurs),
    j.dernier ? new Date(j.dernier).toLocaleDateString('fr-FR') : '—',
  ]);
  return carte('Par jeu, sur trente jours', [
    el('p.admin__note', {
      text: 'C’est ce tableau qui dit lequel on peut fermer sans décevoir '
          + 'grand monde — et lequel il vaut mieux réparer.',
    }),
    tableau(['Jeu', 'État', 'Parties', 'Joueurs', 'Dernière'], lignes),
  ]);
}

function blocCourbe(courbe) {
  if (!courbe?.length) {
    return carte('Jour après jour', el('p', { text: 'Pas encore de partie enregistrée.' }));
  }
  const max = Math.max(...courbe.map((p) => p.joueurs), 1);
  const barres = courbe.map((p) => el('div.admin__barre', {
    title: `${p.jour} — ${p.joueurs} joueur(s), ${p.parties} partie(s)`,
    style: { '--h': `${Math.max(4, Math.round((p.joueurs / max) * 100))}%` },
  }));
  return carte('Jour après jour', [
    el('p.admin__note', {
      text: `Joueurs distincts par jour, sur trente jours. Sommet : ${max}. `
          + 'C’est la seule courbe qui dise si les gens reviennent — aucun '
          + 'total cumulé ne le dira jamais.',
    }),
    el('div.admin__courbe', {}, barres),
  ]);
}

async function ecranBord() {
  const donnees = await chargerTout();
  // Les fonctions renvoient un tableau vide quand `est_admin()` est faux :
  // l'API ne distingue pas « pas admin » de « rien à montrer », c'est à nous
  // de ne pas afficher un tableau de bord vide en faisant comme si tout allait.
  if (!donnees.bilan?.length) {
    ecranConnexion('Ce compte n’est pas administrateur. Le drapeau se pose '
      + 'depuis l’éditeur SQL de Supabase.');
    return;
  }

  const recharger = async () => { await ecranBord(); };
  clear(racine);
  racine.append(
    el('h1.page__title', { text: 'Tableau de bord' }),
    blocReglages(donnees.reglages || [], recharger),
    blocResume(donnees.bilan, donnees.comptes),
    blocParJeu(donnees.parJeu),
    blocCourbe(donnees.courbe),
    el('p.page__back', {}, [
      el('a', { href: 'index.html', text: '← Retour au jeu' }),
      ' · ',
      el('button.cf-giveup', {
        type: 'button', text: 'Se déconnecter',
        onClick: async () => { await signOut(); demarrer(); },
      }),
    ]),
  );
}

// ------------------------------------------------------------------ départ

async function demarrer() {
  if (!isSignedIn() || isAnonymous()) {
    ecranConnexion(isAnonymous()
      ? 'Ce compte est anonyme : il ne peut pas être administrateur.'
      : null);
    return;
  }
  try {
    await ecranBord();
  } catch (erreur) {
    ecranErreur(erreur.message || 'Erreur inconnue.');
  }
}

demarrer();
