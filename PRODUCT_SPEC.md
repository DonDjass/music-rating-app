# PRODUCT SPEC --- Music App

> **GENERATED FILE --- DO NOT EDIT**\
> Source of truth: TRS Excel.

Ce document est une représentation Markdown de la spécification
fonctionnelle TRS. Les maquettes référencées dans `Documentation`
complètent la spécification sur les aspects visuels et d'interaction. En
cas d'ambiguïté entre une maquette et une règle explicitement définie
dans la spécification, l'ambiguïté doit être signalée et non arbitrée
silencieusement.

# GD-00001 --- Vision produit

## General Description

Music App (nom provisoire) est une application de notation et
d'évaluation musicale destinée aux passionnés de musique.

Elle permet aux utilisateurs d'évaluer des morceaux, albums et artistes
selon leurs propres préférences et critères d'appréciation.

L'application repose sur le principe que l'appréciation musicale est
subjective : elle ne cherche pas à imposer une définition universelle de
ce qui constitue une bonne musique, mais à permettre à chaque
utilisateur de formaliser sa propre manière d'évaluer la musique.

Elle a pour objectif de permettre à chacun de construire son référentiel
musical personnel, tout en contribuant à un référentiel communautaire
permettant de découvrir, comparer et partager les évaluations et
préférences musicales.

## RQ-00001 --- Requirement

Le système doit permettre à un utilisateur de noter et évaluer un
morceau.

**Statut :** `VALIDATED`

## RQ-00002 --- Requirement

Le système doit permettre à un utilisateur de noter et évaluer un album.

**Statut :** `VALIDATED`

## RQ-00003 --- Requirement

Le système doit permettre à un utilisateur de noter et évaluer un
artiste.

**Statut :** `VALIDATED`

## RQ-00004 --- Requirement

Le système doit permettre à l'utilisateur de disposer d'un cadre de
notation correspondant à ses propres critères d'appréciation musicale.

**Statut :** `VALIDATED`

## RQ-00005 --- Requirement

Le système doit permettre à l'utilisateur de constituer progressivement
un référentiel personnel de ses évaluations musicales.

**Statut :** `VALIDATED`

## RQ-00006 --- Requirement

Le système doit agréger les évaluations des utilisateurs afin de
constituer un référentiel communautaire.

**Statut :** `VALIDATED`

## RQ-00007 --- Requirement

Le système doit permettre de consulter et comparer ses évaluations et
préférences avec celles de la communauté ou d'un autre utilisateur.

**Statut :** `VALIDATED`

## RQ-00077 --- Requirement

Le système doit permettre de partager ses évaluations et préférences
musicales.

**Statut :** `VALIDATED`

------------------------------------------------------------------------

# GD-00002 --- Notation d'un morceau

## General Description

Notation d'un morceau

La notation d'un morceau permet à un utilisateur d'évaluer un morceau
selon sa propre appréciation musicale.

L'utilisateur peut exprimer son évaluation à travers une note
personnelle ainsi qu'un ensemble de critères permettant de formaliser
les différents aspects de son appréciation du morceau.

La notation doit permettre de distinguer l'appréciation globale et
subjective de l'utilisateur de l'évaluation plus détaillée des
différents critères du morceau.

L'utilisateur peut également attribuer au morceau un statut particulier
reflétant la place qu'il lui accorde dans son référentiel musical
personnel.

Une évaluation peut être enregistrée puis consultée et modifiée par
l'utilisateur.

## CX-00009 --- Context

La notation d'un morceau permet à l'utilisateur d'exprimer son
appréciation selon deux approches complémentaires : une NOTE AU FEELING
attribuée directement et une NOTE PAR CRITÈRES calculée à partir d'une
évaluation détaillée. Une NOTE GLOBALE synthétise les notes disponibles.
L'utilisateur peut également définir indépendamment un morceau comme
Classic.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## US-00010 --- User Story

En tant qu'utilisateur, je veux accéder à la fiche d'un morceau afin de
consulter ses informations ainsi que mes éventuelles évaluations
associées.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

### SC-00011 --- Scenario 1 : Consultation de la fiche d'un morceau.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

#### ST-00012 --- Step 1

Given je consulte un écran contenant un morceau ; When je sélectionne ce
morceau ; Then le système affiche la fiche du morceau.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

#### ST-00013 --- Step 2

Given je consulte la fiche d'un morceau ; When la fiche est affichée ;
Then le système présente les informations du morceau ainsi que mes
éventuelles notations associées.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## BR-00014 --- Business Rule

La NOTE AU FEELING représente l'appréciation globale et subjective
attribuée directement par l'utilisateur à un morceau.

**Statut :** `VALIDATED`

## BR-00015 --- Business Rule

