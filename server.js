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

// Résout un release-group MusicBrainz en une release représentative
// (nécessaire car /api/album-tracks travaille sur une release, pas un groupe).
async function releaseFromGroup(rgMbid) {
  const url = `https://musicbrainz.org/ws/2/release?release-group=${rgMbid}&fmt=json&limit=1`;
  const res = await mbFetch(url);
  const data = await res.json();
  return data.releases?.[0]?.id || null;
}

// --- Page artiste : détails + discographie + meilleurs titres notés ---

async function getArtistPage(mbid) {
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
        GROUP BY album COLLATE NOCASE`
    )
    .all(name);
  const noteByAlbum = {};
  for (const r of noteRows) noteByAlbum[(r.album || "").toLowerCase()] = round1(r.note);

  const discography = (rgData["release-groups"] || [])
    .filter((rg) => (rg["primary-type"] || null) !== "Single")
    .map((rg) => ({
      releaseGroupMbid: rg.id,
      title: rg.title,
      date: rg["first-release-date"] || null,
      primaryType: rg["primary-type"] || null,
      note: noteByAlbum[(rg.title || "").toLowerCase()] ?? null,
    }))
    .sort((x, y) => (y.date || "").localeCompare(x.date || "")); // récent -> ancien

  // 3. Meilleurs titres = morceaux notés de cet artiste, du mieux noté au moins bien.
  const topTracks = db
    .prepare(
      `SELECT * FROM ratings
        WHERE artist = ? COLLATE NOCASE AND global_rating IS NOT NULL
        ORDER BY global_rating DESC, created_at DESC`
    )
    .all(name)
    .map(serializeRow);

  // 4. "J'aime" l'artiste (ligne ratings keyée sur le mbid de l'artiste).
  const likeRow = db.prepare(`SELECT is_liked FROM ratings WHERE mbid = ?`).get(mbid);

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

// `mbid` = release, OU `rgMbid` = release-group (résolu en une release ; utile
// pour la discographie d'un artiste qui liste des release-groups).
async function handleAlbumTracks(mbid, rgMbid, res) {
  try {
    let releaseMbid = mbid || null;
    if (!releaseMbid && rgMbid) releaseMbid = await releaseFromGroup(rgMbid);
    if (!releaseMbid) return sendJson(res, 400, { error: "mbid manquant." });

    const data = await getReleaseTracks(releaseMbid);

    // Enrichit chaque morceau avec sa NOTE GLOBALE locale (null si non noté),
    // et indique si l'album lui-même est "aimé" (ligne ratings keyée sur le
    // mbid de la release).
    const mbids = data.tracks.map((t) => t.mbid).filter(Boolean);
    const ratingByMbid = {};
    if (mbids.length) {
      const placeholders = mbids.map(() => "?").join(",");
      const rows = db
        .prepare(`SELECT mbid, global_rating FROM ratings WHERE mbid IN (${placeholders})`)
        .all(...mbids);
      for (const row of rows) ratingByMbid[row.mbid] = row.global_rating;
    }
    data.tracks = data.tracks.map((t) => ({
      ...t,
      globalRating: ratingByMbid[t.mbid] ?? null,
    }));

    const albumRow = db.prepare(`SELECT is_liked FROM ratings WHERE mbid = ?`).get(releaseMbid);
    data.releaseMbid = releaseMbid;
    data.isLiked = !!(albumRow && albumRow.is_liked);

    sendJson(res, 200, data);
  } catch (err) {
    console.error(err);
    sendJson(res, 502, { error: "MusicBrainz indisponible. Réessaie." });
  }
}

async function handleArtistPage(mbid, res) {
  if (!mbid) return sendJson(res, 400, { error: "mbid manquant." });
  try {
    sendJson(res, 200, await getArtistPage(mbid));
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

// Accueil : mosaïque des éléments notés. Morceaux = chaque ligne avec une
// NOTE GLOBALE ; albums / artistes = regroupés par nom (moyenne des morceaux
// notés), triés du plus récemment noté au plus ancien.
function handleHome(res) {
  const tracks = db
    .prepare(
      `SELECT mbid, track_title, album, artist, global_rating AS note,
              is_classic, release_mbid, created_at
         FROM ratings
        WHERE mbid IS NOT NULL AND global_rating IS NOT NULL
        ORDER BY created_at DESC`
    )
    .all()
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
    }));

  const albums = db
    .prepare(
      `SELECT album, artist, AVG(global_rating) AS note, MAX(created_at) AS created_at
         FROM ratings
        WHERE global_rating IS NOT NULL
          AND album IS NOT NULL AND album NOT IN ('', 'Album inconnu')
          AND artist IS NOT NULL AND artist NOT IN ('', 'Artiste inconnu')
        GROUP BY album COLLATE NOCASE, artist COLLATE NOCASE
        ORDER BY created_at DESC`
    )
    .all()
    .map((r) => ({
      type: "album",
      title: r.album,
      artist: r.artist,
      note: round1(r.note),
      isClassic: false,
      createdAt: r.created_at,
    }));

  const artists = db
    .prepare(
      `SELECT artist, AVG(global_rating) AS note, MAX(created_at) AS created_at
         FROM ratings
        WHERE global_rating IS NOT NULL
          AND artist IS NOT NULL AND artist NOT IN ('', 'Artiste inconnu')
        GROUP BY artist COLLATE NOCASE
        ORDER BY created_at DESC`
    )
    .all()
    .map((r) => ({
      type: "artist",
      title: r.artist,
      artist: r.artist,
      note: round1(r.note),
      isClassic: false,
      createdAt: r.created_at,
    }));

  sendJson(res, 200, { tracks, albums, artists });
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
// Sert aussi pour "J'aime" un ALBUM : la ligne ratings est alors keyée sur le
// mbid de la release (meta transmise pour ne pas créer une ligne "inconnue").
function handleSetLiked(mbid, body, res) {
  const value = !!body.value;
  const row = getOrCreateTrackRow(mbid, body.meta || {});

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

    const searchCatMatch = pathname.match(/^\/api\/search\/(tracks|albums|artists)$/);
    if (searchCatMatch && req.method === "GET") {
      return await handleSearchCategory(searchCatMatch[1], url.searchParams.get("q"), res);
    }

    if (pathname === "/api/cover" && req.method === "GET") {
      return await handleCover(url.searchParams, res);
    }

    if (pathname === "/api/my-ratings" && req.method === "GET") {
      return handleMyRatings(res);
    }

    if (pathname === "/api/home" && req.method === "GET") {
      return handleHome(res);
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
        res
      );
    }

    if (pathname === "/api/artist" && req.method === "GET") {
      return await handleArtistPage(url.searchParams.get("mbid"), res);
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
