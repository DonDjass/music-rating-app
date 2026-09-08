# Gaps & décisions d'implémentation

Ce fichier trace les choix faits quand PRODUCT_SPEC.md ne couvre pas
explicitement un point (ambiguïté, cas limite non précisé). Format par
entrée : contexte → choix par défaut → justification. À valider a
posteriori — pas de blocage en cours de route sauf mention contraire.

---

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
