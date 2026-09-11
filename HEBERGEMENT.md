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
- **`User-Agent` MusicBrainz** encore en `contact: test-local` → à remplacer par
  un contact réel (exigé par MusicBrainz en production).
- **Aucune authentification** : une URL publique laisse **tout le monde
  consulter *et modifier*** les notations. Mitiger via tunnel privé, HTTP basic
  auth, ou la vraie fonctionnalité comptes de la spec (GD-00001 / RQ-00006).
- **`music.db` est gitignoré** → upload manuel unique sur le volume persistant.

---

*Sources tarifs (sept. 2026) : [Render free tier](https://render.com/docs/free),
[Railway pricing](https://railway.com/pricing),
[Fly.io pricing](https://fly.io/docs/about/pricing/),
[Fly.io free tier 2026](https://www.saaspricepulse.com/blog/flyio-free-tier-2026),
[Vercel Fluid compute](https://vercel.com/docs/fluid-compute).*
