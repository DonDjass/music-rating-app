# Changements de spécification proposés

> **NE PAS éditer `PRODUCT_SPEC.md` directement.** C'est un export du fichier
> Excel TRS, seule source de vérité. Ce document liste ce qui doit être
> reporté **dans l'Excel**, d'où il reviendra dans `PRODUCT_SPEC.md` à la
> prochaine génération.
>
> **Pour l'assistant (GPT) qui met à jour l'Excel :** les identifiants
> `GD/RQ/US/SC/ST/BR/CR/CX-XXXXX` sont des séquences à 5 chiffres partagées.
> Là où je propose une **nouvelle** exigence, je mets `-000XX` : attribue le
> prochain numéro libre. Les IDs cités entre backticks (`CR-00039`…) existent
> déjà dans le TRS. Chaque proposition est `À VALIDER` tant qu'elle n'est pas
> portée dans l'Excel.
>
> Mise à jour : 2026-09-09. Traçabilité détaillée côté implémentation :
> `GAPS_ET_DECISIONS.md` (§R0–R15, §GD-00002-x).

---

# PARTIE A — Modifications d'exigences existantes (GD-00002, Notation d'un morceau)

## A1. Saisie partielle des critères (1 ou 2 critères sur 3 suffisent)

**Contexte :** exiger les 3 critères (Performance, Texte, Production) pour
enregistrer une NOTE PAR CRITÈRES est trop rigide. L'implémentation autorise
déjà l'enregistrement dès qu'**au moins un** critère est renseigné ; la NOTE
PAR CRITÈRES est alors la moyenne des seuls critères renseignés.

**Statut : `À VALIDER`**

### A1a. `CR-00039` — Calculation Rule
- **Texte actuel :**
  > La NOTE PAR CRITÈRES correspond à la moyenne arithmétique des notes
  > attribuées aux critères Performance, Texte et Production. Le résultat est
  > arrondi au dixième.
- **Texte proposé :**
  > La NOTE PAR CRITÈRES correspond à la moyenne arithmétique des notes
  > effectivement attribuées parmi les critères Performance, Texte et
  > Production. Les critères non renseignés sont exclus du calcul. Le résultat
  > est arrondi au dixième.
  > Exemple : Performance = 8, Texte = 6, Production non renseignée →
  > NOTE PAR CRITÈRES = 7,0.

### A1b. `ST-00044` — GD-00002 › US-00040 › SC-00041 › Step 3
- **Texte actuel :**
  > Given les trois critères ont été renseignés ; When je clique sur
  > « Enregistrer » ; Then le système enregistre les valeurs des trois
  > critères et la NOTE PAR CRITÈRES correspondante, puis revient en mode
  > consultation.
- **Texte proposé :**
  > Given au moins un des trois critères a été renseigné ; When je clique sur
  > « Enregistrer » ; Then le système enregistre les valeurs des critères
  > renseignés et la NOTE PAR CRITÈRES correspondante, puis revient en mode
  > consultation.

### A1c. `ST-00043` — GD-00002 › US-00040 › SC-00041 › Step 2
- **Texte actuel :**
  > Given je suis en mode d'édition de la NOTE PAR CRITÈRES ; When je définis
  > les valeurs des critères ; Then le système recalcule dynamiquement la
  > NOTE PAR CRITÈRES et affiche le résultat sans permettre sa modification
  > directe.
- **Texte proposé :**
  > Given je suis en mode d'édition de la NOTE PAR CRITÈRES ; When je définis
  > ou modifie la valeur d'un ou plusieurs critères ; Then le système
  > recalcule dynamiquement la NOTE PAR CRITÈRES à partir des critères
  > renseignés et affiche le résultat sans permettre sa modification directe.

### A1d. Nouvelle Business Rule — `BR-000XX`
- **Texte proposé :**
  > L'enregistrement d'une NOTE PAR CRITÈRES nécessite qu'au moins un critère
  > soit renseigné. Tant qu'aucun critère n'est renseigné, l'action
  > « Enregistrer » n'est pas disponible.
