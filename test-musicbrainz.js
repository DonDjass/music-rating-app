/**
 * Script de test : récupérer les infos d'un album via MusicBrainz
 * Pas besoin de clé API ni de compte pour cette étape.
 *
 * Pour lancer :
 *   node test-musicbrainz.js "nom de l'album" "nom de l'artiste"
 *
 * Exemple :
 *   node test-musicbrainz.js "Discovery" "Daft Punk"
 */

const ALBUM = process.argv[2] || "Discovery";
const ARTIST = process.argv[3] || "Daft Punk";

// MusicBrainz demande un User-Agent identifiable (obligatoire, sinon ça peut bloquer)
const HEADERS = {
  "User-Agent": "MonAppNotationMusique/0.1 (contact: test-local)",
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// MusicBrainz limite à ~1 requête/seconde et renvoie parfois une erreur 503
// (service temporairement surchargé) même quand tout est correct.
// Cette fonction réessaie automatiquement en cas de 503, avec un délai croissant.
async function fetchWithRetry(url, options = {}, retries = 4) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, options);

    if (res.ok) return res;

    if (res.status === 503 && attempt < retries) {
      const delay = attempt * 1500; // 1.5s, 3s, 4.5s...
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

  if (!data.releases || data.releases.length === 0) {
    console.log("Aucun résultat trouvé.");
    return null;
  }

  return data.releases[0];
}

async function getTracklist(releaseId) {
  const url = `https://musicbrainz.org/ws/2/release/${releaseId}?inc=recordings&fmt=json`;
  const res = await fetchWithRetry(url, { headers: HEADERS });
  const data = await res.json();

  const tracks = data.media?.[0]?.tracks || [];
  return tracks.map((t) => ({
    position: t.position,
    title: t.title,
    duration_ms: t.length,
  }));
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
    return null; // pas de pochette dispo, pas grave
  }
}

async function main() {
  console.log(`Recherche de "${ALBUM}" par "${ARTIST}"...\n`);

  const release = await searchAlbum(ALBUM, ARTIST);
  if (!release) return;

  // On espace les deux requêtes suivantes (pas de Promise.all) pour rester
  // sous la limite de MusicBrainz d'environ 1 requête/seconde.
  const tracks = await getTracklist(release.id);
  await wait(1000);
  const coverUrl = await getCoverArt(release.id);

  const result = {
    id: release.id,
    title: release.title,
    artist: release["artist-credit"]?.[0]?.name,
    date: release.date,
    country: release.country,
    cover_url: coverUrl,
    tracklist: tracks,
  };

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => console.error("Erreur:", err.message));
