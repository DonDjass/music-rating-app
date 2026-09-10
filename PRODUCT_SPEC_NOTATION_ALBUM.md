# PRODUCT SPEC — Music App

> **GENERATED FILE — DO NOT EDIT**  
> Source of truth: TRS Excel.

# Notation d'un Album

## General Description

**Statut:** `VALIDATED`

La notation d'un album permet à un utilisateur d'évaluer un album selon sa propre appréciation musicale. L'utilisateur peut exprimer son évaluation à travers une NOTE AU FEELING ainsi qu'une NOTE PAR CRITÈRES reposant sur cinq critères propres à l'évaluation d'un album. Les évaluations déjà réalisées sur les morceaux de l'album peuvent également contribuer à la NOTE GLOBALE Album et être utilisées pour assister l'utilisateur dans l'évaluation de certains critères. L'utilisateur conserve la maîtrise de son évaluation et peut ajuster les valeurs proposées à partir de ses notations de morceaux.

---

## BUSINESS RULE — NOTE AU FEELING Album

**Statut:** `VALIDATED`

La NOTE AU FEELING Album correspond à l'appréciation globale, directe et subjective de l'utilisateur concernant l'album.

## BUSINESS RULE — Échelle de la NOTE AU FEELING Album

**Statut:** `VALIDATED`

La NOTE AU FEELING Album est comprise entre 0 et 10 par incréments de 0,5.

## USER STORY — Noter un album au feeling

**Statut:** `VALIDATED`

En tant qu'utilisateur, je veux pouvoir attribuer une NOTE AU FEELING à un album afin d'exprimer mon appréciation globale et subjective de celui-ci.

### SCENARIO — Attribution ou modification d'une NOTE AU FEELING Album

**Statut:** `VALIDATED`

#### STEP 1

Given l'utilisateur consulte la notation d'un album,  
When il choisit de renseigner ou modifier sa NOTE AU FEELING et enregistre sa modification,  
Then la nouvelle NOTE AU FEELING Album est enregistrée et la NOTE GLOBALE Album est recalculée.

---

## BUSINESS RULE — Critères Album

**Statut:** `VALIDATED`

La NOTE PAR CRITÈRES Album repose sur cinq critères : Performance, Texte, Production, Cohérence et Créativité.

## BUSINESS RULE — Échelle des critères Album

**Statut:** `VALIDATED`

Chaque critère Album est évalué de 0 à 10 par incréments de 0,5.

## BUSINESS RULE — Critères partiels

**Statut:** `VALIDATED`

Une NOTE PAR CRITÈRES Album peut être constituée à partir d'au moins un critère renseigné. Les cinq critères ne sont pas obligatoires pour enregistrer la notation.

## CALCULATION RULE — NOTE PAR CRITÈRES Album

**Statut:** `VALIDATED`

La NOTE PAR CRITÈRES Album correspond à la moyenne arithmétique des critères Album effectivement renseignés. Les critères non renseignés sont exclus du calcul. Le résultat est arrondi au dixième.

## USER STORY — Évaluer un album par critères

**Statut:** `VALIDATED`

En tant qu'utilisateur, je veux pouvoir évaluer un album selon plusieurs critères afin de formaliser les différents aspects de mon appréciation du projet.

### SCENARIO — Attribution initiale d'une NOTE PAR CRITÈRES Album

**Statut:** `VALIDATED`

#### STEP 1

Given aucun critère Album n'est renseigné,  
When l'utilisateur renseigne au moins un critère et enregistre sa notation,  
Then les valeurs renseignées sont enregistrées et la NOTE PAR CRITÈRES Album est calculée à partir de ces valeurs.

### SCENARIO — Modification d'une NOTE PAR CRITÈRES Album

**Statut:** `VALIDATED`

#### STEP 1

Given une NOTE PAR CRITÈRES Album existe,  
When l'utilisateur modifie un ou plusieurs critères et enregistre,  
Then les nouvelles valeurs sont enregistrées et la NOTE PAR CRITÈRES Album est recalculée.

---

## BUSINESS RULE — Calcul de Performance, Texte et Production depuis les morceaux

**Statut:** `VALIDATED`

Pour les critères Performance, Texte et Production, le système peut calculer une valeur Album à partir de la moyenne des notes du critère correspondant attribuées aux morceaux de l'album.

## BUSINESS RULE — Disponibilité du calcul depuis les morceaux

**Statut:** `VALIDATED`

