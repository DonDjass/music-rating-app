/**
 * Serveur local pour l'écran de notation d'un morceau (GD-00002).
 *
 * Sert la page statique (dossier public/) et une petite API JSON
 * branchée sur music.db (table ratings).
 *
 * Lancement :
 *   node server.js
 * Puis ouvrir http://localhost:3000
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Diagnostic d'environnement AVANT le require du module natif : si celui-ci
// segfault au chargement (mauvais binaire précompilé pour la plateforme), ces
// lignes seront la dernière chose visible dans les logs de déploiement.
console.log(
  `Environnement : node ${process.version} — ${process.platform}/${process.arch}` +
    (process.platform === "linux"
      ? ` — glibc ${process.report.getReport().header.glibcVersionRuntime || "absent (musl ?)"}`
      : "")
);

const Database = require("better-sqlite3");
console.log("better-sqlite3 chargé.");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MB_HEADERS = {
  // Format exigé par MusicBrainz : Application/Version ( contact réel ).
  "User-Agent": "MonAppNotationMusique/0.1 ( don.djassi@gmail.com )",
};

// Profil par défaut : toutes les notations créées AVANT l'ajout du système
// de profils lui sont rattachées (migration one-shot, cf. plus bas).
const DEFAULT_PROFILE = "Don";

// --- Rôle administrateur (pas de vrai système de comptes) ---
// Un seul mot de passe, fourni au lancement via la variable d'environnement
// ADMIN_PASSWORD (jamais dans le code). Il déverrouille :
//   - l'accès aux « profils réservés » (par défaut « Don ») ;
//   - le changement de profil côté client.
// Sans ADMIN_PASSWORD : mode admin désactivé, aucun profil réservé (= l'appli
// se comporte comme avant l'ajout des rôles).
// ATTENTION casse : la migration one-shot écrit littéralement "Don" (valeur
// de DEFAULT_PROFILE au moment de la migration) sur les lignes existantes.
// Si ADMIN_PROFILES est un jour défini avec une casse différente pour ce même
// profil (ex. "don"), les lignes déjà migrées ne remonteront plus — il
// faudrait alors un `UPDATE ratings SET profile = '<nouvelle casse>' WHERE
// profile = 'Don'` manuel. getProfile() canonicalise déjà la casse envoyée
// par le client sur celle d'ADMIN_PROFILES, mais ne peut pas renommer les
// lignes déjà en base.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const RESERVED_PROFILES = (process.env.ADMIN_PROFILES || DEFAULT_PROFILE)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const RESERVED_LC = new Set(RESERVED_PROFILES.map((s) => s.toLowerCase()));

function sha256(s) {
  return crypto.createHash("sha256").update(String(s)).digest();
}

function safeEqual(a, b) {
  const ba = Buffer.isBuffer(a) ? a : Buffer.from(String(a), "utf8");
  const bb = Buffer.isBuffer(b) ? b : Buffer.from(String(b), "utf8");
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Jeton admin : HMAC stable (survit aux redémarrages tant que le mot de passe
// ne change pas), vérifiable sans stocker de session.
function adminToken() {
  return crypto.createHmac("sha256", ADMIN_PASSWORD).update("admin-v1").digest("hex");
}

function isAdminRequest(req) {
  if (!ADMIN_PASSWORD) return false;
  const t = req.headers["x-admin-token"];
  return typeof t === "string" && safeEqual(t, adminToken());
}

// Un profil est « réservé » uniquement quand un mot de passe admin est
// configuré (sinon personne, pas même le propriétaire, ne pourrait l'endosser).
function isReservedProfile(profile) {
  return !!ADMIN_PASSWORD && !!profile && RESERVED_LC.has(profile.toLowerCase());
}

// Emplacement du fichier SQLite. En local : "music.db" (racine du projet),
// inchangé. En hébergement à volume persistant (Railway...), DB_PATH pointe
// vers un chemin sur le volume monté (ex. /data/music.db) — sans quoi les
// notations seraient perdues à chaque redéploiement (disque éphémère).
const DB_PATH = process.env.DB_PATH || "music.db";

// Restauration d'une base existante (déploiement initial) : /api/admin/db-restore
// dépose le fichier reçu à côté, sous DB_PATH + ".upload", SANS jamais toucher
// une base déjà ouverte par le process. On l'installe ici, avant l'ouverture —
// c'est le seul moment sûr pour remplacer le fichier.
const pendingUpload = `${DB_PATH}.upload`;
if (fs.existsSync(pendingUpload)) {
  if (fs.existsSync(DB_PATH)) {
    fs.renameSync(DB_PATH, `${DB_PATH}.bak-${Date.now()}`);
  }
  fs.renameSync(pendingUpload, DB_PATH);
  console.log(`music.db restauré depuis ${pendingUpload} (ancien fichier conservé en .bak-*).`);
}

// Volume monté sur un dossier qui n'existe pas encore (premier déploiement) :
// le créer avant d'ouvrir la base, sinon better-sqlite3 échoue.
const dbDir = path.dirname(DB_PATH);
if (dbDir && dbDir !== "." && !fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT,
    album TEXT NOT NULL,
    artist TEXT NOT NULL,
    rating INTEGER,
    comment TEXT,
    cover_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- Migration idempotente : ajoute les colonnes nécessaires si absentes ---
const NEW_COLUMNS = {
  feeling_rating: "REAL",
  crit_performance: "REAL",
  crit_texte: "REAL",
  crit_production: "REAL",
  criteria_rating: "REAL",
  global_rating: "REAL",
  is_classic: "INTEGER NOT NULL DEFAULT 0",
  is_liked: "INTEGER NOT NULL DEFAULT 0",
  track_title: "TEXT",
  duration_ms: "INTEGER",
  release_date: "TEXT",
  release_mbid: "TEXT",
};

// Colonnes ajoutées pour la notation d'album (GD-00003) :
//  - entity_type : 'track' | 'album' | 'artist' — première étape vers le
//    modèle générique acté dans GAPS_ET_DECISIONS.md (migration partielle :
//    seuls les critères ALBUM passent par rating_criteria ; les critères
//    MORCEAU restent sur leurs colonnes fixes pour l'instant).
//  - album_track_count : nombre total de morceaux de l'album (source
//    MusicBrainz, pas en base) — nécessaire pour calculer la couverture,
//    y compris lors d'un recalcul automatique déclenché côté serveur.
//  - morceaux_included : préférence utilisateur du toggle « Prendre en
//    compte mes notes des morceaux ». NULL = défaut (compté dès éligible) ;
//    0 = exclu par choix ; 1 = inclus par choix.
//  - deezer_id : identifiant Deezer de l'entité (morceau / album / artiste),
//    résolu une fois via l'API de recherche Deezer puis mémorisé.
//    NULL + deezer_checked = 1 => recherche faite, aucune correspondance.
//  - deezer_preview_url : URL de l'extrait 30 s (morceau seulement). Ces URL
//    Deezer sont signées et EXPIRENT vite (~15 min) → elles sont rafraîchies
//    via /track/{id} lors d'une visite ultérieure. "none" = ce morceau n'a
//    pas d'extrait Deezer (permanent) ; NULL = pas encore résolu.
//  - deezer_checked : 1 dès qu'une recherche Deezer a été tentée pour cette
//    entité (évite de re-chercher à chaque visite de la fiche).
const NEW_COLUMNS_2 = {
  entity_type: "TEXT NOT NULL DEFAULT 'track'",
  album_track_count: "INTEGER",
  morceaux_included: "INTEGER",
  deezer_id: "TEXT",
  deezer_preview_url: "TEXT",
  deezer_checked: "INTEGER NOT NULL DEFAULT 0",
  // Profils légers (pas d'auth) : pseudo de la personne qui a créé la notation.
  //  - NULL : ligne « technique » sans notation (porteuse du cache Deezer d'un
  //    album/artiste non noté) — invisible partout (les lectures filtrent
  //    toujours sur un profil précis).
  //  - sinon : le pseudo saisi côté client (en-tête X-Profile).
  profile: "TEXT",
  // NOTE AU FEELING Album : peut désormais être héritée des morceaux (comme
  // Performance/Texte/Production). DEFAULT 1 (manuelle) pour que les lignes
  // déjà en base au moment de la migration ne se mettent pas soudain à se
  // resynchroniser toutes seules avec une moyenne que personne n'a demandée.
  // Album seulement (sans effet sur les lignes track/artist).
  feeling_is_manual: "INTEGER NOT NULL DEFAULT 1",
  // Date de la dernière évolution de la NOTE GLOBALE (création OU
  // modification d'un vote) — tenue à jour par le trigger
  // `ratings_rated_at` ci-dessous. NULL tant que la note n'a pas bougé
  // depuis la migration : les lectures utilisent COALESCE(rated_at,
  // created_at). Sert au tri chronologique de la vue ALL TIME « Moyenne »
  // (une œuvre remonte dès qu'un vote la concerne, cf. TRS 23/09/2026).
  rated_at: "TEXT",
};

const existingColumns = db.prepare("PRAGMA table_info(ratings)").all().map((c) => c.name);
const hadProfileColumn = existingColumns.includes("profile");
for (const [name, type] of Object.entries({ ...NEW_COLUMNS, ...NEW_COLUMNS_2 })) {
  if (!existingColumns.includes(name)) {
    db.exec(`ALTER TABLE ratings ADD COLUMN ${name} ${type}`);
  }
}

// Migration one-shot : au moment où la colonne `profile` apparaît, toutes les
// lignes existantes (créées avant les profils) sont rattachées au profil par
// défaut pour ne pas les perdre ni les mélanger avec les futurs profils.
if (!hadProfileColumn) {
  const migrated = db
    .prepare(`UPDATE ratings SET profile = ? WHERE profile IS NULL`)
    .run(DEFAULT_PROFILE);
  if (migrated.changes) {
    console.log(`Profils : ${migrated.changes} notation(s) existante(s) rattachée(s) à « ${DEFAULT_PROFILE} ».`);
  }
}

// Trigger plutôt qu'un `rated_at = ...` dans chaque handler d'écriture
// (feeling, critères, réinitialisations, recalcul album…) : aucun chemin
// qui modifie la note globale ne peut l'oublier.
db.exec(`
  CREATE TRIGGER IF NOT EXISTS ratings_rated_at
  AFTER UPDATE OF global_rating ON ratings
  WHEN NEW.global_rating IS NOT OLD.global_rating
  BEGIN
    UPDATE ratings SET rated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END
`);


// Évaluation par critères d'une notation (album pour l'instant ; morceau plus
// tard). Une ligne par critère : le nombre et la nature varient selon le
// niveau. `is_manual` = 1 dès que l'utilisateur saisit/ajuste la valeur à la
// main → la synchronisation automatique avec la moyenne des morceaux s'arrête
// pour ce critère (cf. PRODUCT_SPEC_NOTATION_ALBUM.md).
db.exec(`
  CREATE TABLE IF NOT EXISTS rating_criteria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rating_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    value REAL,
    is_manual INTEGER NOT NULL DEFAULT 0,
    UNIQUE (rating_id, name)
  )
`);

// Historique des recherches — stockage local simple, sans notion d'utilisateur.
// Une seule ligne par requête distincte (la ré-insertion la remonte en tête).
db.exec(`
  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Code à 4 chiffres par pseudo normal (pas "Don"/les profils réservés, déjà
// protégés par le mot de passe admin) — fixé au premier usage du pseudo,
// vérifié à chaque fois qu'il est retapé. But : empêcher qu'un pseudo déjà
// pris par quelqu'un soit réclamé par quelqu'un d'autre à la porte d'entrée.
// Vérifié UNIQUEMENT à la porte d'entrée (pas à chaque requête) — même
// niveau de protection que le reste des profils normaux.
db.exec(`
  CREATE TABLE IF NOT EXISTS profile_pins (
    profile TEXT PRIMARY KEY,
    pin_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Salé par le pseudo lui-même — protection cosmétique (un code à 4 chiffres
// a de toute façon 10 000 combinaisons), mais évite qu'une comparaison
// brute des hachages révèle deux profils partageant le même code.
function hashPin(profileName, pin) {
  return crypto.createHash("sha256").update(`${profileName}:${pin}`).digest("hex");
}

// --- Recherche MusicBrainz (recherche de morceaux, couvre aussi les
// recherches par artiste ou par album puisque MusicBrainz indexe ces
// champs dans la recherche "recording") ---

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- File d'attente MusicBrainz : l'API demande ~1 req/s. Le front peut
// lancer les 3 recherches en parallèle (affichage progressif) ; ce verrou
// les fait partir une par une, avec un petit délai entre chacune. ---
let mbQueue = Promise.resolve();
const MB_GAP_MS = 350;

function mbGated(task) {
  const result = mbQueue.then(task, task);
  mbQueue = result.then(
    () => wait(MB_GAP_MS),
    () => wait(MB_GAP_MS)
  );
  return result;
}

function mbFetch(url) {
  return mbGated(() => fetchWithRetry(url, { headers: MB_HEADERS }));
}

// Backoff volontairement court : la recherche catégorisée enchaîne 3 appels
// MusicBrainz, donc un backoff trop généreux (ex. 1,5s/3s/4,5s) peut faire
// grimper une recherche à 30-40s+ en cas de 503 en chaîne. Ici, pire cas
// par appel ≈ 800ms + 1600ms = 2,4s avant d'abandonner et de remonter une
// erreur claire plutôt que de faire attendre indéfiniment.
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    // Timeout dur : une connexion MusicBrainz qui pend bloquerait toute la
    // file d'attente `mbGated`.
    const res = await fetch(url, { signal: AbortSignal.timeout(9000), ...options });
    if (res.ok) return res;

    if (res.status === 503 && attempt < retries) {
      await wait(attempt * 800);
      continue;
    }
    throw new Error(`Erreur MusicBrainz: ${res.status}`);
  }
}

function recordingToTrack(rec) {
  const credit = rec["artist-credit"] || [];
  return {
    mbid: rec.id,
    title: rec.title,
    artist: credit[0]?.name || "Artiste inconnu",
    // Featurings (hors artiste principal) : affichage uniquement, jamais
    // persisté en base (une ligne `ratings` garde un seul champ `artist`).
    features: credit.slice(1).map((c) => c.name).filter(Boolean),
    album: rec.releases?.[0]?.title || null,
    releaseMbid: rec.releases?.[0]?.id || null, // pochette (cf. /api/cover)
    date: rec.releases?.[0]?.date || rec["first-release-date"] || null,
    durationMs: rec.length || null,
  };
}

async function searchRecordings(query) {
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(
    query
  )}&fmt=json&limit=10`;

  const res = await mbFetch(url);
  const data = await res.json();

  return (data.recordings || []).map(recordingToTrack);
}

async function searchReleases(query) {
  // limit élevée : on dé-doublonne et on filtre ensuite, il faut de la marge
  // pour ne pas se retrouver avec 2-3 albums après traitement.
  const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(
    query
  )}&fmt=json&limit=25`;

  const res = await mbFetch(url);
  const data = await res.json();

  // 1 entrée par release-group : les éditions multiples d'un même album
  // (FR/US, rééditions…) sont fusionnées. Ordre de pertinence MusicBrainz
  // conservé (Map = ordre d'insertion). 2. Les "Single" sont exclus ;
  // Album, EP, compilation, live… sont gardés.
  const byGroup = new Map();
  for (const rel of data.releases || []) {
    const rg = rel["release-group"] || {};
    const primaryType = rg["primary-type"] || null;

    if (primaryType === "Single") continue;

    const groupKey = rg.id || rel.id;
    if (byGroup.has(groupKey)) {
      const existing = byGroup.get(groupKey);
      // Complète la date si l'entrée retenue n'en avait pas.
      if (!existing.date && rel.date) existing.date = rel.date;
      continue;
    }

    byGroup.set(groupKey, {
      mbid: rel.id, // release mbid — nécessaire pour /api/album-tracks
      releaseGroupMbid: rg.id || null,
      title: rg.title || rel.title,
      artist: rel["artist-credit"]?.[0]?.name || "Artiste inconnu",
      date: rel.date || null,
      primaryType,
    });

    if (byGroup.size >= 12) break;
  }

  return [...byGroup.values()];
}

async function searchArtists(query) {
  const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(
    query
  )}&fmt=json&limit=10`;

  const res = await mbFetch(url);
  const data = await res.json();

  return (data.artists || []).map((artist) => ({
    mbid: artist.id,
    name: artist.name,
    type: artist.type || null,
    country: artist.country || null,
  }));
}

// --- Drill-down : morceaux d'un album ou d'un artiste ---

async function getReleaseTracks(releaseMbid) {
  const url = `https://musicbrainz.org/ws/2/release/${releaseMbid}?inc=recordings+artists&fmt=json`;
  const res = await mbFetch(url);
  const data = await res.json();

  const artist = data["artist-credit"]?.[0]?.name || "Artiste inconnu";
  const album = data.title;
  const date = data.date || null;

  const tracks = [];
  for (const medium of data.media || []) {
    for (const t of medium.tracks || []) {
      if (!t.recording?.id) continue;
      // Featurings propres à CE morceau (déjà présents dans la même réponse,
      // aucun appel MusicBrainz supplémentaire) — l'artiste principal affiché
      // reste celui de l'album, cf. limite "Various Artists" documentée
      // dans GAPS_ET_DECISIONS.md.
      const trackCredit = t.recording["artist-credit"] || [];
      tracks.push({
        mbid: t.recording.id,
        title: t.title || t.recording.title,
        artist,
        features: trackCredit.slice(1).map((c) => c.name).filter(Boolean),
        album,
        date,
        position: t.number ?? t.position ?? null,
        durationMs: t.length || t.recording.length || null,
        releaseMbid,
      });
    }
  }

  return { title: album, artist, date, tracks };
}

// Résout un release-group MusicBrainz en une release représentative
// (nécessaire car /api/album-tracks travaille sur une release, pas un groupe).
async function releaseFromGroup(rgMbid) {
  const url = `https://musicbrainz.org/ws/2/release?release-group=${rgMbid}&fmt=json&limit=1`;
  const res = await mbFetch(url);
  const data = await res.json();
  return data.releases?.[0]?.id || null;
}

// --- Page artiste : détails + discographie + meilleurs titres notés ---

async function getArtistPage(mbid, profile) {
  // 1. Détails (nom + genres/tags)
  const aRes = await mbFetch(`https://musicbrainz.org/ws/2/artist/${mbid}?inc=genres+tags&fmt=json`);
  const a = await aRes.json();
  const name = a.name || "Artiste inconnu";
  const rawTags = (a.genres && a.genres.length ? a.genres : a.tags) || [];
  const tags = rawTags
    .slice()
    .sort((x, y) => (y.count || 0) - (x.count || 0))
    .slice(0, 3)
    .map((t) => t.name);

  await wait(400);

  // 2. Discographie : release-groups (dé-doublonnés par nature), Single exclus.
  const rgRes = await mbFetch(`https://musicbrainz.org/ws/2/release-group?artist=${mbid}&fmt=json&limit=100`);
  const rgData = await rgRes.json();

  // Notes locales par titre d'album (match sur le nom, faute de mbid en base).
  const noteRows = db
    .prepare(
      `SELECT album, AVG(global_rating) AS note
         FROM ratings
        WHERE artist = ? COLLATE NOCASE AND global_rating IS NOT NULL
          AND entity_type = 'track' AND profile = ?
        GROUP BY album COLLATE NOCASE`
    )
    .all(name, profile);
  const noteByAlbum = {};
  for (const r of noteRows) noteByAlbum[(r.album || "").toLowerCase()] = round1(r.note);

  const discography = (rgData["release-groups"] || [])
    .filter((rg) => (rg["primary-type"] || null) !== "Single")
    .map((rg) => ({
      releaseGroupMbid: rg.id,
      title: rg.title,
      date: rg["first-release-date"] || null,
      primaryType: rg["primary-type"] || null,
      // Ex. Compilation, Live, Mixtape/Street... distingue un vrai
      // album/EP studio d'une sortie annexe malgré un primary-type "Album".
      secondaryTypes: rg["secondary-types"] || [],
      note: noteByAlbum[(rg.title || "").toLowerCase()] ?? null,
    }))
    .sort((x, y) => (y.date || "").localeCompare(x.date || "")); // récent -> ancien

  // 3. Meilleurs titres = morceaux notés de cet artiste, du mieux noté au moins bien.
  const topTracks = db
    .prepare(
      `SELECT * FROM ratings
        WHERE artist = ? COLLATE NOCASE AND global_rating IS NOT NULL
          AND entity_type = 'track' AND profile = ?
        ORDER BY global_rating DESC, created_at DESC`
    )
    .all(name, profile)
    .map(serializeRow);

  // 4. "J'aime" l'artiste (ligne ratings keyée sur le mbid de l'artiste, par profil).
  const likeRow = db
    .prepare(`SELECT is_liked FROM ratings WHERE mbid = ? AND profile = ?`)
    .get(mbid, profile);

  return {
    mbid,
    name,
    tags,
    isLiked: !!(likeRow && likeRow.is_liked),
    discography,
    topTracks,
  };
}

// --- Récupère (ou crée) la ligne d'un morceau, identifié par son mbid ---
function getOrCreateTrackRow(mbid, profile, meta = {}) {
  let row = db
    .prepare(`SELECT * FROM ratings WHERE mbid = ? AND profile = ?`)
    .get(mbid, profile);

  if (!row) {
    // Lien partagé (GD-partage) : le destinataire arrive directement sur
    // /track/{mbid} sans être passé par la recherche, donc sans meta
    // MusicBrainz en main. On réutilise titre/album/artiste d'une ligne
    // existante d'un AUTRE profil pour ce même mbid plutôt que de créer un
    // morceau "inconnu" — lecture seule de champs descriptifs, jamais de la
    // notation (PP-01 intact : chaque profil garde sa propre ligne).
    let fallback = null;
    if (!meta.title && !meta.artist) {
      fallback = db
        .prepare(
          `SELECT track_title, album, artist, duration_ms, release_date, release_mbid
             FROM ratings WHERE mbid = ? AND entity_type = 'track' LIMIT 1`
        )
        .get(mbid);
    }
    const info = db
      .prepare(
        `INSERT INTO ratings (mbid, profile, track_title, album, artist, duration_ms, release_date, release_mbid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        mbid,
        profile,
        meta.title || fallback?.track_title || "Morceau inconnu",
        meta.album || fallback?.album || "Album inconnu",
        meta.artist || fallback?.artist || "Artiste inconnu",
        meta.durationMs ?? fallback?.duration_ms ?? null,
        meta.date ?? fallback?.release_date ?? null,
        meta.releaseMbid || fallback?.release_mbid || null
      );
    row = db.prepare(`SELECT * FROM ratings WHERE id = ?`).get(info.lastInsertRowid);
  }

  return row;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// CR-00060 / CR-00061 / CR-00062 / CR-00063
function computeGlobal(feeling, criteriaRating) {
  if (feeling != null && criteriaRating != null) return round1((feeling + criteriaRating) / 2);
  if (feeling != null) return feeling;
  if (criteriaRating != null) return criteriaRating;
  return null;
}

function formatDuration(ms) {
  if (!ms) return null;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function serializeRow(row) {
  const tagsParts = [row.release_date, formatDuration(row.duration_ms)].filter(Boolean);

  return {
    id: row.id,
    mbid: row.mbid,
    title: row.track_title || row.album,
    artist: row.artist,
    albumTitle: row.album,
    tags: tagsParts.length ? tagsParts.join(" • ") : "—",
    durationMs: row.duration_ms,
    feeling: row.feeling_rating,
    criteria: {
      performance: row.crit_performance,
      texte: row.crit_texte,
      production: row.crit_production,
    },
    criteriaRating: row.criteria_rating,
    globalRating: row.global_rating,
    isClassic: !!row.is_classic,
    isLiked: !!row.is_liked,
    releaseMbid: row.release_mbid,
  };
}

// ===================================================================
// --- Notation d'un ALBUM (GD-00003 / PRODUCT_SPEC_NOTATION_ALBUM.md) ---
// ===================================================================

// Les 5 critères Album. Seuls Performance / Texte / Production peuvent être
// hérités des morceaux ; Cohérence et Créativité sont propres à l'album.
const ALBUM_CRITERIA = ["performance", "texte", "production", "coherence", "creativite"];
const ALBUM_INHERITABLE = ["performance", "texte", "production"];
const TRACK_CRIT_COLUMN = {
  performance: "crit_performance",
  texte: "crit_texte",
  production: "crit_production",
};
const COVERAGE_THRESHOLD = 0.7; // seuil d'éligibilité MORCEAUX

// Ligne `ratings` d'un album, identifiée par le mbid de la release, pour un profil.
function getAlbumRow(releaseMbid, profile) {
  return db
    .prepare(`SELECT * FROM ratings WHERE mbid = ? AND entity_type = 'album' AND profile = ?`)
    .get(releaseMbid, profile);
}

// Récupère (ou crée) la ligne d'album du profil. Une ancienne ligne « J'aime
// album » (créée avant l'ajout d'entity_type, donc typée 'track') est convertie.
// On ignore les lignes techniques `profile IS NULL` (porteuses du cache Deezer).
function getOrCreateAlbumRow(releaseMbid, profile, meta = {}) {
  let row = db
    .prepare(`SELECT * FROM ratings WHERE mbid = ? AND profile = ?`)
    .get(releaseMbid, profile);

  if (row && row.entity_type !== "album") {
    db.prepare(`UPDATE ratings SET entity_type = 'album' WHERE id = ?`).run(row.id);
    row = db.prepare(`SELECT * FROM ratings WHERE id = ?`).get(row.id);
  }

  if (!row) {
    const info = db
      .prepare(
        `INSERT INTO ratings (mbid, profile, entity_type, album, artist, track_title, release_date, release_mbid)
         VALUES (?, ?, 'album', ?, ?, ?, ?, ?)`
      )
      .run(
        releaseMbid,
        profile,
        meta.album || meta.title || "Album inconnu",
        meta.artist || "Artiste inconnu",
        meta.title || meta.album || null,
        meta.date || null,
        releaseMbid
      );
    row = db.prepare(`SELECT * FROM ratings WHERE id = ?`).get(info.lastInsertRowid);
  }

  return row;
}

function mean1(values) {
  const vals = values.filter((v) => v != null);
  if (!vals.length) return null;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// Stats dérivées des morceaux de l'album (identifiés par release_mbid ; seuls
// les morceaux ouverts via la tracklist portent ce lien — limite v1).
function albumTrackStats(releaseMbid, profile) {
  const rows = db
    .prepare(
      `SELECT crit_performance, crit_texte, crit_production, global_rating, feeling_rating
         FROM ratings
        WHERE release_mbid = ? AND entity_type = 'track' AND profile = ?`
    )
    .all(releaseMbid, profile);

  const ratedGlobals = rows.map((r) => r.global_rating).filter((v) => v != null);
  const critMeans = {};
  for (const name of ALBUM_INHERITABLE) {
    critMeans[name] = mean1(rows.map((r) => r[TRACK_CRIT_COLUMN[name]]));
  }
  // Moyenne des NOTE AU FEELING morceaux — sert UNIQUEMENT à l'héritage de la
  // NOTE AU FEELING Album (ci-dessous). À NE PAS confondre avec `morceauxMean`
  // (moyenne des NOTE GLOBALE Track, feeling+critères combinés, utilisée pour
  // la composante MORCEAUX de la NOTE GLOBALE Album) : deux agrégats
  // distincts sur les mêmes morceaux.
  const feelingValues = rows.map((r) => r.feeling_rating).filter((v) => v != null);

  return {
    ratedCount: ratedGlobals.length,
    morceauxMean: mean1(ratedGlobals),
    critMeans,
    trackFeelingMean: mean1(feelingValues),
    trackFeelingCount: feelingValues.length,
  };
}

function getAlbumCriteria(ratingId) {
  const rows = db
    .prepare(`SELECT name, value, is_manual FROM rating_criteria WHERE rating_id = ?`)
    .all(ratingId);
  const map = {};
  for (const r of rows) map[r.name] = { value: r.value, manual: !!r.is_manual };
  return map;
}

// NOTE PAR CRITÈRES Album = moyenne des critères effectivement renseignés,
// arrondie au dixième (CALCULATION RULE — NOTE PAR CRITÈRES Album).
function albumCriteriaRating(criteriaMap) {
  return mean1(ALBUM_CRITERIA.map((n) => criteriaMap[n] && criteriaMap[n].value));
}

function completeness(setCount, totalCount) {
  if (setCount === 0) return "none";
  if (setCount >= totalCount) return "complete";
  return "partial";
}

// NOTE GLOBALE Album (CALCULATION RULE — poids de MORCEAUX, répartition du
// poids restant, MORCEAUX seul, NOTE GLOBALE sans MORCEAUX).
function computeAlbumGlobal({ feeling, criteriaRating, morceauxMean, coverage, morceauxPref }) {
  const eligible = coverage != null && coverage >= COVERAGE_THRESHOLD;
  const participates = eligible && morceauxPref !== 0 && morceauxMean != null;

  const fc = [];
  if (feeling != null) fc.push(feeling);
  if (criteriaRating != null) fc.push(criteriaRating);

  if (participates) {
    // MORCEAUX seul : ni feeling ni critères -> NOTE GLOBALE = moyenne MORCEAUX.
    if (fc.length === 0) return round1(morceauxMean);

    const weightMorceaux = (1 / 3) * coverage; // max 33,33 % à 100 % de couverture
    const weightEach = (1 - weightMorceaux) / fc.length; // poids restant réparti à parts égales
    const value =
      weightMorceaux * morceauxMean + weightEach * fc.reduce((a, b) => a + b, 0);
    return round1(value);
  }

  // MORCEAUX ne participe pas : moyenne des composantes Album disponibles.
  if (fc.length === 0) return null;
  return round1(fc.reduce((a, b) => a + b, 0) / fc.length);
}

// Recalcule et persiste criteria_rating + global_rating de l'album, en
// resynchronisant au passage les critères hérités non ajustés manuellement
// (BR — Synchronisation des valeurs héritées / Recalcul automatique).
function recomputeAlbum(row) {
  const stats = albumTrackStats(row.mbid, row.profile);
  const total = row.album_track_count;
  const coverage = total ? Math.min(1, stats.ratedCount / total) : null;

  for (const name of ALBUM_INHERITABLE) {
    const cr = db
      .prepare(`SELECT * FROM rating_criteria WHERE rating_id = ? AND name = ?`)
      .get(row.id, name);
    if (cr && !cr.is_manual) {
      db.prepare(`UPDATE rating_criteria SET value = ? WHERE id = ?`).run(
        stats.critMeans[name],
        cr.id
      );
    }
  }

  // NOTE AU FEELING Album héritée : même principe que les critères
  // ci-dessus, appliqué à un scalaire (feeling_rating/feeling_is_manual)
  // plutôt qu'à rating_criteria. Si plus aucun morceau n'a de NOTE AU
  // FEELING, trackFeelingMean vaut null → la NOTE AU FEELING Album héritée
  // redevient vide (BR — Disparition des données sources).
  let feeling = row.feeling_rating;
  if (!row.feeling_is_manual) {
    feeling = stats.trackFeelingMean;
    db.prepare(`UPDATE ratings SET feeling_rating = ? WHERE id = ?`).run(feeling, row.id);
  }

  const criteriaMap = getAlbumCriteria(row.id);
  const criteriaRating = albumCriteriaRating(criteriaMap);
  const global = computeAlbumGlobal({
    feeling,
    criteriaRating,
    morceauxMean: stats.morceauxMean,
    coverage,
    morceauxPref: row.morceaux_included,
  });

  db.prepare(`UPDATE ratings SET criteria_rating = ?, global_rating = ? WHERE id = ?`).run(
    criteriaRating,
    global,
    row.id
  );

  return { stats, coverage, criteriaMap, criteriaRating, global, feeling };
}

// Point d'entrée du recalcul automatique déclenché par une modif de morceau
// (dans le périmètre d'un seul profil : c'est SA note d'album qui bouge).
function recomputeAlbumForRelease(releaseMbid, profile) {
  if (!releaseMbid) return;
  const row = getAlbumRow(releaseMbid, profile);
  if (row) recomputeAlbum(row);
}

// État complet de la notation d'un album, pour le client (profil courant).
// `readonly` (GD-consultation) : consultation de la ligne d'UN AUTRE profil —
// on lit ses stats mais on ne mémorise jamais rien sur sa ligne (PP-01).
function serializeAlbumNotation(releaseMbid, totalCount, profile, readonly = false) {
  const row = getAlbumRow(releaseMbid, profile);
  const ratingId = row ? row.id : null;

  // La couverture s'appuie sur le total transmis par le client (tracklist
  // MusicBrainz) ; on en profite pour le mémoriser sur la ligne album.
  let total = totalCount;
  if (total == null && row) total = row.album_track_count;
  if (!readonly && row && total != null && total !== row.album_track_count) {
    db.prepare(`UPDATE ratings SET album_track_count = ? WHERE id = ?`).run(total, row.id);
  }

  const stats = albumTrackStats(releaseMbid, profile);
  const coverage = total ? Math.min(1, stats.ratedCount / total) : null;
  const eligible = coverage != null && coverage >= COVERAGE_THRESHOLD;
  const morceauxPref = row ? row.morceaux_included : null;
  const included = morceauxPref !== 0; // NULL ou 1 => coché
  const participates = eligible && included && stats.morceauxMean != null;

  const criteriaMap = ratingId ? getAlbumCriteria(ratingId) : {};
  const criteria = {};
  for (const name of ALBUM_CRITERIA) {
    if (criteriaMap[name] && criteriaMap[name].value != null) {
      criteria[name] = {
        value: criteriaMap[name].value,
        manual: criteriaMap[name].manual,
      };
    }
  }
  const setCritCount = Object.keys(criteria).length;
  const criteriaRating = albumCriteriaRating(criteriaMap);
  const feeling = row ? row.feeling_rating : null;
  const feelingManual = row ? !!row.feeling_is_manual : true;

  const global = computeAlbumGlobal({
    feeling,
    criteriaRating,
    morceauxMean: stats.morceauxMean,
    coverage,
    morceauxPref,
  });

  return {
    feeling,
    feelingComplete: feeling != null,
    // Hérité (non manuel) ET une moyenne morceaux existe encore : point de
    // départ pour "Calculer depuis mes morceaux" côté client (bouton, revert,
    // détail "Calculée depuis X/Y morceaux").
    feelingManual,
    trackFeelingMean: stats.trackFeelingMean,
    trackFeelingCount: stats.trackFeelingCount,
    criteria,
    criteriaRating,
    criteriaCompleteness: completeness(setCritCount, ALBUM_CRITERIA.length),
    criteriaSetCount: setCritCount,
    trackCritMeans: stats.critMeans, // pour « Calculer depuis les morceaux » (brouillon client)
    morceaux: {
      mean: stats.morceauxMean,
      ratedCount: stats.ratedCount,
      totalCount: total ?? null,
      coverage,
      eligible,
      participates,
      included,
      completeness:
        total != null ? completeness(stats.ratedCount, total) : stats.ratedCount ? "partial" : "none",
    },
    global,
  };
}

// --- Handlers API ---

// Cache des recherches en mémoire (vie du process). Clé = "catégorie:requête".
// Une requête déjà obtenue n'est pas re-demandée à MusicBrainz.
const SEARCH_CACHE_TTL = 60 * 60 * 1000; // 1 h
const SEARCH_CACHE_MAX = 300;
const searchCache = new Map();

const SEARCH_FN = {
  tracks: searchRecordings,
  albums: searchReleases,
  artists: searchArtists,
};

// Une catégorie à la fois : le front lance les 3 en parallèle et affiche
// chacune dès qu'elle répond. Chaque catégorie est indépendante (une en
// échec renvoie `<clé>Error`, les autres passent). Le verrou `mbGated`
// sérialise les appels MusicBrainz sous-jacents.
async function handleSearchCategory(cat, query, res) {
  const fn = SEARCH_FN[cat];
  if (!fn) return sendJson(res, 404, { error: "Catégorie inconnue." });

  const q = (query || "").trim();
  if (!q) return sendJson(res, 400, { error: "Requête de recherche vide." });

  const key = `${cat}:${q.toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.ts < SEARCH_CACHE_TTL) {
    return sendJson(res, 200, { [cat]: hit.data, cached: true });
  }

  try {
    const data = await fn(q);
    searchCache.set(key, { data, ts: Date.now() });
    if (searchCache.size > SEARCH_CACHE_MAX) {
      searchCache.delete(searchCache.keys().next().value); // évince la plus ancienne
    }
    sendJson(res, 200, { [cat]: data });
  } catch (err) {
    console.error(`Recherche "${cat}" en échec :`, err.message);
    // Pas de mise en cache d'un échec : un nouvel essai relancera l'appel.
    sendJson(res, 200, { [cat]: null, [`${cat}Error`]: "Indisponible pour le moment. Réessaie." });
  }
}

// --- Pochettes : Cover Art Archive puis repli Deezer ---
// IMPORTANT (CGU Deezer) : on ne télécharge/stocke JAMAIS l'image Deezer.
// On interroge uniquement leur API de recherche (JSON) pour récupérer l'URL
// de la pochette, que le client affichera telle quelle en <img>.
const COVER_CACHE_TTL = 24 * 60 * 60 * 1000;
const coverCache = new Map();

async function safeFetch(url, options = {}) {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(4500), ...options });
  } catch {
    return null;
  }
}

// Deezer renvoie parfois une URL "sans image" (segment de hash vide,
// ex. .../images/artist//500x500-...) -> on la traite comme absente.
function cleanCoverUrl(url) {
  if (!url || /\/images\/(?:artist|cover)\/\//.test(url)) return null;
  return url;
}

async function getCoverUrl({ type, releaseMbid, releaseGroupMbid, artist, album }) {
  const cacheKey = `${type || "album"}:${(
    releaseMbid ||
    releaseGroupMbid ||
    `${artist || ""}|${album || ""}`
  ).toLowerCase()}`;
  const hit = coverCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < COVER_CACHE_TTL) return hit.url;

  let url = null;

  // Photo d'artiste : pas de Cover Art Archive, uniquement la recherche Deezer.
  if (type === "artist") {
    if (artist) {
      const r = await safeFetch(
        `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`
      );
      if (r && r.ok) {
        try {
          const a = (await r.json()).data?.[0];
          url = cleanCoverUrl(a?.picture_big || a?.picture_medium || a?.picture || null);
        } catch {
          /* ignore */
        }
      }
    }
    coverCache.set(cacheKey, { url, ts: Date.now() });
    return url;
  }

  // 1. Cover Art Archive (release, puis release-group)
  const caaTargets = [
    releaseMbid && ["release", releaseMbid],
    releaseGroupMbid && ["release-group", releaseGroupMbid],
  ].filter(Boolean);
  for (const [type, id] of caaTargets) {
    const r = await safeFetch(`https://coverartarchive.org/${type}/${id}`, {
      headers: { "User-Agent": MB_HEADERS["User-Agent"] },
    });
    if (r && r.ok) {
      try {
        const d = await r.json();
        const front = (d.images || []).find((i) => i.front) || (d.images || [])[0];
        const pick = front && (front.thumbnails?.["500"] || front.thumbnails?.["250"] || front.image);
        if (pick) {
          url = pick.replace(/^http:/, "https:");
          break;
        }
      } catch {
        /* pas de JSON exploitable */
      }
    }
  }

  // 2. Repli : recherche album Deezer (URL seulement, jamais l'image)
  if (!url && (artist || album)) {
    const q = `artist:"${(artist || "").replace(/"/g, "")}" album:"${(album || "").replace(/"/g, "")}"`.trim();
    const r = await safeFetch(`https://api.deezer.com/search/album?q=${encodeURIComponent(q)}&limit=1`);
    if (r && r.ok) {
      try {
        const d = await r.json();
        const a = d.data?.[0];
        url = cleanCoverUrl(a?.cover_big || a?.cover_medium || a?.cover || null);
      } catch {
        /* ignore */
      }
    }
  }

  coverCache.set(cacheKey, { url, ts: Date.now() });
  return url;
}