- **Justification :** borne basse explicite (« zéro critère » reste interdit).

---

## A2. Suppression d'une note enregistrée — retirée de l'UI

**Contexte :** `ST-00033`/`ST-00034` (suppression NOTE AU FEELING) et
`ST-00057`/`ST-00058` (suppression NOTE PAR CRITÈRES) décrivent une action de
suppression explicite d'une note déjà enregistrée. À la demande de
l'utilisateur, cette action a été **retirée de l'interface** (« on n'en a pas
besoin normalement »). La logique serveur existe encore mais n'est plus
appelée.

**Décision produit à prendre :** soit (a) aligner le spec en retirant ces 4
steps et les scénarios `SC-00032` / `SC-00056` associés, soit (b) garder le
spec et réintroduire la fonctionnalité plus tard. **Recommandation : (a)** —
la modification d'une note couvre déjà la mise à jour ; la remise à « non
renseigné » pourra être ré-spécifiée si le besoin réapparaît.

**Statut : `À VALIDER` (choix produit)**

---

## A3. Libellés des boutons de section

Les boutons ouvrant l'édition sont libellés **« AU FEELING »** et
**« PAR CRITÈRES »** (au lieu de « NOTE AU FEELING » / « NOTE PAR CRITÈRES »
dans les maquettes `MCK-TRACK-001/002/003`) — ce sont de simples labels de
section, le mot « NOTE » est redondant avec le titre du bloc.

- **Impact spec :** cosmétique. Si les libellés exacts figurent dans une
  exigence ou une maquette référencée, les remplacer par « AU FEELING » /
  « PAR CRITÈRES ». Sinon, rien à faire.
- **Statut : `À VALIDER`**

---

## A4. NOTE PAR CRITÈRES — non manipulable, signalée par la couleur

`BR-00037` (la NOTE PAR CRITÈRES ne peut pas être modifiée directement) est
respecté. Détail d'implémentation à acter si le spec décrit le rendu : la
barre de synthèse « note par critères » reste **grise en permanence** (curseur
inclus), quel que soit l'état édition/consultation — c'est la couleur, et non
l'absence de curseur, qui porte le « non manipulable ». Les 3 sliders de
critères et le slider NOTE AU FEELING passent en violet en édition, gris
sinon.

- **Impact spec :** faible (rendu). À intégrer aux maquettes si elles sont
  regénérées. **Statut : `INFORMATIF`**

---

## A5. Incrément NOTE AU FEELING — conforme

`BR-00015` (échelle 0–10, incréments de 0,5) est **respecté** (le slider est
au pas de 0,5). Un écart temporaire « incrément = 1 » a existé puis a été
corrigé. **Aucune action.**

---

## A6. RÉINITIALISER de la NOTE PAR CRITÈRES Album — remise à vide totale

**Contexte :** demande explicite de l'utilisateur (2026-09-10). La logique du
spec (RÉINITIALISER restaure les valeurs héritées P/T/P) est jugée trop
restrictive à l'usage. Nouvelle règle voulue : **RÉINITIALISER vide toute la
NOTE PAR CRITÈRES Album** (les 5 critères), y compris les valeurs héritées,
qui ne réapparaissent pas automatiquement. L'utilisateur peut ensuite
recliquer « Calculer P/T/P depuis mes morceaux ». Implémenté ainsi.

**Statut : `À VALIDER` (choix produit)**

### A6a. Nouvelle formulation proposée — Disponibilité de RÉINITIALISER
- **Texte actuel (spec album) :**
  > Pendant l'édition des critères Album, l'action RÉINITIALISER est
  > disponible uniquement lorsqu'au moins une saisie ou modification manuelle
  > peut être annulée. […] Lorsque les critères Album sont déjà à leur état de
  > référence — aucune valeur manuelle ou uniquement des valeurs héritées non
  > ajustées — l'action RÉINITIALISER n'est pas disponible.
