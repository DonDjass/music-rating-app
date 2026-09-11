# Gaps & décisions d'implémentation

Ce fichier trace les choix faits quand PRODUCT_SPEC.md ne couvre pas
explicitement un point (ambiguïté, cas limite non précisé). Format par
entrée : contexte → choix par défaut → justification. À valider a
posteriori — pas de blocage en cours de route sauf mention contraire.

---

## Profils légers (multi-utilisateurs sans auth) — demande explicite 2026-09-11

Objectif : plusieurs personnes utilisent la même instance avec des notations
séparées, **sans vrai système de comptes** (préfigure GD-00001 / RQ-00006,
volontairement minimal pour la bêta).

- **Identité = un pseudo de confort.** Pas de mot de passe. Au premier accès
  (aucun pseudo sur l'appareil) une porte d'entrée plein écran le demande ;
  il est mémorisé en `localStorage` (`mr_profile`). Repli mémoire si
  `localStorage` indisponible (navigation privée).
- **Transport :** en-tête HTTP `X-Profile` sur chaque appel API, valeur passée
  par `encodeURIComponent` (reste ASCII même avec accents/emoji), décodée côté
  serveur. Normalisation : trim + espaces compactés + 40 caractères max.
  Comparaison **sensible à la casse** (« Don » ≠ « don ») — assumé pour rester
  simple.
- **Modèle de données :** une colonne `profile` sur `ratings`. La clé logique
  d'une notation devient `(mbid, profile)` : `getOrCreateTrackRow` /
  `getOrCreateAlbumRow` et toutes les lectures filtrent sur le profil courant.
  `rating_criteria` suit automatiquement (FK sur `ratings.id`).
- **Lectures adaptées (filtre `profile = ?`) :** fiche morceau, fiche album (y
  compris **« Notation morceaux » = moyenne des morceaux notés par CE profil**,
  `albumTrackStats`), fiche artiste (discographie notée + top titres + « J'aime »),
  « Mes notations », mosaïque d'accueil. Le recalcul auto d'album
  (`recomputeAlbumForRelease`) se fait dans le périmètre d'un seul profil.
- **Serveur :** les endpoints de notation (`/api/tracks/*`, `/api/albums/*`,
  `/api/my-ratings`, `/api/home`, `/api/artist`, `/api/album-tracks`) répondent
  **400 « Profil manquant. »** sans en-tête `X-Profile`. Recherche, pochettes,
  lien Deezer et historique restent hors périmètre profil.
- **Cache Deezer profile-agnostic :** `deezer_id` / `deezer_preview_url` ne
  dépendent pas de la personne → `cacheDeezerResult` réutilise n'importe quelle
  ligne du mbid, ou crée une ligne technique `profile IS NULL` (invisible des
  lectures de notations). Léger surcoût : chaque profil peut redéclencher une
  résolution Deezer une fois.
- **Migration one-shot :** à l'apparition de la colonne `profile`, toutes les
  notations existantes (264 lignes) sont rattachées au profil **« Don »**
  (l'utilisateur — nom choisi d'après le compte Git `DonDjass` /
  `don.djassi@gmail.com`, cf. sa proposition). Garde-fou : `UPDATE ... WHERE
  profile IS NULL` seulement lors de cette migration.
- **Non traité (léger) :** pas de liste de profils, pas de renommage, pas de
  fusion, `search_history` reste global (partagé entre profils).

### Rôle administrateur — demande explicite 2026-09-11

Sans aucun secret, un « rôle » ne protège rien (le client est manipulable :
console dev, appels directs). Le rôle admin est donc gardé par **un mot de
passe unique**, fourni au lancement via `ADMIN_PASSWORD` (jamais dans le repo).

- **Deux rôles :**
  - *Utilisateur normal* : pseudo seul. **Ne peut pas changer de profil**
    (lien retiré) ni endosser un pseudo réservé.
  - *Administrateur* (le propriétaire) : pseudo + mot de passe. Peut basculer
    sur **n'importe quel** profil depuis Réglages (« Basculer »).
- **Profils réservés :** `ADMIN_PROFILES` (défaut `Don`), comparés **sans
  casse**. Toute requête de notation avec `X-Profile` = un pseudo réservé et
  sans jeton admin valide → **403**.
- **Jeton :** `POST /api/admin/login {password}` → `token` =
  `HMAC-SHA256(ADMIN_PASSWORD, "admin-v1")` (hex). Vérification *stateless*
  (`crypto.timingSafeEqual`), stable tant que le mot de passe ne change pas.
  Client : jeton en `localStorage` (`mr_admin_token`) + en-tête `X-Admin-Token`.
  `GET /api/admin/check` valide un jeton mémorisé au démarrage ; s'il est
  invalide (mot de passe changé) le client repasse par la porte d'entrée.
- **`ADMIN_PASSWORD` non défini :** mode admin désactivé, **aucun profil
  réservé** (l'appli se comporte comme avant les rôles — compat descendante).
  Sinon « Don » deviendrait inaccessible faute de pouvoir prouver l'identité.
- **Se déconnecter / changer de profil :**
  - **« Se déconnecter »** (Réglages, les deux rôles) : efface le pseudo local
    (et le jeton si admin), retour à l'écran de connexion. **Aucune notation
    supprimée.** Un utilisateur normal peut ensuite ressaisir un pseudo (non
    réservé) — il peut donc toujours endosser un autre pseudo *normal*
    (usurpation entre normaux = limite assumée), mais jamais « Don ».
  - **« Basculer »** (Réglages, admin uniquement) : passe sur n'importe quel
    pseudo *sans quitter le mode admin*.
- **`GET /api/config`** expose `{ adminEnabled, reservedProfiles }` pour que la
  porte d'entrée affiche/masque le lien admin et refuse un pseudo réservé
  côté client (le pseudo admin est donc « découvrable » — accepté : la menace
  visée est l'écriture, pas la connaissance du nom).
- **Limites résiduelles assumées (bêta) :** pas de HTTPS en local → mot de
  passe en clair sur le réseau ; les utilisateurs normaux peuvent toujours
  s'usurper *entre eux* ; création de pseudos bidons non empêchée.
- **Lancement (Windows PowerShell) :**
  `$env:ADMIN_PASSWORD='...'; node server.js`.
- **Correctif annexe :** `User-Agent` MusicBrainz passé de `contact: test-local`
  à `MonAppNotationMusique/0.1 ( don.djassi@gmail.com )` (format exigé par MB
  pour un usage production).

## Modèle de données — table `ratings` générique + table `rating_criteria` séparée — DÉCISION D'ARCHITECTURE CONFIRMÉE (2026-09-08)

**Ce n'est pas un écart au spec ni un choix provisoire : c'est la cible
d'architecture validée. Ne pas revenir dessus sans décision explicite.**

**Décision :**
- **Une seule table `ratings`**, générique, avec un **champ « type d'entité »**
  (`entity_type` : `track` | `album` | `artist`) distinguant ce qui est noté.
  Elle porte les éléments communs à tous les niveaux : identifiant MusicBrainz,
  métadonnées figées, NOTE AU FEELING, NOTE GLOBALE, statut Classic, « J'aime ».
- **Une table séparée `rating_criteria`** (une ligne par critère : `rating_id`,
  `nom_critère`, `valeur`) pour l'évaluation par critères, dont le **nombre et la
  nature varient selon le niveau** (morceau : Performance / Texte / Production ;
  album et artiste : jeux de critères différents, non encore spécifiés). La NOTE
  PAR CRITÈRES reste calculée (moyenne des critères renseignés), pas stockée dans
  cette table.

**Justification :**
- Le spec traite morceau, album et artiste comme trois entités notables
  (RQ-00001/2/3) partageant la même logique de notation (feeling + critères +
  globale + Classic) — une table générique évite trois schémas parallèles.
- Les critères par niveau ne sont pas connus d'avance et ne sont pas au même
  nombre : les figer en colonnes (`crit_performance`, `crit_texte`…) ne passe pas
  à l'échelle album/artiste. Une table clé/valeur le permet sans migration de
  schéma à chaque nouveau critère.

**État actuel du code (2026-09-08) — NON ENCORE MIGRÉ :** `server.js` utilise
encore une table `ratings` unique avec les critères en colonnes fixes
(`crit_performance`, `crit_texte`, `crit_production`) et sans `entity_type`
(implicitement `track`). Cf. §R2 et §GD-00002-1 ci-dessous, qui décrivent l'état
transitoire. La migration vers le modèle ci-dessus reste à faire ; ces deux
entrées sont donc désormais de l'historique, pas la cible.

---

## Deep link Deezer — bouton « Écouter » (hors spec, demande explicite 2026-09-10)

Le bouton « Écouter » (morceau / album / artiste) était purement décoratif
(aucune règle du TRS ne le couvre). Rendu fonctionnel :

- **Résolution :** API de recherche Deezer (même API que le repli des
  pochettes, cf. SPEC_UPDATES B7). Recherche **plein-texte** `titre artiste`
  (les filtres `field:"value"` de Deezer se sont montrés peu fiables — ils
  renvoyaient des faux positifs ou rien). On prend `data[0]` (Deezer classe
  le meilleur résultat en premier).
- **Persistance :** colonnes `deezer_id` + `deezer_checked` sur `ratings`.
  `deezer_checked = 1` mémorise qu'une recherche a eu lieu (y compris un
  échec : `deezer_id` NULL) → pas de nouvelle recherche aux visites suivantes.
- **Album / artiste non notés :** `GET /api/deezer-link` crée une ligne
  `ratings` minimale (entity_type album/artiste, sans notation) pour porter
  le cache. Invisible partout (filtres `entity_type='track'` + `global_rating`).
  Alternative « table dédiée » écartée pour rester sur « une colonne » comme
  demandé.
- **Ouverture :** `window.open('https://www.deezer.com/<type>/<id>', '_blank')`.
  Le format d'URL standard laisse l'OS ouvrir l'app Deezer si installée
  (pas de détection app/navigateur côté client, comme demandé).
- **Aucune correspondance :** bouton grisé + « Non trouvé sur Deezer ».
- **Recherche indisponible** (Deezer down) : réponse `transient: true`, rien
  n'est mémorisé, le bouton garde son libellé par défaut (non bloquant).
- **Fiche artiste :** un bouton « Écouter » a été **ajouté** dans l'en-tête
  (il n'y en avait pas dans la maquette) pour homogénéité avec morceau/album.
- **Contrainte légale :** on ne stocke qu'un identifiant numérique public et
  on pointe vers deezer.com — aucun contenu Deezer n'est téléchargé/hébergé
  (cohérent avec SPEC_UPDATES B7).

### Extrait 30 s — bouton « Extrait » (fiche morceau uniquement, ajouté 2026-09-10)

En plus du deep link, la fiche morceau expose un bouton « Extrait » qui joue
in-page l'extrait de 30 s fourni par l'API Deezer (`track.preview`).

- **Portée :** morceau seulement (Deezer ne renvoie pas d'extrait pour un
  album/artiste). Absent des maquettes.
- **Persistance :** colonne `deezer_preview_url` sur `ratings`. Sentinelle
  `"none"` = ce morceau n'a pas d'extrait (permanent, on ne re-cherche pas) ;
  `NULL` = pas encore résolu.
- **Expiration :** les URL d'extrait Deezer sont signées et expirent vite
  (~15 min, paramètre `exp=` dans `hdnea`). À chaque visite, si l'URL manque
  ou est expirée, elle est rafraîchie via `GET /track/{id}` puis re-mémorisée.
- **Lecture :** `<audio>` unique, coupé à tout changement d'écran
  (`showOnly` → `stopPreview`). Le buffer est déchargé (`load()`) à l'arrêt.
- **Aucun extrait :** bouton « Extrait » grisé/inactif.
- **Lignes déjà en cache avant cette version :** `deezer_preview_url` NULL —
  l'extrait est backfillé automatiquement à la prochaine ouverture de la fiche.
- **Rappel exploitation :** redémarrer `server.js` après tout déploiement —
  un serveur resté sur l'ancien code mémorise `deezer_id` sans l'extrait.

## Notation d'album (GD-00003) — implémentation 2026-09-10

Source de référence : `PRODUCT_SPEC_NOTATION_ALBUM.md` (toutes règles `VALIDATED`).
Remplace la version placeholder (4 notes en lecture seule). Choix faits :

### 1. Modèle de données — migration incrémentale (confirmé par l'utilisateur)
- Ajout `entity_type` (`track`/`album`/`artist`, défaut `track`) sur `ratings`
  + table `rating_criteria` (clé/valeur, `is_manual`). **Utilisés pour l'ALBUM
  uniquement.** Les critères MORCEAU restent sur leurs colonnes fixes
  (`crit_performance`…) — migration complète repoussée.
- Toutes les requêtes track-centrées (`/api/home`, `/api/my-ratings`, page
  artiste) filtrées `entity_type = 'track'` pour ne pas mélanger les lignes
  album.
- Ligne album = une ligne `ratings` keyée sur le **mbid de la release**,
  `entity_type='album'`. Une ancienne ligne « J'aime album » (typée `track`
  avant migration) est convertie au premier enregistrement de notation.

### 2. Couverture — `album_track_count` mémorisé sur la ligne album
Le nombre total de morceaux vient de la tracklist MusicBrainz (pas en base).
Il est transmis par le client (`?total=` / champ `total`) et stocké sur la
ligne album, pour que le **recalcul automatique côté serveur** (déclenché par
une modif de morceau) puisse recalculer la couverture sans appel MB.
- **Limite v1 :** seuls les morceaux ouverts via la tracklist de l'album
  portent le lien `release_mbid` ; un morceau noté via la recherche directe
  ne compte pas dans la couverture / la moyenne MORCEAUX. Même limite que
  `buildAlbumContextFor` (Précédent/Suivant).

### 3. « Calculer depuis les morceaux » = opération de brouillon (pas d'API)
Les moyennes Performance/Texte/Production des morceaux sont renvoyées par
`GET …/notation` (`trackCritMeans`). Le bouton et le bouton « revenir à la
valeur calculée » agissent sur le brouillon client ; **rien n'est persisté
tant que l'utilisateur n'a pas cliqué Enregistrer** (cohérent avec l'écran
morceau). La confirmation avant d'écraser des valeurs manuelles est un
`confirm()` client.

### 4. Synchronisation des valeurs héritées
Un critère P/T/P avec `is_manual = 0` est resynchronisé sur la moyenne des
morceaux à chaque `recomputeAlbum` (modif de morceau, toggle, enregistrement
feeling/critères, mise à jour de `album_track_count`). `GET …/notation` ne
resynchronise pas en base mais renvoie toujours `trackCritMeans` frais.

### 5. Toggle MORCEAUX — préférence conservée en travers des changements de couverture
`morceaux_included` : NULL = défaut (compté dès éligible), 0/1 = choix explicite.
Si la couverture repasse sous 70 %, MORCEAUX est exclu du calcul mais la
**préférence 0/1 est conservée** (pas de retour au défaut). La ligne du toggle
n'est affichée que lorsque MORCEAUX est **éligible** (≥ 70 %) ; en dessous, la
moyenne reste visible « à titre informatif » sur la ligne MA NOTATION (grise)
et dans son pop-up de détail.

### 6. « Revenir à la valeur calculée » — en mode édition uniquement
Le spec ne précise pas le mode. Placé dans l'édition des critères (comme tout
ajustement de critère), affiché sous le critère concerné quand il est hérité,
ajusté manuellement, et qu'une moyenne morceaux existe.

### 7. Pas de suppression explicite de la NOTE AU FEELING album depuis l'UI
Cohérent avec SPEC_UPDATES A2 (suppression retirée de l'UI côté morceau).
La route `DELETE …/feeling` existe côté serveur mais n'est pas appelée.

### 7bis. RÉINITIALISER de la NOTE PAR CRITÈRES album — ÉCART ASSUMÉ vs. spec (demande explicite 2026-09-10)

**Nouvelle règle demandée :** RÉINITIALISER vide **toute** la NOTE PAR CRITÈRES
album (les 5 critères), y compris les valeurs héritées P/T/P — qui **ne
réapparaissent pas** automatiquement. Disponible dès qu'au moins un critère a
une valeur (héritée, manuelle ou mélange) ; désactivé si tout est vide. Reste
en édition, pas de sauvegarde immédiate. ENREGISTRER derrière → l'état vide
devient le nouvel état enregistré. ABANDONNER → dernier état enregistré.
« ↻ valeur calculée » (individuel) et le toggle MORCEAUX **inchangés**.

**Contredit `PRODUCT_SPEC_NOTATION_ALBUM.md` (règles `VALIDATED`) :**
- « BUSINESS RULE — Réinitialisation avec valeurs héritées » + « SCENARIO —
  Réinitialisation de critères Album comportant des interventions manuelles » :
  le spec dit que RÉINITIALISER **restaure les valeurs héritées disponibles**
  (P/T/P) — la nouvelle règle les vide et ne les restaure pas.
- « BUSINESS RULE — Disponibilité de RÉINITIALISER » + « BUSINESS RULE —
  RÉINITIALISER indisponible à l'état de référence » : le spec dit dispo
  **uniquement si une saisie/modif manuelle peut être annulée**, indispo si
  « uniquement des valeurs héritées non ajustées » — la nouvelle règle
  l'active dès qu'une valeur (même purement héritée) existe.
- « BUSINESS RULE — Critères partiels » + « SCENARIO — Attribution initiale »
  (« au moins un critère renseigné » pour enregistrer) : `PUT …/criteria`
  accepte désormais `criteria: {}` (remise à « non renseigné »). Le spec n'a
  aucun scénario pour vider une NOTE PAR CRITÈRES album.

À reporter dans `SPEC_UPDATES_PROPOSEES.md` (Partie A — modif d'exigences
existantes) pour arbitrage TRS. En attendant, l'implémentation suit la
demande explicite du 2026-09-10.

### 8. Complétude — pastille sur la ligne MA NOTATION

### 8. Complétude — pastille sur la ligne MA NOTATION
Petite pastille ronde devant MORCEAUX / FEELING / CRITÈRES : contour gris =
non renseigné, demi-dorée = partiel, pleine dorée = complet. La NOTE GLOBALE
n'en porte pas (résultat, pas une composante). « Détail à la demande » =
pop-up persistant existant (`albumPopupCtl`), pas de toast.

### 9. Statut « Classic » album — toujours non développé
Emplacement affiché, « Bientôt disponible » au clic (inchangé).

### À VALIDER a posteriori
- Sens du toggle conservé vs. « activé par défaut à chaque passage éligible ».
- Emplacement de « revenir à la valeur calculée » (édition).
- Affichage du toggle uniquement si éligible (spec littérale) vs. visible+grisé
  en dessous de 70 %.

---

## Swipe tactile pour Précédent/Suivant (hors spec)

Ajouté à la demande de l'utilisateur, en plus des boutons. Choix faits
sans confirmation :
- **Convention de sens** : swipe vers la gauche = suivant, swipe vers la
  droite = précédent (comme feuilleter des pages/photos). À inverser si
  ça ne semble pas naturel à l'usage.
- **Zone tactile étendue à toute la fiche** (élargie suite à un retour :
  au départ limitée à l'en-tête, car un swipe partant de la zone
  pochette/infos ne fonctionnait pas — cf. plus bas). Les sliders de
  notation (`input[type="range"]`) sont explicitement exclus de la
  détection (`touchstart` ignoré si la cible est un slider, + override
  CSS `touch-action: none` sur les sliders pour garantir qu'ils gardent
  leur geste horizontal natif complet malgré la restriction `pan-y`
  posée sur le reste de la fiche).
- **Seuil de déclenchement** : 60px de déplacement horizontal minimum, et
  le mouvement doit être nettement plus horizontal que vertical (pour ne
  pas confondre avec un scroll de la page).
- **Validé sur téléphone (2026-09-08)** : le swipe Précédent/Suivant et le
  rendu de la barre d'onglets (fond gris foncé, liseré doré fin, icône +
  libellé, onglets Accueil/Réglages) ont été confirmés OK par l'utilisateur
  sur son écran tactile. Convention de sens (gauche = suivant) validée à
  l'usage.

## Barre d'onglets "Mes notations / Recherche" en bas d'écran — RÉSOLU (2026-09-07)

**Contexte :** la maquette `Proposition header.png` place la barre
d'onglets "MES NOTATIONS / RECHERCHE" en haut de l'écran, au-dessus de la
fiche. L'implémentation la met en `position: fixed; bottom: 0` (barre de
navigation type mobile), tout en gardant le code couleur de la maquette
(fond gris, onglet actif doré plein + bordure noire, onglet inactif doré
pâle, tiers droit gris).
**Confirmé par l'utilisateur :** on garde la barre **en bas**. La position
basse est le choix retenu ; la maquette n'est suivie que pour le style des
onglets, pas pour leur emplacement. Écart assumé, pas une dérive.

## Écran de recherche — conforme à `Mode Recherche.png` — RÉSOLU (2026-09-07)

**Contexte :** l'écran de recherche développé (titre + barre pilule +
"MORCEAUX / ALBUM / ARTISTE" en libellés dorés répartis, onglet actif
souligné en doré) reprend la maquette `Mode Recherche.png` avec deux
différences mineures : police des catégories un peu plus petite que la
maquette, et présence d'un soulignement d'onglet actif absent de la
maquette.
**Confirmé par l'utilisateur :** on garde l'écran tel que développé, ces
différences mineures sont acceptées.

