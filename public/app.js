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
const resultsList = el("results-list");
const catTracks = el("cat-tracks");
const catAlbums = el("cat-albums");
const catArtists = el("cat-artists");

const drilldownView = el("drilldown-view");
const drilldownTitle = el("drilldown-title");
const drilldownStatus = el("drilldown-status");
const drilldownResults = el("drilldown-results");
const backFromDrilldownBtn = el("back-from-drilldown");

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

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 2200);
}

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

// --- Recherche ---

const ALL_VIEWS = [homeView, searchView, drilldownView, myRatingsView, settingsView, trackView];

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
  // Le drill-down (tracklist d'un album/artiste) n'est accessible que
  // depuis la recherche : on reste dans la section "Recherche".
  currentSection = "search";
  updateTabBar();
  showOnly(drilldownView);
}

tabHome.addEventListener("click", showHomeView);
tabSettings.addEventListener("click", showSettingsView);
tabSearch.addEventListener("click", showSearchView);
tabMyRatings.addEventListener("click", () => {
  showMyRatingsView();
  loadMyRatings();
});

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

function createAlbumResultItem(a) {
  const parts = [a.artist];
  if (a.date) parts.push(a.date.slice(0, 4));
  return buildResultItem(a.title, parts.join(" — "), () => openAlbum(a));
}

function createArtistResultItem(a) {
  const meta = [a.type, a.country].filter(Boolean).join(" — ") || "Artiste";
  return buildResultItem(a.name, meta, () => openArtist(a));
}

function renderCategory(container, items, createItemFn, emptyMessage) {
  container.innerHTML = "";
  if (items.length === 0) {
    const li = document.createElement("li");
    li.className = "search-empty";
    li.textContent = emptyMessage;
    container.appendChild(li);
    return;
  }
  for (const item of items) {
    container.appendChild(createItemFn(item));
  }
}

// Une seule catégorie affichée à la fois (onglets Morceaux/Album/Artiste) ;
// les 3 résultats sont conservés en mémoire pour basculer sans refaire de
// recherche.
let currentCategory = "tracks";
let lastSearchData = { tracks: [], albums: [], artists: [] };

const CATEGORY_CONFIG = {
  tracks: { create: () => createTrackResultItem, empty: "Aucun morceau trouvé." },
  albums: { create: () => createAlbumResultItem, empty: "Aucun album trouvé." },
  artists: { create: () => createArtistResultItem, empty: "Aucun artiste trouvé." },
};

function renderCurrentCategory() {
  const { create, empty } = CATEGORY_CONFIG[currentCategory];
  renderCategory(resultsList, lastSearchData[currentCategory], create(), empty);
}

function setCategory(category) {
  currentCategory = category;
  catTracks.classList.toggle("active", category === "tracks");
  catAlbums.classList.toggle("active", category === "albums");
  catArtists.classList.toggle("active", category === "artists");
  renderCurrentCategory();
}

catTracks.addEventListener("click", () => setCategory("tracks"));
catAlbums.addEventListener("click", () => setCategory("albums"));
catArtists.addEventListener("click", () => setCategory("artists"));

async function runSearch() {
  const q = searchInput.value.trim();
  if (!q) return;

  setSearchStatus("Recherche en cours…");
  resultsList.innerHTML = "";

  try {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}`, "GET");
    lastSearchData = { tracks: data.tracks || [], albums: data.albums || [], artists: data.artists || [] };
    setSearchStatus(null);
    renderCurrentCategory();
  } catch (err) {
    setSearchStatus("Recherche indisponible. Réessaie.");
  }
}

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

async function openAlbum(album) {
  drilldownTitle.textContent = album.title;
  drilldownResults.innerHTML = "";
  setDrilldownStatus("Chargement…");
  showDrilldownView();

  try {
    const data = await api(`/api/album-tracks?mbid=${encodeURIComponent(album.mbid)}`, "GET");
    const tracks = data.tracks || [];
    setDrilldownStatus(null);
    drilldownResults.innerHTML = "";
    if (tracks.length === 0) {
      const li = document.createElement("li");
      li.className = "search-empty";
      li.textContent = "Aucun morceau trouvé pour cet album.";
      drilldownResults.appendChild(li);
    } else {
      tracks.forEach((r, index) => {
        drilldownResults.appendChild(createTrackResultItem(r, { tracks, index }));
      });
    }
  } catch (err) {
    setDrilldownStatus("Impossible de charger cet album. Réessaie.");
  }
}

async function openArtist(artist) {
  drilldownTitle.textContent = artist.name;
  drilldownResults.innerHTML = "";
  setDrilldownStatus("Chargement…");
  showDrilldownView();

  try {
    const data = await api(
      `/api/artist-tracks?mbid=${encodeURIComponent(artist.mbid)}&name=${encodeURIComponent(artist.name)}`,
      "GET"
    );
    setDrilldownStatus(null);
    renderCategory(drilldownResults, data.tracks || [], createTrackResultItem, "Aucun morceau trouvé pour cet artiste.");
  } catch (err) {
    setDrilldownStatus("Impossible de charger cet artiste. Réessaie.");
  }
}

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
