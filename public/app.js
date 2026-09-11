// Écran de notation d'un morceau (GD-00002) — logique simplifiée v1.

let track = null; // dernier état enregistré, renvoyé par le serveur
let editing = null; // 'feeling' | 'criteria' | null
let currentSection = "search"; // 'home' | 'search' | 'my-ratings' | 'settings' — onglet actif

// Contexte "album" : { tracks: [...], index } quand le morceau affiché vient
// de la tracklist d'un album (drill-down) — permet Précédent/Suivant.
// Reste à null si on est arrivé par un résultat direct, un artiste ou
// "Mes notations" (pas d'ordre naturel dans ces cas).
let albumContext = null;

let feelingDraft = null; // valeur en cours d'édition (nombre ou null)
let criteriaDraft = { performance: null, texte: null, production: null };

const el = (id) => document.getElementById(id);

// --- Profil léger (pas d'auth) : un pseudo de confort, mémorisé sur l'appareil.
// Envoyé au serveur dans l'en-tête X-Profile (encodé pour rester ASCII).
// Le rôle administrateur (mot de passe -> jeton) déverrouille les profils
// réservés et le changement de profil ; jeton en en-tête X-Admin-Token.
const PROFILE_KEY = "mr_profile";
const ADMIN_TOKEN_KEY = "mr_admin_token";
// Dupliqué côté serveur (PROFILE_MAX_LENGTH, server.js) — pas de module
// partagé navigateur/serveur ici ; garder les deux synchronisés à la main.
const PROFILE_MAX_LENGTH = 40;
let profile = null;
let adminToken = null;
let appConfig = { adminEnabled: false, reservedProfiles: [] };
try {
  profile = localStorage.getItem(PROFILE_KEY) || null;
  adminToken = localStorage.getItem(ADMIN_TOKEN_KEY) || null;
} catch {
  profile = null;
  adminToken = null;
}

function normalizeProfile(s) {
  return (s || "").trim().replace(/\s+/g, " ").slice(0, PROFILE_MAX_LENGTH);
}

function isReservedName(name) {
  const lc = (name || "").toLowerCase();
  return appConfig.reservedProfiles.some((r) => r.toLowerCase() === lc);
}

function storeLocal(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* navigation privée : on garde la valeur en mémoire pour la session */
  }
}

const tabHome = el("tab-home");
const tabSearch = el("tab-search");
const tabMyRatings = el("tab-my-ratings");
const tabSettings = el("tab-settings");

const homeView = el("home-view");
const settingsView = el("settings-view");
const searchView = el("search-view");
const trackView = el("track-view");
const searchInput = el("search-input");
const searchBtn = el("search-btn");
const searchStatus = el("search-status");
const searchHistoryEl = el("search-history");
const resultsList = el("results-list");
const catTracks = el("cat-tracks");
const catAlbums = el("cat-albums");
const catArtists = el("cat-artists");

const drilldownView = el("drilldown-view");
const drilldownTitle = el("drilldown-title");
const drilldownStatus = el("drilldown-status");
const drilldownResults = el("drilldown-results");
const backFromDrilldownBtn = el("back-from-drilldown");

const albumHeader = el("album-header");
const albumTitleEl = el("album-title");
const albumArtistEl = el("album-artist");
const albumYearEl = el("album-year");
const albumLikeBtn = el("album-like-btn");
const albumActions = el("album-actions");
const rateAlbumBtn = el("rate-album-btn");
const rateTracksBtn = el("rate-tracks-btn");

const albumNotationEl = el("album-notation");
const albumNoteTracks = el("album-note-tracks");
const albumNoteFeeling = el("album-note-feeling");
const albumNoteCriteria = el("album-note-criteria");
const albumNoteGlobal = el("album-note-global");
const albumPopup = el("album-popup");
const albumPopupText = el("album-popup-text");

const artistView = el("artist-view");
const artistNameEl = el("artist-name");
const artistTagsEl = el("artist-tags");
const artistLikeBtn = el("artist-like-btn");
const artistStatus = el("artist-status");
const artistNotation = el("artist-notation");
const artistNoteTracks = el("artist-note-tracks");
const artistNoteFeeling = el("artist-note-feeling");
const artistNoteCriteria = el("artist-note-criteria");
const artistNoteGlobal = el("artist-note-global");
const artistPopup = el("artist-popup");
const artistPopupText = el("artist-popup-text");
const artistDiscographyEl = el("artist-discography");
const artistTopTracksEl = el("artist-top-tracks");
const backFromArtistBtn = el("back-from-artist");

const albumSticky = el("album-sticky");
const albumStickyTitle = el("album-sticky-title");
const artistHeader = el("artist-header");
const artistSticky = el("artist-sticky");
const artistStickyTitle = el("artist-sticky-title");

const trackCoverArt = el("track-header").querySelector(".cover-art");
const albumCoverArt = el("album-header").querySelector(".cover-art");
const artistCoverArt = artistHeader.querySelector(".cover-art");

// Album actuellement ouvert dans le drill-down (pour "J'aime" et "Noter les
// morceaux"). Réinitialisé à chaque openAlbum / openArtist.
let currentAlbum = null; // { mbid, title, artist, year }
let currentAlbumTracks = []; // liste ordonnée pour "Noter les morceaux"
let currentArtist = null; // { mbid, name } — pour "J'aime" l'artiste

const myRatingsView = el("my-ratings-view");
const myRatingsStatus = el("my-ratings-status");
const myRatingsResults = el("my-ratings-results");

const trackTitleEl = el("track-title");
const trackArtistEl = el("track-artist");
const trackAlbumEl = el("track-album");
const trackTagsEl = el("track-tags");

const classicBtn = el("classic-btn");
const classicStarEl = el("classic-star");
const globalValueEl = el("global-value");
const likeBtn = el("like-btn");

const trackNavRow = el("track-nav-row");
const prevTrackBtn = el("prev-track-btn");
const nextTrackBtn = el("next-track-btn");

const feelingToggle = el("feeling-toggle");
const feelingSlider = el("feeling-slider");
const feelingValueEl = el("feeling-value");
const feelingActions = el("feeling-actions");

const feelingBlock = el("feeling-block");
const criteriaBlock = el("criteria-block");

const criteriaToggle = el("criteria-toggle");
const criteriaSlider = el("criteria-slider");
const criteriaValueEl = el("criteria-value");
const criteriaActions = el("criteria-actions");

const performanceSlider = el("performance-slider");
const texteSlider = el("texte-slider");
const productionSlider = el("production-slider");
const performanceValueEl = el("performance-value");
const texteValueEl = el("texte-value");
const productionValueEl = el("production-value");

const toastEl = el("toast");

function formatNum(n) {
  if (n === null || n === undefined) return "—";
  const s = Number.isInteger(n) ? n.toFixed(1) : n.toFixed(1);
  return s.replace(".", ",");
}

function setSliderFill(input, value) {
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 10;
  const pct = ((Number(value) - min) / (max - min)) * 100;
  input.style.setProperty("--pct", `${pct}%`);
}

function setSlider(input, value) {
  input.value = value ?? 0;
  setSliderFill(input, value ?? 0);
}

function trackApiPath(suffix = "") {
  return `/api/tracks/${encodeURIComponent(track.mbid)}${suffix}`;
}

async function api(path, method, body) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (profile) headers["X-Profile"] = encodeURIComponent(profile);
  if (adminToken) headers["X-Admin-Token"] = adminToken;
  const res = await fetch(path, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error("Erreur réseau");
  return res.json();
}

// Toast : statut bref qui disparaît (Classic, erreurs courtes).
function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 2600);
}

// Pop-up d'explication (album / artiste) : positionnée en absolu juste sous
// la ligne "MA NOTATION" (ne décale rien). Fondu à l'affichage/disparition ;
// se ferme à 10 s, via le "×", ou en changeant d'écran.
function makePopup(popupEl, textEl, anchorEl) {
  let timer;
  function show(message) {
    textEl.textContent = message;
    popupEl.style.top = `${anchorEl.offsetTop + anchorEl.offsetHeight + 8}px`;
    popupEl.style.left = `${anchorEl.offsetLeft}px`;
    popupEl.style.width = `${anchorEl.offsetWidth}px`;
    popupEl.classList.add("visible");
    clearTimeout(timer);
    timer = setTimeout(hide, 10000);
  }
  function hide() {
    popupEl.classList.remove("visible");
    clearTimeout(timer);
  }
  popupEl.querySelector(".album-popup-close").addEventListener("click", hide);
  return { show, hide };
}

const albumPopupCtl = makePopup(albumPopup, albumPopupText, albumNotationEl);
const artistPopupCtl = makePopup(artistPopup, artistPopupText, artistNotation);
const showAlbumPopup = albumPopupCtl.show;
const hideAlbumPopup = albumPopupCtl.hide;

// --- Pochettes (Cover Art Archive puis repli Deezer, résolu côté serveur) ---

function setCoverArt(elm, url) {
  if (url) {
    elm.style.backgroundImage = `url("${url}")`;
    elm.textContent = "";
    elm.classList.add("has-image");
  } else {
    elm.style.backgroundImage = "";
    elm.textContent = "♪";
    elm.classList.remove("has-image");
  }
}

// Charge la pochette en arrière-plan sans bloquer l'affichage. Un jeton évite
// qu'une pochette d'un écran précédent n'arrive après avoir changé de vue.
async function loadCoverInto(elm, params) {
  setCoverArt(elm, null);
  const token = String(Date.now() + Math.random());
  elm.dataset.coverToken = token;
  try {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v)
    ).toString();
    const { url } = await api(`/api/cover?${qs}`, "GET");
    if (elm.dataset.coverToken !== token || !url) return;
    // On ne bascule l'image que si elle charge vraiment (URL parfois morte).
    const img = new Image();
    img.onload = () => {
      if (elm.dataset.coverToken === token) setCoverArt(elm, url);
    };
    img.src = url;
  } catch {
    /* on garde le placeholder ♪ */
  }
}

// --- Bouton « Écouter » : deep link Deezer (résolu et mémorisé côté serveur) ---
// `params` : { type: 'track'|'album'|'artist', mbid, title, artist }.
// Un jeton évite qu'une réponse d'un écran précédent ne s'applique après coup.
const trackPlayBtn = el("track-play-btn");
const albumPlayBtn = el("album-play-btn");
const artistPlayBtn = el("artist-play-btn");
const trackPreviewBtn = el("track-preview-btn");
const previewAudio = el("track-preview-audio");

function deezerQs(params) {
  return new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
}

