# Music App — État actuel et changements récents

> Récapitulatif lisible, à jour au **2026-09-16**. Pour le suivi formel
> destiné au TRS Excel, voir `SPEC_UPDATES_PROPOSEES.md`. Pour la
> traçabilité détaillée de chaque décision, voir `GAPS_ET_DECISIONS.md`.

---

## 1. Ce que l'application fait aujourd'hui

### Notation
- **Morceau** : NOTE AU FEELING (0–10, pas de 0,5) + NOTE PAR CRITÈRES
  (Performance / Texte / Production, 1 à 3 renseignés) → NOTE GLOBALE
  (moyenne des deux, ou l'une des deux si l'autre est vide). Statut
  **Classic** indépendant. « J'aime » indépendant.
- **Album** : même principe (feeling + critères + globale), avec 5 critères
  (Performance/Texte/Production/Cohérence/Créativité), dont les 3 premiers
  peuvent être **hérités automatiquement des morceaux notés** de l'album
  (recalculés en continu tant qu'on ne les ajuste pas à la main). Une
  4ᵉ composante, **« Notation morceaux »**, entre dans la NOTE GLOBALE album
  dès que 70 % des morceaux de l'album sont notés.
- **Artiste** : NOTE GLOBALE = moyenne des morceaux notés de l'artiste (tous
  albums confondus). Feeling/critères artiste : pas encore développés.

### Navigation & découverte
- **Recherche** unifiée (morceaux / albums / artistes) via MusicBrainz, avec
  historique des 10 dernières recherches, pochettes (Cover Art Archive puis
  Deezer en repli), résultats affichés dès qu'ils arrivent.
- **Fiche album** : tracklist complète, note par morceau, navigation
  Précédent/Suivant (boutons + swipe) entre les morceaux d'un même album.
- **Fiche artiste** : discographie notée, meilleurs titres.
- **Accueil** : mosaïque des dernières notations (morceaux/albums/artistes),
  avec deux niveaux de filtre — **Tout / Morceaux / Albums / Artistes**, et
  **Tout le monde / Mes notations**.
- **Bouton « Écouter »** (deep link Deezer) et **extrait 30 s** (morceau).

### Profils & accès
- **Profils légers** : un pseudo + un code à 4 chiffres (pas de mot de
  passe), mémorisés sur l'appareil. Chaque profil a ses propres notations,
  totalement isolées des autres.
- **Rôle administrateur** : un pseudo réservé, protégé par un mot de passe
  serveur ; peut basculer sur n'importe quel profil.
- **Partage de liens** et **consultation en lecture seule** (détaillés
  ci-dessous, nouveautés de cette semaine).

### Déploiement
- Local (développement) et **prod** : https://beta.applicalbum.com (Railway,
  HTTPS). Pas d'authentification globale (HTTP Basic Auth) — jugée inutile
  pour une bêta partagée à des amis de confiance.

---

## 2. Changements de cette semaine (11 → 16 septembre 2026)

### 🔗 Partage de liens directs *(nouveau)*
Chaque morceau et chaque album a désormais une **URL stable**
(`/track/{id}`, `/album/{id}`) accessible directement, y compris par
quelqu'un qui n'a jamais ouvert l'appli. Un bouton **Partager** sur la fiche
propose trois choix :
- **Partager la fiche** — lien nu.
- **Partager ma note** — lien + un message avec ta note pour cet élément.
- **Inviter à noter** — lien qui ouvre directement sur la zone de notation.

Le partage utilise la liste d'applications native du téléphone (WhatsApp,
Messages, etc.) quand c'est possible ; sinon le lien est copié. Un
destinataire sans profil passe par la création d'un pseudo puis atterrit
automatiquement sur la fiche visée.

### 👁️ Consultation en lecture seule *(nouveau)*
Depuis l'accueil en mode « Tout le monde », cliquer sur une notation de
quelqu'un d'autre **n'ouvre plus une fiche vide sous ton profil** — tu vois
maintenant **sa** notation, en lecture seule (bannière « Notation de X »,
toute action verrouillée), tracklist comprise pour un album. Un bouton
**« Noter »** te fait basculer sur ta propre notation, éditable normalement.

### 🏠 Accueil — mosaïque affinée
- Filtre **« Tout le monde » / « Mes notations »** (le pseudo de chacun
  s'affiche sur sa tuile en mode « Tout le monde »).
- **Pagination** : 15 tuiles à l'ouverture, bouton « Voir plus » pour
  charger la suite.
- **Plafond par album** : un album très noté ne noie plus la mosaïque — au
  -delà de 2-3 morceaux (selon la vue), les suivants sont résumés par une
  tuile « +N autres » (pochette assombrie), qui ouvre l'album complet.

### 🛠️ Corrections notables
- **Bug critique de routing** (lié au partage de liens) : les fichiers
  CSS/JS étaient référencés en chemin relatif, ce qui cassait tout le style
  et le JS sur les nouvelles URLs `/track/...` et `/album/...` — corrigé.
- **Retour à la tracklist** depuis l'écran de notation d'un album :
  jusqu'ici, une fois scrollé dans les critères, il n'y avait plus moyen de
  revenir sans remonter tout en haut. Un raccourci **toujours visible**
  (barre sticky) a été ajouté.
- **Repli de partage compatible HTTP** : sur un réseau local (test avant
  mise en prod), le partage natif et le presse-papiers du navigateur sont
  indisponibles (ils exigent HTTPS) — un repli fiable (lien affiché,
  copiable) a été ajouté pour ce cas.

---

## 3. Ce qui reste hors périmètre (connu, assumé)

- **Confidentialité par notation** : en mode « Tout le monde », toutes les
  notations de tous les profils sont visibles par n'importe qui — aucune
  option public/privé pour l'instant. Accepté pour la bêta entre amis.
- **Fiche artiste** : pas de bouton Partager, pas de consultation en lecture
  seule, pas de feeling/critères propres (routing `/artist/{id}` déjà prêt).
- **Statut Classic** au niveau album/artiste : emplacement affiché, jamais
  développé.
- **Pas de vrai système de comptes** : les profils légers séparent les
  notations mais sans authentification réelle.

---

## 4. Où trouver le détail

| Besoin | Fichier |
|---|---|
| Suivre chaque décision/écart au fil de l'eau, avec le contexte exact | `GAPS_ET_DECISIONS.md` |
| Ce qui doit être reporté dans le TRS Excel (format ID GD/RQ/BR/CR) | `SPEC_UPDATES_PROPOSEES.md` |
| Spec formelle d'origine (générée depuis l'Excel, ne pas éditer) | `PRODUCT_SPEC.md` |
| Spec de référence pour la notation d'album | `PRODUCT_SPEC_NOTATION_ALBUM.md` |
| Étapes de déploiement / hébergement | `HEBERGEMENT.md` |