- **Texte proposé :**
  > Pendant l'édition des critères Album, RÉINITIALISER est disponible dès
  > qu'au moins un critère porte une valeur (héritée, manuelle, ou les deux).
  > Elle n'est indisponible que lorsque les cinq critères sont non renseignés.

### A6b. Nouvelle formulation proposée — Effet de RÉINITIALISER
- **Texte actuel (spec album) :**
  > Lorsque des valeurs héritées existent pour Performance, Texte ou
  > Production, RÉINITIALISER supprime les saisies et ajustements manuels
  > correspondants et restaure les valeurs héritées disponibles. Les saisies
  > manuelles de Cohérence et Créativité reviennent à un état non renseigné.
- **Texte proposé :**
  > RÉINITIALISER ramène les cinq critères Album à un état non renseigné, y
  > compris les valeurs héritées de Performance, Texte et Production —
  > l'héritage est rompu et les valeurs calculées ne sont pas restaurées
  > automatiquement. L'utilisateur reste en mode édition ; aucune sauvegarde
  > n'est effectuée. Un nouveau calcul depuis les morceaux peut être relancé
  > ensuite.

### A6c. Enregistrer une NOTE PAR CRITÈRES Album vide
- **Impact :** la règle « au moins un critère renseigné pour enregistrer »
  (BUSINESS RULE — Critères partiels) ne s'applique plus au cas où
  l'utilisateur **efface** une NOTE PAR CRITÈRES existante : ENREGISTRER
  après RÉINITIALISER persiste l'état « non renseigné » (équivalent d'une
  suppression de la NOTE PAR CRITÈRES Album). À arbitrer : faut-il un
  scénario dédié « Supprimer la NOTE PAR CRITÈRES Album » ?
- **Sans changement :** « ↻ valeur calculée » (retour hérité d'un critère
  précis) et le toggle « Prendre en compte mes notes des morceaux ».

---

# PARTIE B — Nouvelles fonctionnalités à spécifier

