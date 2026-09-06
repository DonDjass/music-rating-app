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

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// Morceau affiché pour cette première passe (voir objectif de la tâche).
// Métadonnées décoratives (album/année/durée/genre) codées en dur : ce ne sont
// pas des données de notation, juste l'en-tête de la fiche pour ce morceau de
// démo unique (cf. GAPS_ET_DECISIONS.md #2).
const TRACK_TITLE = "N.Y. State of Mind";
const TRACK_ARTIST = "Nas";
const TRACK_ALBUM = "Illmatic";
const TRACK_TAGS = "1994 • 4:53 • Rap, East Coast";

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
};

const existingColumns = db.prepare("PRAGMA table_info(ratings)").all().map((c) => c.name);
for (const [name, type] of Object.entries(NEW_COLUMNS)) {
  if (!existingColumns.includes(name)) {
    db.exec(`ALTER TABLE ratings ADD COLUMN ${name} ${type}`);
  }
}

// --- Récupère (ou crée) la ligne du morceau de démo ---
function getOrCreateTrackRow() {
  let row = db
    .prepare(`SELECT * FROM ratings WHERE album = ? AND artist = ?`)
    .get(TRACK_TITLE, TRACK_ARTIST);

  if (!row) {
    const info = db
      .prepare(`INSERT INTO ratings (album, artist) VALUES (?, ?)`)
      .run(TRACK_TITLE, TRACK_ARTIST);
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

function serializeRow(row) {
  return {
    id: row.id,
    title: row.album,
    artist: row.artist,
    albumTitle: TRACK_ALBUM,
    tags: TRACK_TAGS,
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
  };
}

// --- Handlers API ---

function handleGetTrack(res) {
  const row = getOrCreateTrackRow();
  sendJson(res, 200, serializeRow(row));
}

function handleSaveFeeling(body, res) {
  const value = body.value;
  if (typeof value !== "number" || Number.isNaN(value)) {
    return sendJson(res, 400, { error: "Valeur invalide." });
  }

  const row = getOrCreateTrackRow();
  const globalRating = computeGlobal(value, row.criteria_rating);

  db.prepare(
    `UPDATE ratings SET feeling_rating = ?, global_rating = ? WHERE id = ?`
  ).run(value, globalRating, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow()));
}

function handleDeleteFeeling(res) {
  const row = getOrCreateTrackRow();
  const globalRating = computeGlobal(null, row.criteria_rating);

  db.prepare(
    `UPDATE ratings SET feeling_rating = NULL, global_rating = ? WHERE id = ?`
  ).run(globalRating, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow()));
}

function isValidCriterionValue(v) {
  return v === null || v === undefined || (typeof v === "number" && !Number.isNaN(v));
}

function handleSaveCriteria(body, res) {
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

  const row = getOrCreateTrackRow();
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

  sendJson(res, 200, serializeRow(getOrCreateTrackRow()));
}

function handleDeleteCriteria(res) {
  const row = getOrCreateTrackRow();
  const globalRating = computeGlobal(row.feeling_rating, null);

  db.prepare(
    `UPDATE ratings
     SET crit_performance = NULL, crit_texte = NULL, crit_production = NULL,
         criteria_rating = NULL, global_rating = ?
     WHERE id = ?`
  ).run(globalRating, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow()));
}

function handleSetClassic(body, res) {
  const value = !!body.value;
  const row = getOrCreateTrackRow();

  db.prepare(`UPDATE ratings SET is_classic = ? WHERE id = ?`).run(value ? 1 : 0, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow()));
}

// "J'aime" : hors périmètre GD-00002, ajouté à la demande explicite de
// l'utilisateur (cf. GAPS_ET_DECISIONS.md). Même schéma que le statut Classic.
function handleSetLiked(body, res) {
  const value = !!body.value;
  const row = getOrCreateTrackRow();

  db.prepare(`UPDATE ratings SET is_liked = ? WHERE id = ?`).run(value ? 1 : 0, row.id);

  sendJson(res, 200, serializeRow(getOrCreateTrackRow()));
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

function serveStatic(req, res) {
  let filePath = req.url === "/" ? "/index.html" : req.url;
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
    if (req.url === "/api/track" && req.method === "GET") {
      return handleGetTrack(res);
    }
    if (req.url === "/api/track/feeling" && req.method === "PUT") {
      const body = await readBody(req);
      return handleSaveFeeling(body, res);
    }
    if (req.url === "/api/track/feeling" && req.method === "DELETE") {
      return handleDeleteFeeling(res);
    }
    if (req.url === "/api/track/criteria" && req.method === "PUT") {
      const body = await readBody(req);
      return handleSaveCriteria(body, res);
    }
    if (req.url === "/api/track/criteria" && req.method === "DELETE") {
      return handleDeleteCriteria(res);
    }
    if (req.url === "/api/track/classic" && req.method === "PUT") {
      const body = await readBody(req);
      return handleSetClassic(body, res);
    }
    if (req.url === "/api/track/like" && req.method === "PUT") {
      const body = await readBody(req);
      return handleSetLiked(body, res);
    }

    if (req.method === "GET") {
      return serveStatic(req, res);
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