// Câble un bouton « Écouter » (deep link Deezer résolu et mémorisé côté
// serveur, cf. /api/deezer-link). `onResult` (optionnel) reçoit la réponse
// brute quand elle arrive à temps (jeton toujours d'actualité) — utilisé par
// wireTrackDeezer pour câbler aussi le bouton « Extrait » à partir du même
// appel, sans dupliquer la garde anti-réponse-périmée ni le fetch.
async function wireDeezerButton(btn, params, defaultLabel, onResult) {
  const token = String(Date.now() + Math.random());
  btn.dataset.dzToken = token;
  btn.classList.remove("dz-ready", "dz-none");
  btn.onclick = null;
  btn.textContent = defaultLabel;

  if (!params.mbid) return;

  try {
    const result = await api(`/api/deezer-link?${deezerQs(params)}`, "GET");
    if (btn.dataset.dzToken !== token) return;

    const { url, transient } = result;
    if (url) {
      btn.classList.add("dz-ready");
      btn.onclick = () => window.open(url, "_blank", "noopener");
    } else if (!transient) {
      // `transient` = recherche momentanément indisponible (Deezer down) :
      // pas une non-correspondance confirmée, on laisse le libellé par défaut.
      btn.classList.add("dz-none");
      btn.textContent = "Non trouvé sur Deezer";
    }
    if (onResult) onResult(result);
  } catch {
    // Recherche indisponible : on laisse le libellé par défaut (non bloquant).
  }
}

// --- Extrait Deezer 30 s (fiche morceau uniquement) ---

function setPreviewPlaying(playing) {
  trackPreviewBtn.classList.toggle("is-playing", playing);
  trackPreviewBtn.textContent = playing ? "⏸ Extrait" : "▶ Extrait";
}

function stopPreview() {
  if (!previewAudio) return;
  if (!previewAudio.paused) previewAudio.pause();
  previewAudio.removeAttribute("src");
  previewAudio.load(); // décharge le buffer
  setPreviewPlaying(false);
}

previewAudio.addEventListener("play", () => setPreviewPlaying(true));
previewAudio.addEventListener("pause", () => setPreviewPlaying(false));
previewAudio.addEventListener("ended", () => {
  setPreviewPlaying(false);
  previewAudio.currentTime = 0;
});

function togglePreview() {
  const url = trackPreviewBtn.dataset.previewUrl;
  if (!url) return;
  if (previewAudio.currentSrc !== url && previewAudio.src !== url) {
    previewAudio.src = url;
  }
  if (previewAudio.paused) {
    previewAudio.play().catch(() => showToast("Lecture de l'extrait impossible."));
  } else {
    previewAudio.pause();
  }
}

// Fiche morceau : câble le bouton « Écouter » (deep link, via
// wireDeezerButton) ET le bouton « Extrait » (lecture in-page) à partir du
// même appel /api/deezer-link, sous la même garde anti-réponse-périmée.
function wireTrackDeezer(mbid, title, artist) {
  stopPreview();
  trackPreviewBtn.classList.remove("dz-ready", "dz-none", "is-playing");
  trackPreviewBtn.onclick = null;
  delete trackPreviewBtn.dataset.previewUrl;
  trackPreviewBtn.textContent = "▶ Extrait";

  return wireDeezerButton(
    trackPlayBtn,
    { type: "track", mbid, title, artist },
    "▶ Écouter",
    ({ preview, transient }) => {
      if (preview) {
        trackPreviewBtn.classList.add("dz-ready");
        trackPreviewBtn.dataset.previewUrl = preview;
        trackPreviewBtn.onclick = togglePreview;
      } else if (!transient) {
        trackPreviewBtn.classList.add("dz-none");
      }
    }
  );
}

// --- En-tête qui se réduit : la pochette défile, le bloc MA NOTATION +
// boutons reste collé en haut. Le titre compact n'apparaît que quand la
// pochette est entièrement sortie de l'écran. ---

function setStickyCollapsed(stickyEl, titleEl, collapsed) {
  stickyEl.classList.toggle("collapsed", collapsed);
  titleEl.hidden = !collapsed;
}

function watchHeaderCollapse(headerEl, stickyEl, titleEl) {
  new IntersectionObserver(
    ([entry]) => setStickyCollapsed(stickyEl, titleEl, !entry.isIntersecting),
    { threshold: 0 }
  ).observe(headerEl);
}

watchHeaderCollapse(el("album-header"), albumSticky, albumStickyTitle);
watchHeaderCollapse(artistHeader, artistSticky, artistStickyTitle);

// --- Rendu ---

function updateBlockHighlight() {
  // Par défaut (rien en édition), les deux blocs restent en couleur normale.
  // Seul le bloc "en face" de celui en cours d'édition passe en gris/figé.
  feelingBlock.classList.toggle("editing", editing === "feeling");
  feelingBlock.classList.toggle("inactive", editing === "criteria");
  criteriaBlock.classList.toggle("editing", editing === "criteria");
  criteriaBlock.classList.toggle("inactive", editing === "feeling");
}

function renderTrackNav() {
  if (!albumContext) {
    trackNavRow.hidden = true;
    return;
  }
  trackNavRow.hidden = false;
  prevTrackBtn.disabled = albumContext.index <= 0;
  nextTrackBtn.disabled = albumContext.index >= albumContext.tracks.length - 1;
}

function render() {
  trackTitleEl.textContent = track.title;
  trackArtistEl.textContent = track.artist;
  trackAlbumEl.textContent = track.albumTitle;
  trackTagsEl.textContent = track.tags;

  // L'artiste et l'album de l'en-tête sont cliquables (ouvrent leur fiche)
  // dès qu'on a un nom exploitable.
  trackArtistEl.classList.toggle(
    "linkable",
    !!track.artist && track.artist !== "Artiste inconnu"
  );
  trackAlbumEl.classList.toggle(
    "linkable",
    !!track.albumTitle && track.albumTitle !== "Album inconnu"
  );

  classicBtn.classList.toggle("active", track.isClassic);
  classicStarEl.textContent = track.isClassic ? "★" : "☆";

  likeBtn.classList.toggle("liked", track.isLiked);
  likeBtn.textContent = track.isLiked ? "♥" : "♡";

  globalValueEl.textContent = formatNum(track.globalRating);

  renderTrackNav();
  renderFeeling();
  renderCriteria();
}

function renderFeeling() {
  const isEditing = editing === "feeling";
  updateBlockHighlight();
  feelingToggle.classList.toggle("active", isEditing);
  feelingActions.hidden = !isEditing;
  feelingSlider.disabled = !isEditing;

  const displayValue = isEditing ? feelingDraft : track.feeling;
  feelingValueEl.textContent = formatNum(displayValue);

  if (!isEditing) {
    setSlider(feelingSlider, track.feeling ?? 0);
  }

  if (isEditing) {
    const resetBtn = feelingActions.querySelector('[data-action="reset"]');
    const saveBtn = feelingActions.querySelector('[data-action="save"]');
    resetBtn.disabled = feelingDraft == null;
    saveBtn.disabled = feelingDraft == null || feelingDraft === track.feeling;
  }
}

function syncFeelingSlider() {
  setSlider(feelingSlider, feelingDraft ?? 0);
}

