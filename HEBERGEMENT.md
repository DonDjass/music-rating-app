# Hébergement — comparatif des solutions (bêta)

> Rédigé le 2026-09-11 à partir de l'architecture réelle de `server.js`.
> Contrat domaine : IONOS « Pack Domaine » (nom de domaine seul, pas
> d'hébergement web) → l'application est hébergée ailleurs, le domaine IONOS
> pointe vers cet hébergeur.

## 1. Ce que le projet exige réellement

| Contrainte | Détail (vérifié dans le code) | Impact hébergement |
|---|---|---|
| **Processus long-running** | `http.createServer` + `server.listen(PORT)`, tourne en continu | Vrai process persistant requis, pas des fonctions à la demande |
| **File d'attente MusicBrainz en mémoire** | `mbGated` / `mbQueue` : **un seul verrou in-process** sérialise tous les appels MB avec 350 ms d'écart (`MB_GAP_MS`) pour tenir le ~1 req/s | ⚠️ **1 seule instance obligatoire.** 2 instances = 2 files = quota MB violé. Pas d'autoscaling. |
| **Durée des requêtes** | 1 requête HTTP → 1 à 3 appels MB séquentiels ; timeout dur 9 s/appel + backoff court (`fetchWithRetry`). Pire cas réaliste ~6-15 s | OK partout pour un serveur classique. Dépasse les limites serverless par défaut (10-60 s) ; tiendrait dans Vercel Fluid (5 min) mais le reste ne suit pas |
| **SQLite locale à persister** | `new Database("music.db")` — fichier sur disque, `better-sqlite3` = **module natif C++** | **Volume persistant** requis + build du module natif (Nixpacks ou Dockerfile) |
| **Caches en mémoire** | `SEARCH_CACHE` (1 h), `coverCache` (24 h) via `Map` | Froids après redémarrage. Acceptable sur 1 instance, cassés si multi-instance |

**Conclusion structurante :** le projet veut une VM / un container **mono-instance
avec disque**. Tout modèle serverless ou multi-instance casse soit la conformité
MusicBrainz, soit la persistance SQLite.

## 2. Verdict par plateforme

### Railway — ✅ meilleur compromis facilité/prix

- Process 24/7, **pas de mise en veille**. Nixpacks compile `better-sqlite3`
  sans Dockerfile. Volume persistant pour `music.db` (~0,15 $/Go/mois,
  négligeable ici). Mono-service par défaut = file MB intacte.
- ❌ **Pas de vrai tier gratuit** : 5 $ de crédit one-time, puis plan Hobby
  **5 $/mois** (crédit de 5 $ d'usage inclus — l'app tiendra dedans).
- Setup : connecter le repo, ajouter un volume monté sur le dossier de
  `music.db`, uploader `music.db` une fois. ~15 min.

### Fly.io — ✅ meilleur fit technique, le moins cher, mais plus de config

- Machine `shared-cpu-1x` en continu ≈ **2-3 $/mois** + volume 0,15 $/Go/mois.
  Volume Fly = persistance SQLite OK. `min_machines_running = 1`, pas de scale
  = file MB intacte.
- ❌ **Le tier gratuit est mort** pour les nouveaux comptes depuis 2024
  (trial = 2 h de VM / 7 jours).
- ❌ Exige un **Dockerfile** (module natif) + `fly.toml` + `fly volumes create`.
  ~30-45 min de mise en place.

### Render — ⚠️ seulement en payant

- Free tier : **pas de disque persistant** + veille après 15 min d'inactivité →
  `music.db` **effacée à chaque redéploiement/réveil**. Inutilisable ici.
- Plan **Starter 7 $/mois** : disque persistant dispo, pas de veille, 1 instance.
  Fonctionne, mais c'est l'option la plus chère pour le même résultat que
  Railway/Fly.

### Vercel — ❌ mauvais modèle

- Fonctions serverless : système de fichiers **éphémère et en lecture seule**
  (sauf `/tmp`, volatil) → SQLite ne persiste pas. Chaque invocation est isolée
  → **la file `mbQueue` n'existe plus**, chaque requête repart avec sa propre
  cadence → quota MusicBrainz violé sous charge. Caches mémoire inutiles.
- Fluid Compute monte la durée max à 5 min sur Hobby, donc la *durée* ne serait
  pas le blocage — mais la persistance et la file le sont.
- Viable **uniquement** en réarchitecturant : DB externe (Turso/libSQL,
  Postgres) + rate-limiting MB externalisé (Redis/Upstash). Gros chantier, hors
  périmètre bêta.

### Netlify — ❌ identique à Vercel

- Site statique + Functions (10 s en sync, 15 min en background). Pas de disque
  persistant, pas d'état in-process partagé. Même blocage que Vercel. Non adapté
  sans réécriture.

### Hors liste, à considérer pour une bêta

- **VPS type Hetzner (~4 €/mois)** : `git pull` + `node server.js` sous
  systemd/pm2. Modèle mental le plus simple, disque = disque, zéro surprise
  d'architecture. Plus de responsabilité (OS, TLS via Caddy/Nginx).
- **Oracle Cloud Always-Free VM** : réellement gratuit à vie, mais setup Linux
  le plus lourd.
- **Raspberry Pi + Cloudflare Tunnel / Tailscale** : coût nul, données chez toi,
  règle aussi le trou « pas d'auth » (tunnel privé). Dépend de la connexion
  domestique.

## 3. Tableau de synthèse

| | Process 24/7 | SQLite persistante | File MB OK (mono-instance) | Build `better-sqlite3` | Coût bêta | Setup |
|---|---|---|---|---|---|---|
| **Railway** | ✅ | ✅ volume | ✅ | ✅ Nixpacks | ~5 $/mois | 🟢 facile |
| **Fly.io** | ✅ | ✅ volume | ✅ | ⚠️ Dockerfile | ~2-3 $/mois | 🟠 moyen |
| **Render** | ✅ (payant) | ✅ (payant uniquement) | ✅ | ✅ | 7 $/mois | 🟢 facile |
| **Vercel** | ❌ serverless | ❌ éphémère | ❌ file cassée | n/a | gratuit | 🔴 réécriture |
| **Netlify** | ❌ serverless | ❌ éphémère | ❌ file cassée | n/a | gratuit | 🔴 réécriture |
| VPS Hetzner | ✅ | ✅ | ✅ | ✅ | ~4 €/mois | 🟠 tu gères l'OS |
| Oracle Free VM | ✅ | ✅ | ✅ | ✅ | gratuit | 🔴 setup Linux |

## 4. Recommandation

**Railway** pour démarrer la bêta vite (15 min, pas de Dockerfile, 24/7 réel),
**Fly.io** si l'objectif est de minimiser le coût récurrent et que le Dockerfile
ne rebute pas. Render ne se justifie que si on est déjà dans leur écosystème.
**Vercel/Netlify sont à écarter** tant que l'app garde SQLite locale + la file
MusicBrainz in-process.

**Domaine IONOS :** un enregistrement `CNAME` (ou `ALIAS`/`A` selon la
plateforme) depuis le DNS IONOS vers le host — Railway, Fly et Render
fournissent la cible et le certificat TLS automatiquement.

## 5. Rappels avant mise en ligne (quel que soit l'hébergeur)

- `server.js` honore déjà `process.env.PORT`.
- ✅ `User-Agent` MusicBrainz corrigé (contact réel).
- ✅ Profils légers + rôle admin (2026-09-11) : ce n'est **pas une
  authentification classique**, mais suffisant pour cette bêta fermée
  (décision utilisateur) — voir § 7 pour la configuration `ADMIN_PASSWORD`.
- `music.db` est gitignoré → restauration via `/api/admin/db-restore` (§ 7),
  pas de copie manuelle de fichier nécessaire.
- `robots.txt` (`Disallow: /`) réduit le risque de découverte accidentelle de
  l'URL, mais ne remplace pas un vrai contrôle d'accès si l'URL fuit.

## 6. Préparation du code — fait (2026-09-11)

- **`DB_PATH`** (variable d'environnement, défaut `music.db`) : chemin du
  fichier SQLite. En local, inchangé. Sur un hébergeur à volume, pointer vers
  un fichier **à l'intérieur du volume monté** (ex. `/data/music.db`) — sinon
  les notations sont perdues à chaque redéploiement (disque du conteneur
  éphémère). Le dossier est créé automatiquement s'il n'existe pas encore.
- **`ADMIN_PASSWORD`** / **`ADMIN_PROFILES`** : déjà lus via `process.env`
  (rôle admin, cf. `GAPS_ET_DECISIONS.md` § « Rôle administrateur »).
- **`PORT`** : déjà lu via `process.env.PORT`, et le serveur écoute sur toutes
  les interfaces (obligatoire pour Railway).
- **Restauration de `music.db`** (le fichier est gitignoré, jamais dans le
  repo) : `POST /api/admin/db-restore` reçoit le fichier en corps brut,
  protégé par `X-Admin-Token`. Il ne touche jamais la base déjà ouverte : le
  fichier reçu est posé à côté (`music.db.upload`) et n'est installé qu'au
  **prochain démarrage** du service (l'ancien fichier est conservé en
  `.bak-<timestamp>`, jamais supprimé). Refuse si la base courante contient
  déjà des notations, sauf `?force=1`. `GET /api/admin/db-status` renvoie
  `{ path, sizeBytes, ratingsCount, pendingRestore }` pour vérifier l'état
  sans accès au serveur.
- `package.json` : `engines.node` ajouté (`>=20`) pour que Railway installe
  une version de Node compatible avec le module natif `better-sqlite3` ;
  `package-lock.json` déjà présent (build reproductible).
- Testé en local avec un `DB_PATH` de test : dépôt du fichier, redémarrage,
  bascule effective, garde-fou `force`, rejet d'un fichier non-SQLite —
  tous vérifiés avant cette livraison.

## 7. Étapes manuelles — Railway

1. **Compte** : sur [railway.com](https://railway.com), s'inscrire (GitHub
   recommandé, ça simplifie l'étape suivante).
2. **Nouveau projet** : *New Project* → *Deploy from GitHub repo* → choisir
   `music-rating-app`. Railway détecte un projet Node (grâce à `package.json`)
   et propose *Deploy Now* — laisser faire, le premier déploiement peut
   échouer faute de variables d'environnement, ce n'est pas grave à ce stade.
3. **Variables d'environnement** : sur le service créé, onglet *Variables* :
   - `ADMIN_PASSWORD` = ton vrai mot de passe (choisis-en un solide, c'est la
     seule chose qui protège le profil « Don »).
   - `DB_PATH` = `/data/music.db`.
   - (`PORT` : ne pas la définir — Railway l'injecte automatiquement et le
     code la lit déjà.)
4. **Volume persistant** : bouton *+ New* (dans le canevas du projet, pas dans
   Variables) → *Volume* → l'attacher au service → *Mount path* =
   `/data` (le même dossier que dans `DB_PATH` ci-dessus, sans le nom de
   fichier).
5. **Redéployer** : après avoir ajouté variables + volume, redéclencher un
   déploiement (*Deploy* en haut à droite, ou un nouveau commit/push). Vérifier
   dans les *Logs* la ligne `Mode admin actif — profil(s) réservé(s) : Don` —
   confirme que `ADMIN_PASSWORD` est bien pris en compte.
6. **URL Railway temporaire** : dans *Settings* → *Networking*, cliquer
   *Generate Domain* pour obtenir une URL `*.up.railway.app` de test — sert à
   vérifier que tout fonctionne avant de brancher le domaine.
7. **Restaurer `music.db`** (une fois l'app accessible sur son URL Railway) :
   depuis ta machine, dans le dossier du projet :
   ```powershell
   curl.exe -X POST -H "X-Admin-Token: <jeton>" --data-binary "@music.db" https://<ton-url-railway>.up.railway.app/api/admin/db-restore
   ```
   Le `<jeton>` s'obtient une fois avec :
   ```powershell
   curl.exe -X POST -H "Content-Type: application/json" -d "{\"password\":\"<ADMIN_PASSWORD>\"}" https://<ton-url-railway>.up.railway.app/api/admin/login
   ```
   Vérifier avec `GET /api/admin/db-status` (même en-tête `X-Admin-Token`)
   que `pendingRestore: true`, puis **redémarrer le service** dans Railway
   (menu ⋯ du service → *Restart*) pour l'installer. Revérifier
   `db-status` : `ratingsCount` doit correspondre à tes notations réelles.
8. **Custom domain** : *Settings* → *Networking* → *+ Custom Domain* → entrer
   `beta.applicalbum.com`. Railway affiche alors un enregistrement **CNAME**
   et un enregistrement **TXT** à créer — copie leurs valeurs exactes, elles
   sont propres à ton déploiement (cf. § 8).
9. Une fois le DNS propagé, Railway émet automatiquement le certificat TLS —
   pas d'action supplémentaire.

## 8. Configuration DNS — IONOS

Railway génère les valeurs exactes des 2 enregistrements à l'étape 8
ci-dessus (elles changent à chaque domaine) : **recopie ce que Railway
affiche**, ce qui suit est le chemin pour aller les saisir chez IONOS.

1. Espace client IONOS → **Domaines & SSL** → sur la ligne du domaine
   `applicalbum.com`, icône ⚙ (Actions) → **DNS**.
2. **Ajouter un enregistrement** :
   - Type : `CNAME`
   - Nom d'hôte (*Hostname*) : `beta`
   - Pointe vers (*Points to*) : la valeur `xxxxx.up.railway.app` fournie par
     Railway
   - TTL : valeur par défaut
   - Enregistrer.
3. **Ajouter un second enregistrement** (vérification de domaine, obligatoire
   — sans lui Railway répond 404 même si le CNAME résout) :
   - Type : `TXT`
   - Nom d'hôte : exactement celui affiché par Railway (souvent quelque chose
     comme `_railway` ou `beta` selon leur génération du moment)
   - Valeur : la chaîne fournie par Railway
   - Enregistrer.
4. **Attention** : IONOS interdit un `CNAME` sur la racine (`@`) — c'est sans
   incidence ici puisque `beta` est un sous-domaine.
5. Propagation : IONOS applique en général immédiatement en interne, jusqu'à
   ~1 h pour une propagation DNS complète. Railway indique dans son onglet
   *Networking* quand le domaine est vérifié et le certificat TLS émis.
6. Vérifier ensuite `https://beta.applicalbum.com/robots.txt` répond bien
   (confirme domaine + TLS + appli tous opérationnels), puis se connecter en
   admin et vérifier `db-status`.

---

*Sources tarifs (sept. 2026) : [Render free tier](https://render.com/docs/free),
[Railway pricing](https://railway.com/pricing),
[Fly.io pricing](https://fly.io/docs/about/pricing/),
[Fly.io free tier 2026](https://www.saaspricepulse.com/blog/flyio-free-tier-2026),
[Vercel Fluid compute](https://vercel.com/docs/fluid-compute).*
