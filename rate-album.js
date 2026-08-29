/**
 * Script de test : sauvegarder une note d'album dans une base SQLite locale.
 *
 * Installation (une seule fois) :
 *   npm install better-sqlite3
 *
 * Utilisation :
 *   node rate-album.js add "Discovery" "Daft Punk" 9 "Album culte, aucun skip"
 *   node rate-album.js list
 */

const Database = require("better-sqlite3");

// Le fichier "music.db" sera créé automatiquement dans ce dossier au premier lancement.
// C'est LA base de données de ton appli — tout est stocké dedans, pas besoin de serveur.
const db = new Database("music.db");

// Crée la table si elle n'existe pas encore (ne fait rien si elle existe déjà)
db.exec(`
  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    album TEXT NOT NULL,
    artist TEXT NOT NULL,
    rating INTEGER NOT NULL,
    comment TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

function addRating(album, artist, rating, comment) {
  const stmt = db.prepare(`
    INSERT INTO ratings (album, artist, rating, comment)
    VALUES (?, ?, ?, ?)
  `);
  const info = stmt.run(album, artist, rating, comment || null);
  console.log(`✅ Note ajoutée (id ${info.lastInsertRowid}) : "${album}" par ${artist} — ${rating}/10`);
}

function listRatings() {
  const rows = db.prepare(`SELECT * FROM ratings ORDER BY created_at DESC`).all();

  if (rows.length === 0) {
    console.log("Aucune note enregistrée pour l'instant.");
    return;
  }

  console.log(`\n${rows.length} note(s) enregistrée(s) :\n`);
  for (const row of rows) {
    console.log(`[${row.rating}/10] ${row.album} — ${row.artist}`);
    if (row.comment) console.log(`   "${row.comment}"`);
    console.log(`   (ajouté le ${row.created_at})\n`);
  }
}

// --- Lecture des arguments passés en ligne de commande ---
const command = process.argv[2];

if (command === "add") {
  const album = process.argv[3];
  const artist = process.argv[4];
  const rating = parseInt(process.argv[5], 10);
  const comment = process.argv[6];

  if (!album || !artist || isNaN(rating)) {
    console.log('Usage : node rate-album.js add "Album" "Artiste" note "commentaire (optionnel)"');
    process.exit(1);
  }

  addRating(album, artist, rating, comment);
} else if (command === "list") {
  listRatings();
} else {
  console.log("Commandes disponibles :");
  console.log('  node rate-album.js add "Album" "Artiste" note "commentaire"');
  console.log("  node rate-album.js list");
}