Le calcul d'un critère Album à partir des morceaux est possible dès lors qu'au moins un morceau possède une note pour le critère correspondant. Aucun seuil minimal de couverture n'est requis pour cette fonction.

## BUSINESS RULE — Cohérence et Créativité

**Statut:** `VALIDATED`

Les critères Cohérence et Créativité sont propres à l'évaluation de l'album et ne peuvent pas être calculés à partir des notations des morceaux.

## USER STORY — Utiliser les morceaux comme point de départ

**Statut:** `VALIDATED`

En tant qu'utilisateur, je veux pouvoir calculer Performance, Texte et Production Album à partir de mes évaluations des morceaux afin de disposer d'un point de départ pour mon évaluation de l'album.

### SCENARIO — Calcul des critères Album depuis les morceaux

**Statut:** `VALIDATED`

#### STEP 1

Given des notes de critères existent sur les morceaux de l'album,  
When l'utilisateur demande de calculer les critères Album depuis ses morceaux,  
Then le système calcule séparément les moyennes disponibles pour Performance, Texte et Production et les utilise comme valeurs héritées des critères Album correspondants.

#### STEP 2

Given aucune note Track n'existe pour l'un des critères correspondants,  
When le calcul depuis les morceaux est effectué,  
Then le critère Album concerné reste non renseigné.

---

## BUSINESS RULE — Synchronisation des valeurs héritées

**Statut:** `VALIDATED`

Une valeur de critère Album héritée des morceaux reste automatiquement synchronisée avec la moyenne du critère correspondant des morceaux tant qu'elle n'est pas ajustée manuellement par l'utilisateur.

## BUSINESS RULE — Surcharge manuelle

**Statut:** `VALIDATED`

Lorsqu'un utilisateur modifie manuellement un critère Album hérité, la valeur ajustée devient la valeur retenue pour ce critère et cesse d'être automatiquement synchronisée avec les morceaux.

## BUSINESS RULE — Retour à la valeur calculée

**Statut:** `VALIDATED`

L'utilisateur peut rétablir un critère ajusté à sa valeur calculée depuis les morceaux. Cette action réactive la synchronisation automatique du critère avec les morceaux.

### SCENARIO — Ajustement manuel d'un critère hérité

**Statut:** `VALIDATED`

#### STEP 1

Given un critère Album possède une valeur héritée des morceaux,  
When l'utilisateur modifie manuellement cette valeur,  
Then la valeur manuelle devient la valeur retenue et la synchronisation automatique de ce critère est interrompue.

### SCENARIO — Retour à la valeur héritée

**Statut:** `VALIDATED`

#### STEP 1

Given un critère Album hérité a été ajusté manuellement,  
When l'utilisateur choisit de revenir à la valeur calculée,  
Then la moyenne actuelle issue des morceaux est restaurée et la synchronisation automatique est réactivée.

## BUSINESS RULE — Protection des valeurs manuelles

**Statut:** `VALIDATED`

Une action de calcul depuis les morceaux ne doit pas écraser silencieusement des valeurs Performance, Texte ou Production déjà renseignées manuellement.

### SCENARIO — Calcul depuis les morceaux en présence de valeurs manuelles

**Statut:** `VALIDATED`

#### STEP 1

Given au moins une valeur Performance, Texte ou Production Album a été renseignée manuellement,  
When l'utilisateur demande de calculer ces critères depuis ses morceaux,  
Then le système l'informe que les valeurs manuelles concernées seront remplacées et demande confirmation avant de poursuivre.

---

## BUSINESS RULE — Couverture d'un album

**Statut:** `VALIDATED`

Le système calcule la couverture d'un album comme le rapport entre le nombre de morceaux de l'album disposant d'une NOTE GLOBALE Track et le nombre total de morceaux de l'album.

## BUSINESS RULE — Moyenne MORCEAUX

**Statut:** `VALIDATED`

La moyenne MORCEAUX correspond à la moyenne arithmétique des NOTE GLOBALE Track des morceaux effectivement notés de l'album.

## CALCULATION RULE — Seuil d'éligibilité MORCEAUX

**Statut:** `VALIDATED`

La composante MORCEAUX devient éligible à la NOTE GLOBALE Album lorsque la couverture de l'album atteint au moins 70 %.

## BUSINESS RULE — Couverture inférieure à 70 %

**Statut:** `VALIDATED`

Lorsque la couverture est inférieure à 70 %, la moyenne MORCEAUX peut être affichée à titre informatif mais ne participe pas au calcul de la NOTE GLOBALE Album.