// Moyenne des critères effectivement renseignés (saisie partielle autorisée).
function averageOfSetCriteria(criteria) {
  const values = [criteria.performance, criteria.texte, criteria.production].filter((v) => v != null);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

function criteriaHasAnyValue(criteria) {
  return criteria.performance != null || criteria.texte != null || criteria.production != null;
}

function criteriaEquals(a, b) {
  return a.performance === b.performance && a.texte === b.texte && a.production === b.production;
}

function renderCriteria() {
  const isEditing = editing === "criteria";
  updateBlockHighlight();
  criteriaToggle.classList.toggle("active", isEditing);
  criteriaActions.hidden = !isEditing;

  performanceSlider.disabled = !isEditing;
  texteSlider.disabled = !isEditing;
  productionSlider.disabled = !isEditing;

  const source = isEditing ? criteriaDraft : track.criteria;
  performanceValueEl.textContent = formatNum(source.performance);
  texteValueEl.textContent = formatNum(source.texte);
  productionValueEl.textContent = formatNum(source.production);

  // Marque visuellement les critères pas encore renseignés en mode édition :
  // ils n'entrent PAS dans la moyenne (cf. averageOfSetCriteria).
  performanceSlider.classList.toggle("unset", isEditing && criteriaDraft.performance == null);
  texteSlider.classList.toggle("unset", isEditing && criteriaDraft.texte == null);
  productionSlider.classList.toggle("unset", isEditing && criteriaDraft.production == null);

  if (!isEditing) {
    setSlider(performanceSlider, track.criteria.performance ?? 0);
    setSlider(texteSlider, track.criteria.texte ?? 0);
    setSlider(productionSlider, track.criteria.production ?? 0);
  }

  // La note par critères n'est jamais éditable directement (BR-00037) :
  // le slider global reste toujours désactivé et grisé, seule sa valeur affichée change.
  let liveCriteriaRating = track.criteriaRating;
  if (isEditing) {
    liveCriteriaRating = averageOfSetCriteria(criteriaDraft);

    const resetBtn = criteriaActions.querySelector('[data-action="reset"]');
    const saveBtn = criteriaActions.querySelector('[data-action="save"]');
    const hasAnyValue = criteriaHasAnyValue(criteriaDraft);
    resetBtn.disabled = !hasAnyValue;
    saveBtn.disabled = !hasAnyValue || criteriaEquals(criteriaDraft, track.criteria);
  }

  criteriaValueEl.textContent = formatNum(liveCriteriaRating);
  setSlider(criteriaSlider, liveCriteriaRating ?? 0);
}

function syncCriteriaSliders() {
  setSlider(performanceSlider, criteriaDraft.performance ?? 0);
  setSlider(texteSlider, criteriaDraft.texte ?? 0);
  setSlider(productionSlider, criteriaDraft.production ?? 0);
}

// --- Édition : NOTE AU FEELING ---

function openFeelingEdit() {
  if (editing === "criteria") closeCriteriaEdit();
  editing = "feeling";
  feelingDraft = track.feeling;
  syncFeelingSlider();
  renderFeeling();
}

function closeFeelingEdit() {
  editing = editing === "feeling" ? null : editing;
  renderFeeling();
}

feelingToggle.addEventListener("click", () => {
  if (editing !== "feeling") openFeelingEdit();
});

feelingSlider.addEventListener("input", () => {
  feelingDraft = Number(feelingSlider.value);
  setSliderFill(feelingSlider, feelingDraft);
  renderFeeling();
});

feelingActions.addEventListener("click", async (e) => {
  const action = e.target.dataset.action;
  if (!action) return;

  if (action === "reset") {
    feelingDraft = null;
    syncFeelingSlider();
    renderFeeling();
  } else if (action === "cancel") {
    feelingDraft = null;
    closeFeelingEdit();
  } else if (action === "save") {
    if (feelingDraft == null) return;
    track = await api(trackApiPath("/feeling"), "PUT", { value: feelingDraft });
    closeFeelingEdit();
    render();
  }
});

// --- Édition : NOTE PAR CRITÈRES ---

function openCriteriaEdit() {
  if (editing === "feeling") closeFeelingEdit();
  editing = "criteria";
  criteriaDraft = { ...track.criteria };
  syncCriteriaSliders();
  renderCriteria();
}

function closeCriteriaEdit() {
  editing = editing === "criteria" ? null : editing;
  renderCriteria();
}

criteriaToggle.addEventListener("click", () => {
  if (editing !== "criteria") openCriteriaEdit();
});

performanceSlider.addEventListener("input", () => {
  criteriaDraft.performance = Number(performanceSlider.value);
  setSliderFill(performanceSlider, criteriaDraft.performance);
  renderCriteria();
});
texteSlider.addEventListener("input", () => {
  criteriaDraft.texte = Number(texteSlider.value);
  setSliderFill(texteSlider, criteriaDraft.texte);
  renderCriteria();
});
productionSlider.addEventListener("input", () => {
  criteriaDraft.production = Number(productionSlider.value);
  setSliderFill(productionSlider, criteriaDraft.production);
  renderCriteria();
});

criteriaActions.addEventListener("click", async (e) => {
  const action = e.target.dataset.action;
  if (!action) return;

  if (action === "reset") {
    criteriaDraft = { performance: null, texte: null, production: null };
    syncCriteriaSliders();
    renderCriteria();
  } else if (action === "cancel") {
    criteriaDraft = { performance: null, texte: null, production: null };
    closeCriteriaEdit();
  } else if (action === "save") {
    const { performance, texte, production } = criteriaDraft;
    if (!criteriaHasAnyValue(criteriaDraft)) return;
    track = await api(trackApiPath("/criteria"), "PUT", { performance, texte, production });
    closeCriteriaEdit();
    render();
  }
});

// --- Statut Classic ---

classicBtn.addEventListener("click", async () => {
  const nextValue = !track.isClassic;
  try {
    track = await api(trackApiPath("/classic"), "PUT", { value: nextValue });
    render();
    showToast(nextValue ? "Ajouté aux Classics ✓" : "Retiré des Classics");
  } catch (err) {
    showToast("Impossible de modifier le statut Classic. Réessaie.");
  }
});

// --- "J'aime" ---

likeBtn.addEventListener("click", async () => {
  const nextValue = !track.isLiked;
  try {
    track = await api(trackApiPath("/like"), "PUT", { value: nextValue });
    render();
  } catch (err) {
    // Pas de retour utilisateur dédié pour l'instant (hors périmètre GD-00002).
  }
});

// --- Navigation depuis la fiche : artiste / album cliquables ---
// On n'a que le nom en base : on résout vers l'entité MusicBrainz puis on
// ouvre le drill-down correspondant (morceaux de l'artiste / tracklist de
// l'album), comme un clic depuis les résultats de recherche.

async function openArtistByName(name) {
  if (!name || name === "Artiste inconnu") return;
  showToast("Recherche de l'artiste…");
  try {
    const { artist } = await api(`/api/resolve-artist?name=${encodeURIComponent(name)}`, "GET");
    if (artist) openArtist(artist);
    else showToast("Fiche artiste introuvable.");
  } catch (err) {
    showToast("Fiche artiste introuvable.");
  }
}

async function openAlbumByName(title, artist) {
  if (!title || title === "Album inconnu") return;
  showToast("Recherche de l'album…");
  try {
    const { album } = await api(
      `/api/resolve-album?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist || "")}`,
      "GET"
    );
    if (album) openAlbum(album);
    else showToast("Fiche album introuvable.");
  } catch (err) {
    showToast("Fiche album introuvable.");
  }
}

trackArtistEl.addEventListener("click", () => {
  if (trackArtistEl.classList.contains("linkable")) openArtistByName(track.artist);
});

albumArtistEl.addEventListener("click", () => {
  if (albumArtistEl.classList.contains("linkable") && currentAlbum) {
    openArtistByName(currentAlbum.artist);
  }
});

trackAlbumEl.addEventListener("click", () => {
  if (!trackAlbumEl.classList.contains("linkable")) return;
  if (track.releaseMbid) {
    openAlbum({ mbid: track.releaseMbid, title: track.albumTitle, artist: track.artist });
  } else {
    openAlbumByName(track.albumTitle, track.artist);
  }
});

// --- Actions de l'en-tête album (drill-down tracklist) ---

albumLikeBtn.addEventListener("click", async () => {
  if (!currentAlbum) return;
  const next = !albumLikeBtn.classList.contains("liked");
  renderAlbumLike(next); // optimiste
  try {
    await api(`/api/tracks/${encodeURIComponent(currentAlbum.mbid)}/like`, "PUT", {
      value: next,
      meta: {
        title: currentAlbum.title,
        album: currentAlbum.title,
        artist: currentAlbum.artist,
        date: currentAlbum.year,
      },
    });
  } catch (err) {
    renderAlbumLike(!next); // revient en arrière
    showToast("Impossible de modifier « J'aime ».");
  }
});

// "Noter l'album" : ouvre l'écran de notation dédié (feeling + critères).
// La tracklist est masquée jusqu'à ce que l'utilisateur clique « Retour ».
rateAlbumBtn.addEventListener("click", () => {
  enterAlbumRatingMode();
});

el("album-rating-back").addEventListener("click", exitAlbumRatingMode);

// "Noter les morceaux" : ouvre la fiche du 1er morceau de la tracklist en
// réutilisant l'écran de notation de morceau (avec contexte album pour
// Précédent/Suivant).
rateTracksBtn.addEventListener("click", () => {
  if (!currentAlbumTracks.length) return;
  selectTrack(currentAlbumTracks[0], { tracks: currentAlbumTracks, index: 0 });
});

// --- Recherche ---

const ALL_VIEWS = [homeView, searchView, drilldownView, artistView, myRatingsView, settingsView, trackView];

function showOnly(view) {
  // Tout changement d'écran coupe l'extrait 30 s en cours (fiche morceau).
  stopPreview();
  for (const v of ALL_VIEWS) v.hidden = v !== view;
}

function updateTabBar() {
  tabHome.classList.toggle("active", currentSection === "home");
  tabSearch.classList.toggle("active", currentSection === "search");
  tabMyRatings.classList.toggle("active", currentSection === "my-ratings");
  tabSettings.classList.toggle("active", currentSection === "settings");
}

function showHomeView() {
  currentSection = "home";
  updateTabBar();
  showOnly(homeView);
}

function showSettingsView() {
  currentSection = "settings";
  updateTabBar();
  refreshProfileUI();
  showOnly(settingsView);
}

function showSearchView() {
  currentSection = "search";
  updateTabBar();
  showOnly(searchView);
}

function showTrackView() {
  // La section active (Recherche ou Mes notations) ne change pas : on garde
  // une trace visuelle de "d'où on vient" même en consultant une fiche.
  updateTabBar();
  showOnly(trackView);
}

function showMyRatingsView() {
  currentSection = "my-ratings";
  updateTabBar();
  showOnly(myRatingsView);
}

function showDrilldownView() {
  // Le drill-down (tracklist d'un album) n'est accessible que depuis la
  // recherche : on reste dans la section "Recherche".
  currentSection = "search";
  updateTabBar();
  showOnly(drilldownView);
}

function showArtistView() {
  currentSection = "search";
  updateTabBar();
  showOnly(artistView);
}

tabHome.addEventListener("click", () => {
  showHomeView();
  loadHome();
});
tabSettings.addEventListener("click", showSettingsView);
tabSearch.addEventListener("click", showSearchView);
tabMyRatings.addEventListener("click", () => {
  showMyRatingsView();
  loadMyRatings();
});

// --- Accueil : mosaïque des dernières notations ---

const homeSearchBar = el("home-search-bar");
const homeFilters = el("home-filters");
const homeStatus = el("home-status");
const homeGrid = el("home-grid");
const homeEmpty = el("home-empty");
const homeEmptyCta = el("home-empty-cta");

let homeData = { tracks: [], albums: [], artists: [] };
let homeFilter = "all";

const goToSearch = () => {
  showSearchView();
  searchInput.focus();
};
homeSearchBar.addEventListener("click", goToSearch);
homeEmptyCta.addEventListener("click", goToSearch);

homeFilters.addEventListener("click", (e) => {
  const btn = e.target.closest(".home-filter");
  if (!btn) return;
  homeFilter = btn.dataset.filter;
  for (const b of homeFilters.querySelectorAll(".home-filter")) {
    b.classList.toggle("active", b === btn);
  }
  renderHome();
});

// Pochettes des tuiles : chargées seulement à l'approche de l'écran.
const tileCoverObserver = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      tileCoverObserver.unobserve(entry.target);
      loadTileCover(entry.target);
    }
  },
  { rootMargin: "300px 0px" }
);

async function loadTileCover(tile) {
  const d = tile.dataset;
  const params =
    d.type === "artist"
      ? { type: "artist", artist: d.artist }
      : d.type === "album"
      ? { artist: d.artist, album: d.album }
      : { releaseMbid: d.releaseMbid, artist: d.artist, album: d.album };
  try {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    const { url } = await api(`/api/cover?${qs}`, "GET");
    if (!url || !tile.isConnected) return;
    const img = new Image();
    img.onload = () => {
      if (!tile.isConnected) return;
      tile.style.backgroundImage = `url("${url}")`;
      const ph = tile.querySelector(".home-tile-ph");
      if (ph) ph.hidden = true;
    };
    img.src = url;
  } catch {
    /* garde le placeholder */
  }
}

function createHomeTile(item) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "home-tile";
  tile.dataset.type = item.type;
  tile.dataset.artist = item.artist || "";
  tile.dataset.album = item.album || (item.type === "album" ? item.title : "") || "";
  tile.dataset.releaseMbid = item.releaseMbid || "";

  const ph = document.createElement("span");
  ph.className = "home-tile-ph";
  ph.textContent = "♪";
  tile.appendChild(ph);

  if (item.isClassic) {
    const star = document.createElement("span");
    star.className = "home-tile-star";
    star.textContent = "★";
    tile.appendChild(star);
  }

  const note = document.createElement("span");
  note.className = "home-tile-note";
  note.textContent = formatNum(item.note);
  tile.appendChild(note);

  tile.addEventListener("click", () => openHomeTile(item));
  tileCoverObserver.observe(tile);
  return tile;
}

async function openHomeTile(item) {
  if (item.type === "album") return openAlbumByName(item.title, item.artist);
  if (item.type === "artist") return openArtistByName(item.artist);

  // morceau : la ligne existe déjà en base
  homeStatus.hidden = false;
  homeStatus.textContent = "Chargement…";
  try {
    const context = await buildAlbumContextFor({ mbid: item.mbid, releaseMbid: item.releaseMbid });
    await loadTrack(
      item.mbid,
      { title: item.title, artist: item.artist, album: item.album, releaseMbid: item.releaseMbid },
      context
    );
    homeStatus.hidden = true;
  } catch (err) {
    homeStatus.textContent = "Impossible de charger ce morceau. Réessaie.";
  }
}