Toutes ces capacités ont été développées à la demande de l'utilisateur et ne
sont couvertes par **aucune** section actuelle du TRS (GD-00002 suppose qu'on
est déjà sur la fiche d'un morceau). Elles servent la vision produit
GD-00001 (constituer un référentiel personnel, découvrir, comparer).

## B1. Nouveau GD — Recherche d'un morceau, d'un album, d'un artiste

**General Description proposée :**
> La recherche permet à l'utilisateur de retrouver n'importe quel morceau,
> album ou artiste à partir d'une saisie libre, afin d'accéder à sa fiche et
> de le noter. Les résultats proviennent d'une base musicale externe
> (MusicBrainz).

**Requirements / Business Rules proposées :**
- `RQ-000XX` — Le système doit permettre de rechercher un morceau, un album
  ou un artiste à partir d'un champ de saisie unique.
- `BR-000XX` — Les résultats sont présentés en **trois catégories** :
  Morceaux, Albums, Artistes. Une seule catégorie est affichée à la fois
  (onglets) ; l'utilisateur bascule entre elles sans relancer la recherche.
- `BR-000XX` — L'onglet **Albums exclut les singles** (type « Single »).
  Albums, EP, compilations, live sont conservés ; le type est indiqué
  discrètement quand ce n'est pas un album (« … — EP »).
- `BR-000XX` — L'onglet **Albums est dé-doublonné par œuvre** : les éditions
  multiples d'un même album (pays, rééditions…) n'apparaissent qu'une fois.
- `BR-000XX` — **Affichage progressif** : chaque catégorie s'affiche dès que
  ses résultats sont disponibles, sans attendre les deux autres. Un
  indicateur de chargement (skeleton) est montré sur les catégories encore
  en attente.
- `BR-000XX` — **Résilience par catégorie** : si la recherche d'une catégorie
  échoue (service externe indisponible), les deux autres catégories
  s'affichent quand même ; seule la catégorie en échec porte un message
  d'erreur discret.
- `BR-000XX` — **Cache de session** : relancer exactement la même recherche
  réaffiche les résultats déjà obtenus sans nouvel appel externe.
- `BR-000XX` — **Historique de recherche** : au focus du champ (avant
  saisie), les 10 dernières recherches effectuées sont proposées, de la plus
  récente à la plus ancienne, toutes catégories confondues. Un clic relance
  la recherche.
- `BR-000XX` — **Drill-down** : sélectionner un Album ouvre sa fiche album
  (tracklist) ; sélectionner un Artiste ouvre sa fiche artiste ; sélectionner
  un Morceau ouvre sa fiche de notation.

## B2. Nouveau GD — Structure et navigation de l'application

**General Description proposée :**
> L'application est organisée en quatre sections accessibles par une barre
> d'onglets permanente en bas d'écran : Accueil, Recherche, Mes notations,
> Réglages.

**Requirements / Business Rules proposées :**
- `BR-000XX` — Barre d'onglets fixe en bas d'écran : **Accueil**,
  **Recherche**, **Mes notations**, **Réglages**. (Remplace / précise la
  barre « MES NOTATIONS / RECHERCHE » de la maquette `Proposition header.png`,
  qui était en haut ; la position basse est retenue.)
- `BR-000XX` — **Réglages** : section présente mais sans contenu pour
  l'instant (« Bientôt disponible »).
- `BR-000XX` — **Navigation Précédent / Suivant dans un album** : depuis la
  fiche d'un morceau ouvert via la tracklist d'un album, deux commandes
  « ‹ Précédent » / « Suivant › » permettent de passer au morceau adjacent de
  l'album. Indisponible (masqué) pour un morceau ouvert hors contexte album.
  Un **glissement horizontal** (swipe : gauche = suivant, droite = précédent)
  a le même effet.
- `BR-000XX` — Depuis la fiche d'un morceau, **le nom de l'artiste et le nom
  de l'album sont cliquables** et ouvrent respectivement la fiche artiste et
  la fiche album.

## B3. Nouveau GD — Fiche album

**General Description proposée :**
> La fiche album présente un album, sa tracklist, et la notation de
> l'utilisateur pour cet album.

**Requirements / Business Rules proposées :**
- `BR-000XX` — En-tête : pochette, titre de l'album, nom de l'artiste
  (cliquable → fiche artiste), année, bouton « Écouter » (décoratif pour
  l'instant), bouton « J'aime » (cf. B8).
- `BR-000XX` — L'en-tête reste **partiellement figé** au défilement : la
  pochette défile, mais la ligne de notation et les boutons d'action restent
  visibles en haut ; un titre compact apparaît alors.
- `BR-000XX` — **Tracklist** : une ligne par morceau, affichant le titre, la
  durée, et la **NOTE GLOBALE** du morceau si l'utilisateur l'a noté (« — »
  sinon). Un clic sur une ligne ouvre la fiche de notation du morceau.
- `BR-000XX` — Ligne **« MA NOTATION »** : voir B5 (bloc à 4 notes).
- `BR-000XX` — Bouton **« Noter les morceaux »** : ouvre la fiche du premier
  morceau de la tracklist, en réutilisant l'écran de notation de morceau
  (GD-00002).
- `BR-000XX` — Bouton **« Noter l'album »** : présent mais **inactif**
  (fonctionnalité non développée) ; un message « Bientôt disponible »
  s'affiche au clic. Correspond à `RQ-00002` (noter un album), à développer.

## B4. Nouveau GD — Fiche artiste

**General Description proposée :**
> La fiche artiste présente un artiste, sa discographie, ses morceaux les
> mieux notés par l'utilisateur, et la notation de l'utilisateur pour cet
> artiste.

**Requirements / Business Rules proposées :**
- `BR-000XX` — En-tête : photo (ou icône par défaut), nom, genre(s) / tags,
  bouton « J'aime » (cf. B8). En-tête partiellement figé au défilement
  (idem B3).
- `BR-000XX` — Ligne **« MA NOTATION »** : voir B5.
- `BR-000XX` — **Discographie** : liste des albums de l'artiste (singles
  exclus), du plus récent au plus ancien. Chaque album affiche sa **NOTE
  GLOBALE calculée** si l'utilisateur a noté des morceaux de cet album
  (« — » sinon). Un clic ouvre la fiche album.
- `BR-000XX` — **Meilleurs titres** : morceaux de cet artiste notés par
  l'utilisateur, triés de la meilleure NOTE GLOBALE à la moins bonne.
  N'affiche que les morceaux ayant au moins une note. Si aucun morceau noté :
  message « Pas encore de morceau noté pour cet artiste ».

## B5. Notation d'un album / d'un artiste — bloc « MA NOTATION » à 4 notes
**(précise `RQ-00002` et `RQ-00003`, aujourd'hui `VALIDATED` mais non détaillés)**

**Contexte :** la notation d'un album et d'un artiste réutilise le modèle de
GD-00002 (feeling + critères + globale) mais y ajoute une **note dérivée des
morceaux**. Le bloc « MA NOTATION » affiche 4 notes.

**Calculation / Business Rules proposées :**
- `BR-000XX` — Le bloc **« MA NOTATION »** d'un album (resp. d'un artiste)
  présente 4 notes : **Notation morceaux**, **Notation au feeling**,
  **Notation par critères**, **NOTE GLOBALE**.
- `CR-000XX` — **Notation morceaux (album)** = moyenne arithmétique des NOTE
  GLOBALE des morceaux de cet album que l'utilisateur a notés (feeling
  **ou** critères renseigné). Arrondi au dixième. Non renseignée si aucun
  morceau noté.