## BUSINESS RULE — Activation par défaut de MORCEAUX

**Statut:** `VALIDATED`

Lorsque la composante MORCEAUX devient éligible, l'option « Prendre en compte mes notes des morceaux » est activée par défaut. L'utilisateur peut la désactiver.

## BUSINESS RULE — Portée du toggle MORCEAUX

**Statut:** `VALIDATED`

L'option « Prendre en compte mes notes des morceaux » contrôle uniquement la participation de la composante MORCEAUX au calcul de la NOTE GLOBALE Album. Elle ne contrôle pas l'héritage des critères Performance, Texte et Production.

## BUSINESS RULE — Exclusion de MORCEAUX

**Statut:** `VALIDATED`

Lorsque l'option « Prendre en compte mes notes des morceaux » est désactivée, la composante MORCEAUX ne participe pas à la NOTE GLOBALE Album.

## CALCULATION RULE — Poids de MORCEAUX

**Statut:** `VALIDATED`

Lorsque MORCEAUX participe au calcul avec une ou plusieurs notations propres à l'album, son poids correspond à un tiers multiplié par le taux de couverture de l'album. Son poids maximal est donc de 33,33 % lorsque la couverture atteint 100 %.

## CALCULATION RULE — Répartition du poids restant

**Statut:** `VALIDATED`

Le poids restant après application du poids MORCEAUX est réparti équitablement entre les composantes Album disponibles parmi NOTE AU FEELING et NOTE PAR CRITÈRES.

## CALCULATION RULE — Cas de couverture à 100 %

**Statut:** `VALIDATED`

Lorsque NOTE AU FEELING, NOTE PAR CRITÈRES et MORCEAUX sont disponibles, que MORCEAUX est pris en compte et que la couverture atteint 100 %, chacune des trois composantes représente un tiers de la NOTE GLOBALE Album.

## CALCULATION RULE — MORCEAUX seul

**Statut:** `VALIDATED`

Lorsqu'aucune NOTE AU FEELING Album ni NOTE PAR CRITÈRES Album n'existe, une couverture d'au moins 70 % permet à MORCEAUX de produire seule une NOTE GLOBALE Album lorsque l'option « Prendre en compte mes notes des morceaux » est activée. Dans ce cas, la NOTE GLOBALE Album est égale à la moyenne MORCEAUX.

## CALCULATION RULE — NOTE GLOBALE sans MORCEAUX

**Statut:** `VALIDATED`

Lorsque MORCEAUX ne participe pas au calcul, la NOTE GLOBALE Album correspond à la moyenne arithmétique des composantes disponibles parmi NOTE AU FEELING et NOTE PAR CRITÈRES. Si une seule de ces composantes existe, la NOTE GLOBALE lui est égale.

## CALCULATION RULE — Arrondi de la NOTE GLOBALE Album

**Statut:** `VALIDATED`

La NOTE GLOBALE Album est arrondie au dixième.

## BUSINESS RULE — Recalcul automatique

**Statut:** `VALIDATED`

Toute modification d'une notation Track susceptible de modifier la moyenne MORCEAUX, la couverture ou une valeur héritée entraîne automatiquement le recalcul des valeurs Album concernées.

## BUSINESS RULE — Recalcul des valeurs héritées

**Statut:** `VALIDATED`

Lorsqu'une valeur Performance, Texte ou Production Album est toujours héritée des morceaux, son recalcul automatique ne nécessite pas de confirmation de l'utilisateur.

## BUSINESS RULE — Couverture repassant sous 70 %

**Statut:** `VALIDATED`

Si la couverture redescend sous 70 %, MORCEAUX cesse automatiquement de participer à la NOTE GLOBALE Album. Si aucune NOTE AU FEELING ni NOTE PAR CRITÈRES Album n'existe, aucune NOTE GLOBALE Album n'est alors calculée.

## USER STORY — Contrôler la participation de MORCEAUX

**Statut:** `VALIDATED`

En tant qu'utilisateur, je veux pouvoir décider si mes évaluations des morceaux doivent contribuer à ma NOTE GLOBALE Album afin de conserver la maîtrise de ma manière d'évaluer l'album.

### SCENARIO — Exclusion de MORCEAUX de la NOTE GLOBALE Album

**Statut:** `VALIDATED`

#### STEP 1

Given MORCEAUX est éligible et pris en compte,  
When l'utilisateur désactive l'option « Prendre en compte mes notes des morceaux »,  
Then MORCEAUX est exclu du calcul et la NOTE GLOBALE Album est recalculée à partir des autres composantes disponibles.