La NOTE AU FEELING est exprimée sur une échelle de 0 à 10, par
incréments de 0,5.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## BR-00016 --- Business Rule

La NOTE AU FEELING peut être attribuée indépendamment de la NOTE PAR
CRITÈRES.

**Statut :** `VALIDATED`

## US-00017 --- User Story

En tant qu'utilisateur, je veux attribuer une NOTE AU FEELING à un
morceau afin d'exprimer directement mon appréciation globale de
celui-ci.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

### SC-00018 --- Scenario 1 : Attribution initiale d'une NOTE AU FEELING.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

#### ST-00019 --- Step 1

Given je consulte la fiche d'un morceau auquel je n'ai pas encore
attribué de NOTE AU FEELING ; When je clique sur « NOTE AU FEELING » ;
Then le système active l'édition de la NOTE AU FEELING et affiche les
actions « Réinitialiser », « Abandonner » et « Enregistrer ».

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

#### ST-00020 --- Step 2

Given la NOTE AU FEELING est en cours d'édition ; When je définis une
valeur et clique sur « Enregistrer » ; Then le système enregistre la
NOTE AU FEELING et revient en mode consultation.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

### SC-00021 --- Scenario 2 : Modification d'une NOTE AU FEELING.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

#### ST-00022 --- Step 1

Given une NOTE AU FEELING a déjà été enregistrée ; When je clique sur «
NOTE AU FEELING » ; Then le système active l'édition avec la dernière
valeur enregistrée et affiche les actions « Réinitialiser », «
Abandonner » et « Enregistrer ».

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

#### ST-00023 --- Step 2

Given je modifie une NOTE AU FEELING existante ; When je sélectionne une
nouvelle valeur et clique sur « Enregistrer » ; Then le système remplace
la valeur précédemment enregistrée par la nouvelle valeur et revient en
mode consultation.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

## BR-00024 --- Business Rule

Lorsqu'un bloc de notation est en cours d'édition, son bouton doit
présenter un état visuel actif permettant de le distinguer des autres
blocs de notation.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002` · `MCK-TRACK-003`

## BR-00025 --- Business Rule

Lorsqu'une NOTE AU FEELING est en cours d'édition, l'utilisateur peut
réinitialiser la valeur saisie sans quitter le mode édition et sans
modifier la dernière valeur enregistrée.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

### SC-00026 --- Scenario 3 : Réinitialisation d'une NOTE AU FEELING en cours d'édition.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

#### ST-00027 --- Step 1

Given je suis en train de créer ou modifier une NOTE AU FEELING ; When
je clique sur « Réinitialiser » ; Then le système efface la valeur
actuellement saisie et maintient la NOTE AU FEELING en mode édition.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

#### ST-00028 --- Step 2

Given j'ai réinitialisé la NOTE AU FEELING en cours d'édition ; When
aucune nouvelle valeur n'a encore été saisie ; Then la dernière NOTE AU
FEELING enregistrée, si elle existe, reste inchangée.

**Statut :** `VALIDATED`

#### ST-00029 --- Step 3

Given j'ai réinitialisé la NOTE AU FEELING ; When je définis une
nouvelle valeur ; Then le système permet de poursuivre l'édition à
partir de cette nouvelle valeur.

**Statut :** `VALIDATED`

### SC-00030 --- Scenario 4 : Abandon de l'édition d'une NOTE AU FEELING.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

#### ST-00031 --- Step 1

Given je suis en train de créer ou modifier une NOTE AU FEELING ; When
je clique sur « Abandonner » ; Then le système annule les modifications
en cours, restaure la dernière valeur enregistrée ou l'état non
renseigné si aucune valeur n'existait, puis revient en mode
consultation.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002`

### SC-00032 --- Scenario 5 : Suppression d'une NOTE AU FEELING enregistrée.

**Statut :** `VALIDATED`

#### ST-00033 --- Step 1

Given une NOTE AU FEELING a déjà été enregistrée ; When j'accède à son
mode d'édition ; Then le système me permet de demander explicitement la
suppression de la notation enregistrée.

**Statut :** `VALIDATED`

#### ST-00034 --- Step 2

Given je demande la suppression de ma NOTE AU FEELING ; When je confirme
la suppression ; Then le système supprime la NOTE AU FEELING enregistrée
et revient en mode consultation avec une NOTE AU FEELING non renseignée.

**Statut :** `VALIDATED`

## BR-00035 --- Business Rule

L'évaluation par critères d'un morceau repose sur trois critères :
Performance, Texte et Production.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## BR-00036 --- Business Rule

Chaque critère est noté sur une échelle de 0 à 10, par incréments de
0,5.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## BR-00037 --- Business Rule

