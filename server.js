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
const Database = require("better-sqlite3");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MB_HEADERS = {
  "User-Agent": "MonAppNotationMusique/0.1 (contact: test-local)",
};

const db = new Database("music.db");

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

const existingColumns = db.prepare("PRAGMA table_info(ratings)").all().map((c) => c.name);
for (const [name, type] of Object.entries(NEW_COLUMNS)) {
  if (!existingColumns.includes(name)) {
    db.exec(`ALTER TABLE ratings ADD COLUMN ${name} ${type}`);
  }
}

// Historique des recherches — stockage local simple, sans notion d'utilisateur.
// Une seule ligne par requête distincte (la ré-insertion la remonte en tête).
db.exec(`
  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- Recherche MusicBrainz (recherche de morceaux, couvre aussi les
// recherches par artiste ou par album puisque MusicBrainz indexe ces
// champs dans la recherche "recording") ---

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Backoff volontairement court : la recherche catégorisée enchaîne 3 appels
// MusicBrainz, donc un backoff trop généreux (ex. 1,5s/3s/4,5s) peut faire
// grimper une recherche à 30-40s+ en cas de 503 en chaîne. Ici, pire cas
// par appel ≈ 800ms + 1600ms = 2,4s avant d'abandonner et de remonter une
// erreur claire plutôt que de faire attendre indéfiniment.
async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;

    if (res.status === 503 && attempt < retries) {
      await wait(attempt * 800);
      continue;
    }
    throw new Error(`Erreur MusicBrainz: ${res.status}`);
  }
}

function recordingToTrack(rec) {
  return {
    mbid: rec.id,
    title: rec.title,
    artist: rec["artist-credit"]?.[0]?.name || "Artiste inconnu",
    album: rec.releases?.[0]?.title || null,
    date: rec.releases?.[0]?.date || rec["first-release-date"] || null,
    durationMs: rec.length || null,
  };
}

async function searchRecordings(query) {
  const url = `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(
    query
  )}&fmt=json&limit=10`;

  const res = await fetchWithRetry(url, { headers: MB_HEADERS });
  const data = await res.json();

  return (data.recordings || []).map(recordingToTrack);
}

async function searchReleases(query) {
  const url = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(
    query
  )}&fmt=json&limit=10`;

  const res = await fetchWithRetry(url, { headers: MB_HEADERS });
  const data = await res.json();

  return (data.releases || []).map((rel) => ({
    mbid: rel.id,
    title: rel.title,
    artist: rel["artist-credit"]?.[0]?.name || "Artiste inconnu",
    date: rel.date || null,
  }));
}

