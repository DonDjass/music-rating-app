/**
 * Script tout-en-un : rechercher un album sur MusicBrainz, l'afficher,
 * puis le noter directement (sauvegardé dans music.db).
 *
 * Installation (si pas déjà fait) :
 *   npm install better-sqlite3
 *
 * Utilisation :
 *   node music-app.js "Discovery" "Daft Punk" 9 "Album culte, aucun skip"
 *
 * Le commentaire est optionnel :
 *   node music-app.js "Discovery" "Daft Punk" 9
 *
 * Pour juste chercher sans noter (note omise) :
 *   node music-app.js "Discovery" "Daft Punk"
 */

const Database = require("better-sqlite3");

const HEADERS = {
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

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;

    if (res.status === 503 && attempt < retries) {
      const delay = attempt * 1500;
      console.log(`  (503 reçu, nouvelle tentative dans ${delay / 1000}s... [${attempt}/${retries}])`);
      await wait(delay);
      continue;
    }
    throw new Error(`Erreur MusicBrainz: ${res.status}`);
  }
}

async function searchAlbum(albumName, artistName) {
  const query = encodeURIComponent(`release:"${albumName}" AND artist:"${artistName}"`);
  const url = `https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=1`;

  const res = await fetchWithRetry(url, { headers: HEADERS });
  const data = await res.json();

  if (!data.releases || data.releases.length === 0) return null;
  return data.releases[0];
}

async function getCoverArt(releaseId) {
  const url = `https://coverartarchive.org/release/${releaseId}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const front = data.images.find((img) => img.front);
    return front ? front.image : null;
  } catch {
    return null;
  }
}

function saveRating({ mbid, album, artist, rating, comment, coverUrl }) {
  const stmt = db.prepare(`
    INSERT INTO ratings (mbid, album, artist, rating, comment, cover_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(mbid, album, artist, rating ?? null, comment ?? null, coverUrl ?? null);
  console.log(`\n✅ Sauvegardé (id ${info.lastInsertRowid}) : "${album}" — ${artist} — ${rating}/10`);
}

async function main() {
  const albumInput = process.argv[2];
  const artistInput = process.argv[3];
  const ratingInput = process.argv[4];
  const commentInput = process.argv[5];

  if (!albumInput || !artistInput) {
    console.log('Usage : node music-app.js "Album" "Artiste" [note] [commentaire]');
    process.exit(1);
  }

  console.log(`Recherche de "${albumInput}" par "${artistInput}"...\n`);

  const release = await searchAlbum(albumInput, artistInput);

  if (!release) {
    console.log("❌ Aucun album trouvé avec ce nom/artiste. Vérifie l'orthographe et réessaie.");
    return;
  }

  const coverUrl = await getCoverArt(release.id);
  const realArtist = release["artist-credit"]?.[0]?.name || artistInput;

  console.log("🎵 Album trouvé :");
  console.log(`   Titre   : ${release.title}`);
  console.log(`   Artiste : ${realArtist}`);
  console.log(`   Date    : ${release.date || "inconnue"}`);
  if (coverUrl) console.log(`   Pochette: ${coverUrl}`);

  const rating = parseInt(ratingInput, 10);

  if (isNaN(rating)) {
    console.log("\n(Pas de note fournie — album affiché uniquement, rien n'a été sauvegardé.)");
    console.log('Pour noter : node music-app.js "Album" "Artiste" note "commentaire"');
    return;
  }

  saveRating({
    mbid: release.id,
    album: release.title,
    artist: realArtist,
    rating,
    comment: commentInput,
    coverUrl,
  });
}

main().catch((err) => console.error("Erreur:", err.message));