function homeVisibleItems() {
  if (homeFilter === "all") {
    return [...homeData.tracks, ...homeData.albums, ...homeData.artists].sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || "")
    );
  }
  return homeData[homeFilter] || [];
}

function renderHome() {
  const total = homeData.tracks.length + homeData.albums.length + homeData.artists.length;
  const empty = total === 0;

  homeFilters.hidden = empty;
  homeGrid.hidden = empty;
  homeEmpty.hidden = !empty;
  tileCoverObserver.disconnect();
  homeGrid.innerHTML = "";
  if (empty) return;

  const items = homeVisibleItems();
  if (items.length === 0) {
    const msg = document.createElement("div");
    msg.className = "home-grid-msg";
    msg.textContent = "Rien dans cette catégorie pour l'instant.";
    homeGrid.appendChild(msg);
    return;
  }
  for (const item of items) homeGrid.appendChild(createHomeTile(item));
}

async function loadHome() {
  homeStatus.hidden = false;
  homeStatus.textContent = "Chargement…";
  try {
    homeData = await api("/api/home", "GET");
  } catch (err) {
    homeData = { tracks: [], albums: [], artists: [] };
  }
  homeStatus.hidden = true;
  renderHome();
}

function setSearchStatus(message) {
  if (!message) {
    searchStatus.hidden = true;
    searchStatus.textContent = "";
    return;
  }
  searchStatus.hidden = false;
  searchStatus.textContent = message;
}

// --- Construction des lignes de résultat (réutilisées par la recherche
// catégorisée et par le drill-down album/artiste) ---

function buildResultItem(titleText, metaText, onClick) {
  const li = document.createElement("li");
  li.className = "search-result";

  const infoEl = document.createElement("div");
  infoEl.className = "search-result-info";

  const titleEl = document.createElement("div");
  titleEl.className = "search-result-title";
  titleEl.textContent = titleText;

  const metaEl = document.createElement("div");
  metaEl.className = "search-result-meta";
  metaEl.textContent = metaText;

  infoEl.appendChild(titleEl);
  infoEl.appendChild(metaEl);
  li.appendChild(infoEl);
  li.addEventListener("click", onClick);
  return li;
}

function trackMeta(r) {
  const parts = [r.artist];
  if (r.album) parts.push(r.album);
  if (r.date) parts.push(r.date.slice(0, 4));
  return parts.join(" — ");
}

// `context` (optionnel) = { tracks, index } quand ce résultat fait partie
// d'une tracklist d'album ordonnée, pour activer Précédent/Suivant sur la
// fiche. Absent pour un résultat de recherche direct ou un morceau
// d'artiste (pas d'ordre naturel).
function createTrackResultItem(r, context = null) {
  return buildResultItem(r.title, trackMeta(r), () => selectTrack(r, context));
}

function formatMsShort(ms) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// Ligne de tracklist d'album : titre du morceau à gauche, puis durée et
// NOTE GLOBALE ("—" si non noté). Artiste/album/année ne sont pas répétés
// (ils sont dans l'en-tête).
function createTracklistRow(r, context) {
  const li = document.createElement("li");
  li.className = "tracklist-row";

  const titleEl = document.createElement("span");
  titleEl.className = "tracklist-title";
  titleEl.textContent = r.title;
  li.appendChild(titleEl);

  const durEl = document.createElement("span");
  durEl.className = "tracklist-duration";
  durEl.textContent = formatMsShort(r.durationMs);
  li.appendChild(durEl);

  const ratingEl = document.createElement("span");
  ratingEl.className = "tracklist-rating";
  ratingEl.textContent = formatNum(r.globalRating); // "—" si null/undefined
  li.appendChild(ratingEl);

  li.addEventListener("click", () => selectTrack(r, context));
  return li;
}

function createAlbumResultItem(a) {
  const parts = [a.artist];
  if (a.date) parts.push(a.date.slice(0, 4));
  // Signale les non-albums qui restent dans l'onglet (EP, compilation, live…).
  if (a.primaryType && a.primaryType !== "Album") parts.push(a.primaryType);
  return buildResultItem(a.title, parts.join(" — "), () => openAlbum(a));
}

function createArtistResultItem(a) {
  const meta = [a.type, a.country].filter(Boolean).join(" — ") || "Artiste";
  return buildResultItem(a.name, meta, () => openArtist(a));
}

function renderCategory(container, items, createItemFn, emptyMessage, isError = false) {
  container.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = isError ? "search-empty search-error" : "search-empty";
    li.textContent = emptyMessage;
    container.appendChild(li);
    return;
  }
  for (const item of items) {
    container.appendChild(createItemFn(item));
  }
}

function renderSkeleton(container, rows = 5) {
  container.innerHTML = "";
  for (let i = 0; i < rows; i++) {
    const li = document.createElement("li");
    li.className = "skeleton-row";
    container.appendChild(li);
  }
}

// Une seule catégorie affichée à la fois (onglets Morceaux/Album/Artiste) ;
// les 3 résultats sont conservés en mémoire pour basculer sans refaire de
// recherche.
const CATEGORIES = ["tracks", "albums", "artists"];
let currentCategory = "tracks";
let lastSearchData = { tracks: [], albums: [], artists: [] };
let lastSearchErrors = { tracks: null, albums: null, artists: null };
let lastSearchLoading = { tracks: false, albums: false, artists: false };
let searchRunId = 0; // ignore les réponses d'une recherche précédente

const CATEGORY_CONFIG = {
  tracks: { create: () => createTrackResultItem, empty: "Aucun morceau trouvé." },
  albums: { create: () => createAlbumResultItem, empty: "Aucun album trouvé." },
  artists: { create: () => createArtistResultItem, empty: "Aucun artiste trouvé." },
};

const CAT_TAB = { tracks: catTracks, albums: catAlbums, artists: catArtists };

function updateCategoryTabState() {
  for (const c of CATEGORIES) {
    CAT_TAB[c].classList.toggle("loading", lastSearchLoading[c]);
    CAT_TAB[c].classList.toggle("has-error", !lastSearchLoading[c] && !!lastSearchErrors[c]);
  }
}

function renderCurrentCategory() {
  if (lastSearchLoading[currentCategory]) {
    renderSkeleton(resultsList);
    return;
  }
  const { create, empty } = CATEGORY_CONFIG[currentCategory];
  const err = lastSearchErrors[currentCategory];
  renderCategory(resultsList, lastSearchData[currentCategory], create(), err || empty, !!err);
}

function setCategory(category) {
  currentCategory = category;
  for (const c of CATEGORIES) CAT_TAB[c].classList.toggle("active", c === category);
  renderCurrentCategory();
}

catTracks.addEventListener("click", () => setCategory("tracks"));
catAlbums.addEventListener("click", () => setCategory("albums"));
catArtists.addEventListener("click", () => setCategory("artists"));

// Affichage progressif : les 3 catégories sont demandées en parallèle et
// chacune s'affiche dès qu'elle répond (le serveur sérialise les appels
// MusicBrainz derrière). Une recherche déjà obtenue revient du cache serveur.
async function runSearch() {
  const q = searchInput.value.trim();
  if (!q) return;

  const runId = ++searchRunId;
  hideSearchHistory();
  searchInput.blur();
  setSearchStatus(null);
  lastSearchData = { tracks: [], albums: [], artists: [] };
  lastSearchErrors = { tracks: null, albums: null, artists: null };
  lastSearchLoading = { tracks: true, albums: true, artists: true };
  updateCategoryTabState();
  renderCurrentCategory();

  // Best-effort : l'historique ne doit pas bloquer l'affichage des résultats.
  api("/api/search-history", "POST", { query: q }).catch(() => {});

  for (const cat of CATEGORIES) {
    api(`/api/search/${cat}?q=${encodeURIComponent(q)}`, "GET")
      .then((data) => {
        if (runId !== searchRunId) return;
        lastSearchData[cat] = data[cat] || [];
        lastSearchErrors[cat] = data[`${cat}Error`] || null;
      })
      .catch(() => {
        if (runId !== searchRunId) return;
        lastSearchData[cat] = [];
        lastSearchErrors[cat] = "Indisponible pour le moment. Réessaie.";
      })
      .finally(() => {
        if (runId !== searchRunId) return;
        lastSearchLoading[cat] = false;
        updateCategoryTabState();
        if (currentCategory === cat) renderCurrentCategory();
      });
  }
}

// --- Historique des recherches (affiché au focus du champ, avant saisie) ---

function hideSearchHistory() {
  searchHistoryEl.hidden = true;
  searchHistoryEl.innerHTML = "";
}

function renderSearchHistory(queries) {
  searchHistoryEl.innerHTML = "";
  if (!queries.length) {
    searchHistoryEl.hidden = true;
    return;
  }
  for (const q of queries) {
    const li = document.createElement("li");
    li.className = "search-history-item";
    li.textContent = q;
    // mousedown/touchstart : agir avant le blur du champ qui masquerait la liste.
    li.addEventListener("mousedown", (e) => e.preventDefault());
    li.addEventListener("click", () => {
      searchInput.value = q;
      runSearch();
    });
    searchHistoryEl.appendChild(li);
  }
  searchHistoryEl.hidden = false;
}

async function maybeShowSearchHistory() {
  if (searchInput.value.trim()) return; // l'utilisateur tape déjà une requête
  try {
    const data = await api("/api/search-history", "GET");
    if (searchInput.value.trim()) return; // a commencé à taper entre-temps
    renderSearchHistory(data.queries || []);
  } catch (err) {
    hideSearchHistory();
  }
}

searchInput.addEventListener("focus", maybeShowSearchHistory);
searchInput.addEventListener("input", () => {
  if (searchInput.value.trim()) hideSearchHistory();
  else maybeShowSearchHistory();
});
searchInput.addEventListener("blur", () => {
  // Laisser le temps à un clic sur un élément de la liste de se déclencher.
  setTimeout(hideSearchHistory, 150);
});

// --- Drill-down : tracklist d'un album ou morceaux d'un artiste ---

function setDrilldownStatus(message) {
  if (!message) {
    drilldownStatus.hidden = true;
    drilldownStatus.textContent = "";
    return;
  }
  drilldownStatus.hidden = false;
  drilldownStatus.textContent = message;
}

function renderAlbumLike(isLiked) {
  albumLikeBtn.classList.toggle("liked", !!isLiked);
  albumLikeBtn.textContent = isLiked ? "♥" : "♡";
}

// --- Notation de l'album (ligne "MA NOTATION" : 4 notes) ---

function round1(n) {
  return Math.round(n * 10) / 10;
}

function mean1(values) {
  const vals = values.filter((v) => v != null);
  if (!vals.length) return null;
  return round1(vals.reduce((a, b) => a + b, 0) / vals.length);
}

// Note d'un slot : "8,4/10" si renseigné, "—/10" sinon. Toujours 1 décimale.
function albumNoteText(n) {
  return n == null ? "—/10" : `${n.toFixed(1).replace(".", ",")}/10`;
}

