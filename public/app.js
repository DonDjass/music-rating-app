// Écran de notation d'un morceau (GD-00002) — logique simplifiée v1.

let track = null; // dernier état enregistré, renvoyé par le serveur
let editing = null; // 'feeling' | 'criteria' | null

let feelingDraft = null; // valeur en cours d'édition (nombre ou null)
let criteriaDraft = { performance: null, texte: null, production: null };

const el = (id) => document.getElementById(id);

const trackTitleEl = el("track-title");
const trackArtistEl = el("track-artist");
const trackAlbumEl = el("track-album");
const trackTagsEl = el("track-tags");

const classicBtn = el("classic-btn");
const classicStarEl = el("classic-star");
const globalValueEl = el("global-value");
const likeBtn = el("like-btn");

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
    track = await api("/api/track/feeling", "PUT", { value: feelingDraft });
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
    track = await api("/api/track/criteria", "PUT", { performance, texte, production });
    closeCriteriaEdit();
    render();
  }
});

// --- Statut Classic ---

classicBtn.addEventListener("click", async () => {
  const nextValue = !track.isClassic;
  try {
    track = await api("/api/track/classic", "PUT", { value: nextValue });
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
    track = await api("/api/track/like", "PUT", { value: nextValue });
    render();
  } catch (err) {
    // Pas de retour utilisateur dédié pour l'instant (hors périmètre GD-00002).
  }
});

// --- Chargement initial ---

async function init() {
  track = await api("/api/track", "GET");
  render();
}

init();