### SCENARIO — Réactivation de MORCEAUX dans la NOTE GLOBALE Album

**Statut:** `VALIDATED`

#### STEP 1

Given MORCEAUX est éligible mais exclu du calcul,  
When l'utilisateur réactive l'option « Prendre en compte mes notes des morceaux »,  
Then MORCEAUX participe de nouveau au calcul et la NOTE GLOBALE Album est recalculée.

---

## BUSINESS RULE — Disponibilité de RÉINITIALISER

**Statut:** `VALIDATED`

Pendant l'édition des critères Album, l'action RÉINITIALISER est disponible uniquement lorsqu'au moins une saisie ou modification manuelle peut être annulée.

## BUSINESS RULE — Réinitialisation avec valeurs héritées

**Statut:** `VALIDATED`

Lorsque des valeurs héritées existent pour Performance, Texte ou Production, RÉINITIALISER supprime les saisies et ajustements manuels correspondants et restaure les valeurs héritées disponibles. Les saisies manuelles de Cohérence et Créativité reviennent à un état non renseigné.

## BUSINESS RULE — Réinitialisation sans valeur héritée

**Statut:** `VALIDATED`

Lorsqu'aucune valeur héritée n'existe pour un critère, RÉINITIALISER supprime sa saisie manuelle temporaire et le ramène à un état non renseigné.

## BUSINESS RULE — RÉINITIALISER indisponible à l'état de référence

**Statut:** `VALIDATED`

Lorsque les critères Album sont déjà à leur état de référence — aucune valeur manuelle ou uniquement des valeurs héritées non ajustées — l'action RÉINITIALISER n'est pas disponible.

## BUSINESS RULE — ABANDONNER

**Statut:** `VALIDATED`

ABANDONNER annule les modifications de la session d'édition et restaure le dernier état enregistré, y compris lorsqu'une action RÉINITIALISER a été effectuée pendant la session.

### SCENARIO — Réinitialisation de critères Album comportant des interventions manuelles

**Statut:** `VALIDATED`

#### STEP 1

Given au moins un critère Album comporte une saisie ou un ajustement manuel,  
When l'utilisateur choisit RÉINITIALISER,  
Then les interventions manuelles sont retirées, les valeurs héritées disponibles sont restaurées et les autres critères concernés reviennent à un état non renseigné, sans quitter le mode édition.

### SCENARIO — Abandon après réinitialisation

**Statut:** `VALIDATED`

#### STEP 1

Given l'utilisateur a réinitialisé les critères pendant une session d'édition,  
When il choisit ABANDONNER,  
Then le dernier état enregistré avant l'entrée en édition est restauré.

---

## BUSINESS RULE — États de complétude

**Statut:** `VALIDATED`

L'état de complétude des composantes de notation Album peut être représenté par trois états : non renseigné, partiel et complet.

## BUSINESS RULE — Complétude MORCEAUX

**Statut:** `VALIDATED`

Pour MORCEAUX, l'état est non renseigné lorsqu'aucun morceau n'est noté, partiel lorsqu'au moins un mais pas tous les morceaux sont notés, et complet lorsque tous les morceaux sont notés. Le seuil de 70 % détermine l'éligibilité au calcul et non la complétude.

## BUSINESS RULE — Complétude NOTE PAR CRITÈRES

**Statut:** `VALIDATED`

Pour NOTE PAR CRITÈRES, l'état est non renseigné lorsqu'aucun des cinq critères n'est renseigné, partiel lorsque 1 à 4 critères sont renseignés et complet lorsque les cinq critères sont renseignés.

## BUSINESS RULE — Complétude NOTE AU FEELING

**Statut:** `VALIDATED`

Pour NOTE AU FEELING, l'état est non renseigné lorsqu'aucune note n'existe et complet dès qu'une note existe.

## BUSINESS RULE — Synthèse de la notation Album

**Statut:** `VALIDATED`

La synthèse de la notation Album doit permettre d'identifier distinctement les composantes MORCEAUX, FEELING, CRITÈRES et GLOBALE ainsi que l'état de complétude des composantes concernées.

## BUSINESS RULE — Détail à la demande

**Statut:** `VALIDATED`

L'origine et le détail d'une valeur calculée ou héritée, notamment le nombre de morceaux utilisés et la couverture correspondante, peuvent être consultés à la demande sans être affichés en permanence dans la vue principale.