// value: nombre ou null ; state (optionnel) : "none" | "partial" | "complete"
// pour la pastille de complétude ; counted (optionnel) : false => valeur
// grise "à titre informatif" (ne compte pas dans la NOTE GLOBALE).
function setAlbumNote(elm, value, state, counted = true) {
  elm.textContent = albumNoteText(value);
  elm.classList.toggle("has-value", value != null);
  elm.classList.toggle("not-counted", value != null && counted === false);
  elm.classList.toggle("with-state", !!state);
  elm.classList.toggle("state-none", state === "none");
  elm.classList.toggle("state-partial", state === "partial");
  elm.classList.toggle("state-complete", state === "complete");
}

// Utilisé par la vue ARTISTE seulement (notation artiste non développée :
// feeling/critères artiste = placeholders). L'album a sa propre mécanique.
function computeAlbumNotes(tracks) {
  const tracksNote = mean1(tracks.map((t) => t.globalRating));
  const globalNote = mean1([tracksNote, null, null]);
  return { tracks: tracksNote, feeling: null, criteria: null, global: globalNote };
}

// ===================================================================
// --- Notation d'un ALBUM (GD-00003) ---
// ===================================================================

const ALBUM_CRITERIA = ["performance", "texte", "production", "coherence", "creativite"];
const ALBUM_INHERITABLE = ["performance", "texte", "production"];
const ALBUM_CRIT_LABEL = {
  performance: "Performance",
  texte: "Texte",
  production: "Production",
  coherence: "Cohérence",
  creativite: "Créativité",
};

const albumRatingCard = el("album-rating-card");

const albumFeelingBlock = el("album-feeling-block");
const albumFeelingToggle = el("album-feeling-toggle");
const albumFeelingSlider = el("album-feeling-slider");
const albumFeelingValueEl = el("album-feeling-value");
const albumFeelingActions = el("album-feeling-actions");

const albumCriteriaBlock = el("album-criteria-block");
const albumCriteriaToggle = el("album-criteria-toggle");
const albumCriteriaSlider = el("album-criteria-slider");
const albumCriteriaValueEl = el("album-criteria-value");
const albumCriteriaActions = el("album-criteria-actions");
const albumCriteriaBreakdown = el("album-criteria-breakdown");
const albumInheritBtn = el("album-inherit-btn");
const albumInheritHint = el("album-inherit-hint");

const albumMorceauxRow = el("album-morceaux-row");
const albumMorceauxCheck = el("album-morceaux-check");
const albumMorceauxNote = el("album-morceaux-note");

// Lignes de critères (une par nom) : { line, slider, valueEl, revertBtn? }
const albumCritLines = {};
for (const line of albumCriteriaBreakdown.querySelectorAll(".criteria-line")) {
  const name = line.dataset.crit;
  albumCritLines[name] = {
    line,
    slider: line.querySelector(".mini-slider"),
    valueEl: line.querySelector(".criteria-value"),
    revertBtn: line.querySelector(".crit-revert"),
  };
}

let albumNotation = null; // dernier état serveur pour l'album courant
let albumEditing = null; // 'feeling' | 'criteria' | null
let albumFeelingDraft = null; // nombre ou null
let albumCriteriaDraft = null; // { <nom>: { value: number|null, manual: bool } }
let albumCardForced = false; // "Noter l'album" a déjà révélé la carte

function albumApiBase() {
  return `/api/albums/${encodeURIComponent(currentAlbum.mbid)}`;
}

function albumTotalCount() {
  return currentAlbumTracks.length || null;
}

function albumSaveMeta() {
  return currentAlbum
    ? { title: currentAlbum.title, album: currentAlbum.title, artist: currentAlbum.artist, date: currentAlbum.year }
    : {};
}

async function loadAlbumNotation() {
  if (!currentAlbum || !currentAlbum.mbid) return;
  const forMbid = currentAlbum.mbid;
  const total = albumTotalCount();
  const qs = total != null ? `?total=${total}` : "";
  let data = null;
  try {
    data = await api(`${albumApiBase()}/notation${qs}`, "GET");
  } catch (err) {
    data = null;
  }
  // Ignore une réponse arrivée après un changement d'album.
  if (!currentAlbum || currentAlbum.mbid !== forMbid) return;
  albumNotation = data;
  albumEditing = null;
  renderAlbumNotation();
}

// --- Ligne "MA NOTATION" (sticky) : 4 notes + pastilles de complétude ---