La NOTE PAR CRITÈRES ne peut pas être modifiée directement ; elle
résulte des valeurs attribuées aux critères Performance, Texte et
Production.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

## BR-00038 --- Business Rule

La NOTE PAR CRITÈRES peut être attribuée indépendamment de la NOTE AU
FEELING.

**Statut :** `VALIDATED`

## CR-00039 --- Calculation Rule

La NOTE PAR CRITÈRES correspond à la moyenne arithmétique des notes
attribuées aux critères Performance, Texte et Production. Le résultat
est arrondi au dixième.

**Statut :** `VALIDATED`

## US-00040 --- User Story

En tant qu'utilisateur, je veux évaluer un morceau selon les critères
Performance, Texte et Production afin d'obtenir une NOTE PAR CRITÈRES
représentant mon évaluation détaillée du morceau.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

### SC-00041 --- Scenario 1 : Attribution initiale d'une NOTE PAR CRITÈRES.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00042 --- Step 1

Given je consulte la fiche d'un morceau auquel je n'ai pas encore
attribué de NOTE PAR CRITÈRES ; When je clique sur « NOTE PAR CRITÈRES »
; Then le système active l'édition des critères Performance, Texte et
Production et affiche les actions « Réinitialiser », « Abandonner » et «
Enregistrer ».

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00043 --- Step 2

Given je suis en mode d'édition de la NOTE PAR CRITÈRES ; When je
définis les valeurs des critères ; Then le système recalcule
dynamiquement la NOTE PAR CRITÈRES et affiche le résultat sans permettre
sa modification directe.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00044 --- Step 3

Given les trois critères ont été renseignés ; When je clique sur «
Enregistrer » ; Then le système enregistre les valeurs des trois
critères et la NOTE PAR CRITÈRES correspondante, puis revient en mode
consultation.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

### SC-00045 --- Scenario 2 : Modification d'une NOTE PAR CRITÈRES.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00046 --- Step 1

Given une NOTE PAR CRITÈRES a déjà été enregistrée ; When je clique sur
« NOTE PAR CRITÈRES » ; Then le système active l'édition des trois
critères avec leurs dernières valeurs enregistrées et affiche les
actions « Réinitialiser », « Abandonner » et « Enregistrer ».

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00047 --- Step 2

Given je modifie une ou plusieurs valeurs des critères ; When une valeur
est modifiée ; Then le système recalcule dynamiquement la NOTE PAR
CRITÈRES sans modifier les données enregistrées.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00048 --- Step 3

Given une modification de l'évaluation par critères est en cours ; When
je clique sur « Enregistrer » ; Then le système remplace les valeurs
précédemment enregistrées, enregistre la nouvelle NOTE PAR CRITÈRES et
revient en mode consultation.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

## BR-00049 --- Business Rule

Lorsqu'une NOTE PAR CRITÈRES est en cours d'édition, l'utilisateur peut
réinitialiser les valeurs saisies sans quitter le mode édition et sans
modifier les dernières valeurs enregistrées.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

### SC-00050 --- Scenario 3 : Réinitialisation d'une NOTE PAR CRITÈRES en cours d'édition.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00051 --- Step 1

Given je suis en train de créer ou modifier une NOTE PAR CRITÈRES ; When
je clique sur « Réinitialiser » ; Then le système efface les valeurs
actuellement saisies pour Performance, Texte et Production et maintient
la NOTE PAR CRITÈRES en mode édition.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00052 --- Step 2

Given les critères ont été réinitialisés ; When aucune nouvelle valeur
n'a encore été saisie ; Then aucune NOTE PAR CRITÈRES temporaire n'est
calculée et les dernières valeurs enregistrées restent inchangées.

**Statut :** `VALIDATED`

#### ST-00053 --- Step 3

Given j'ai réinitialisé les critères ; When je renseigne de nouvelles
valeurs ; Then le système recalcule dynamiquement la NOTE PAR CRITÈRES à
partir de ces nouvelles valeurs.

**Statut :** `VALIDATED`

### SC-00054 --- Scenario 4 : Abandon de l'édition d'une NOTE PAR CRITÈRES.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

#### ST-00055 --- Step 1