async function handleCover(params, res) {
  const url = await getCoverUrl({
    type: params.get("type") || null,
    releaseMbid: params.get("releaseMbid") || null,
    releaseGroupMbid: params.get("rg") || null,
    artist: params.get("artist") || null,
    album: params.get("album") || null,
  });
  sendJson(res, 200, { url });
}

// --- Deep link Deezer (bouton « Écouter ») ---
// On résout l'entité MusicBrainz vers son équivalent Deezer via l'API de
// recherche Deezer (même API que le repli des pochettes), une seule fois :
// l'ID est mémorisé sur la ligne `ratings` (deezer_id + deezer_checked).

const DEEZER_SEG = { track: "track", album: "album", artist: "artist" };

function deezerUrl(type, id) {
  return id ? `https://www.deezer.com/${DEEZER_SEG[type] || "track"}/${id}` : null;
}

function dzQuote(s) {
  return (s || "").replace(/["\\]/g, " ").trim();
}

const PREVIEW_NONE = "none"; // sentinelle : ce morceau n'a pas d'extrait

// URL d'extrait Deezer expirée (ou sur le point de l'être) ? Elles portent un
// paramètre `exp=<epoch>` dans la signature `hdnea`.
function previewExpired(url) {
  const m = /exp=(\d+)/.exec(url || "");
  return m ? Number(m[1]) * 1000 < Date.now() + 30000 : false;
}

// --- Normalisation & similarité de chaînes (vérification du matching Deezer) ---
// Cf. GAPS_ET_DECISIONS.md (2026-09-17) : la recherche plein-texte Deezer
// prenait le 1er résultat sans jamais vérifier l'artiste ni la durée, ce qui
// a produit des associations complètement fausses (ex. un morceau de Lino
// associé à un morceau de Cesária Évora).

function stripDiacritics(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeForMatch(s) {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Distance de Levenshtein (chaînes courtes : titres/noms d'artiste).
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

// Score de similarité 0..1 (1 = identique) entre deux chaînes déjà normalisées.
function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// L'artiste renvoyé par Deezer "correspond" à l'artiste MusicBrainz si, une
// fois normalisés (minuscules, sans accents/ponctuation), l'un contient
// l'autre (tolère "The Beatles" vs "Beatles", "Lino feat. X" vs "Lino") ou si
// leur similarité reste élevée (tolère une variante orthographique mineure).
// Un artiste sans rapport (ex. Cesária Évora vs Lino) est rejeté.
const ARTIST_MATCH_THRESHOLD = 0.72;
function artistMatches(mbArtist, dzArtist) {
  const a = normalizeForMatch(mbArtist);
  const b = normalizeForMatch(dzArtist);
  if (!a || !b) return true; // rien à comparer : ne bloque pas le résultat
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return true;
  return similarity(a, b) >= ARTIST_MATCH_THRESHOLD;
}

// Tolérance de durée (morceaux uniquement, en ms) : filtre notamment les
// versions live / remix / radio edit qui partagent le même titre+artiste.
const DURATION_TOLERANCE_MS = 7000;
function durationMatches(mbDurationMs, dzDurationSec) {
  if (!mbDurationMs || dzDurationSec == null) return true; // donnée absente : ne bloque pas
  return Math.abs(mbDurationMs - dzDurationSec * 1000) <= DURATION_TOLERANCE_MS;
}

// Renvoie { id, preview } (id string ou null si aucune correspondance fiable ;
// preview = URL de l'extrait 30 s ou "" si le morceau n'en a pas, morceau
// uniquement), ou `undefined` si la recherche a échoué (→ ne pas mémoriser).
//
// Récupère jusqu'à 5 candidats Deezer, écarte ceux dont l'artiste ne
// correspond pas (et, pour un morceau, dont la durée diffère trop — filtre
// les versions live/remix), puis retient parmi les survivants celui dont le
// titre est le plus proche du titre recherché. Si aucun candidat ne passe
// les filtres, pas de correspondance plutôt qu'un résultat faux (un extrait
// absent est moins gênant qu'un extrait faux).
async function searchDeezer(type, title, artist, durationMs) {
  const seg = DEEZER_SEG[type];
  if (!seg) return undefined;

  const t = dzQuote(title);
  const a = dzQuote(artist);

  if (type === "artist") {
    // Recherche d'un artiste : pas de filtre identité/durée applicable ici
    // (c'est justement l'identité qu'on cherche) — comportement inchangé.
    if (!a) return undefined;
    const r = await safeFetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(a)}&limit=1`);
    if (!r || !r.ok) return undefined;
    try {
      const hit = (await r.json())?.data?.[0];
      return hit && hit.id != null ? { id: String(hit.id), preview: null } : { id: null, preview: null };
    } catch {
      return { id: null, preview: null };
    }
  }

  const queries = [`${t} ${a}`.trim(), t].filter(Boolean);
  const normTitle = normalizeForMatch(title);

  let anySucceeded = false;
  for (const q of queries) {
    const r = await safeFetch(
      `https://api.deezer.com/search/${seg}?q=${encodeURIComponent(q)}&limit=5`
    );
    if (!r || !r.ok) continue;
    anySucceeded = true;

    let hits;
    try {
      hits = (await r.json())?.data || [];
    } catch {
      continue;
    }

    const candidates = hits.filter((hit) => {
      if (hit.id == null) return false;
      if (a && !artistMatches(artist, hit.artist?.name)) return false;
      if (type === "track" && !durationMatches(durationMs, hit.duration)) return false;
      return true;
    });
    if (candidates.length === 0) continue;

    // Meilleur candidat = titre le plus proche (tri stable : à égalité, on
    // garde l'ordre de pertinence déjà donné par Deezer).
    let best = candidates[0];
    let bestScore = similarity(normTitle, normalizeForMatch(best.title));
    for (const c of candidates.slice(1)) {
      const score = similarity(normTitle, normalizeForMatch(c.title));
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    return { id: String(best.id), preview: type === "track" ? best.preview || "" : null };
  }
  return anySucceeded ? { id: null, preview: null } : undefined;
}

// Récupère une URL d'extrait fraîche pour un ID Deezer connu (les URL d'extrait
// expirent vite). "" => le morceau n'a pas d'extrait ; undefined => échec.
async function deezerFreshPreview(deezerId) {
  const r = await safeFetch(`https://api.deezer.com/track/${encodeURIComponent(deezerId)}`);
  if (!r || !r.ok) return undefined;
  try {
    const d = await r.json();
    if (!d || d.error) return undefined;
    return d.preview || "";
  } catch {
    return undefined;
  }
}

// Mémorise le résultat (crée une ligne `ratings` minimale si l'entité n'en a
// pas encore — album/artiste non notés). Ne touche jamais entity_type d'une
// ligne existante.
// Le cache Deezer (id, extrait) n'est PAS propre à un profil : on réutilise
// n'importe quelle ligne de ce mbid, ou on crée une ligne technique
// `profile IS NULL` (invisible des lectures de notations).
//
// `meta.releaseMbid` (morceau uniquement) : cf. GAPS_ET_DECISIONS.md
// (2026-09-17) — avant ce correctif, une ligne technique créée ici pour un
// morceau jamais ouvert/noté auparavant avait toujours `release_mbid = NULL`,
// ce qui rendait le refresh admin "par album" incapable de l'atteindre. On
// le pose à la création si on le connaît, et on rattrape (backfill) une
// ligne déjà existante qui ne l'avait pas encore.
function cacheDeezerResult(mbid, type, meta, result) {
  let row = db.prepare(`SELECT id, release_mbid FROM ratings WHERE mbid = ? LIMIT 1`).get(mbid);
  if (!row) {
    const info = db
      .prepare(
        `INSERT INTO ratings (mbid, entity_type, album, artist, track_title, release_mbid)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        mbid,
        type,
        meta.album || meta.title || "—",
        meta.artist || "—",
        meta.title || null,
        type === "album" ? mbid : meta.releaseMbid || null
      );
    row = { id: info.lastInsertRowid };
  } else if (type === "track" && !row.release_mbid && meta.releaseMbid) {
    db.prepare(`UPDATE ratings SET release_mbid = ? WHERE mbid = ? AND release_mbid IS NULL`).run(
      meta.releaseMbid,
      mbid
    );
  }
  db.prepare(
    `UPDATE ratings SET deezer_id = ?, deezer_preview_url = ?, deezer_checked = 1 WHERE id = ?`
  ).run(result.id || null, result.preview ? result.preview : PREVIEW_NONE, row.id);
}

async function handleDeezerLink(params, res) {
  const type = params.get("type") || "track";
  const mbid = params.get("mbid");
  if (!mbid || !DEEZER_SEG[type]) {
    return sendJson(res, 400, { error: "Paramètres invalides." });
  }
  const title = params.get("title") || "";
  const artist = params.get("artist") || "";
  const durationMs = params.get("durationMs") ? Number(params.get("durationMs")) : null;
  const releaseMbid = params.get("releaseMbid") || null;

  // N'importe quelle ligne de ce mbid porte le cache Deezer (voir
  // cacheDeezerResult) : on prend en priorité une ligne déjà résolue.
  const row = db
    .prepare(
      `SELECT deezer_id, deezer_preview_url, deezer_checked FROM ratings
        WHERE mbid = ? ORDER BY deezer_checked DESC LIMIT 1`
    )
    .get(mbid);

  if (row && row.deezer_checked) {
    // Rattrape un release_mbid manquant (cf. cacheDeezerResult) même sur un
    // cache déjà résolu, pour qu'un futur refresh "par album" l'atteigne.
    if (type === "track" && releaseMbid) {
      db.prepare(`UPDATE ratings SET release_mbid = ? WHERE mbid = ? AND release_mbid IS NULL`).run(
        releaseMbid,
        mbid
      );
    }
    let preview = row.deezer_preview_url;
    // Rafraîchit l'URL d'extrait si elle manque ou a expiré (morceau connu).
    if (
      type === "track" &&
      row.deezer_id &&
      preview !== PREVIEW_NONE &&
      (!preview || previewExpired(preview))
    ) {
      const fresh = await deezerFreshPreview(row.deezer_id);
      if (fresh !== undefined) {
        preview = fresh === "" ? PREVIEW_NONE : fresh;
        db.prepare(`UPDATE ratings SET deezer_preview_url = ? WHERE mbid = ?`).run(preview, mbid);
      }
    }
    return sendJson(res, 200, {
      id: row.deezer_id || null,
      url: deezerUrl(type, row.deezer_id),
      preview: preview && preview !== PREVIEW_NONE ? preview : null,
    });
  }

  const result = await searchDeezer(type, title, artist, durationMs);
  if (result === undefined) {
    // Recherche indisponible : on ne mémorise rien, le client réessaiera.
    return sendJson(res, 200, { id: null, url: null, preview: null, transient: true });
  }
  cacheDeezerResult(mbid, type, { title, artist, releaseMbid }, result);
  sendJson(res, 200, {
    id: result.id || null,
    url: deezerUrl(type, result.id),
    preview: result.preview ? result.preview : null,
  });
}

// Admin : force un re-matching Deezer (id + extrait) pour un morceau/album
// précis, un album entier, un artiste ou l'intégralité du cache — cf.
// GAPS_ET_DECISIONS.md (2026-09-17, correctif du matching Deezer, ex.
// "Radio bitume"/"Get Rich or Die Tryin'" mal matchés). Vide juste le cache
// existant ; le prochain affichage du bouton "Écouter"/"Extrait" relance une
// recherche, avec les filtres artiste/durée désormais en place dans
// searchDeezer().
function handleDeezerRefresh(body, res) {
  const clearSql = `UPDATE ratings SET deezer_id = NULL, deezer_preview_url = NULL, deezer_checked = 0`;
  let info;
  if (body.all === true) {
    info = db.prepare(`${clearSql} WHERE deezer_checked = 1`).run();
  } else if (typeof body.mbid === "string" && body.mbid.trim()) {
    // Un seul morceau/album précis (bouton ↻ sur sa fiche) — ne touche pas
    // le reste de l'album.
    info = db.prepare(`${clearSql} WHERE deezer_checked = 1 AND mbid = ?`).run(body.mbid.trim());
  } else if (typeof body.releaseMbid === "string" && body.releaseMbid.trim()) {
    const releaseMbid = body.releaseMbid.trim();
    // L'album lui-même (mbid = releaseMbid) et tous ses morceaux
    // (release_mbid = releaseMbid), tous profils confondus (le cache Deezer
    // n'est pas propre à un profil, cf. cacheDeezerResult).
    info = db
      .prepare(`${clearSql} WHERE deezer_checked = 1 AND (mbid = ? OR release_mbid = ?)`)
      .run(releaseMbid, releaseMbid);
  } else if (typeof body.artist === "string" && body.artist.trim()) {
    // Correspondance texte insensible à la casse (aucun artist_mbid stocké
    // sur `ratings` aujourd'hui — cohérent avec le reste du matching Deezer,
    // déjà basé sur le nom texte plutôt qu'un identifiant stable).
    info = db
      .prepare(`${clearSql} WHERE deezer_checked = 1 AND LOWER(artist) = LOWER(?)`)
      .run(body.artist.trim());
  } else {
    return sendJson(res, 400, { error: "Précise releaseMbid, artist, ou all:true." });
  }
  sendJson(res, 200, { ok: true, cleared: info.changes });
}

// Historique des recherches : on enregistre la requête (dé-doublonnée et
// remontée en tête), et on relit les 10 plus récentes.
function handleRecordSearch(body, res) {
  const q = (body.query || "").trim();
  if (!q) return sendJson(res, 400, { error: "Requête vide." });

  db.prepare(`DELETE FROM search_history WHERE query = ?`).run(q);
  db.prepare(`INSERT INTO search_history (query) VALUES (?)`).run(q);

  sendJson(res, 200, { ok: true });
}

function handleGetSearchHistory(res) {
  const rows = db
    .prepare(`SELECT query FROM search_history ORDER BY id DESC LIMIT 10`)
    .all();
  sendJson(res, 200, { queries: rows.map((r) => r.query) });
}

// Résolution nom -> entité MusicBrainz, pour rendre l'artiste et l'album
// cliquables depuis la fiche morceau (on n'a que leur nom en base).
async function handleResolveArtist(name, res) {
  const n = (name || "").trim();
  if (!n) return sendJson(res, 400, { error: "Nom manquant." });
  try {
    const results = await searchArtists(n);
    sendJson(res, 200, { artist: results[0] || null });
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: "MusicBrainz indisponible. Réessaie." });
  }
}

async function handleResolveAlbum(title, artist, res) {
  const t = (title || "").trim();
  if (!t) return sendJson(res, 400, { error: "Titre manquant." });
  try {
    const query = artist
      ? `release:"${t}" AND artist:"${artist}"`
      : `release:"${t}"`;
    const results = await searchReleases(query);
    sendJson(res, 200, { album: results[0] || null });
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: "MusicBrainz indisponible. Réessaie." });
  }
}

// Édition (release) à privilégier pour afficher cet album à ce profil, ou
// null pour garder celle demandée. Garde la demandée si le profil y a déjà
// une notation album ou des morceaux ; sinon prend sa notation album du même
// nom/artiste, à défaut l'édition portant le plus de ses morceaux notés.
function preferredRelease(data, requested, profile) {
  const onRequested = db
    .prepare(
      `SELECT 1 FROM ratings
        WHERE profile = ? AND (
          (entity_type = 'album' AND mbid = ?) OR
          (entity_type = 'track' AND release_mbid = ?))
        LIMIT 1`
    )
    .get(profile, requested, requested);
  if (onRequested) return null;

  const albumRow = db
    .prepare(
      `SELECT mbid FROM ratings
        WHERE profile = ? AND entity_type = 'album' AND mbid IS NOT NULL
          AND album = ? COLLATE NOCASE AND artist = ? COLLATE NOCASE
        LIMIT 1`
    )
    .get(profile, data.title || "", data.artist || "");
  if (albumRow) return albumRow.mbid;

  const mbids = data.tracks.map((t) => t.mbid).filter(Boolean);
  if (!mbids.length) return null;
  const row = db
    .prepare(
      `SELECT release_mbid, COUNT(*) AS n FROM ratings
        WHERE profile = ? AND entity_type = 'track' AND release_mbid IS NOT NULL
          AND mbid IN (${mbids.map(() => "?").join(",")})
        GROUP BY release_mbid ORDER BY n DESC LIMIT 1`
    )
    .get(profile, ...mbids);
  return row ? row.release_mbid : null;
}

// `mbid` = release, OU `rgMbid` = release-group (résolu en une release ; utile
// pour la discographie d'un artiste qui liste des release-groups).
// `viewProfile` (GD-consultation) : affiche les notes de CE profil (tuile
// d'accueil "Tout le monde") au lieu de celles du profil courant — lecture
// seule, aucun recalcul/écriture déclenché sur sa ligne (PP-01).
async function handleAlbumTracks(mbid, rgMbid, profile, viewProfile, res) {
  try {
    let releaseMbid = mbid || null;
    if (!releaseMbid && rgMbid) releaseMbid = await releaseFromGroup(rgMbid);
    if (!releaseMbid) return sendJson(res, 400, { error: "mbid manquant." });

    let data = await getReleaseTracks(releaseMbid);
    const displayProfile = viewProfile || profile;

    // Même album, autre édition : ouvert par son nom (tuile d'accueil,
    // recherche, discographie), MusicBrainz peut renvoyer une autre release
    // que celle à laquelle le profil a rattaché ses notes. La tracklist
    // retrouvait bien les notes (mêmes recordings) mais la notation album
    // (feeling hérité, critères, MORCEAUX), keyée sur la release, était vide.
    // → on bascule sur l'édition déjà utilisée par ce profil.
    const preferred = preferredRelease(data, releaseMbid, displayProfile);
    if (preferred) {
      try {
        data = await getReleaseTracks(preferred);
        releaseMbid = preferred;
      } catch {
        /* garde l'édition demandée */
      }
    }

    // Morceaux notés depuis la recherche (sans contexte album) : release
    // inconnue → absents des stats album. On les rattache à cette édition.
    if (!viewProfile) {
      const attach = db.prepare(
        `UPDATE ratings SET release_mbid = ?
          WHERE mbid = ? AND profile = ? AND entity_type = 'track' AND release_mbid IS NULL`
      );
      let attached = 0;
      for (const t of data.tracks) attached += attach.run(releaseMbid, t.mbid, profile).changes;
      if (attached) recomputeAlbumForRelease(releaseMbid, profile);
    }

    // Enrichit chaque morceau avec la NOTE GLOBALE du profil affiché (null si
    // non noté), et indique si CE profil "aime" l'album.
    const mbids = data.tracks.map((t) => t.mbid).filter(Boolean);
    const ratingByMbid = {};
    if (mbids.length) {
      const placeholders = mbids.map(() => "?").join(",");
      const rows = db
        .prepare(
          `SELECT mbid, global_rating FROM ratings
            WHERE profile = ? AND mbid IN (${placeholders})`
        )
        .all(displayProfile, ...mbids);
      for (const row of rows) ratingByMbid[row.mbid] = row.global_rating;
    }
    data.tracks = data.tracks.map((t) => ({
      ...t,
      globalRating: ratingByMbid[t.mbid] ?? null,
    }));

    const albumRow = db
      .prepare(`SELECT is_liked FROM ratings WHERE mbid = ? AND profile = ?`)
      .get(releaseMbid, displayProfile);
    data.releaseMbid = releaseMbid;
    data.isLiked = !!(albumRow && albumRow.is_liked);

    // Consultation pure (viewProfile) : on s'arrête là, aucun recalcul ni
    // écriture sur la ligne d'un profil qu'on ne fait que regarder.
    if (viewProfile) return sendJson(res, 200, data);

    // Mémorise le nombre total de morceaux sur la ligne album du profil (si
    // elle existe) : sert au calcul de couverture, y compris lors d'un recalcul
    // automatique déclenché plus tard côté serveur.
    const ratedAlbum = getAlbumRow(releaseMbid, profile);
    if (ratedAlbum && data.tracks.length && ratedAlbum.album_track_count !== data.tracks.length) {
      db.prepare(`UPDATE ratings SET album_track_count = ? WHERE id = ?`).run(
        data.tracks.length,
        ratedAlbum.id
      );
      recomputeAlbum(getAlbumRow(releaseMbid, profile));
    }

    sendJson(res, 200, data);
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: "MusicBrainz indisponible. Réessaie." });
  }
}

async function handleArtistPage(mbid, profile, res) {
  if (!mbid) return sendJson(res, 400, { error: "mbid manquant." });
  try {
    sendJson(res, 200, await getArtistPage(mbid, profile));
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: "MusicBrainz indisponible. Réessaie." });
  }
}

// `viewProfile` (GD-consultation) : consulter en lecture seule la notation
// d'UN AUTRE profil (depuis une tuile d'accueil "Tout le monde"), jamais la
// sienne. Simple SELECT, JAMAIS getOrCreateTrackRow — on ne doit ni créer ni
// modifier la ligne d'un profil qu'on ne fait que regarder (PP-01).
function handleGetTrack(mbid, searchParams, profile, res) {
  const viewProfile = searchParams.get("viewProfile");
  if (viewProfile) {
    const row = db
      .prepare(`SELECT * FROM ratings WHERE mbid = ? AND profile = ? AND entity_type = 'track'`)
      .get(mbid, viewProfile);
    if (!row) return sendJson(res, 404, { error: "Notation introuvable." });
    return sendJson(res, 200, serializeRow(row));
  }

  const meta = {
    title: searchParams.get("title"),
    artist: searchParams.get("artist"),
    album: searchParams.get("album"),
    date: searchParams.get("date"),
    durationMs: searchParams.get("durationMs") ? Number(searchParams.get("durationMs")) : null,
    releaseMbid: searchParams.get("releaseMbid"),
  };

  const row = getOrCreateTrackRow(mbid, profile, meta);
  const payload = serializeRow(row);

  // Featurings : affichage uniquement, jamais stockés en base. Présents
  // seulement quand la navigation vient d'un résultat MusicBrainz frais
  // (cf. recordingToTrack) ; absents sinon (Mes notations, Précédent/
  // Suivant dans un album...), sans régression — juste pas de "feat.".
  const featuresParam = searchParams.get("features");
  if (featuresParam) {
    try {
      const features = JSON.parse(featuresParam);
      if (Array.isArray(features) && features.length) payload.features = features;
    } catch {
      /* paramètre malformé, ignoré */
    }
  }

  sendJson(res, 200, payload);
}

// "Mes notations" : morceaux ayant au moins une donnée de notation
// (feeling, critères ou Classic — un simple "J'aime" seul ne suffit pas
// à faire apparaître un morceau ici, cf. GAPS_ET_DECISIONS.md).
function handleMyRatings(profile, res) {
  const rows = db
    .prepare(
      `SELECT * FROM ratings
       WHERE mbid IS NOT NULL
         AND entity_type = 'track'
         AND profile = ?
         AND (feeling_rating IS NOT NULL OR criteria_rating IS NOT NULL OR is_classic = 1)
       ORDER BY created_at DESC`
    )
    .all(profile);

  sendJson(res, 200, { results: rows.map(serializeRow) });
}

// Tuiles Artiste de l'accueil — identiques en vue Votants et Moyenne (rôle
// des artistes dans ALL TIME : TO BE DISCUSSED, cf. TRS 23/09/2026).
function homeArtists(mine, p) {
  return db
    .prepare(
      `SELECT artist, profile, AVG(global_rating) AS note, MAX(created_at) AS created_at
         FROM ratings
        WHERE global_rating IS NOT NULL
          AND entity_type = 'track' AND profile IS NOT NULL
          AND artist IS NOT NULL AND artist NOT IN ('', 'Artiste inconnu')
          ${mine ? "AND profile = ?" : ""}
        GROUP BY artist COLLATE NOCASE${mine ? "" : ", profile"}
        ORDER BY created_at DESC`
    )
    .all(...p)
    .map((r) => ({
      type: "artist",
      title: r.artist,
      artist: r.artist,
      note: round1(r.note),
      isClassic: false,
      createdAt: r.created_at,
      profile: r.profile,
    }));
}

// Accueil : mosaïque des éléments notés. Morceaux = chaque ligne avec une
// NOTE GLOBALE ; albums / artistes = regroupés par nom (moyenne des morceaux
// notés), triés du plus récemment noté au plus ancien.
// `scope` : "mine" (défaut serveur si absent) = profil courant uniquement ;
// "all" = tous les profils confondus, SANS fusion entre profils (BR — bêta
// entre amis de confiance, cf. GAPS_ET_DECISIONS.md § Mosaïque "Tout le
// monde") : la clause GROUP BY inclut alors `profile`, donc un même
// album/artiste noté par deux personnes produit deux lignes distinctes.
function handleHome(profile, scope, res) {
  const mine = scope !== "all";
  const p = mine ? [profile] : [];

  const tracks = db
    .prepare(
      `SELECT mbid, track_title, album, artist, global_rating AS note,
              is_classic, release_mbid, created_at, profile
         FROM ratings
        WHERE mbid IS NOT NULL AND global_rating IS NOT NULL
          AND entity_type = 'track' AND profile IS NOT NULL
          ${mine ? "AND profile = ?" : ""}
        ORDER BY created_at DESC`
    )
    .all(...p)
    .map((r) => ({
      type: "track",
      mbid: r.mbid,
      title: r.track_title || r.album,
      artist: r.artist,
      album: r.album,
      releaseMbid: r.release_mbid,
      note: r.note,
      isClassic: !!r.is_classic,
      createdAt: r.created_at,
      profile: r.profile,
    }));

  const albums = db
    .prepare(
      `SELECT album, artist, profile, AVG(global_rating) AS note, MAX(created_at) AS created_at
         FROM ratings
        WHERE global_rating IS NOT NULL
          AND entity_type = 'track' AND profile IS NOT NULL
          AND album IS NOT NULL AND album NOT IN ('', 'Album inconnu')
          AND artist IS NOT NULL AND artist NOT IN ('', 'Artiste inconnu')
          ${mine ? "AND profile = ?" : ""}
        GROUP BY album COLLATE NOCASE, artist COLLATE NOCASE${mine ? "" : ", profile"}
        ORDER BY created_at DESC`
    )
    .all(...p)
    .map((r) => ({
      type: "album",
      title: r.album,
      artist: r.artist,
      note: round1(r.note),
      isClassic: false,
      createdAt: r.created_at,
      profile: r.profile,
    }));

  const artists = homeArtists(mine, p);

  sendJson(res, 200, { tracks, albums, artists });
}

// Accueil ALL TIME, vue « Moyenne » (TRS 23/09/2026) : mêmes lignes que la
// vue Votants (handleHome), agrégées par ŒUVRE au lieu de par (œuvre, profil).
//  - Morceau : GROUP BY mbid → moyenne des notes globales + nb de votants.
//  - Album : moyenne des notes-album de chaque votant (elles-mêmes = moyenne
//    de SES morceaux notés, comme la tuile Album de la vue Votants) → chaque
//    votant pèse autant, quel que soit le nombre de morceaux qu'il a notés.
//  - Pas de seuil de votants (1 vote suffit).
//  - Date = notation la plus récente reçue, modification comprise
//    (COALESCE(rated_at, created_at)).
//  - Artistes : hors concept Moyenne (TO BE DISCUSSED) → mêmes tuiles que
//    la vue Votants, inchangées.
// `scope` "mine" : œuvres que J'AI notées, mais moyenne de tous les votants.
function handleHomeAverage(profile, scope, res) {
  const mine = scope === "mine";
  const p = mine ? [profile] : [];

  const tracks = db
    .prepare(
      `SELECT mbid, MAX(track_title) AS track_title, MAX(album) AS album,
              MAX(artist) AS artist, MAX(release_mbid) AS release_mbid,
              AVG(global_rating) AS note, COUNT(DISTINCT profile) AS voters,
              MAX(COALESCE(rated_at, created_at)) AS last_at
         FROM ratings
        WHERE mbid IS NOT NULL AND global_rating IS NOT NULL
          AND entity_type = 'track' AND profile IS NOT NULL
        GROUP BY mbid
        ${mine ? "HAVING SUM(profile = ?) > 0" : ""}
        ORDER BY last_at DESC`
    )
    .all(...p)
    .map((r) => ({
      type: "track",
      mbid: r.mbid,
      title: r.track_title || r.album,
      artist: r.artist,
      album: r.album,
      releaseMbid: r.release_mbid,
      note: round1(r.note),
      voters: r.voters,
      createdAt: r.last_at,
    }));

  const albums = db
    .prepare(
      `WITH per_voter AS (
         SELECT album, artist, profile, AVG(global_rating) AS note,
                MAX(COALESCE(rated_at, created_at)) AS last_at
           FROM ratings
          WHERE global_rating IS NOT NULL
            AND entity_type = 'track' AND profile IS NOT NULL
            AND album IS NOT NULL AND album NOT IN ('', 'Album inconnu')
            AND artist IS NOT NULL AND artist NOT IN ('', 'Artiste inconnu')
          GROUP BY album COLLATE NOCASE, artist COLLATE NOCASE, profile
       )
       SELECT album, artist, AVG(note) AS note, COUNT(*) AS voters,
              MAX(last_at) AS last_at
         FROM per_voter
        GROUP BY album COLLATE NOCASE, artist COLLATE NOCASE
        ${mine ? "HAVING SUM(profile = ?) > 0" : ""}
        ORDER BY last_at DESC`
    )
    .all(...p)
    .map((r) => ({
      type: "album",
      title: r.album,
      artist: r.artist,
      note: round1(r.note),
      voters: r.voters,
      createdAt: r.last_at,
    }));

  const artists = homeArtists(mine, p);

  sendJson(res, 200, { tracks, albums, artists });
}

function handleSaveFeeling(mbid, body, profile, res) {
  const value = body.value;
  if (typeof value !== "number" || Number.isNaN(value)) {
    return sendJson(res, 400, { error: "Valeur invalide." });
  }

  const row = getOrCreateTrackRow(mbid, profile);
  const globalRating = computeGlobal(value, row.criteria_rating);

  db.prepare(
    `UPDATE ratings SET feeling_rating = ?, global_rating = ? WHERE id = ?`
  ).run(value, globalRating, row.id);

  recomputeAlbumForRelease(row.release_mbid, profile);
  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid, profile)));
}

function handleDeleteFeeling(mbid, profile, res) {
  const row = getOrCreateTrackRow(mbid, profile);
  const globalRating = computeGlobal(null, row.criteria_rating);

  db.prepare(
    `UPDATE ratings SET feeling_rating = NULL, global_rating = ? WHERE id = ?`
  ).run(globalRating, row.id);

  recomputeAlbumForRelease(row.release_mbid, profile);
  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid, profile)));
}

function isValidCriterionValue(v) {
  return v === null || v === undefined || (typeof v === "number" && !Number.isNaN(v));
}

function handleSaveCriteria(mbid, body, profile, res) {
  const { performance, texte, production } = body;

  if (![performance, texte, production].every(isValidCriterionValue)) {
    return sendJson(res, 400, { error: "Valeurs invalides." });
  }

  // Saisie partielle autorisée : au moins un des trois critères doit être renseigné.
  const provided = [performance, texte, production].filter((v) => typeof v === "number");
  if (provided.length === 0) {
    return sendJson(res, 400, { error: "Au moins un critère doit être renseigné." });
  }

  // CR-00039 (adapté) : moyenne des critères renseignés, arrondie au dixième.
  const criteriaRating = round1(provided.reduce((sum, v) => sum + v, 0) / provided.length);

  const row = getOrCreateTrackRow(mbid, profile);
  const globalRating = computeGlobal(row.feeling_rating, criteriaRating);

  db.prepare(
    `UPDATE ratings
     SET crit_performance = ?, crit_texte = ?, crit_production = ?,
         criteria_rating = ?, global_rating = ?
     WHERE id = ?`
  ).run(
    performance ?? null,
    texte ?? null,
    production ?? null,
    criteriaRating,
    globalRating,
    row.id
  );

  recomputeAlbumForRelease(row.release_mbid, profile);
  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid, profile)));
}

function handleDeleteCriteria(mbid, profile, res) {
  const row = getOrCreateTrackRow(mbid, profile);
  const globalRating = computeGlobal(row.feeling_rating, null);

  db.prepare(
    `UPDATE ratings
     SET crit_performance = NULL, crit_texte = NULL, crit_production = NULL,
         criteria_rating = NULL, global_rating = ?
     WHERE id = ?`
  ).run(globalRating, row.id);

  recomputeAlbumForRelease(row.release_mbid, profile);
  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid, profile)));
}

function handleSetClassic(mbid, body, profile, res) {
  const value = !!body.value;
  const row = getOrCreateTrackRow(mbid, profile);

  db.prepare(`UPDATE ratings SET is_classic = ? WHERE id = ?`).run(value ? 1 : 0, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid, profile)));
}

// "J'aime" : hors périmètre GD-00002, ajouté à la demande explicite de
// l'utilisateur (cf. GAPS_ET_DECISIONS.md). Même schéma que le statut Classic.
// Sert aussi pour "J'aime" un ALBUM : la ligne ratings est alors keyée sur le
// mbid de la release (meta transmise pour ne pas créer une ligne "inconnue").
function handleSetLiked(mbid, body, profile, res) {
  const value = !!body.value;
  const row = getOrCreateTrackRow(mbid, profile, body.meta || {});

  db.prepare(`UPDATE ratings SET is_liked = ? WHERE id = ?`).run(value ? 1 : 0, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid, profile)));
}

// --- Notation d'album : handlers API (GD-00003) ---

function toNumberOrNull(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

// `total` (nb de morceaux de l'album) est transmis en query string sur le GET
// et dans le corps sur les écritures — il vient de la tracklist MusicBrainz.
function albumTotalFromQuery(searchParams) {
  const raw = searchParams.get("total");
  const n = raw == null ? null : Number(raw);
  return n != null && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function handleGetAlbumNotation(releaseMbid, searchParams, profile, res) {
  if (!releaseMbid) return sendJson(res, 400, { error: "mbid manquant." });
  const viewProfile = searchParams.get("viewProfile");
  sendJson(
    res,
    200,
    serializeAlbumNotation(
      releaseMbid,
      albumTotalFromQuery(searchParams),
      viewProfile || profile,
      !!viewProfile
    )
  );
}

function applyAlbumTotal(row, total) {
  if (total != null && total !== row.album_track_count) {
    db.prepare(`UPDATE ratings SET album_track_count = ? WHERE id = ?`).run(total, row.id);
    row.album_track_count = total;
  }
}

// NOTE AU FEELING Album — attribution / modification.
function handleSaveAlbumFeeling(releaseMbid, body, profile, res) {
  const value = toNumberOrNull(body.value);
  if (value == null) return sendJson(res, 400, { error: "Valeur invalide." });
  // Manuelle par défaut (saisie directe au slider) ; `manual: false` = valeur
  // posée via "Calculer depuis mes morceaux" côté client, reste synchronisée.
  const manual = body.manual !== false;

  const row = getOrCreateAlbumRow(releaseMbid, profile, body.meta || {});
  applyAlbumTotal(row, toNumberOrNull(body.total));
  db.prepare(`UPDATE ratings SET feeling_rating = ?, feeling_is_manual = ? WHERE id = ?`).run(
    value,
    manual ? 1 : 0,
    row.id
  );
  recomputeAlbum(getAlbumRow(releaseMbid, profile));

  sendJson(res, 200, serializeAlbumNotation(releaseMbid, toNumberOrNull(body.total), profile));
}

function handleDeleteAlbumFeeling(releaseMbid, profile, res) {
  const row = getAlbumRow(releaseMbid, profile);
  if (row) {
    db.prepare(`UPDATE ratings SET feeling_rating = NULL WHERE id = ?`).run(row.id);
    recomputeAlbum(getAlbumRow(releaseMbid, profile));
  }
  sendJson(res, 200, serializeAlbumNotation(releaseMbid, null, profile));
}

// NOTE PAR CRITÈRES Album — le client envoie l'état complet souhaité :
// { criteria: { <nom>: { value, manual } , ... }, meta, total }.
// Seuls les critères avec une valeur sont conservés (saisie partielle OK).
// Un objet vide est accepté : il remet la NOTE PAR CRITÈRES à « non
// renseigné » (résultat d'un RÉINITIALISER suivi d'ENREGISTRER — écart
// assumé vs. « au moins un critère requis » du spec, cf. GAPS_ET_DECISIONS.md).
function handleSaveAlbumCriteria(releaseMbid, body, profile, res) {
  const input = body.criteria || {};
  const clean = {};
  for (const name of ALBUM_CRITERIA) {
    const entry = input[name];
    const value = entry ? toNumberOrNull(entry.value) : null;
    if (value == null) continue;
    if (value < 0 || value > 10) return sendJson(res, 400, { error: "Valeur hors échelle." });
    clean[name] = { value, manual: !!(entry && entry.manual) };
  }

  const row = getOrCreateAlbumRow(releaseMbid, profile, body.meta || {});
  applyAlbumTotal(row, toNumberOrNull(body.total));

  const del = db.prepare(`DELETE FROM rating_criteria WHERE rating_id = ?`);
  const ins = db.prepare(
    `INSERT INTO rating_criteria (rating_id, name, value, is_manual) VALUES (?, ?, ?, ?)`
  );
  const write = db.transaction(() => {
    del.run(row.id);
    for (const [name, { value, manual }] of Object.entries(clean)) {
      ins.run(row.id, name, value, manual ? 1 : 0);
    }
  });
  write();

  recomputeAlbum(getAlbumRow(releaseMbid, profile));
  sendJson(res, 200, serializeAlbumNotation(releaseMbid, toNumberOrNull(body.total), profile));
}

function handleDeleteAlbumCriteria(releaseMbid, profile, res) {
  const row = getAlbumRow(releaseMbid, profile);
  if (row) {
    db.prepare(`DELETE FROM rating_criteria WHERE rating_id = ?`).run(row.id);
    recomputeAlbum(getAlbumRow(releaseMbid, profile));
  }
  sendJson(res, 200, serializeAlbumNotation(releaseMbid, null, profile));
}

// Toggle « Prendre en compte mes notes des morceaux » — ne contrôle QUE la
// participation de MORCEAUX à la NOTE GLOBALE (pas l'héritage des critères).
function handleSetAlbumMorceaux(releaseMbid, body, profile, res) {
  const row = getOrCreateAlbumRow(releaseMbid, profile, body.meta || {});
  applyAlbumTotal(row, toNumberOrNull(body.total));
  db.prepare(`UPDATE ratings SET morceaux_included = ? WHERE id = ?`).run(
    body.value ? 1 : 0,
    row.id
  );
  recomputeAlbum(getAlbumRow(releaseMbid, profile));
  sendJson(res, 200, serializeAlbumNotation(releaseMbid, toNumberOrNull(body.total), profile));
}

// --- Petit serveur HTTP (statique + API), sans dépendance supplémentaire ---

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Dupliqué côté client (normalizeProfile, public/app.js) — pas de module
// partagé navigateur/serveur ici ; garder les deux synchronisés à la main.
const PROFILE_MAX_LENGTH = 40;

// Profil courant : pseudo transmis par le client dans l'en-tête X-Profile
// (encodé avec encodeURIComponent pour rester ASCII même avec des accents).
// Renvoie null si absent/vide → les endpoints de notation répondent 400.
function getProfile(req) {
  const raw = req.headers["x-profile"];
  if (typeof raw !== "string" || !raw) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  let p = decoded.trim().replace(/\s+/g, " ").slice(0, PROFILE_MAX_LENGTH);
  if (!p) return null;
  // Un pseudo réservé est toujours utilisé avec la casse canonique
  // d'ADMIN_PROFILES, quelle que soit la casse envoyée par le client —
  // sinon "Don" et "don" pointeraient vers deux lignes `ratings` distinctes
  // alors que isReservedProfile() les traite comme le même profil réservé.
  const canonical = RESERVED_PROFILES.find((r) => r.toLowerCase() === p.toLowerCase());
  return canonical || p;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

// Liens de partage (GD-partage) : /album/{mbid}, /track/{mbid}, /artist/{mbid}
// sont des routes purement client (SPA) — aucun fichier ne porte ce nom sur
// disque, donc sans ce fallback elles tombaient en 404 au premier accès
// direct (lien reçu par SMS/WhatsApp, jamais passé par la recherche interne).
const DEEP_LINK_PATH = /^\/(album|track|artist)\/[^/]+\/?$/;

function serveStatic(pathname, res) {
  let filePath = pathname === "/" || DEEP_LINK_PATH.test(pathname) ? "/index.html" : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Interdit");
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Introuvable");
    }
    const ext = path.extname(filePath);
    // Dev local : on ne veut jamais servir un vieux HTML/CSS/JS en cache
    // (le téléphone rechargeait une ancienne feuille de style et des
    // correctifs semblaient "revenir en arrière").
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store, must-revalidate",
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    // Profil (pseudo léger, pas d'auth). Échec sûr : tout /api/* exige un
    // profil PAR DÉFAUT, sauf la liste explicite ci-dessous (recherche,
    // pochettes, lien Deezer, historique, résolution nom→MusicBrainz, config
    // et endpoints admin — rien qui lise/écrive des notations). Un nouvel
    // endpoint de notation oublié ici échoue donc en 400 plutôt que de
    // lire/écrire silencieusement sans profil ; c'est la liste d'EXCEPTION
    // qu'il faut penser à compléter pour un futur endpoint non lié aux
    // notations, pas l'inverse.
    const PROFILE_EXEMPT_PREFIXES = ["/api/search/"];
    const PROFILE_EXEMPT_PATHS = new Set([
      "/api/config",
      "/api/admin/login",
      "/api/admin/check",
      "/api/admin/db-status",
      "/api/admin/db-restore",
      "/api/admin/profile-pin-reset",
      "/api/admin/deezer-refresh",
      "/api/profile/claim",
      "/api/cover",
      "/api/deezer-link",
      "/api/search-history",
      "/api/resolve-artist",
      "/api/resolve-album",
    ]);
    const profile = getProfile(req);
    const needsProfile =
      pathname.startsWith("/api/") &&
      !PROFILE_EXEMPT_PATHS.has(pathname) &&
      !PROFILE_EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
    if (needsProfile && !profile) {
      return sendJson(res, 400, { error: "Profil manquant." });
    }
    // Profil réservé (« Don ») : seul l'administrateur (jeton valide) peut
    // l'endosser pour lire ou écrire des notations.
    if (needsProfile && isReservedProfile(profile) && !isAdminRequest(req)) {
      return sendJson(res, 403, { error: "Ce profil est réservé à l'administrateur." });
    }

    // --- Rôle admin ---
    if (pathname === "/api/config" && req.method === "GET") {
      return sendJson(res, 200, {
        adminEnabled: !!ADMIN_PASSWORD,
        reservedProfiles: ADMIN_PASSWORD ? RESERVED_PROFILES : [],
      });
    }
    if (pathname === "/api/admin/login" && req.method === "POST") {
      if (!ADMIN_PASSWORD) {
        return sendJson(res, 503, { error: "Connexion admin non configurée." });
      }
      const body = await readBody(req);
      if (!body || !safeEqual(sha256(body.password || ""), sha256(ADMIN_PASSWORD))) {
        return sendJson(res, 401, { error: "Mot de passe incorrect." });
      }
      return sendJson(res, 200, { token: adminToken() });
    }
    // Réclame un pseudo normal avec un code à 4 chiffres : le fixe au premier
    // usage, le vérifie ensuite. Les profils réservés passent par le mot de
    // passe admin (/api/admin/login), pas par ce code.
    if (pathname === "/api/profile/claim" && req.method === "POST") {
      const body = await readBody(req);
      const raw = typeof body.profile === "string" ? body.profile : "";
      const claimProfile = raw.trim().replace(/\s+/g, " ").slice(0, PROFILE_MAX_LENGTH);
      const pin = typeof body.pin === "string" ? body.pin : "";
      if (!claimProfile || !/^\d{4}$/.test(pin)) {
        return sendJson(res, 400, { error: "Pseudo ou code invalide." });
      }
      if (isReservedProfile(claimProfile)) {
        return sendJson(res, 403, { error: "Ce profil est réservé à l'administrateur." });
      }
      const hash = hashPin(claimProfile, pin);
      const existing = db
        .prepare(`SELECT pin_hash FROM profile_pins WHERE profile = ?`)
        .get(claimProfile);
      if (!existing) {
        db.prepare(`INSERT INTO profile_pins (profile, pin_hash) VALUES (?, ?)`).run(
          claimProfile,
          hash
        );
        return sendJson(res, 200, { ok: true, created: true });
      }
      if (!safeEqual(hash, existing.pin_hash)) {
        return sendJson(res, 401, { error: "Code incorrect." });
      }
      return sendJson(res, 200, { ok: true, created: false });
    }

    // Débloque un pseudo dont le code a été oublié : supprime son code
    // enregistré, il redevient "à réclamer" (le prochain qui le tape en fixe
    // un nouveau). Réservé à l'admin — pas de récupération en self-service.
    if (pathname === "/api/admin/profile-pin-reset" && req.method === "POST") {
      if (!isAdminRequest(req)) {
        return sendJson(res, 403, { error: "Réservé à l'administrateur." });
      }
      const body = await readBody(req);
      const target = typeof body.profile === "string" ? body.profile.trim() : "";
      if (!target) return sendJson(res, 400, { error: "Pseudo manquant." });
      const info = db.prepare(`DELETE FROM profile_pins WHERE profile = ?`).run(target);
      return sendJson(res, 200, { ok: true, reset: info.changes > 0 });
    }

    // Force un re-matching Deezer (cf. handleDeezerRefresh) — body :
    // { mbid } (un morceau/album précis) | { releaseMbid } (un album entier) |
    // { artist } (toutes ses entrées) | { all: true } (tout le cache).
    // Réservé à l'admin.
    if (pathname === "/api/admin/deezer-refresh" && req.method === "POST") {
      if (!isAdminRequest(req)) {
        return sendJson(res, 403, { error: "Réservé à l'administrateur." });
      }
      const body = await readBody(req);
      return handleDeezerRefresh(body || {}, res);
    }

    if (pathname === "/api/admin/check" && req.method === "GET") {
      const ok = isAdminRequest(req);
      return sendJson(res, ok ? 200 : 401, { admin: ok });
    }

    // Outil de déploiement (Railway et autres hébergeurs à volume) : voir
    // DB_PATH plus haut. Réservé à l'admin ; sans ADMIN_PASSWORD, toujours 403.
    if (pathname === "/api/admin/db-status" && req.method === "GET") {
      if (!isAdminRequest(req)) {
        return sendJson(res, 403, { error: "Réservé à l'administrateur." });
      }
      let sizeBytes = null;
      try {
        sizeBytes = fs.statSync(DB_PATH).size;
      } catch {
        /* fichier pas encore créé */
      }
      // `profile IS NOT NULL` : exclut les lignes techniques (cache Deezer
      // d'un album/artiste jamais noté, cf. cacheDeezerResult) pour ne
      // compter que des notations réelles.
      const ratingsCount = db
        .prepare(`SELECT COUNT(*) AS n FROM ratings WHERE profile IS NOT NULL`)
        .get().n;
      return sendJson(res, 200, {
        path: DB_PATH,
        sizeBytes,
        ratingsCount,
        pendingRestore: fs.existsSync(pendingUpload),
      });
    }

    // Dépose un fichier .db reçu en corps brut (pas de JSON) à côté de DB_PATH ;
    // il est installé au PROCHAIN démarrage (jamais pendant que la base est
    // ouverte, cf. le code juste avant `new Database(DB_PATH)`). Refuse par
    // défaut si la base courante contient déjà des notations (?force=1 pour
    // passer outre) — filet de sécurité contre un remplacement accidentel
    // d'une bêta déjà utilisée.
    if (pathname === "/api/admin/db-restore" && req.method === "POST") {
      if (!isAdminRequest(req)) {
        return sendJson(res, 403, { error: "Réservé à l'administrateur." });
      }
      const currentCount = db
        .prepare(`SELECT COUNT(*) AS n FROM ratings WHERE profile IS NOT NULL`)
        .get().n;
      if (currentCount > 0 && url.searchParams.get("force") !== "1") {
        return sendJson(res, 409, {
          error: `La base actuelle contient déjà ${currentCount} ligne(s). Ajoute ?force=1 à l'URL pour remplacer quand même.`,
        });
      }
      const MAX_BYTES = 100 * 1024 * 1024;
      let total = 0;
      const chunks = [];
      try {
        for await (const chunk of req) {
          total += chunk.length;
          if (total > MAX_BYTES) {
            const err = new Error("Fichier trop volumineux.");
            err.tooLarge = true;
            throw err;
          }
          chunks.push(chunk);
        }
      } catch (err) {
        if (err && err.tooLarge) {
          return sendJson(res, 413, { error: "Fichier trop volumineux." });
        }
        // Coupure réseau ou autre échec du flux (pas une histoire de taille) :
        // ne pas mentir sur la cause.
        console.error("db-restore : échec de lecture du flux :", err);
        return sendJson(res, 400, { error: "Échec de la réception du fichier. Réessaie." });
      }
      const buf = Buffer.concat(chunks);
      if (buf.length < 16 || buf.toString("latin1", 0, 15) !== "SQLite format 3") {
        return sendJson(res, 400, { error: "Fichier invalide : ce n'est pas une base SQLite." });
      }
      await fs.promises.writeFile(pendingUpload, buf);
      return sendJson(res, 200, {
        ok: true,
        bytes: buf.length,
        note: "Déposé. Redémarre le service pour l'installer (l'ancien fichier est conservé en .bak-*).",
      });
    }

    const searchCatMatch = pathname.match(/^\/api\/search\/(tracks|albums|artists)$/);
    if (searchCatMatch && req.method === "GET") {
      return await handleSearchCategory(searchCatMatch[1], url.searchParams.get("q"), res);
    }

    if (pathname === "/api/cover" && req.method === "GET") {
      return await handleCover(url.searchParams, res);
    }

    if (pathname === "/api/deezer-link" && req.method === "GET") {
      return await handleDeezerLink(url.searchParams, res);
    }

    if (pathname === "/api/my-ratings" && req.method === "GET") {
      return handleMyRatings(profile, res);
    }

    if (pathname === "/api/home" && req.method === "GET") {
      if (url.searchParams.get("view") === "avg") {
        return handleHomeAverage(profile, url.searchParams.get("scope"), res);
      }
      return handleHome(profile, url.searchParams.get("scope"), res);
    }

    if (pathname === "/api/search-history" && req.method === "GET") {
      return handleGetSearchHistory(res);
    }
    if (pathname === "/api/search-history" && req.method === "POST") {
      return handleRecordSearch(await readBody(req), res);
    }

    if (pathname === "/api/resolve-artist" && req.method === "GET") {
      return await handleResolveArtist(url.searchParams.get("name"), res);
    }
    if (pathname === "/api/resolve-album" && req.method === "GET") {
      return await handleResolveAlbum(
        url.searchParams.get("title"),
        url.searchParams.get("artist"),
        res
      );
    }

    if (pathname === "/api/album-tracks" && req.method === "GET") {
      return await handleAlbumTracks(
        url.searchParams.get("mbid"),
        url.searchParams.get("rg"),
        profile,
        url.searchParams.get("viewProfile"),
        res
      );
    }

    if (pathname === "/api/artist" && req.method === "GET") {
      return await handleArtistPage(url.searchParams.get("mbid"), profile, res);
    }

    // --- Notation d'album ---
    const albumNotationMatch = pathname.match(/^\/api\/albums\/([^/]+)\/notation$/);
    if (albumNotationMatch && req.method === "GET") {
      return handleGetAlbumNotation(
        decodeURIComponent(albumNotationMatch[1]),
        url.searchParams,
        profile,
        res
      );
    }

    const albumFeelingMatch = pathname.match(/^\/api\/albums\/([^/]+)\/feeling$/);
    if (albumFeelingMatch && req.method === "PUT") {
      return handleSaveAlbumFeeling(
        decodeURIComponent(albumFeelingMatch[1]),
        await readBody(req),
        profile,
        res
      );
    }
    if (albumFeelingMatch && req.method === "DELETE") {
      return handleDeleteAlbumFeeling(decodeURIComponent(albumFeelingMatch[1]), profile, res);
    }

    const albumCriteriaMatch = pathname.match(/^\/api\/albums\/([^/]+)\/criteria$/);
    if (albumCriteriaMatch && req.method === "PUT") {
      return handleSaveAlbumCriteria(
        decodeURIComponent(albumCriteriaMatch[1]),
        await readBody(req),
        profile,
        res
      );
    }
    if (albumCriteriaMatch && req.method === "DELETE") {
      return handleDeleteAlbumCriteria(decodeURIComponent(albumCriteriaMatch[1]), profile, res);
    }

    const albumMorceauxMatch = pathname.match(/^\/api\/albums\/([^/]+)\/morceaux$/);
    if (albumMorceauxMatch && req.method === "PUT") {
      return handleSetAlbumMorceaux(
        decodeURIComponent(albumMorceauxMatch[1]),
        await readBody(req),
        profile,
        res
      );
    }

    const trackMatch = pathname.match(/^\/api\/tracks\/([^/]+)$/);
    if (trackMatch && req.method === "GET") {
      return handleGetTrack(decodeURIComponent(trackMatch[1]), url.searchParams, profile, res);
    }

    const feelingMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/feeling$/);
    if (feelingMatch && req.method === "PUT") {
      const body = await readBody(req);
      return handleSaveFeeling(decodeURIComponent(feelingMatch[1]), body, profile, res);
    }
    if (feelingMatch && req.method === "DELETE") {
      return handleDeleteFeeling(decodeURIComponent(feelingMatch[1]), profile, res);
    }

    const criteriaMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/criteria$/);
    if (criteriaMatch && req.method === "PUT") {
      const body = await readBody(req);
      return handleSaveCriteria(decodeURIComponent(criteriaMatch[1]), body, profile, res);
    }
    if (criteriaMatch && req.method === "DELETE") {
      return handleDeleteCriteria(decodeURIComponent(criteriaMatch[1]), profile, res);
    }

    const classicMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/classic$/);
    if (classicMatch && req.method === "PUT") {
      const body = await readBody(req);
      return handleSetClassic(decodeURIComponent(classicMatch[1]), body, profile, res);
    }

    const likeMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/like$/);
    if (likeMatch && req.method === "PUT") {
      const body = await readBody(req);
      return handleSetLiked(decodeURIComponent(likeMatch[1]), body, profile, res);
    }

    if (req.method === "GET") {
      return serveStatic(pathname, res);
    }

    res.writeHead(404);
    res.end("Introuvable");
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "Erreur serveur." });
  }
});

server.listen(PORT, () => {
  console.log(`Music App — écran de notation dispo sur http://localhost:${PORT}`);
  if (ADMIN_PASSWORD) {
    console.log(`Mode admin actif — profil(s) réservé(s) : ${RESERVED_PROFILES.join(", ")}`);
  } else {
    console.log(
      "Mode admin DÉSACTIVÉ (ADMIN_PASSWORD non défini) — aucun profil n'est protégé."
    );
  }
});