function renderAlbumNotationLine() {
  const n = albumNotation;
  if (!n) {
    setAlbumNote(albumNoteTracks, null, "none");
    setAlbumNote(albumNoteFeeling, null, "none");
    setAlbumNote(albumNoteCriteria, null, "none");
    setAlbumNote(albumNoteGlobal, null);
    return;
  }
  setAlbumNote(albumNoteTracks, n.morceaux.mean, n.morceaux.completeness, n.morceaux.participates);
  setAlbumNote(albumNoteFeeling, n.feeling, n.feelingComplete ? "complete" : "none");
  setAlbumNote(albumNoteCriteria, n.criteriaRating, n.criteriaCompleteness);
  setAlbumNote(albumNoteGlobal, n.global);
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function albumNoteDetail(kind) {
  const n = albumNotation;
  if (!n) return "Chargement…";
  const m = n.morceaux;
  if (kind === "tracks") {
    if (m.mean == null) return "Aucun morceau de cet album n'est encore noté.";
    let base = `${m.ratedCount} morceau${m.ratedCount > 1 ? "x" : ""} noté${m.ratedCount > 1 ? "s" : ""}`;
    if (m.totalCount != null) base += ` sur ${m.totalCount} — couverture ${pct(m.coverage)}`;
    base += ` (moyenne ${formatNum(m.mean)}).`;
    if (!m.eligible) return `${base} En dessous de 70 % de couverture, cette note n'entre pas dans la NOTE GLOBALE.`;
    if (!m.included) return `${base} Tu as choisi de ne pas la compter dans la NOTE GLOBALE.`;
    return `${base} Poids dans la NOTE GLOBALE : ${pct((1 / 3) * m.coverage)}.`;
  }
  if (kind === "feeling") {
    return n.feeling == null
      ? "Ta note instinctive pour l'album — pas encore renseignée. Ouvre « AU FEELING » pour la saisir."
      : `Ta note au feeling pour l'album : ${formatNum(n.feeling)}/10.`;
  }
  if (kind === "criteria") {
    if (!n.criteriaSetCount) return "Ta note par critères de l'album — pas encore renseignée.";
    const parts = ALBUM_CRITERIA.filter((c) => n.criteria[c]).map(
      (c) => `${ALBUM_CRIT_LABEL[c]} ${formatNum(n.criteria[c].value)}`
    );
    return `${n.criteriaSetCount}/5 critères : ${parts.join(" · ")} → moyenne ${formatNum(n.criteriaRating)}/10.`;
  }
  if (kind === "global") {
    if (n.global == null)
      return "NOTE GLOBALE : renseigne au moins une composante (feeling, critères, ou 70 % des morceaux notés).";
    const comps = [];
    if (m.participates) comps.push("morceaux");
    if (n.feeling != null) comps.push("feeling");
    if (n.criteriaRating != null) comps.push("critères");
    return `NOTE GLOBALE ${formatNum(n.global)}/10 — moyenne${
      m.participates ? " pondérée" : ""
    } de : ${comps.join(", ")}.`;
  }
  return "";
}

const ALBUM_NOTE_KIND = {
  "album-note-tracks": "tracks",
  "album-note-feeling": "feeling",
  "album-note-criteria": "criteria",
  "album-note-global": "global",
};
for (const [id, kind] of Object.entries(ALBUM_NOTE_KIND)) {
  el(id).addEventListener("click", () => showAlbumPopup(albumNoteDetail(kind)));
}

// "Classic" album : emplacement prévu, non développé (cf. spec).
el("album-classic-btn").addEventListener("click", () => showAlbumPopup("Bientôt disponible."));

// --- Écran de notation d'album (feeling + critères + toggle MORCEAUX) ---
// `albumCardForced` = on est sur l'écran de notation dédié : la carte est
// visible et la tracklist masquée jusqu'au clic sur « Retour ».

function enterAlbumRatingMode() {
  albumCardForced = true;
  renderAlbumNotation();
  if (albumEditing === null && (!albumNotation || albumNotation.feeling == null)) {
    openAlbumFeelingEdit();
  }
  albumRatingCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function exitAlbumRatingMode() {
  albumEditing = null; // abandonne une édition en cours
  albumCardForced = false;
  renderAlbumNotation();
  albumSticky.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderAlbumNotation() {
  renderAlbumNotationLine();

  const show = albumCardForced;
  albumRatingCard.hidden = !show;
  // Écran de notation : on masque la tracklist et les boutons d'action.
  drilldownResults.hidden = show;
  albumActions.hidden = show;
  if (show) drilldownStatus.hidden = true;

  if (show) {
    renderAlbumFeeling();
    renderAlbumCriteria();
    renderAlbumMorceauxToggle();
  }
}

// Valeur "retenue" côté serveur pour un critère (ou null).
function savedCritValue(name) {
  const c = albumNotation && albumNotation.criteria[name];
  return c ? c.value : null;
}
function savedCritManual(name) {
  const c = albumNotation && albumNotation.criteria[name];
  return !!(c && c.manual);
}
function trackMean(name) {
  return (albumNotation && albumNotation.trackCritMeans[name]) ?? null;
}

// ----- NOTE AU FEELING ALBUM -----

function renderAlbumFeeling() {
  const isEditing = albumEditing === "feeling";
  albumFeelingBlock.classList.toggle("editing", isEditing);
  albumFeelingBlock.classList.toggle("inactive", albumEditing === "criteria");
  albumFeelingToggle.classList.toggle("active", isEditing);
  albumFeelingActions.hidden = !isEditing;
  albumFeelingSlider.disabled = !isEditing;

  const saved = albumNotation ? albumNotation.feeling : null;
  const shown = isEditing ? albumFeelingDraft : saved;
  albumFeelingValueEl.textContent = formatNum(shown);
  // En édition, on ne réassigne pas .value du slider en cours de drag
  // (cf. GAPS §11bis) — sa position est posée à l'ouverture / au reset.
  if (!isEditing) setSlider(albumFeelingSlider, shown ?? 0);

  if (isEditing) {
    const resetBtn = albumFeelingActions.querySelector('[data-action="reset"]');
    const saveBtn = albumFeelingActions.querySelector('[data-action="save"]');
    resetBtn.disabled = albumFeelingDraft == null;
    saveBtn.disabled = albumFeelingDraft == null || albumFeelingDraft === saved;
  }
}

function openAlbumFeelingEdit() {
  if (albumEditing === "criteria") closeAlbumCriteriaEdit();
  albumEditing = "feeling";
  albumFeelingDraft = albumNotation ? albumNotation.feeling : null;
  setSlider(albumFeelingSlider, albumFeelingDraft ?? 0);
  renderAlbumNotation();
}

function closeAlbumFeelingEdit() {
  if (albumEditing === "feeling") albumEditing = null;
  renderAlbumNotation();
}

albumFeelingToggle.addEventListener("click", () => {
  if (albumEditing !== "feeling") openAlbumFeelingEdit();
});

albumFeelingSlider.addEventListener("input", () => {
  albumFeelingDraft = Number(albumFeelingSlider.value);
  setSliderFill(albumFeelingSlider, albumFeelingDraft);
  renderAlbumFeeling();
});

albumFeelingActions.addEventListener("click", async (e) => {
  const action = e.target.dataset.action;
  if (!action) return;
  if (action === "reset") {
    albumFeelingDraft = null;
    setSlider(albumFeelingSlider, 0);
    renderAlbumFeeling();
  } else if (action === "cancel") {
    closeAlbumFeelingEdit();
  } else if (action === "save") {
    if (albumFeelingDraft == null) return;
    try {
      albumNotation = await api(`${albumApiBase()}/feeling`, "PUT", {
        value: albumFeelingDraft,
        total: albumTotalCount(),
        meta: albumSaveMeta(),
      });
      albumEditing = null;
      renderAlbumNotation();
    } catch (err) {
      showToast("Impossible d'enregistrer. Réessaie.");
    }
  }
});

// ----- NOTE PAR CRITÈRES ALBUM -----

function albumCriteriaDraftAvg() {
  return mean1(ALBUM_CRITERIA.map((n) => albumCriteriaDraft[n].value));
}

function albumDraftHasAnyValue() {
  return ALBUM_CRITERIA.some((n) => albumCriteriaDraft[n].value != null);
}

function albumDraftEqualsSaved() {
  return ALBUM_CRITERIA.every((n) => {
    const d = albumCriteriaDraft[n];
    if (d.value !== savedCritValue(n)) return false;
    // Un critère renseigné dont on a changé le statut hérité/manuel compte
    // comme une modification (impacte la resynchro future).
    if (d.value != null && d.manual !== savedCritManual(n)) return false;
    return true;
  });
}

function renderAlbumCriteria() {
  const isEditing = albumEditing === "criteria";
  albumCriteriaBlock.classList.toggle("editing", isEditing);
  albumCriteriaBlock.classList.toggle("inactive", albumEditing === "feeling");
  albumCriteriaToggle.classList.toggle("active", isEditing);
  albumCriteriaActions.hidden = !isEditing;
  albumInheritBtn.hidden = !isEditing;

  const src = (name) => (isEditing ? albumCriteriaDraft[name].value : savedCritValue(name));

  for (const name of ALBUM_CRITERIA) {
    const { slider, valueEl, revertBtn } = albumCritLines[name];
    const v = src(name);
    slider.disabled = !isEditing;
    valueEl.textContent = formatNum(v);
    // En édition : position posée par syncAlbumCriteriaSliders() (ouverture,
    // reset, inherit, revert) — pas ici, pour ne pas perturber un drag.
    if (!isEditing) setSlider(slider, v ?? 0);
    slider.classList.toggle("unset", isEditing && v == null);

    if (revertBtn) {
      // "Revenir à la valeur calculée" : critère hérité ajusté à la main,
      // et une moyenne morceaux existe pour ce critère.
      const showRevert =
        isEditing &&
        ALBUM_INHERITABLE.includes(name) &&
        albumCriteriaDraft[name].manual &&
        albumCriteriaDraft[name].value != null &&
        trackMean(name) != null;
      revertBtn.hidden = !showRevert;
    }
  }

  // Bouton "Calculer depuis les morceaux" : dispo si au moins un des 3
  // critères héritables a une moyenne morceaux. Le motif de désactivation est
  // dupliqué en texte visible (`album-inherit-hint`) : un `title` ne s'affiche
  // jamais au tap sur mobile (pas de survol), il resterait invisible là où
  // l'appli est surtout utilisée.
  const anyTrackMean = ALBUM_INHERITABLE.some((n) => trackMean(n) != null);
  albumInheritBtn.disabled = !anyTrackMean;
  const inheritHintText = anyTrackMean
    ? ""
    : "Aucun morceau de l'album n'a de note Performance / Texte / Production.";
  albumInheritBtn.title = inheritHintText;
  albumInheritHint.textContent = inheritHintText;
  albumInheritHint.hidden = !isEditing || !inheritHintText;

  const liveAvg = isEditing ? albumCriteriaDraftAvg() : (albumNotation ? albumNotation.criteriaRating : null);
  albumCriteriaValueEl.textContent = formatNum(liveAvg);
  setSlider(albumCriteriaSlider, liveAvg ?? 0);

  if (isEditing) {
    const resetBtn = albumCriteriaActions.querySelector('[data-action="reset"]');
    const saveBtn = albumCriteriaActions.querySelector('[data-action="save"]');
    // RÉINITIALISER remet toute la NOTE PAR CRITÈRES à vide : disponible dès
    // qu'au moins un critère a une valeur (héritée, manuelle ou mélange).
    resetBtn.disabled = !albumDraftHasAnyValue();
    // ENREGISTRER : dès que le brouillon diffère du dernier état enregistré
    // (y compris pour enregistrer un état entièrement vide après RÉINITIALISER).
    saveBtn.disabled = albumDraftEqualsSaved();
  }
}

function freshAlbumCriteriaDraft() {
  const d = {};
  for (const name of ALBUM_CRITERIA) {
    d[name] = { value: savedCritValue(name), manual: savedCritManual(name) };
  }
  return d;
}

function syncAlbumCriteriaSliders() {
  for (const name of ALBUM_CRITERIA) {
    setSlider(albumCritLines[name].slider, albumCriteriaDraft[name].value ?? 0);
  }
}

function openAlbumCriteriaEdit() {
  if (albumEditing === "feeling") closeAlbumFeelingEdit();
  albumEditing = "criteria";
  albumCriteriaDraft = freshAlbumCriteriaDraft();
  syncAlbumCriteriaSliders();
  renderAlbumNotation();
}

function closeAlbumCriteriaEdit() {
  if (albumEditing === "criteria") albumEditing = null;
  renderAlbumNotation();
}

albumCriteriaToggle.addEventListener("click", () => {
  if (albumEditing !== "criteria") openAlbumCriteriaEdit();
});

for (const name of ALBUM_CRITERIA) {
  const { slider, revertBtn } = albumCritLines[name];
  slider.addEventListener("input", () => {
    albumCriteriaDraft[name] = { value: Number(slider.value), manual: true };
    setSliderFill(slider, albumCriteriaDraft[name].value);
    renderAlbumCriteria();
  });
  if (revertBtn) {
    revertBtn.addEventListener("click", () => {
      const m = trackMean(name);
      if (m == null) return;
      albumCriteriaDraft[name] = { value: m, manual: false };
      setSlider(slider, m);
      renderAlbumCriteria();
    });
  }
}

albumInheritBtn.addEventListener("click", () => {
  const targets = ALBUM_INHERITABLE.filter((n) => trackMean(n) != null);
  if (!targets.length) return;

  const clash = targets.filter(
    (n) => albumCriteriaDraft[n].manual && albumCriteriaDraft[n].value != null
  );
  if (clash.length) {
    const names = clash.map((n) => ALBUM_CRIT_LABEL[n]).join(", ");
    if (!confirm(`Remplacer tes valeurs manuelles (${names}) par la moyenne de tes morceaux ?`)) {
      return;
    }
  }
  for (const n of targets) {
    albumCriteriaDraft[n] = { value: trackMean(n), manual: false };
  }
  syncAlbumCriteriaSliders();
  renderAlbumCriteria();
});

albumCriteriaActions.addEventListener("click", async (e) => {
  const action = e.target.dataset.action;
  if (!action) return;

  if (action === "reset") {
    // Remet TOUTE la NOTE PAR CRITÈRES à vide (les 5 critères), y compris les
    // valeurs héritées — qui ne doivent pas réapparaître automatiquement.
    // Reste en édition, aucune sauvegarde immédiate.
    for (const name of ALBUM_CRITERIA) {
      albumCriteriaDraft[name] = { value: null, manual: false };
    }
    syncAlbumCriteriaSliders();
    renderAlbumCriteria();
  } else if (action === "cancel") {
    closeAlbumCriteriaEdit();
  } else if (action === "save") {
    if (albumDraftEqualsSaved()) return;
    const criteria = {};
    for (const name of ALBUM_CRITERIA) {
      const { value, manual } = albumCriteriaDraft[name];
      if (value != null) criteria[name] = { value, manual };
    }
    try {
      albumNotation = await api(`${albumApiBase()}/criteria`, "PUT", {
        criteria,
        total: albumTotalCount(),
        meta: albumSaveMeta(),
      });
      albumEditing = null;
      renderAlbumNotation();
    } catch (err) {
      showToast("Impossible d'enregistrer les critères. Réessaie.");
    }
  }
});

// ----- Toggle MORCEAUX -----

function renderAlbumMorceauxToggle() {
  const m = albumNotation ? albumNotation.morceaux : null;
  const show = !!(m && m.eligible);
  albumMorceauxRow.hidden = !show;
  if (!show) return;

  albumMorceauxCheck.checked = m.included;
  albumMorceauxRow.classList.remove("is-locked");
  albumMorceauxCheck.disabled = false;
  albumMorceauxNote.textContent = m.included
    ? `${m.ratedCount}/${m.totalCount} morceaux notés — couverture ${pct(m.coverage)}. Poids ${pct(
        (1 / 3) * m.coverage
      )} dans la NOTE GLOBALE.`
    : "Exclue de la NOTE GLOBALE par ton choix.";
}

albumMorceauxCheck.addEventListener("change", async () => {
  const value = albumMorceauxCheck.checked;
  try {
    albumNotation = await api(`${albumApiBase()}/morceaux`, "PUT", {
      value,
      total: albumTotalCount(),
      meta: albumSaveMeta(),
    });
    renderAlbumNotation();
  } catch (err) {
    albumMorceauxCheck.checked = !value;
    showToast("Impossible de modifier ce réglage. Réessaie.");
  }
});

async function openAlbum(album) {
  // Mode "album" : en-tête riche (pochette + méta + actions), pas le titre simple.
  albumHeader.hidden = false;
  albumSticky.hidden = false;
  hideAlbumPopup();
  drilldownTitle.hidden = true;
  currentAlbum = null;
  currentAlbumTracks = [];
  albumTitleEl.textContent = album.title || "—";
  albumStickyTitle.textContent = album.title || "—";
  setStickyCollapsed(albumSticky, albumStickyTitle, false);
  albumArtistEl.textContent = album.artist || "—";
  albumArtistEl.classList.toggle("linkable", !!album.artist && album.artist !== "Artiste inconnu");
  albumYearEl.textContent = "";
  albumYearEl.hidden = true;
  setCoverArt(albumCoverArt, null);
  renderAlbumLike(false);
  wireDeezerButton(albumPlayBtn, {}, "▶ Écouter");
  albumNotation = null;
  albumEditing = null;
  albumCardForced = false;
  renderAlbumNotation();
  rateTracksBtn.disabled = true;
  drilldownResults.className = "search-results";
  drilldownResults.innerHTML = "";
  setDrilldownStatus("Chargement…");
  showDrilldownView();

  try {
    // Ouverture par release (recherche / fiche) ou par release-group (discographie artiste).
    const qs = album.mbid
      ? `mbid=${encodeURIComponent(album.mbid)}`
      : `rg=${encodeURIComponent(album.releaseGroupMbid)}`;
    const data = await api(`/api/album-tracks?${qs}`, "GET");
    const tracks = data.tracks || [];
    setDrilldownStatus(null);

    const artistName = data.artist || album.artist || "";
    const year = (data.date || album.date || "").slice(0, 4);

    currentAlbum = {
      mbid: data.releaseMbid || album.mbid,
      title: data.title || album.title || "",
      artist: artistName,
      year,
    };
    currentAlbumTracks = tracks;

    albumTitleEl.textContent = currentAlbum.title || "—";
    albumStickyTitle.textContent = [currentAlbum.title, artistName].filter(Boolean).join(" · ") || "—";
    albumArtistEl.textContent = artistName || "Artiste inconnu";
    albumArtistEl.classList.toggle("linkable", !!artistName && artistName !== "Artiste inconnu");
    albumYearEl.textContent = year || "";
    albumYearEl.hidden = !year;
    renderAlbumLike(data.isLiked);
    loadAlbumNotation();
    rateTracksBtn.disabled = tracks.length === 0;
    loadCoverInto(albumCoverArt, {
      releaseMbid: currentAlbum.mbid || "",
      artist: artistName || "",
      album: currentAlbum.title || "",
    });
    wireDeezerButton(
      albumPlayBtn,
      { type: "album", mbid: currentAlbum.mbid, title: currentAlbum.title, artist: artistName },
      "▶ Écouter"
    );

    drilldownResults.innerHTML = "";
    if (tracks.length === 0) {
      drilldownResults.className = "search-results";
      const li = document.createElement("li");
      li.className = "search-empty";
      li.textContent = "Aucun morceau trouvé pour cet album.";
      drilldownResults.appendChild(li);
    } else {
      drilldownResults.className = "tracklist";
      tracks.forEach((r, index) => {
        drilldownResults.appendChild(createTracklistRow(r, { tracks, index }));
      });
    }
  } catch (err) {
    setDrilldownStatus("Impossible de charger cet album. Réessaie.");
  }
}

// --- Vue artiste (en-tête + MA NOTATION + discographie + meilleurs titres) ---

const ARTIST_NOTE_HELP = {
  "artist-note-tracks": "Moyenne des notes de tous les morceaux notés de cet artiste, tous albums confondus.",
  "artist-note-feeling": "Ta note instinctive pour cet artiste dans son ensemble — bientôt disponible.",
  "artist-note-criteria": "Ta note calculée sur les critères de l'artiste — bientôt disponible.",
  "artist-note-global": "Moyenne de tes notes disponibles pour cet artiste (morceaux, feeling, critères).",
};
for (const [id, msg] of Object.entries(ARTIST_NOTE_HELP)) {
  el(id).addEventListener("click", () => artistPopupCtl.show(msg));
}
el("artist-classic-btn").addEventListener("click", () => artistPopupCtl.show("Bientôt disponible."));

function renderArtistLike(isLiked) {
  artistLikeBtn.classList.toggle("liked", !!isLiked);
  artistLikeBtn.textContent = isLiked ? "♥" : "♡";
}

function renderArtistNotation(topTracks) {
  // Notation morceaux = moyenne des NOTE GLOBALE des morceaux notés de l'artiste.
  const notes = computeAlbumNotes(topTracks); // même logique que l'album
  setAlbumNote(artistNoteTracks, notes.tracks);
  setAlbumNote(artistNoteFeeling, notes.feeling);
  setAlbumNote(artistNoteCriteria, notes.criteria);
  setAlbumNote(artistNoteGlobal, notes.global);
}

// Ligne de discographie : titre de l'album, année (+ type si ≠ Album), note.
function createDiscographyRow(album) {
  const li = document.createElement("li");
  li.className = "tracklist-row";

  const titleEl = document.createElement("span");
  titleEl.className = "tracklist-title";
  titleEl.textContent = album.title;
  li.appendChild(titleEl);

  const metaEl = document.createElement("span");
  metaEl.className = "tracklist-duration";
  const metaParts = [];
  if (album.date) metaParts.push(album.date.slice(0, 4));
  if (album.primaryType && album.primaryType !== "Album") metaParts.push(album.primaryType);
  metaEl.textContent = metaParts.join(" · ");
  li.appendChild(metaEl);

  const ratingEl = document.createElement("span");
  ratingEl.className = "tracklist-rating";
  ratingEl.textContent = formatNum(album.note);
  li.appendChild(ratingEl);

  li.addEventListener("click", () =>
    openAlbum({
      releaseGroupMbid: album.releaseGroupMbid,
      title: album.title,
      artist: currentArtist ? currentArtist.name : "",
      date: album.date,
    })
  );
  return li;
}

// Ligne "meilleurs titres" : titre du morceau, album, NOTE GLOBALE (toujours renseignée).
function createArtistTopTrackRow(r) {
  const li = document.createElement("li");
  li.className = "tracklist-row";

  const titleEl = document.createElement("span");
  titleEl.className = "tracklist-title";
  titleEl.textContent = r.title;
  li.appendChild(titleEl);

  const metaEl = document.createElement("span");
  metaEl.className = "tracklist-duration";
  metaEl.textContent = r.albumTitle || "";
  li.appendChild(metaEl);

  const ratingEl = document.createElement("span");
  ratingEl.className = "tracklist-rating";
  ratingEl.textContent = formatNum(r.globalRating);
  li.appendChild(ratingEl);

  li.addEventListener("click", async () => {
    setArtistStatus("Chargement…");
    try {
      const context = await buildAlbumContextFor(r);
      await loadTrack(r.mbid, r, context);
      setArtistStatus(null);
    } catch (err) {
      setArtistStatus("Impossible de charger ce morceau. Réessaie.");
    }
  });
  return li;
}

function setArtistStatus(message) {
  artistStatus.hidden = !message;
  artistStatus.textContent = message || "";
}

async function openArtist(artist) {
  currentArtist = { mbid: artist.mbid, name: artist.name };
  currentAlbum = null;
  currentAlbumTracks = [];
  artistPopupCtl.hide();

  artistNameEl.textContent = artist.name;
  artistStickyTitle.textContent = artist.name;
  setStickyCollapsed(artistSticky, artistStickyTitle, false);
  artistTagsEl.hidden = true;
  artistTagsEl.textContent = "";
  setCoverArt(artistCoverArt, null);
  renderArtistLike(false);
  wireDeezerButton(artistPlayBtn, {}, "▶ Écouter");
  renderArtistNotation([]);
  artistDiscographyEl.innerHTML = "";
  artistTopTracksEl.innerHTML = "";
  setArtistStatus("Chargement…");
  showArtistView();

  try {
    const data = await api(`/api/artist?mbid=${encodeURIComponent(artist.mbid)}`, "GET");
    setArtistStatus(null);

    currentArtist = { mbid: data.mbid, name: data.name };
    artistNameEl.textContent = data.name;
    artistStickyTitle.textContent = data.name;
    artistTagsEl.textContent = (data.tags || []).join(" · ");
    artistTagsEl.hidden = !(data.tags && data.tags.length);
    renderArtistLike(data.isLiked);
    loadCoverInto(artistCoverArt, { type: "artist", artist: data.name || "" });
    wireDeezerButton(
      artistPlayBtn,
      { type: "artist", mbid: data.mbid, title: data.name, artist: data.name },
      "▶ Écouter"
    );

    const topTracks = data.topTracks || [];
    renderArtistNotation(topTracks);

    // Discographie
    const discography = data.discography || [];
    if (discography.length === 0) {
      const li = document.createElement("li");
      li.className = "search-empty";
      li.textContent = "Aucun album trouvé pour cet artiste.";
      artistDiscographyEl.appendChild(li);
    } else {
      discography.forEach((a) => artistDiscographyEl.appendChild(createDiscographyRow(a)));
    }

    // Meilleurs titres (uniquement les morceaux notés)
    if (topTracks.length === 0) {
      const li = document.createElement("li");
      li.className = "search-empty";
      li.textContent = "Pas encore de morceau noté pour cet artiste.";
      artistTopTracksEl.appendChild(li);
    } else {
      topTracks.forEach((r) => artistTopTracksEl.appendChild(createArtistTopTrackRow(r)));
    }
  } catch (err) {
    setArtistStatus("Impossible de charger cet artiste. Réessaie.");
  }
}

artistLikeBtn.addEventListener("click", async () => {
  if (!currentArtist) return;
  const next = !artistLikeBtn.classList.contains("liked");
  renderArtistLike(next); // optimiste
  try {
    await api(`/api/tracks/${encodeURIComponent(currentArtist.mbid)}/like`, "PUT", {
      value: next,
      meta: { title: currentArtist.name, artist: currentArtist.name, album: currentArtist.name },
    });
  } catch (err) {
    renderArtistLike(!next);
    showToast("Impossible de modifier « J'aime ».");
  }
});

backFromArtistBtn.addEventListener("click", showSearchView);
backFromDrilldownBtn.addEventListener("click", showSearchView);

// Charge un morceau (le crée s'il n'existe pas encore) et bascule sur sa
// fiche. `meta` sert uniquement à la création si la ligne n'existe pas
// déjà en base (résultat de recherche) ; inutile si le morceau vient de
// "Mes notations" (la ligne existe forcément déjà). `context` (optionnel)
// = { tracks, index } pour activer Précédent/Suivant sur cette fiche.
async function loadTrack(mbid, meta = {}, context = null) {
  const params = new URLSearchParams({
    title: meta.title || "",
    artist: meta.artist || "",
    album: meta.album || "",
    date: meta.date || "",
    durationMs: meta.durationMs || "",
    releaseMbid: meta.releaseMbid || "",
  });

  track = await api(`/api/tracks/${encodeURIComponent(mbid)}?${params.toString()}`, "GET");
  albumContext = context;
  editing = null;
  feelingDraft = null;
  criteriaDraft = { performance: null, texte: null, production: null };
  render();
  showTrackView();
  loadCoverInto(trackCoverArt, {
    releaseMbid: track.releaseMbid || "",
    artist: track.artist || "",
    album: track.albumTitle || "",
  });
  wireTrackDeezer(track.mbid, track.title, track.artist);
}

async function selectTrack(result, context = null) {
  setSearchStatus("Chargement…");
  try {
    await loadTrack(result.mbid, result, context);
    setSearchStatus(null);
  } catch (err) {
    setSearchStatus("Impossible de charger ce morceau. Réessaie.");
  }
}

// --- Précédent / Suivant (contexte album) ---

async function goToAdjacentTrack(offset) {
  if (!albumContext) return;
  const { tracks, index } = albumContext;
  const newIndex = index + offset;
  if (newIndex < 0 || newIndex >= tracks.length) return;

  const nextTrack = tracks[newIndex];
  try {
    await loadTrack(nextTrack.mbid, nextTrack, { tracks, index: newIndex });
  } catch (err) {
    // Navigation silencieuse : en cas d'échec, on reste sur le morceau actuel.
  }
}

// Swipe tactile sur toute la fiche, SAUF les sliders de notation (un
// glissement sur un slider doit régler sa valeur, pas naviguer). Swipe
// gauche = suivant, swipe droite = précédent.
(function setupSwipeNavigation(target) {
  const MIN_DISTANCE = 60; // px, en dessous on ignore (tap accidentel)
  let startX = 0;
  let startY = 0;
  let tracking = false;

  target.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      if (e.target.closest('input[type="range"]')) return; // laisse le slider gérer son propre geste
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
    },
    { passive: true }
  );

  target.addEventListener(
    "touchend",
    (e) => {
      if (!tracking) return;
      tracking = false;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (Math.abs(deltaX) < MIN_DISTANCE) return;
      if (Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return; // trop vertical : probablement un scroll

      goToAdjacentTrack(deltaX < 0 ? 1 : -1);
    },
    { passive: true }
  );

  target.addEventListener(
    "touchcancel",
    () => {
      tracking = false;
    },
    { passive: true }
  );
})(trackView);

prevTrackBtn.addEventListener("click", () => goToAdjacentTrack(-1));
nextTrackBtn.addEventListener("click", () => goToAdjacentTrack(1));

// Si ce morceau a été noté depuis la tracklist d'un album (releaseMbid
// connu), on va rechercher cette tracklist pour retrouver sa position et
// réactiver Précédent/Suivant. Best-effort : en cas d'échec, la fiche
// s'affiche quand même, juste sans navigation.
async function buildAlbumContextFor(result) {
  if (!result.releaseMbid) return null;
  try {
    const albumData = await api(`/api/album-tracks?mbid=${encodeURIComponent(result.releaseMbid)}`, "GET");
    const tracks = albumData.tracks || [];
    const index = tracks.findIndex((t) => t.mbid === result.mbid);
    if (index === -1) return null;
    return { tracks, index };
  } catch (err) {
    return null;
  }
}

async function openMyRating(result) {
  setMyRatingsStatus("Chargement…");
  try {
    const context = await buildAlbumContextFor(result);
    await loadTrack(result.mbid, result, context);
    setMyRatingsStatus(null);
  } catch (err) {
    setMyRatingsStatus("Impossible de charger ce morceau. Réessaie.");
  }
}

searchBtn.addEventListener("click", runSearch);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

// --- Mes notations ---

function setMyRatingsStatus(message) {
  if (!message) {
    myRatingsStatus.hidden = true;
    myRatingsStatus.textContent = "";
    return;
  }
  myRatingsStatus.hidden = false;
  myRatingsStatus.textContent = message;
}

function renderMyRatings(results) {
  myRatingsResults.innerHTML = "";

  if (results.length === 0) {
    setMyRatingsStatus("Aucun morceau noté pour l'instant.");
    return;
  }
  setMyRatingsStatus(null);

  for (const r of results) {
    const li = document.createElement("li");
    li.className = "search-result";

    const infoEl = document.createElement("div");
    infoEl.className = "search-result-info";

    const titleEl = document.createElement("div");
    titleEl.className = "search-result-title";
    titleEl.textContent = r.isClassic ? `${r.title} ★` : r.title;

    const metaEl = document.createElement("div");
    metaEl.className = "search-result-meta";
    const metaParts = [r.artist];
    if (r.albumTitle) metaParts.push(r.albumTitle);
    metaEl.textContent = metaParts.join(" — ");

    infoEl.appendChild(titleEl);
    infoEl.appendChild(metaEl);

    const ratingEl = document.createElement("div");
    ratingEl.className = "search-result-rating";
    ratingEl.textContent = r.globalRating != null ? `${formatNum(r.globalRating)}/10` : "—";

    li.appendChild(infoEl);
    li.appendChild(ratingEl);
    li.addEventListener("click", () => openMyRating(r));
    myRatingsResults.appendChild(li);
  }
}

async function loadMyRatings() {
  setMyRatingsStatus("Chargement…");
  myRatingsResults.innerHTML = "";
  try {
    const data = await api("/api/my-ratings", "GET");
    renderMyRatings(data.results || []);
  } catch (err) {
    setMyRatingsStatus("Impossible de charger tes notations. Réessaie.");
  }
}

// --- Profil : porte d'entrée (mode pseudo / mode admin) + Réglages ---

const profileGate = el("profile-gate");
const gateNormal = el("gate-normal");
const gateAdmin = el("gate-admin");
const profileGateInput = el("profile-gate-input");
profileGateInput.maxLength = PROFILE_MAX_LENGTH; // synchronisé avec normalizeProfile ci-dessus
const profileGateSubmit = el("profile-gate-submit");
const profileGateError = el("profile-gate-error");
const gateAdminLink = el("gate-admin-link");
const gateAdminPassword = el("gate-admin-password");
const gateAdminSubmit = el("gate-admin-submit");
const gateAdminBack = el("gate-admin-back");
const gateAdminError = el("gate-admin-error");

const settingsRoleEl = el("settings-role");
const adminSwitchEl = el("admin-switch");
const adminSwitchInput = el("admin-switch-input");
adminSwitchInput.maxLength = PROFILE_MAX_LENGTH;
const adminSwitchBtn = el("admin-switch-btn");
const logoutBtn = el("logout-btn");
const settingsHintNormal = el("settings-hint-normal");
const settingsHintAdmin = el("settings-hint-admin");

function showGateMode(mode) {
  gateNormal.hidden = mode !== "normal";
  gateAdmin.hidden = mode !== "admin";
}

function showProfileGate(mode = "normal") {
  profileGateInput.value = "";
  gateAdminPassword.value = "";
  profileGateError.hidden = true;
  gateAdminError.hidden = true;
  gateAdminLink.hidden = !appConfig.adminEnabled;
  showGateMode(mode);
  profileGate.hidden = false;
  setTimeout(() => {
    (mode === "admin" ? gateAdminPassword : profileGateInput).focus();
  }, 50);
}

function submitProfile() {
  const val = normalizeProfile(profileGateInput.value);
  if (!val) {
    profileGateError.textContent = "Entre un pseudo pour continuer.";
    profileGateError.hidden = false;
    return;
  }
  if (isReservedName(val)) {
    profileGateError.textContent = "Ce pseudo est réservé. Connecte-toi comme administrateur.";
    profileGateError.hidden = false;
    return;
  }
  profile = val;
  storeLocal(PROFILE_KEY, val);
  profileGate.hidden = true;
  startApp();
}

async function submitAdmin() {
  const pw = gateAdminPassword.value;
  if (!pw) {
    gateAdminError.textContent = "Entre le mot de passe.";
    gateAdminError.hidden = false;
    return;
  }
  try {
    const { token } = await api("/api/admin/login", "POST", { password: pw });
    adminToken = token;
    storeLocal(ADMIN_TOKEN_KEY, token);
    profile = appConfig.reservedProfiles[0] || normalizeProfile(profile) || "Don";
    storeLocal(PROFILE_KEY, profile);
    profileGate.hidden = true;
    startApp();
  } catch {
    gateAdminError.textContent = "Mot de passe incorrect.";
    gateAdminError.hidden = false;
  }
}

profileGateSubmit.addEventListener("click", submitProfile);
profileGateInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitProfile();
});
gateAdminLink.addEventListener("click", () => showProfileGate("admin"));
gateAdminBack.addEventListener("click", () => showProfileGate("normal"));
gateAdminSubmit.addEventListener("click", submitAdmin);
gateAdminPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitAdmin();
});

