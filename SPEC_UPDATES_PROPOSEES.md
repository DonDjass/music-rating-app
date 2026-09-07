# Changements de spécification proposés

> **NE PAS éditer `PRODUCT_SPEC.md` directement.** Ce fichier est un export
> du fichier Excel TRS, qui reste la seule source de vérité. Ce document
> liste les modifications à reporter **dans le fichier Excel**, d'où elles
> reviendront ensuite dans `PRODUCT_SPEC.md` à la prochaine génération.
>
> Format par entrée : ID concerné → texte actuel → texte proposé →
> justification. Statut de chaque proposition : `À VALIDER` tant qu'elle
> n'a pas été portée dans l'Excel.

---

## 1. Saisie partielle des critères (1 ou 2 critères sur 3 suffisent)

**Contexte :** à l'usage, exiger les trois critères (Performance, Texte,
Production) pour pouvoir enregistrer une NOTE PAR CRITÈRES est trop rigide —
un utilisateur veut parfois ne noter qu'un ou deux aspects d'un morceau.
L'implémentation actuelle autorise déjà l'enregistrement dès qu'au moins un
critère est renseigné, la NOTE PAR CRITÈRES étant alors la moyenne des seuls
critères renseignés (cf. `GAPS_ET_DECISIONS.md`, §GD-00002-7). Le spec doit
être aligné sur ce comportement.

**Statut : `À VALIDER`**

### 1a. `CR-00039` — Calculation Rule

- **Texte actuel :**
  > La NOTE PAR CRITÈRES correspond à la moyenne arithmétique des notes
  > attribuées aux critères Performance, Texte et Production. Le résultat est
  > arrondi au dixième.

- **Texte proposé :**
  > La NOTE PAR CRITÈRES correspond à la moyenne arithmétique des notes
  > effectivement attribuées parmi les critères Performance, Texte et
  > Production. Les critères non renseignés sont exclus du calcul. Le
  > résultat est arrondi au dixième.
  > Exemple : Performance = 8, Texte = 6, Production non renseignée →
  > NOTE PAR CRITÈRES = 7,0.

### 1b. `ST-00044` — GD-00002 › US-00040 › SC-00041 › Step 3

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

### 1c. `ST-00043` — GD-00002 › US-00040 › SC-00041 › Step 2

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

### 1d. Nouvelle règle métier proposée — `BR-000XX` (à numéroter dans l'Excel)

- **Texte proposé :**
  > L'enregistrement d'une NOTE PAR CRITÈRES nécessite qu'au moins un critère
  > soit renseigné. Tant qu'aucun critère n'est renseigné, l'action
  > « Enregistrer » n'est pas disponible.

- **Justification :** borne basse explicite (le comportement « zéro critère »
  reste interdit) ; complète `CR-00039` révisée et `ST-00044` révisé.

---

## (Réservé pour les prochaines propositions)