- `CR-000XX` — **Notation morceaux (artiste)** = même définition, sur **tous**
  les morceaux notés de l'artiste, tous albums confondus.
- `CR-000XX` — **NOTE GLOBALE (album / artiste)** = moyenne arithmétique des
  notes disponibles parmi { Notation morceaux, Notation au feeling, Notation
  par critères }, en excluant les notes non renseignées. Arrondi au dixième.
  Non renseignée si aucune des trois ne l'est. *(Même logique que
  `CR-00060`→`CR-00063` au niveau morceau, transposée.)*
- `BR-000XX` — **Notation au feeling** et **Notation par critères** au niveau
  album / artiste : **non développées pour l'instant**, affichées « — ».
  Aujourd'hui, la NOTE GLOBALE album/artiste = la Notation morceaux. La
  formule ci-dessus est actée pour intégrer feeling/critères sans changement
  de règle une fois développés.
- `BR-000XX` — Les critères par niveau ne sont **pas** ceux du morceau :
  Performance/Texte/Production sont propres au morceau. Les jeux de critères
  album et artiste restent **à spécifier**.
- `BR-000XX` — Toutes les notes affichées le sont **avec une décimale**
  (ex. « 8,5 »), jamais arrondies à l'entier.
- `BR-000XX` — Un **statut « Classic »** au niveau album et artiste est
  prévu (emplacement affiché) mais **non développé** ; inactif, « Bientôt
  disponible » au clic.

## B6. Nouveau GD — Page d'accueil (mosaïque des dernières notations)

**General Description proposée :**
> La page d'accueil présente, sous forme de mosaïque visuelle, les éléments
> (morceaux, albums, artistes) déjà notés par l'utilisateur, du plus
> récemment noté au plus ancien.

**Requirements / Business Rules proposées :**
- `BR-000XX` — En haut : un raccourci vers la Recherche (barre au style de
  l'écran Recherche, cliquable).
- `BR-000XX` — Sous la barre : filtres en pastilles **Tout / Morceaux /
  Albums / Artistes**. « Tout » sélectionné par défaut. Un filtre n'affiche
  que les tuiles du type correspondant.
- `BR-000XX` — **Grille de tuiles carrées (3 colonnes)**, triée du plus
  récemment noté au plus ancien. Une tuile = un morceau, un album ou un
  artiste noté.
- `BR-000XX` — Contenu d'une tuile : pochette en fond (icône par défaut si
  aucune) ; **NOTE GLOBALE** en superposition bas-gauche (fond noir
  semi-transparent, texte doré) ; **icône étoile** dorée en haut à gauche si
  l'élément est « Classic » (morceaux uniquement pour l'instant).