Given je suis en train de créer ou modifier une NOTE PAR CRITÈRES ; When
je clique sur « Abandonner » ; Then le système annule les modifications
en cours, restaure les dernières valeurs enregistrées ou l'état non
renseigné si aucune évaluation n'existait, puis revient en mode
consultation.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-003`

### SC-00056 --- Scenario 5 : Suppression d'une NOTE PAR CRITÈRES enregistrée.

**Statut :** `VALIDATED`

#### ST-00057 --- Step 1

Given une NOTE PAR CRITÈRES a déjà été enregistrée ; When j'accède à son
mode d'édition ; Then le système me permet de demander explicitement la
suppression de l'évaluation enregistrée.

**Statut :** `VALIDATED`

#### ST-00058 --- Step 2

Given je demande la suppression de ma NOTE PAR CRITÈRES ; When je
confirme la suppression ; Then le système supprime les valeurs
enregistrées de Performance, Texte et Production ainsi que la NOTE PAR
CRITÈRES associée, puis revient en mode consultation.

**Statut :** `VALIDATED`

## BR-00059 --- Business Rule

La NOTE GLOBALE constitue la synthèse de la NOTE AU FEELING et de la
NOTE PAR CRITÈRES disponibles pour un morceau.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## CR-00060 --- Calculation Rule

Lorsque la NOTE AU FEELING et la NOTE PAR CRITÈRES sont toutes deux
renseignées, la NOTE GLOBALE correspond à leur moyenne arithmétique. Le
résultat est arrondi au dixième.

**Statut :** `VALIDATED`

## CR-00061 --- Calculation Rule

Lorsque seule la NOTE AU FEELING est renseignée, la NOTE GLOBALE
correspond à la NOTE AU FEELING.

**Statut :** `VALIDATED`

## CR-00062 --- Calculation Rule

Lorsque seule la NOTE PAR CRITÈRES est renseignée, la NOTE GLOBALE
correspond à la NOTE PAR CRITÈRES.

**Statut :** `VALIDATED`

## CR-00063 --- Calculation Rule

Lorsque ni la NOTE AU FEELING ni la NOTE PAR CRITÈRES ne sont
renseignées, aucune NOTE GLOBALE n'est calculée.

**Statut :** `VALIDATED`

## BR-00064 --- Business Rule

Toute création, modification ou suppression d'une NOTE AU FEELING ou
d'une NOTE PAR CRITÈRES entraîne la mise à jour de la NOTE GLOBALE selon
les notes enregistrées disponibles.

**Statut :** `VALIDATED`

## BR-00065 --- Business Rule

Les modifications temporaires effectuées en mode édition ne modifient
pas la NOTE GLOBALE enregistrée tant qu'elles n'ont pas été
enregistrées.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-002` · `MCK-TRACK-003`

## BR-00066 --- Business Rule

Le statut Classic est indépendant de la NOTE AU FEELING, de la NOTE PAR
CRITÈRES et de la NOTE GLOBALE. Il peut être attribué ou retiré
indépendamment de l'existence ou de la valeur de ces notes.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## BR-00067 --- Business Rule

Le statut Classic est un état binaire propre à l'utilisateur pour un
morceau donné.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## BR-00068 --- Business Rule

Toute modification du statut Classic est enregistrée immédiatement et
indépendamment de l'enregistrement des autres éléments de notation.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

## US-00069 --- User Story

En tant qu'utilisateur, je veux pouvoir définir un morceau comme Classic
afin d'identifier les morceaux que je considère personnellement comme
des classiques.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

### SC-00070 --- Scenario 1 : Attribution du statut Classic à un morceau.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

#### ST-00071 --- Step 1

Given je consulte la fiche d'un morceau qui n'est pas défini comme
Classic ; When je clique sur l'icône « Classic » ; Then le système
enregistre immédiatement le statut Classic et affiche l'icône dans son
état actif.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

#### ST-00072 --- Step 2

Given le statut Classic a été enregistré avec succès ; When
l'enregistrement est confirmé ; Then le système affiche temporairement
le message « Ajouté aux Classics ✓ ».

**Statut :** `VALIDATED`

### SC-00073 --- Scenario 2 : Retrait du statut Classic d'un morceau.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

#### ST-00074 --- Step 1

Given je consulte la fiche d'un morceau défini comme Classic ; When je
clique sur l'icône « Classic » ; Then le système retire immédiatement le
statut Classic et affiche l'icône dans son état inactif.

**Statut :** `VALIDATED`\
**Documentation :** `MCK-TRACK-001`

#### ST-00075 --- Step 2

Given le retrait du statut Classic a été enregistré avec succès ; When
l'enregistrement est confirmé ; Then le système affiche temporairement
le message « Retiré des Classics ».

**Statut :** `VALIDATED`

### SC-00076 --- Scenario 3 : Échec de modification du statut Classic.

**Statut :** `VALIDATED`

#### ST-00077 --- Step 1

Given je demande à attribuer ou retirer le statut Classic ; When le
système ne parvient pas à enregistrer la modification ; Then le système
conserve ou restaure le dernier état enregistré et affiche « Impossible
de modifier le statut Classic. Réessaie. ».

**Statut :** `VALIDATED`

------------------------------------------------------------------------
