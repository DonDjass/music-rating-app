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

const albumNotation = el("album-notation");
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
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
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

const albumPopupCtl = makePopup(albumPopup, albumPopupText, albumNotation);
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

// "Noter l'album" : pas encore développé — bouton visuellement désactivé,
// message explicite pour ne pas passer pour un bug.
rateAlbumBtn.addEventListener("click", () => {
  showAlbumPopup("La notation d'album n'est pas encore disponible.");
});

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

function setAlbumNote(elm, value) {
  elm.textContent = albumNoteText(value);
  elm.classList.toggle("has-value", value != null);
}

// Notation morceaux = moyenne des NOTE GLOBALE des morceaux déjà notés
// (globalRating != null <=> feeling ou critères renseigné, cf. serveur).
// feeling / critères album : pas encore développés -> null.
// Note globale album = moyenne des 3, en excluant les non renseignées.
function computeAlbumNotes(tracks) {
  const tracksNote = mean1(tracks.map((t) => t.globalRating));
  const feelingNote = null;
  const criteriaNote = null;
  const globalNote = mean1([tracksNote, feelingNote, criteriaNote]);
  return { tracks: tracksNote, feeling: feelingNote, criteria: criteriaNote, global: globalNote };
}

function renderAlbumNotation(tracks) {
  const notes = computeAlbumNotes(tracks);
  setAlbumNote(albumNoteTracks, notes.tracks);
  setAlbumNote(albumNoteFeeling, notes.feeling);
  setAlbumNote(albumNoteCriteria, notes.criteria);
  setAlbumNote(albumNoteGlobal, notes.global);
}

const ALBUM_NOTE_HELP = {
  "album-note-tracks": "Moyenne des notes de tous les morceaux de cet album que tu as déjà notés.",
  "album-note-feeling": "Ta note instinctive pour l'album dans son ensemble — bientôt disponible.",
  "album-note-criteria": "Ta note calculée sur les critères de l'album — bientôt disponible.",
  "album-note-global": "Moyenne de tes notes disponibles pour cet album (morceaux, feeling, critères).",
};

for (const [id, msg] of Object.entries(ALBUM_NOTE_HELP)) {
  el(id).addEventListener("click", () => showAlbumPopup(msg));
}

// "Classic" album : affichage seul pour l'instant (pas de support serveur).
el("album-classic-btn").addEventListener("click", () => showAlbumPopup("Bientôt disponible."));

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
  renderAlbumNotation([]);
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
    renderAlbumNotation(tracks);
    rateTracksBtn.disabled = tracks.length === 0;
    loadCoverInto(albumCoverArt, {
      releaseMbid: currentAlbum.mbid || "",
      artist: artistName || "",
      album: currentAlbum.title || "",
    });

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

// --- Démarrage : on commence toujours sur l'écran de recherche ---

showSearchView();