- `BR-000XX` — Le **coin en haut à droite de chaque tuile est réservé** à un
  futur badge « noteur » (fonctionnalité communautaire, cf. GD-00001) : rien
  n'y est affiché pour l'instant.
- `BR-000XX` — Un clic sur une tuile ouvre la fiche correspondante (morceau,
  album ou artiste).
- `BR-000XX` — **État vide** : si l'utilisateur n'a rien noté, un message
  invite à chercher un premier morceau / album, avec un lien vers la
  Recherche.
- **Note d'implémentation (pas une règle) :** les tuiles Album / Artiste sont
  aujourd'hui regroupées **par nom** (moyenne des morceaux notés), faute
  d'identifiant stable. Un morceau seulement « Classic » sans note n'apparaît
  pas (la tuile a besoin d'une note à afficher).

## B7. Pochettes — source et contrainte légale

**Business Rules proposées :**
- `BR-000XX` — Les pochettes d'album et de morceau sont récupérées d'abord
  auprès de **Cover Art Archive**. À défaut, l'application utilise l'**API de
  recherche Deezer** comme source de secours.
- `BR-000XX` — **Contrainte légale (CGU Deezer) :** l'image Deezer n'est
  **jamais téléchargée ni stockée** par l'application. Seule l'URL de la
  pochette est référencée et affichée en direct côté client.
- `BR-000XX` — Si aucune pochette n'est trouvée, une icône « note de
  musique » par défaut est affichée.

## B8. « J'aime » — suivre un morceau / un album / un artiste

**Contexte :** le cœur « J'aime » de l'en-tête (issu des maquettes) a été
rendu fonctionnel, sur morceau **et** album **et** artiste. Il n'est couvert
par aucune règle du TRS.

**Business Rules proposées :**
- `RQ-000XX` — Le système doit permettre à l'utilisateur d'indiquer qu'il
  « aime » un morceau, un album ou un artiste (état binaire, propre à
  l'utilisateur).
- `BR-000XX` — Toute modification du statut « J'aime » est enregistrée
  immédiatement (même schéma que le statut Classic, `BR-00068`).
- `BR-000XX` — Le statut « J'aime » est **indépendant** de toute notation :
  un élément « aimé » mais non noté n'apparaît **pas** dans « Mes notations ».
- **À cadrer :** faut-il une vue « Mes favoris » ? un impact sur l'accueil ?
  (non développé pour l'instant).

## B9. Bouton « Écouter » — deep link Deezer

**Contexte :** le bouton « Écouter » (des maquettes) était décoratif. Rendu
fonctionnel sur morceau, album et artiste (bouton ajouté à la fiche artiste,
absent de la maquette).

**Business Rules proposées :**
- `RQ-000XX` — Depuis la fiche d'un morceau / album / artiste, l'utilisateur
  peut ouvrir l'élément correspondant sur Deezer.
- `BR-000XX` — La correspondance Deezer est résolue une seule fois (API de
  recherche Deezer, meilleur résultat) puis mémorisée. Si aucune
  correspondance : le bouton est désactivé et indique « Non trouvé sur
  Deezer ».
- `BR-000XX` — L'ouverture se fait via l'URL Deezer standard
  (`deezer.com/track|album|artist/<id>`), qui laisse le système ouvrir
  l'app Deezer si elle est installée, sinon le site.
- `BR-000XX` — **Contrainte légale :** seul l'identifiant Deezer public est
  stocké ; aucun contenu Deezer n'est téléchargé ni hébergé (cf. B7).
- `BR-000XX` — **Extrait 30 s (fiche morceau) :** un bouton « Extrait » joue
  en place l'extrait de 30 s exposé par l'API Deezer. Seule l'URL d'extrait
  (transitoire, rafraîchie à la demande) est utilisée ; rien n'est stocké
  durablement au-delà de cette URL et de l'identifiant. Grisé si le morceau
  n'a pas d'extrait. Non prévu pour album/artiste (Deezer n'en fournit pas).

## B10. Profils légers (multi-utilisateurs sans authentification)

**Contexte :** version minimale de GD-00001 / `RQ-00006` pour la bêta —
plusieurs personnes sur la même instance, notations séparées, sans comptes.

**Business Rules proposées :**
- `RQ-000XX` — Au premier accès sur un appareil, l'utilisateur saisit un pseudo
  (texte libre, pas de mot de passe). Le pseudo est mémorisé sur l'appareil et
  n'est plus redemandé.
- `BR-000XX` — Toutes les notations (feeling, critères, Classic, J'aime, note
  d'album) sont rattachées au pseudo courant. Les écrans « ma notation » (fiche
  morceau, fiche album — dont **NOTE MORCEAUX**, fiche artiste), « Mes
  notations » et la mosaïque d'accueil ne montrent et ne calculent qu'à partir
  des notations du pseudo courant.
- `BR-000XX` — L'utilisateur peut changer de pseudo depuis les Réglages. Cela
  le déconnecte de l'appareil et redemande un pseudo ; **aucune notation n'est
  supprimée** (elles restent accessibles en ressaisissant l'ancien pseudo).
- `BR-000XX` — Les notations créées avant l'introduction des profils sont
  rattachées au pseudo du propriétaire de l'instance.
- **Hors périmètre (à cadrer plus tard) :** agrégation entre profils,
  comparaison communautaire (`RQ-00007`), gestion/renommage/fusion de profils.

---

# PARTIE C — Points volontairement laissés hors spec (ne pas spécifier maintenant)

- **Badge « noteur » communautaire** sur les tuiles d'accueil (coin
  haut-droite réservé) — dépend de GD-00001 / `RQ-00006` (référentiel
  communautaire) et d'une notion de compte.
- **Comptes utilisateurs / authentification** — les profils légers (B10)
  séparent les notations par pseudo mais sans authentification. Un vrai
  système de comptes reste prérequis de `RQ-00006` (agrégation communautaire),
  `RQ-00007` (comparer avec la communauté / un autre utilisateur), `RQ-00077`
  (partage).
- **Notation « au feeling » et « par critères » d'un album / d'un artiste** —
  la mécanique existe (bloc à 4 notes) mais ces 2 notes sont des placeholders.
  Les jeux de critères album / artiste restent à définir.
- **Statut « Classic » album / artiste** — emplacement prévu, non développé.
- **Carte « NOTATION DE LA COMMUNAUTÉ »** des maquettes `MCK-TRACK-001/002/003`
  — non reprise (nécessite GD-00001).

---

# PARTIE D — Écarts techniques sans impact sur le TRS (pour information)

Ces points sont des choix d'implémentation ; ils n'ont pas vocation à entrer
dans le TRS, mais expliquent l'état du code.

- **Modèle de données cible** : table `ratings` générique + champ
  `entity_type` (`track`/`album`/`artist`) + table `rating_criteria`
  clé/valeur. Décision d'architecture actée ; migration non encore faite (le
  code utilise encore des colonnes de critères fixes, niveau morceau
  uniquement).
- **Source musicale** : MusicBrainz (API publique anonyme). File d'attente
  interne (1 appel à la fois) pour respecter la limite ~1 req/s ; cache
  mémoire des recherches et des URLs de pochettes.
- **Gestion d'erreur réseau** minimale (pas tous les cas d'échec type
  `SC-00076`).
- **Pas de gestion de concurrence multi-onglets** (dernier enregistrement
  gagne).
- **Arrondi** : standard « à la moitié supérieure » (`CR-00039`, `CR-00060`
  disent « arrondi au dixième » sans préciser la méthode).