## Navigation Précédent/Suivant dans un album (hors spec)

Fonctionnalité ajoutée à la demande de l'utilisateur : deux boutons
"‹ Précédent" / "Suivant ›" sur la fiche de notation pour passer au
morceau adjacent, quand on est arrivé sur ce morceau via la tracklist
d'un album.

**Choix faits sans confirmation explicite :**
- **Portée limitée au contexte album** : la navigation n'existe que si le
  morceau vient du drill-down d'un album (liste ordonnée disponible). Un
  morceau ouvert depuis un résultat de recherche direct, depuis les
  morceaux d'un artiste, ou depuis "Mes notations" n'a pas de
  Précédent/Suivant (pas d'ordre naturel dans ces cas). Le bandeau est
  simplement masqué dans ces cas.
- **Boutons cliquables, pas de raccourci clavier** : "les flèches" a été
  interprété comme des boutons (‹ ›), pas comme les touches flèches du
  clavier. À ajouter si l'intention était un raccourci clavier.
- **RÉSOLU (2026-09-07)** : à la demande de l'utilisateur, le contexte est
  maintenant reconstruit depuis "Mes notations" aussi. Nouvelle colonne
  `release_mbid` (identifiant MusicBrainz de l'album, pas juste son nom)
  enregistrée quand un morceau est noté depuis une tracklist d'album.
  Depuis "Mes notations", si `release_mbid` est connu, un appel
  `/api/album-tracks` best-effort retrouve la tracklist et la position du
  morceau ; en cas d'échec (album introuvable, MusicBrainz indisponible),
  la fiche s'affiche quand même, simplement sans Précédent/Suivant. Ne
  fonctionne que pour les morceaux notés APRÈS ce correctif (le
  `release_mbid` n'est pas rétroactif sur les lignes déjà en base).

---

## Recherche de morceau (hors GD-00002 — fonctionnalité non spécifiée)

Fonctionnalité ajoutée à la demande de l'utilisateur : un écran de
recherche en amont de la fiche de notation, permettant de choisir
n'importe quel morceau via l'API MusicBrainz. Aucune section du
PRODUCT_SPEC.md ne couvre la recherche/sélection d'un morceau (GD-00002
suppose qu'on est déjà sur la fiche) : tous les points ci-dessous sont
donc des choix d'implémentation par défaut, pas des interprétations d'une
règle existante.

### R0. Recherche catégorisée (Albums / Morceaux / Artistes) + drill-down
**Contexte :** amélioration demandée après R1 (voir ci-dessous) : plutôt
qu'un seul type de résultat, la recherche interroge maintenant 3
endpoints MusicBrainz (`release`, `recording`, `artist`) et affiche 3
catégories. Cliquer un Album ouvre sa tracklist (`release?inc=recordings+artists`),
cliquer un Artiste ouvre ses morceaux (`recording?artist=<mbid>`, limité
à 25) — choix confirmé explicitement par l'utilisateur plutôt que de
relancer une recherche affinée ou de ne pas les rendre cliquables.
**Limitation connue :** MusicBrainz demande de rester autour d'1
requête/seconde ; une recherche catégorisée fait 3 appels, faits en
séquence (pas en parallèle) avec un court délai entre eux. En conditions
de test (nombreux appels rapprochés pendant le développement), on a
observé des 503 en chaîne faisant grimper une recherche à 20-47 secondes
avec le backoff initial (jusqu'à 4 tentatives, 1,5s/3s/4,5s). Le backoff a
été resserré (3 tentatives max, 800ms/1600ms) pour qu'un vrai
indisponibilité MusicBrainz remonte une erreur en ~8s max plutôt que de
faire attendre l'utilisateur une minute — mais rien ne garantit un temps
de réponse constant tant qu'on utilise l'API publique anonyme (pas de clé
dédiée).

### R1. Un seul champ de recherche, pas trois — SUPERSEDÉ PAR R0
**Contexte :** la demande couvrait "chercher un album ou un morceau ou un
artiste". Cette décision (un seul champ, un seul type de résultat) a
depuis été remplacée par la recherche catégorisée décrite en R0
(3 endpoints MusicBrainz, 3 catégories de résultats, drill-down). Gardé
ici pour l'historique.
**Choix :** un seul champ, branché sur la recherche "recording" de
MusicBrainz (qui indexe aussi le nom de l'artiste et le titre de
l'album associé) plutôt que trois modes de recherche séparés avec
navigation en cascade (artiste → ses morceaux, album → ses morceaux).
**Justification :** l'objectif final est toujours de choisir un morceau ;
un champ unique couvre les trois cas d'usage sans construire une
navigation à plusieurs niveaux. À revoir si la recherche par artiste/album
doit vraiment lister d'abord tous ses morceaux plutôt que remonter
directement des résultats de type "morceau".

### R2. Modèle de données : bascule vers un identifiant `mbid` générique
**Contexte :** le morceau était auparavant unique et codé en dur,
retrouvé par correspondance texte album+artist.
**Choix :** toutes les routes API sont désormais `/api/tracks/:mbid/...`,
et une ligne `ratings` est retrouvée/créée par son `mbid` MusicBrainz.
Nouvelles colonnes `track_title`, `duration_ms`, `release_date` (le
`title` renvoyé à l'écran retombe sur `album` si `track_title` est vide,
pour ne pas casser les anciennes lignes).
**Justification :** nécessaire pour supporter un nombre arbitraire de
morceaux. **Conséquence :** les deux lignes de démo créées précédemment
(id 1 : test Daft Punk, id 2 : "N.Y. State of Mind" codé en dur, toutes
deux sans `mbid`) deviennent orphelines/inaccessibles depuis l'appli — ce
sont juste des restes inertes en base, sans impact fonctionnel.

### R3. Pas de genre affiché pour les morceaux recherchés
**Contexte :** l'ancien en-tête affichait "année • durée • genre" pour le
morceau codé en dur (genre en dur : "Rap, East Coast").
**Choix :** pour un morceau issu de la recherche, la ligne n'affiche que
"date • durée" — le genre n'est pas fourni de façon fiable par la
recherche "recording" de MusicBrainz sans requête supplémentaire.
**Justification :** éviter un appel réseau MusicBrainz de plus par
sélection (déjà 1 requête pour rechercher, aucune pour sélectionner —
les métadonnées viennent du résultat de recherche déjà en main).

### R4. Pas de pochette réelle pour les morceaux recherchés
**Contexte :** récupérer une vraie pochette nécessiterait une requête
Cover Art Archive supplémentaire par sélection (sur l'identifiant de
l'ALBUM, pas du morceau).
**Choix :** le placeholder dégradé + note de musique reste utilisé pour
tous les morceaux, y compris ceux choisis par recherche.
**Justification :** cohérent avec R3 (éviter les appels réseau
supplémentaires par sélection) ; à ajouter plus tard si la pochette
devient importante.

### R5. Métadonnées figées au moment de la sélection
**Contexte :** titre/artiste/album/date/durée sont transmis par le
front (déjà récupérés lors de la recherche) et stockés une seule fois à
la création de la ligne.
**Choix :** si ces informations changent un jour sur MusicBrainz, la
fiche déjà créée ne se met pas à jour automatiquement.
**Justification :** évite un appel MusicBrainz à chaque chargement de
fiche ; acceptable pour une appli de notation personnelle où la valeur
qui compte est la note, pas la fraîcheur des métadonnées.

### R6. Historique des recherches (hors spec) — 2026-09-08
Demandé par l'utilisateur : au focus du champ de recherche (avant saisie),
afficher les 10 dernières recherches, plus récente en tête ; un clic relance
la recherche.
**Choix faits :**
- **Stockage SQLite** (nouvelle table `search_history`, endpoints
  `GET/POST /api/search-history`) plutôt que `localStorage` : l'utilisateur
  accède au serveur local depuis son téléphone, un stockage côté serveur rend
  l'historique disponible quel que soit l'appareil/navigateur. Pas de notion
  de compte (historique global unique, cohérent avec §GD-00002-3).
- **Une ligne par requête distincte** : ré-insérer une requête déjà présente
  la remonte en tête (DELETE puis INSERT, colonne `query` UNIQUE). Pas de
  compteur d'occurrences.
- **L'historique = des chaînes de requête**, pas des entités : « toutes
  catégories confondues » est interprété comme « la recherche elle-même n'est
  pas catégorisée » (une requête interroge déjà les 3 endpoints). Cliquer une
  entrée relance la recherche complète, pas une catégorie précise.
- **Enregistré uniquement sur recherche réussie** (best-effort, n'interrompt
  jamais l'affichage des résultats). Une requête sans résultat est quand même
  enregistrée (c'est une recherche effectuée).

### R7. Tracklist d'un album — mise en page façon "Proposition Tracklist.png" — 2026-09-08
Demandé par l'utilisateur : ne plus répéter artiste/album/année sur chaque
ligne, puis (2ᵉ passe) suivre la maquette `Proposition Tracklist.png`.
**Choix :**
- **En-tête de la tracklist** : nom de l'album (centré, gras, majuscules)
  + sous-titre `Artiste · Année` (doré). **Figé** (`position: sticky`) :
  reste collé en haut pendant le défilement de la liste, avec fond noir
  pleine largeur qui masque les lignes défilant dessous.
  `/api/album-tracks` renvoie `artist` et `date` au niveau racine pour
  composer cet en-tête quel que soit le point d'entrée (recherche,
  résolution, clic album depuis une fiche).
- **Lignes** : titre du morceau à gauche (tronqué si trop long), durée
  `M:SS` à droite, filet de séparation clair sous chaque ligne, pas
  d'encadré/pastille. Classes `.tracklist`, `.tracklist-row`,
  `.tracklist-header`.
- **Pas de numéro de piste affiché** : la maquette montre un seul libellé
  par ligne (« Piste N » = texte de remplacement) ; l'ordre de la liste
  porte déjà la séquence. Le champ `position` reste renvoyé par l'API (tri /
  usage futur) mais n'est plus préfixé au titre. À réintroduire si un numéro
  visible est souhaité.
- **Divergences mineures assumées vs maquette** : la durée n'est pas
  parfaitement alignée sur la colonne de la maquette (léger `padding-right`
  en %), et le bouton « ← Retour aux résultats » reste au-dessus de
  l'en-tête (hors cadre de la maquette).
Les métadonnées complètes restent transmises à la fiche morceau à la
sélection — seul l'affichage de la liste change.
**Non touché :** la liste des morceaux d'un *artiste* (drill-down artiste)
garde l'ancien format « artiste — année » ; pas demandé.

### R8. Artiste et album cliquables depuis la fiche morceau — 2026-09-08
Demandé par l'utilisateur : cliquer le nom de l'artiste / de l'album en
en-tête de fiche ouvre la fiche correspondante.
**Choix faits :**
- **La base ne stocke que les noms** (pas les mbid artiste/album — cf. la
  décision d'archi en tête de fichier, migration à venir). On résout donc le
  nom → entité MusicBrainz à la volée : nouveaux endpoints
  `GET /api/resolve-artist?name=` et `GET /api/resolve-album?title=&artist=`
  (premier résultat de recherche MusicBrainz). Si l'album a un `release_mbid`
  connu (morceau noté depuis une tracklist), on l'utilise directement sans
  résolution.
- **« Fiche artiste » / « fiche album » = le drill-down existant** (morceaux
  de l'artiste / tracklist de l'album), pas une nouvelle vue dédiée — même
  comportement qu'un clic depuis les résultats de recherche.
- **Conséquence de navigation :** ouvrir un artiste/album depuis une fiche
  bascule l'onglet actif sur « Recherche » (le drill-down appartient au
  domaine recherche) ; le bouton « ← Retour aux résultats » ramène à la liste
  de résultats de recherche, éventuellement vide si on venait de « Mes
  notations ». Quirk assumé.
- **Résolution best-effort :** si MusicBrainz ne renvoie rien ou est
  indisponible, un toast « Fiche artiste/album introuvable » s'affiche et on
  reste sur la fiche.
- Petite amélioration au passage : `server.js` lit `process.env.PORT`
  (défaut 3000) pour pouvoir lancer une 2ᵉ instance de test sans conflit.

### R9. Écran tracklist d'album enrichi — 2026-09-08
Demandé par l'utilisateur : harmoniser l'écran tracklist avec la fiche morceau.
**Choix faits :**
- **En-tête riche** au lieu du bandeau texte : pochette (placeholder, comme
  la fiche — cf. R4), titre, artiste (cliquable → `openArtistByName`), année,
  bouton « ▶ Écouter » (décoratif, comme celui de la fiche morceau) et cœur
  « J'aime ». **Supersède** la décision « en-tête figé » (§R7 / passes
  précédentes) : plus de `position: sticky`, l'en-tête défile comme celui de
  la fiche morceau. Classes réutilisées : `.cover-art`, `.track-meta`,
  `.header-actions`, `.play-btn`, `.like-btn`.
- **« J'aime » l'album** : persisté sur une ligne `ratings` keyée sur le
  **mbid de la release** (via `PUT /api/tracks/<mbid>/like`, qui accepte
  désormais un `meta` pour nommer correctement la ligne). C'est un usage
  transitoire de la table générique en attendant `entity_type` (cf. décision
  d'archi en tête de fichier). Une ligne « aimé seulement » n'apparaît pas
  dans « Mes notations » (le filtre exige feeling/critères/Classic).
- **« Noter l'album »** : bouton présent mais **inactif** (`.is-disabled`,
  opacité 0.45, `cursor: not-allowed`, `title`/toast « Bientôt disponible »).
  La notation d'album (RQ-00002) n'est pas développée ; le bouton prépare le
  terrain visuel.
- **« Noter les morceaux »** : ouvre la fiche du 1ᵉʳ morceau de la tracklist
  (réutilise `selectTrack` + contexte album pour Précédent/Suivant).
  Interprétation de « en mode notation » : l'écran de notation de morceau
  (GD-00002) en consultation — pas un panneau d'édition ouvert d'office.
  Désactivé si la tracklist est vide.
- **NOTE GLOBALE par ligne** : `/api/album-tracks` fait un `JOIN` local
  (`ratings.mbid IN (…)`) et renvoie `globalRating` par morceau (null si non
  noté) → affiché à droite de la durée, « — » si pas de note. Renvoie aussi
  `isLiked` (état du cœur album) et `releaseMbid`.

### R9bis. Ligne « MA NOTATION » de l'album — 4 notes distinctes — 2026-09-08
Demandé par l'utilisateur (visuel : `Prepa Vue Album.png`). Remplace la ligne
« MA NOTATION » simple (héritée de la fiche morceau) par 4 notes :
`MA NOTATION · <morceaux> | <feeling> | <critères> | <globale>`.

- **1. Notation morceaux** (calculable maintenant) : moyenne des NOTE GLOBALE
  des morceaux de l'album déjà notés (`globalRating != null`, c.-à-d. feeling
  OU critères renseigné sur le morceau). « — » si aucun. Calcul côté client
  dans `computeAlbumNotes` à partir des `globalRating` renvoyés par
  `/api/album-tracks`.
- **2. Notation au feeling (album)** et **3. Notation par critères (album)** :
  pas encore développées → toujours « — ».
- **4. NOTE GLOBALE (album)** = **moyenne des 3 notes ci-dessus en excluant
  les non renseignées**, 1 décimale, pas d'arrondi à l'entier. Aujourd'hui
  seule la note « morceaux » existe → globale = note morceaux. **Cette
  formule (moyenne des disponibles) est actée et validée pour le futur** :
  quand feeling/critères album seront développés, la globale les intègrera
  sans changement de règle. Cohérent avec CR-00060→CR-00063 (même logique
  « moyenne des notes disponibles ») transposée au niveau album.
- **Décimales** : partout `n.toFixed(1)` (virgule) — jamais d'entier sec.
  Format d'un slot : `8,5/10` si renseigné, `—/10` sinon.
- **Style** : les 3 premières en écriture fine, dorées si note réelle, grises
  si « — » ; la globale en gras, dorée si ≥1 des 3 renseignée, grise sinon.
  Chaque note est cliquable → toast explicatif (textes fournis par
  l'utilisateur, dans `ALBUM_NOTE_HELP`).
- **Toggle « Classic » album** (à droite de la ligne, cf. `Prepa Vue Album.png`) :
  affiché mais **purement décoratif** — grisé (`opacity: 0.5`,
  `cursor: not-allowed`), jamais actif, clic → pop-up « Bientôt disponible ».
  Pas de persistance ni de colonne dédiée ; à câbler quand la notation
  d'album sera développée.

### R9ter. Messages temporaires — deux mécanismes distincts — 2026-09-08
L'utilisateur signale que les toasts passaient **derrière la barre d'onglets**
(invisibles), et que certains messages ne conviennent pas à un toast fugace.
- **Toast** (`.toast`) : repositionné **au-dessus de la barre d'onglets**
  (`bottom: calc(80px + env(safe-area-inset-bottom))`, `z-index: 20`), coins
  arrondis + `max-width` + `text-align:center` pour les messages un peu longs,
  durée 2,6 s. Réservé au **statut bref** : « Ajouté / Retiré des Classics »,
  « Impossible de modifier le statut Classic », « Fiche artiste/album
  introuvable », « Impossible de modifier « J'aime » », « Recherche de… ».
- **Pop-up album** (`.album-popup`) : petite carte **positionnée en absolu**
  juste sous la ligne « MA NOTATION » (le JS calcule `top`/`left`/`width`
  d'après `.album-notation`) — elle **ne décale pas** les boutons « Noter… ».
  **Fond jaune très pâle `#fdf5cf`, texte noir**, bouton « × ». Apparition /
  disparition en **fondu 0,35 s** (`opacity` + `visibility`). Se ferme **au
  bout de 10 s**, via le « × », ou en changeant d'album/artiste
  (`hideAlbumPopup()` dans `openAlbum` / `openArtist`). Utilisée pour les
  **explications** (les 4 textes des notes d'album) et les actions **pas
  encore développées** (« Noter l'album », « Classic » album) — trop long /
  trop utile pour un toast fugace.

### R10. Recherche — dédup album, filtre singles, résilience par catégorie — 2026-09-09
Demandé par l'utilisateur.
- **Dédup par release-group** (`searchReleases`) : une seule entrée par
  album quel que soit le nombre d'éditions (FR/US, rééditions…). `limit`
  MusicBrainz passée de 10 à 25 pour garder une liste fournie après
  traitement ; on retient les 12 premiers groupes (ordre de pertinence
  MusicBrainz conservé). Chaque entrée garde un **mbid de release** (pas de
  release-group) car `/api/album-tracks` fait un *lookup* de release. Date
  complétée depuis une autre édition si l'entrée retenue n'en a pas.
- **Filtre des singles** : `release-group.primary-type === "Single"` exclu
  de l'onglet Albums. **Tout le reste est gardé** (Album, EP, compilation,
  live, `primary-type` absent…). Les non-albums restants sont étiquetés
  discrètement dans le méta du résultat (« … — EP »).
- **Résilience par catégorie** (`handleSearch`) : les 3 recherches
  (recording / release / artist) tournent toujours en séquence mais chacune
  est isolée. Une catégorie en échec renvoie `<clé> = null` +
  `<clé>Error = "Indisponible pour le moment. Réessaie."` ; les autres
  passent quand même. Fini le 502 global. Côté front : message ambre
  discret dans la liste de la catégorie en échec + petite pastille ambre
  sur son onglet (`.category-tab.has-error`). `lastSearchErrors` réinitialisé
  si l'appel au serveur lui-même échoue.

### R11. Cache-Control sur les fichiers statiques — 2026-09-09
Le serveur n'envoyait aucun en-tête de cache → le téléphone gardait une
vieille `style.css` (des correctifs semblaient « revenir en arrière », ex.
en-tête album réapparu sur la vue artiste). `serveStatic` renvoie maintenant
`Cache-Control: no-store, must-revalidate`. Dev local uniquement.

### R12. Vue artiste enrichie — 2026-09-09
Demandé par l'utilisateur : même pattern visuel que les fiches morceau/album.
Nouvelle section `#artist-view` (l'ancien drill-down artiste = simple liste de
morceaux MusicBrainz — est **supprimé**, ainsi que `getArtistTracks` /
`/api/artist-tracks`). Nouvel endpoint `GET /api/artist?mbid=` (`getArtistPage`).
- **Header** : pochette placeholder (comme la fiche morceau, cf. R4), nom,
  genres/tags MusicBrainz (`inc=genres+tags`, top 3 par `count`, genres
  prioritaires sur tags), cœur « J'aime » persisté (ligne `ratings` keyée sur
  le mbid artiste, comme le « J'aime » album — n'apparaît pas dans « Mes
  notations »).
- **MA NOTATION** : même bloc 4 notes que l'album. « Notation morceaux » =
  moyenne des NOTE GLOBALE de **tous** les morceaux notés de l'artiste (tous
  albums confondus). Feeling / critères artiste = placeholders « — ». Globale
  = moyenne des disponibles (= notation morceaux aujourd'hui). Tooltips
  adaptés au contexte artiste. Toggle « Classic » décoratif (comme l'album).
- **Discographie** : `release-group?artist=<mbid>&limit=100`, Single exclu
  (comme R10), tri **récent → ancien** par `first-release-date`. Note par
  album = moyenne des NOTE GLOBALE des morceaux notés **dont le champ `album`
  (nom, faute de mbid en base) correspond au titre du release-group**
  (`COLLATE NOCASE`) — sinon « — ». Un clic ouvre la tracklist :
  `/api/album-tracks?rg=<releaseGroupMbid>` résout le groupe en une release
  représentative (`releaseFromGroup`).
- **Meilleurs titres** : `ratings` où `artist` (nom, `COLLATE NOCASE`) =
  l'artiste et `global_rating IS NOT NULL`, triés note décroissante. Aucune
  ligne « — ». Vide → « Pas encore de morceau noté pour cet artiste ».
- **Limites connues** : match par **nom** (artiste et album) tant que la
  migration `entity_type` / mbid n'est pas faite → collisions possibles,
  titres d'album non strictement identiques ratés. La discographie inclut
  live / compilations / remixes (seul « Single » est filtré) → liste parfois
  longue ; filtrer les `secondary-types` serait une option.

### R13. Recherche — cache + affichage progressif ; pochettes CAA/Deezer — 2026-09-09
Demandé par l'utilisateur.
- **Cache serveur** (`searchCache`, Map en mémoire, vie du process, TTL 1 h,
  300 entrées max, LRU grossier) : clé `catégorie:requête` (minuscules).
  Une recherche déjà obtenue n'appelle plus MusicBrainz (`{cached:true}`).
  Les échecs ne sont PAS mis en cache (un nouvel essai relance l'appel).
- **Affichage progressif** : `/api/search` (une réponse groupée) est remplacé
  par `/api/search/{tracks|albums|artists}`. Le front lance les 3 en parallèle
  et affiche chaque catégorie dès qu'elle répond. Skeleton animé dans la
  liste + petit spinner sur l'onglet tant que la catégorie charge.
  `searchRunId` ignore les réponses d'une recherche précédente.
- **Verrou MusicBrainz** (`mbGated` / `mbFetch`) : **tous** les appels MB
  (recherche, résolution, page artiste, tracklist…) passent par une file
  d'attente unique → un seul appel MB à la fois + délai de 350 ms entre deux,
  même quand le front tire 3 requêtes en parallèle. Timeout dur de 9 s par
  appel (`AbortSignal.timeout`) pour ne pas bloquer la file.
- **Pochettes** (`GET /api/cover`, `getCoverUrl`) : Cover Art Archive d'abord
  (API JSON release puis release-group, URL de thumbnail 500/250 forcée en
  `https`), repli sur la **recherche album Deezer** (API JSON, sans clé) si
  CAA n'a rien. Photo d'artiste : Deezer `search/artist` uniquement.
  **L'image Deezer n'est jamais téléchargée ni stockée côté serveur** (CGU
  Deezer) — on ne renvoie que l'URL, affichée telle quelle en `background-image`
  côté client. Cache d'URL en mémoire (TTL 24 h). Chargée en arrière-plan
  (ne bloque pas l'affichage) avec un jeton anti-course. Placeholder « ♪ »
  conservé si aucune pochette.
- **Nettoyage** : `/api/search` (groupé) et `handleSearch` supprimés.

### R14. En-tête figé (album + artiste) — 2026-09-09
Demandé par l'utilisateur (option « qui se réduit »). Sur les pages album et
artiste, la ligne « MA NOTATION » + les boutons de notation sont dans un bloc
`.sticky-head` (`position: sticky; top: 0`) : la pochette et les infos
défilent, ce bloc reste collé en haut, la liste défile dessous. Un titre
compact (`.sticky-head-title`, `titre · artiste`) n'apparaît que quand la
pochette est **entièrement** sortie de l'écran (IntersectionObserver sur
l'en-tête, `threshold: 0`) ; à ce moment le bloc prend un filet + une ombre
(`.collapsed`). La pop-up jaune est déplacée **dans** `.sticky-head` pour
rester ancrée sous la ligne notation même quand le bloc est collé.

### R15. Page d'accueil — mosaïque des dernières notations — 2026-09-09
Demandé par l'utilisateur (visuel `home_mosaic_proposal.html`).
- **Endpoint `GET /api/home`** : `tracks` = chaque ligne `ratings` avec une
  NOTE GLOBALE (triées récent → ancien) ; `albums` / `artists` = regroupés
  par **nom** (`AVG(global_rating)`, `MAX(created_at)`), faute de mbid en
  base. Exclut « Album/Artiste inconnu » et les vides. Un morceau
  **Classic sans note** n'apparaît pas (la tuile a besoin d'une note à
  afficher).
- **Vue** : barre de recherche factice (→ `showSearchView` + focus),
  filtres pastilles Tout/Morceaux/Albums/Artistes (Tout par défaut, doré
  plein), grille 3 colonnes de tuiles carrées (`gap: 3px`).
- **Tuile** : cover en fond (placeholder ♪ sinon), note en overlay bas-gauche
  (fond noir semi-transparent, texte doré, `formatNum` → 1 décimale),
  étoile Classic haut-gauche (morceaux uniquement — pas de Classic
  album/artiste). **Coin haut-droite laissé vide** = réservé à un futur
  badge « noteur » communautaire.
- **Covers** : chargées en *lazy* (IntersectionObserver sur les tuiles,
  `rootMargin` 300px), via `/api/cover`. Une URL Deezer « sans image »
  (segment de hash vide) est filtrée côté serveur (`cleanCoverUrl`) ;
  côté client, l'image n'est appliquée qu'après un `Image().onload` réussi
  (fiche morceau/album/artiste comprises).
- **Clic tuile** : morceau → fiche (contexte album best-effort) ; album →
  `openAlbumByName` (résolution) ; artiste → `openArtistByName`.
- **État vide** (rien de noté) : filtres + grille masqués, message +
  bouton « Chercher un premier morceau ». Filtre sans résultat (mais des
  notations ailleurs) : petit message « Rien dans cette catégorie ».

---

## GD-00002 — Écran de notation d'un morceau

### 0. Bouton "J'aime" (cœur) — fonctionnalité hors périmètre du spec
**Contexte :** le cœur affiché dans l'en-tête (issu de la maquette) n'est
mentionné nulle part dans PRODUCT_SPEC.md — GD-00002 ne couvre que NOTE AU
FEELING, NOTE PAR CRITÈRES, NOTE GLOBALE et le statut Classic. Il avait été
laissé décoratif/non fonctionnel initialement.
**Choix :** à la demande explicite de l'utilisateur, rendu cliquable avec
un état binaire "aimé"/"pas aimé" (cœur rouge rempli / contour), persisté
immédiatement en base (nouvelle colonne `is_liked`, nouvel endpoint
`PUT /api/track/like`), sur le même schéma que le statut Classic.
**Justification :** demande explicite. Comme ce n'est couvert par aucune
règle du spec, aucune des garanties de GD-00002 (BR-00066 à BR-00068,
scénarios de confirmation, etc.) n'a été appliquée ici — c'est un simple
toggle sans message de confirmation. À cadrer par une vraie fiche
fonctionnelle si "J'aime" doit devenir une fonctionnalité à part entière.

### 1. Réutilisation de la table `ratings` pour les morceaux
**Contexte :** `ratings` existait déjà pour noter des albums (colonnes
`album`, `artist`, `rating` entier). Le spec ne précise pas de modèle de
données ; il parle de "morceau" comme entité indépendante d'"album".
**Choix :** j'ai ajouté les colonnes nécessaires à la table existante
plutôt que de créer une table dédiée aux morceaux, et j'utilise les
colonnes `album`/`artist` pour stocker titre/artiste du morceau.
**Justification :** demande explicite ("ajoutant les colonnes
nécessaires à la table ratings"). À revoir si albums et morceaux doivent
un jour être distingués proprement (ex. colonne `type` ou table séparée).

### 2. Morceau unique codé en dur côté serveur
**Contexte :** le spec décrit la fiche d'un morceau générique (US-00010),
sans notion de liste de morceaux, de recherche ou de navigation entre
fiches.
**Choix :** `server.js` cible une seule ligne ("N.Y. State of Mind" /
Nas) en dur, pas de route par identifiant de morceau.
**Justification :** portée de la tâche limitée à un seul écran de démo.
À généraliser (route `/api/tracks/:id`) avant d'avoir plusieurs morceaux.

### 3. Aucune notion d'utilisateur / authentification
**Contexte :** le spec parle systématiquement de "l'utilisateur" au
singulier (RQ-00001 à RQ-00007) mais la vision produit (GD-00001) prévoit
un référentiel communautaire multi-utilisateurs.
**Choix :** aucune notion de compte ; toutes les notes appartiennent à un
utilisateur implicite unique.
**Justification :** hors périmètre de cette passe ; nécessaire dès que
GD-00001/RQ-00006 (agrégation communautaire) sera attaqué.

### 4. Basculer entre les deux blocs d'édition
**Contexte :** BR-00024 précise l'état visuel actif d'un bloc en édition
mais le spec ne dit pas ce qui se passe si l'utilisateur ouvre l'édition
d'un bloc pendant que l'autre est déjà en cours d'édition non enregistrée.
**Choix :** ouvrir l'édition d'un bloc abandonne silencieusement l'édition
en cours de l'autre bloc (perte du brouillon non enregistré, sans
confirmation).
**Justification :** un seul bloc éditable à la fois simplifie l'UI et
respecte BR-00024 sans ambiguïté visuelle. Le silence sur la perte du
brouillon est un raccourci — pourrait justifier une confirmation plus
tard.

### 5. Reclic sur le bouton d'un bloc déjà en édition
**Contexte :** non traité par le spec.
**Choix :** ne fait rien (pas de fermeture/toggle via le même bouton) ;
seules les actions Réinitialiser/Abandonner/Enregistrer changent l'état.
**Justification :** évite un comportement ambigu de type "toggle" non
demandé par les scénarios SC-00018/SC-00021.

### 6. Suppression d'une note enregistrée — fonctionnalité retirée de l'UI
**Contexte :** ST-00033/034 (feeling) et ST-00057/058 (critères) demandent
de pouvoir supprimer explicitement une note déjà enregistrée. La maquette
ne montre pas cette action ; j'avais ajouté un lien "Supprimer la note"
en mode édition pour rester conforme au spec, sans dialogue de confirmation
intermédiaire (écart déjà noté avec ST-00033/034/057/058 à l'époque).
**Choix :** à la demande explicite de l'utilisateur ("on n'en a pas besoin
normalement"), ce bouton et sa logique (front + rien côté API, les routes
`DELETE /api/track/feeling` et `DELETE /api/track/criteria` restent en
place côté serveur mais ne sont plus appelées) ont été retirés de l'écran.
**Justification :** demande explicite de l'utilisateur. **Écart assumé
avec le spec** — ST-00033/034 et ST-00057/058 (suppression d'une note
enregistrée) ne sont plus couverts par l'UI actuelle ; à réintroduire si ce
besoin redevient nécessaire (l'API existe toujours).

### 7. Sauvegarde bloquée tant que les valeurs requises manquent
**Contexte :** le spec ne dit pas explicitement ce qui se passe si on
clique "Enregistrer" sans avoir défini de valeur (feeling) ou avec des
critères partiellement renseignés.
**Choix :** le bouton "Enregistrer" est désactivé tant que la NOTE AU
FEELING n'a pas de valeur, ou qu'**aucun** des trois critères n'est
renseigné.
**MISE À JOUR (2026-09-08) — saisie partielle des critères autorisée :** on
peut enregistrer avec 1 ou 2 critères sur 3 ; la NOTE PAR CRITÈRES est alors
la moyenne des seuls critères renseignés (`averageOfSetCriteria` côté front,
`handleSaveCriteria` côté serveur). Cela **s'écarte de CR-00039 et de
ST-00044** ("les trois critères ont été renseignés" avant l'enregistrement) :
changement de spec proposé dans `SPEC_UPDATES_PROPOSEES.md`, à répercuter dans
le fichier Excel source. Reste bloqué : enregistrer zéro critère.
**VÉRIFIÉ (2026-09-08)** : le calcul côté interface exclut bien les critères
`null` (test unitaire de `averageOfSetCriteria` : 1 critère à 8 → 8,0, pas
8/3). Ajout d'un repère visuel : en édition, un critère non encore réglé est
estompé (classe `.mini-slider.unset`) et sa valeur affiche « — », pour qu'on
voie qu'il ne compte pas (utile aussi contre les touchers accidentels sur
mobile — cf. §espacement des critères ci-dessous).

### 7bis. Charte de couleur des sliders selon l'état édition — 2026-09-08
Demande explicite de l'utilisateur.
- **NOTE AU FEELING** et **3 critères (Performance/Texte/Production)** :
  hors édition → barre grise + curseur blanc bordé de gris ; en édition →
  barre violette + curseur bordé de violet. Porté par la variable CSS
  `--fill`, basculée par `#feeling-block.editing` / `#criteria-block.editing`.
- **Barre de synthèse « note par critères »** (slider du haut, résultat
  calculé) : **toujours grise**, quel que soit l'état — pour signifier
  qu'elle n'est jamais modifiable directement (BR-00037).
- **Changement vs décision antérieure (§GD-00002-10)** : cette barre de
  synthèse avait été rendue **sans curseur** pour la distinguer. L'utilisateur
  demande maintenant un **curseur visible mais gris** ; c'est la couleur (et
  non l'absence de curseur) qui porte désormais le « non manipulable ».
  Les repères d'échelle repassent donc en positionnement normal (le curseur
  de 16px est de retour), la classe `.slider-ticks.flush` est supprimée.

### 7quater. Boutons de section allégés — 2026-09-08
Demande de l'utilisateur : ces boutons sont de simples labels de section
cliquables, trop imposants.
- Libellés raccourcis : « NOTE AU FEELING » → « AU FEELING », « NOTE PAR
  CRITÈRES » → « PAR CRITÈRES ».
- `.pill-toggle` : `font-size` 12 → 11px, `padding` 9px 14px → 8px 12px,
  `gap` 7 → 6px. Cible tactile ≈ 100-115 × ~33px (large, confortable).
- `.pencil` (✎) : 12 → 15px pour garder l'affordance « cliquable pour
  éditer » bien visible malgré le bouton plus compact.

### 7ter. Espacement des sliders de critères + bouton « Écouter » — 2026-09-08
- Écart vertical entre Performance / Texte / Production porté de 10px à 22px
  (`.criteria-breakdown`) pour limiter les touchers du mauvais slider au
  doigt sur mobile.
- Épaisseur des barres : NOTE AU FEELING + synthèse à **8px**, les 3 critères
  à **4px** — pour bien distinguer les deux niveaux.
  **Piège corrigé au passage :** le sélecteur `input[type="range"]` (spécificité
  0,0,1,1) est plus fort que `.rating-slider` / `.mini-slider` (0,0,1,0) ; tant
  qu'il portait `height`, les épaisseurs par classe étaient ignorées (toutes
  les barres restaient à 4px). `height` a été retiré du sélecteur de base et
  n'est plus défini que sur les classes.
- Bouton « ▶ Écouter le morceau » : débordait légèrement sur petit écran →
  `font-size` 13→12px, `padding` horizontal 14→10px, `gap` de la barre
  d'actions 10→8px, + `overflow:hidden;text-overflow:ellipsis` en filet de
  sécurité. (Le bouton reste dans la colonne métadonnées à droite de la
  pochette, comme la maquette.)

### 8. Méthode d'arrondi
**Contexte :** CR-00039 et CR-00060 disent "arrondi au dixième" sans
préciser la méthode (arrondi standard vs bancaire, gestion du .05 exact).
**Choix :** arrondi standard "à la moitié supérieure"
(`Math.round(n * 10) / 10`).
**Justification :** comportement le plus intuitif/attendu, pas d'indice
contraire dans le spec.

### 9. Note globale stockée en base plutôt que recalculée à la volée
**Contexte :** BR-00064 dit que la NOTE GLOBALE est "mise à jour" sans
préciser si elle doit être persistée ou recalculée à chaque lecture.
**Choix :** `global_rating` est une colonne stockée, recalculée et
réécrite à chaque sauvegarde de la note au feeling ou des critères.
**Justification :** simplifie la lecture (une seule requête) ; le risque
de désynchronisation est nul tant que toutes les écritures passent par
les mêmes fonctions serveur.

### 10. Absence de maquette dans le dépôt
**Contexte :** le spec renvoie à des maquettes (`MCK-TRACK-001/002/003`)
pour les aspects visuels/interaction, mais aucun fichier de maquette
n'était présent dans le dossier au moment de l'implémentation.
**Choix :** style construit uniquement à partir de la description
donnée en conversation (dark mode, accent doré), sans référence visuelle
directe.
**Justification :** aucune autre source disponible. À comparer avec la
vraie maquette dès qu'elle sera accessible — écarts probables sur la
disposition exacte des blocs.
**MISE À JOUR (2026-09-07)** : les maquettes sont maintenant dans le dépôt
(`MCK-TRACK-001/002/003` + `Ajustement mockup.png`, commitées dans
`418f57c`). Passe d'alignement du style de la fiche sur
`Ajustement mockup.png` (référence la plus récente) : agrandissement de la
pochette, du titre, du bouton "Écouter le morceau" (désormais pleine
largeur), du cœur, des pills NOTE AU FEELING / CRITÈRES, des valeurs de
sliders et des boutons Réinitialiser/Abandonner/Enregistrer (pleine
largeur). Structure HTML inchangée (elle collait déjà). Divergences
conservées : §11bis-2 (pill active dorée pleine, pas de variante pâle).
Hors périmètre, non repris de 001/002/003 : la carte "NOTATION DE LA
COMMUNAUTE" (agrégation communautaire, cf. §3 — nécessite GD-00001).
La barre "note par critères" en lecture seule passe d'un ton olive terne
(`#8a8578`) à un gris clair (`#d2d2d2`) pour coller à
`Ajustement mockup.png` ; elle reste sans curseur donc toujours lisible
comme non manipulable (BR-00037).
**CONFIRMÉ (2026-09-07)** : rendu validé par l'utilisateur sur son
téléphone, on garde en l'état. Autres points d'amélioration à voir plus
tard.

### 11bis. Interprétation de deux bugs signalés (contexte perdu)
**Contexte :** l'utilisateur a signalé "doublon des critères" et "affichage
'0' incorrect" en référence à un échange précédent, mais ce contexte a été
perdu lors d'une compaction de la conversation — impossible de retrouver
le libellé exact des bugs.
**Choix :** relecture du code pour identifier les causes les plus
plausibles : (1) réassignation de `slider.value` depuis le propre handler
`input` du slider pendant le drag, pouvant perturber la mise à jour en
temps réel — déplacée vers des fonctions `syncFeelingSlider()` /
`syncCriteriaSliders()` appelées uniquement à l'ouverture/réinitialisation ;
(2) placeholders `0` codés en dur dans le HTML des lectures de sliders,
remplacés par `—` ; (3) le libellé "Note par critères (calculée)" dans le
panneau d'édition dupliquait le titre du bloc "NOTE PAR CRITÈRES",
raccourci en "Moyenne calculée".
**Justification :** plutôt que de bloquer sur une clarification, j'ai
appliqué les corrections les plus défendables au vu du code et signalé
explicitement l'interprétation faite, à confirmer ou corriger.

### 11ter. État par défaut du contraste actif/figé (rien en édition) — RÉSOLU
**Contexte :** la demande initiale de contraste inversé ne précisait pas
l'état par défaut (rien en édition). Une première implémentation grisait les
deux blocs par défaut, ce qui s'est avéré être le mauvais choix.
**Confirmé par l'utilisateur :** par défaut (rien en édition), les deux
blocs restent en couleur normale/vive. Le grisé ne s'applique qu'au bloc
"en face" de celui qui est activement en cours d'édition ; dès qu'on quitte
l'édition (Abandonner ou Enregistrer), les deux blocs redeviennent vifs.
Implémenté dans `updateBlockHighlight()` (public/app.js).

### 11bis-2. Contraste actif/figé contredit le code couleur des maquettes
**Contexte :** les maquettes MCK-TRACK-002/003 montrent l'inverse de ce qui
est demandé ici (pastille pâle = bloc en édition, pastille dorée vive =
bloc inactif).
**Choix :** l'instruction explicite la plus récente prime sur la maquette ;
la pastille du bloc actif reste dorée pleine (aucune variante pâle) et
l'encadré lumineux + le grisé du bloc inactif portent seuls la distinction.
**Justification :** demande explicite et directe de l'utilisateur, à traiter
comme un écart assumé par rapport à la maquette plutôt que comme une erreur
d'implémentation.

### 11. Pas de gestion de concurrence multi-onglets
**Contexte :** non traité par le spec.
**Choix :** aucune synchronisation si la fiche est ouverte dans plusieurs
onglets ; le dernier enregistrement gagne, sans détection de conflit.
**Justification :** cas limite hors périmètre d'une v1 mono-utilisateur
locale.

---

## Écarts explicites (hors ambiguïté — demandés directement, notés pour mémoire)

- **Incrément de la NOTE AU FEELING = 1** au lieu de 0,5 (contredisait
  BR-00015) : **RÉSOLU (2026-09-08)** — le slider "Note au feeling" est repassé
  à `step="0.5"` (`public/index.html`), conforme à BR-00015. Plus d'écart.
- **Gestion d'erreur réseau minimale** (pas de retry, pas de tous les cas
  d'échec type SC-00076) : demandé explicitement.

Ces points ne sont pas des décisions prises face à une ambiguïté du
spec — ce sont des simplifications directement instruites — mais ils
créent un écart avec des règles `VALIDATED` du spec, donc listés ici pour
qu'ils ne soient pas oubliés lors d'une passe de mise en conformité.