// Réglages : affichage selon le rôle.
function refreshProfileUI() {
  const isAdmin = !!adminToken;
  const nameEl = el("settings-profile-name");
  if (nameEl) nameEl.textContent = profile || "—";
  if (settingsRoleEl) settingsRoleEl.hidden = !isAdmin;
  if (adminSwitchEl) adminSwitchEl.hidden = !isAdmin;
  if (settingsHintNormal) settingsHintNormal.hidden = isAdmin;
  if (settingsHintAdmin) settingsHintAdmin.hidden = !isAdmin;
}

adminSwitchBtn.addEventListener("click", () => {
  const val = normalizeProfile(adminSwitchInput.value);
  if (!val) return;
  profile = val;
  storeLocal(PROFILE_KEY, val);
  adminSwitchInput.value = "";
  refreshProfileUI();
  showToast(`Profil : ${val}`);
  showSearchView();
});
adminSwitchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") adminSwitchBtn.click();
});

// Déconnexion : normal → efface le pseudo ; admin → efface aussi le jeton.
// Dans les deux cas, retour à l'écran de connexion, aucune notation supprimée.
logoutBtn.addEventListener("click", () => {
  adminToken = null;
  profile = null;
  storeLocal(ADMIN_TOKEN_KEY, null);
  storeLocal(PROFILE_KEY, null);
  showProfileGate("normal");
});