async function searchArtists(query) {
  const url = `https://musicbrainz.org/ws/2/artist/?query=${encodeURIComponent(
    query
  )}&fmt=json&limit=10`;

  const res = await fetchWithRetry(url, { headers: MB_HEADERS });
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
  const res = await fetchWithRetry(url, { headers: MB_HEADERS });
  const data = await res.json();

  const artist = data["artist-credit"]?.[0]?.name || "Artiste inconnu";
  const album = data.title;
  const date = data.date || null;

  const tracks = [];
  for (const medium of data.media || []) {
    for (const t of medium.tracks || []) {
      if (!t.recording?.id) continue;
      tracks.push({
        mbid: t.recording.id,
        title: t.title || t.recording.title,
        artist,
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

async function getArtistTracks(artistMbid, artistName) {
  const url = `https://musicbrainz.org/ws/2/recording?artist=${artistMbid}&fmt=json&limit=25`;
  const res = await fetchWithRetry(url, { headers: MB_HEADERS });
  const data = await res.json();

  // La recherche "browse" par artiste ne renvoie pas l'artiste ni les
  // releases par défaut (il faudrait un inc= supplémentaire) : on réutilise
  // le nom déjà connu côté appelant plutôt que de faire un appel de plus.
  const tracks = (data.recordings || []).map((rec) => ({
    mbid: rec.id,
    title: rec.title,
    artist: artistName || "Artiste inconnu",
    album: null,
    date: rec["first-release-date"] || null,
    durationMs: rec.length || null,
  }));

  return { title: artistName || "Artiste", tracks };
}

// --- Récupère (ou crée) la ligne d'un morceau, identifié par son mbid ---
function getOrCreateTrackRow(mbid, meta = {}) {
  let row = db.prepare(`SELECT * FROM ratings WHERE mbid = ?`).get(mbid);

  if (!row) {
    const info = db
      .prepare(
        `INSERT INTO ratings (mbid, track_title, album, artist, duration_ms, release_date, release_mbid)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        mbid,
        meta.title || "Morceau inconnu",
        meta.album || "Album inconnu",
        meta.artist || "Artiste inconnu",
        meta.durationMs ?? null,
        meta.date ?? null,
        meta.releaseMbid || null
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

// --- Handlers API ---

async function handleSearch(query, res) {
  const q = (query || "").trim();
  if (!q) return sendJson(res, 400, { error: "Requête de recherche vide." });

  try {
    // Séquentiel plutôt qu'en parallèle : MusicBrainz demande de rester
    // autour d'1 requête/seconde, et 3 appels simultanés déclenchent des
    // 503 (donc des retries avec backoff) bien plus souvent.
    const tracks = await searchRecordings(q);
    await wait(400);
    const albums = await searchReleases(q);
    await wait(400);
    const artists = await searchArtists(q);

    sendJson(res, 200, { tracks, albums, artists });
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: "Recherche MusicBrainz indisponible. Réessaie." });
  }
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

async function handleAlbumTracks(mbid, res) {
  if (!mbid) return sendJson(res, 400, { error: "mbid manquant." });
  try {
    sendJson(res, 200, await getReleaseTracks(mbid));
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: "MusicBrainz indisponible. Réessaie." });
  }
}

async function handleArtistTracks(mbid, artistName, res) {
  if (!mbid) return sendJson(res, 400, { error: "mbid manquant." });
  try {
    sendJson(res, 200, await getArtistTracks(mbid, artistName));
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: "MusicBrainz indisponible. Réessaie." });
  }
}

function handleGetTrack(mbid, searchParams, res) {
  const meta = {
    title: searchParams.get("title"),
    artist: searchParams.get("artist"),
    album: searchParams.get("album"),
    date: searchParams.get("date"),
    durationMs: searchParams.get("durationMs") ? Number(searchParams.get("durationMs")) : null,
    releaseMbid: searchParams.get("releaseMbid"),
  };

  const row = getOrCreateTrackRow(mbid, meta);
  sendJson(res, 200, serializeRow(row));
}

// "Mes notations" : morceaux ayant au moins une donnée de notation
// (feeling, critères ou Classic — un simple "J'aime" seul ne suffit pas
// à faire apparaître un morceau ici, cf. GAPS_ET_DECISIONS.md).
function handleMyRatings(res) {
  const rows = db
    .prepare(
      `SELECT * FROM ratings
       WHERE mbid IS NOT NULL
         AND (feeling_rating IS NOT NULL OR criteria_rating IS NOT NULL OR is_classic = 1)
       ORDER BY created_at DESC`
    )
    .all();

  sendJson(res, 200, { results: rows.map(serializeRow) });
}

function handleSaveFeeling(mbid, body, res) {
  const value = body.value;
  if (typeof value !== "number" || Number.isNaN(value)) {
    return sendJson(res, 400, { error: "Valeur invalide." });
  }

  const row = getOrCreateTrackRow(mbid);
  const globalRating = computeGlobal(value, row.criteria_rating);

  db.prepare(
    `UPDATE ratings SET feeling_rating = ?, global_rating = ? WHERE id = ?`
  ).run(value, globalRating, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid)));
}

function handleDeleteFeeling(mbid, res) {
  const row = getOrCreateTrackRow(mbid);
  const globalRating = computeGlobal(null, row.criteria_rating);

  db.prepare(
    `UPDATE ratings SET feeling_rating = NULL, global_rating = ? WHERE id = ?`
  ).run(globalRating, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid)));
}

function isValidCriterionValue(v) {
  return v === null || v === undefined || (typeof v === "number" && !Number.isNaN(v));
}

function handleSaveCriteria(mbid, body, res) {
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

  const row = getOrCreateTrackRow(mbid);
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

  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid)));
}

function handleDeleteCriteria(mbid, res) {
  const row = getOrCreateTrackRow(mbid);
  const globalRating = computeGlobal(row.feeling_rating, null);

  db.prepare(
    `UPDATE ratings
     SET crit_performance = NULL, crit_texte = NULL, crit_production = NULL,
         criteria_rating = NULL, global_rating = ?
     WHERE id = ?`
  ).run(globalRating, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid)));
}

function handleSetClassic(mbid, body, res) {
  const value = !!body.value;
  const row = getOrCreateTrackRow(mbid);

  db.prepare(`UPDATE ratings SET is_classic = ? WHERE id = ?`).run(value ? 1 : 0, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid)));
}

// "J'aime" : hors périmètre GD-00002, ajouté à la demande explicite de
// l'utilisateur (cf. GAPS_ET_DECISIONS.md). Même schéma que le statut Classic.
function handleSetLiked(mbid, body, res) {
  const value = !!body.value;
  const row = getOrCreateTrackRow(mbid);

  db.prepare(`UPDATE ratings SET is_liked = ? WHERE id = ?`).run(value ? 1 : 0, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow(mbid)));
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

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
};

function serveStatic(pathname, res) {
  let filePath = pathname === "/" ? "/index.html" : pathname;
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
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const pathname = url.pathname;

    if (pathname === "/api/search" && req.method === "GET") {
      return await handleSearch(url.searchParams.get("q"), res);
    }

    if (pathname === "/api/my-ratings" && req.method === "GET") {
      return handleMyRatings(res);
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
      return await handleAlbumTracks(url.searchParams.get("mbid"), res);
    }

    if (pathname === "/api/artist-tracks" && req.method === "GET") {
      return await handleArtistTracks(
        url.searchParams.get("mbid"),
        url.searchParams.get("name"),
        res
      );
    }

    const trackMatch = pathname.match(/^\/api\/tracks\/([^/]+)$/);
    if (trackMatch && req.method === "GET") {
      return handleGetTrack(decodeURIComponent(trackMatch[1]), url.searchParams, res);
    }

    const feelingMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/feeling$/);
    if (feelingMatch && req.method === "PUT") {
      const body = await readBody(req);
      return handleSaveFeeling(decodeURIComponent(feelingMatch[1]), body, res);
    }
    if (feelingMatch && req.method === "DELETE") {
      return handleDeleteFeeling(decodeURIComponent(feelingMatch[1]), res);
    }

    const criteriaMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/criteria$/);
    if (criteriaMatch && req.method === "PUT") {
      const body = await readBody(req);
      return handleSaveCriteria(decodeURIComponent(criteriaMatch[1]), body, res);
    }
    if (criteriaMatch && req.method === "DELETE") {
      return handleDeleteCriteria(decodeURIComponent(criteriaMatch[1]), res);
    }

    const classicMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/classic$/);
    if (classicMatch && req.method === "PUT") {
      const body = await readBody(req);
      return handleSetClassic(decodeURIComponent(classicMatch[1]), body, res);
    }

    const likeMatch = pathname.match(/^\/api\/tracks\/([^/]+)\/like$/);
    if (likeMatch && req.method === "PUT") {
      const body = await readBody(req);
      return handleSetLiked(decodeURIComponent(likeMatch[1]), body, res);
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
});
