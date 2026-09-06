# Gaps & décisions d'implémentation

Ce fichier trace les choix faits quand PRODUCT_SPEC.md ne couvre pas
explicitement un point (ambiguïté, cas limite non précisé). Format par
entrée : contexte → choix par défaut → justification. À valider a
posteriori — pas de blocage en cours de route sauf mention contraire.

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
FEELING n'a pas de valeur, ou que les trois critères ne sont pas tous
renseignés.
**Justification :** cohérent avec SC-00041 ("les trois critères ont été
renseignés" avant l'étape d'enregistrement) ; évite un enregistrement
partiel non prévu par CR-00039.

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

- **Incrément de la NOTE AU FEELING = 1** au lieu de 0,5 (contredit
  BR-00015) : demandé explicitement pour simplifier cette première passe.
- **Gestion d'erreur réseau minimale** (pas de retry, pas de tous les cas
  d'échec type SC-00076) : demandé explicitement.

Ces deux points ne sont pas des décisions prises face à une ambiguïté du
spec — ce sont des simplifications directement instruites — mais ils
créent un écart avec des règles `VALIDATED` du spec, donc listés ici pour
qu'ils ne soient pas oubliés lors d'une passe de mise en conformité.