// --- Démarrage : on récupère la config (mode admin ?), on valide un éventuel
// jeton admin mémorisé, puis on ouvre l'appli ou la porte d'entrée. ---

function startApp() {
  refreshProfileUI();
  showSearchView();
}

async function boot() {
  let configOk = true;
  try {
    appConfig = await api("/api/config", "GET");
  } catch {
    configOk = false;
    appConfig = { adminEnabled: false, reservedProfiles: [] };
  }

  if (adminToken) {
    let valid = false;
    try {
      valid = (await api("/api/admin/check", "GET")).admin === true;
    } catch {
      valid = false;
    }
    if (!valid) {
      adminToken = null;
      storeLocal(ADMIN_TOKEN_KEY, null);
    }
  }

  // /api/config a échoué (réseau) et on ne peut pas vérifier si le pseudo
  // mémorisé est réservé : mieux vaut repasser par la porte d'entrée que de
  // démarrer à l'aveugle sur un profil qui pourrait être bloqué en 403
  // partout, sans un seul indice pour l'utilisateur.
  if (!configOk && profile && !adminToken) {
    showToast("Connexion au serveur impossible. Réessaie.");
    showProfileGate("normal");
    return;
  }

  // Profil réservé sans jeton admin valide → on repasse par la porte d'entrée.
  if (profile && isReservedName(profile) && !adminToken) {
    profile = null;
    storeLocal(PROFILE_KEY, null);
  }

  if (profile) startApp();
  else showProfileGate("normal");
}

boot();
