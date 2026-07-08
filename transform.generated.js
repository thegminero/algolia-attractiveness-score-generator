// ---------------------------------------------------------------------------
// Attractiveness / Purchase-likelihood scoring transform
//
// THIS FILE IS A TEMPLATE — do not run it directly.
// Run `node generator/generate.js ...` to produce transform.generated.js.
//
// The GENERATED_CONFIG block (delimited by the START/END comment markers below)
// is replaced automatically each time the generator runs.  Edit everything
// outside that block freely — those edits are preserved across re-runs.
// ---------------------------------------------------------------------------

/*__GENERATED_CONFIG_START__*/
// Generated: 2026-07-08T14:57:45.663Z
// Index:     magento2_production_fr_products
// Period:    2026-06-07 → 2026-07-07
// Re-run:    node generator/generate.js --app-id <APP_ID> --index magento2_production_fr_products --start-date 2026-06-07 --end-date 2026-07-07 --field-map <path/to/client.field-map.json> [--sample-record <path/to/records.json>]
//
// Everything between the START/END markers is overwritten on each generator run.
// Make your permanent changes OUTSIDE these markers or in generator/template.js.

const POPULAR_VALUES = {
  "categories.level2": [
    "outils électriques /// pièces, kits et accessoires d'outils électriques /// kits de combinaison d'outils électriques",
    "abrasifs /// coupure et meulage /// disques à tronçonner et meules",
    "outils électriques /// outils électriques de coupe et de formage /// coupe-boulons électriques, câbles et tuyaux",
    "outils électriques /// pièces, kits et accessoires d'outils électriques /// batteries pour outils sans fil",
    "outils de coupe et travail des métaux /// perçage /// forets",
    "outils manuels /// pinces /// pinces de préhension",
    "électrique /// connecteurs de câblage /// accessoires pour borniers",
    "éclairage portatif et lampes de poche /// lampes de poche /// lampes de poche rechargeables",
    "tuyaux, tubes et raccords /// raccords pour tuyaux et tubes /// accouplements universels (chicago)",
    "manutention, stockage et câblage /// accessoires de levage sous le crochet /// pinces de levage pour plaques et poutres",
    "outils électriques /// outils électriques de perçage et de fixation /// perceuses électriques",
    "outils électriques /// préparation de surface et finition des outils électriques /// meuleuses et ponceuses électriques",
    "outils électriques /// outils électriques de perçage et de fixation /// boulonneuses électriques",
    "santé & sécurité /// équipement de protection individuelle (epi) /// casques durs et protection de la tête",
    "lubrifiants et liquides de refroidissement /// raccords de graissage et accessoires /// raccords et adaptateurs de graissage",
    "manutention, stockage et câblage /// élingues /// élingues web",
    "santé & sécurité /// équipement de protection individuelle (epi) /// protection des yeux et du visage",
    "outils de coupe et travail des métaux /// filetage /// matrice, porte-filières et peignes",
    "santé & sécurité /// équipement de protection individuelle (epi) /// gants et protection des mains/bras",
    "batteries et accessoires /// batteries /// batteries à lithium"
  ],
  "categories.level1": [
    "outils électriques /// pièces, kits et accessoires d'outils électriques",
    "santé & sécurité /// équipement de protection individuelle (epi)",
    "abrasifs /// coupure et meulage",
    "éclairage portatif et lampes de poche /// lampes de poche",
    "outils électriques /// outils électriques de perçage et de fixation",
    "manutention, stockage et câblage /// élingues",
    "outils manuels /// pinces",
    "manutention, stockage et câblage /// palans et chariots",
    "électrique /// connecteurs de câblage",
    "outils de coupe et travail des métaux /// perçage",
    "manutention, stockage et câblage /// meubles et systèmes de rangement",
    "test et mesure /// micromètres, étriers et jauges",
    "outils électriques /// préparation de surface et finition des outils électriques",
    "électrique /// contrôle industriel",
    "outils manuels /// clés",
    "entretien de conciergerie et des installations /// équipement",
    "manutention, stockage et câblage /// accessoires de levage sous le crochet",
    "manutention, stockage et câblage /// matériel de levage et de gréage",
    "santé & sécurité /// signes, cartons, étiquettes et marqueurs",
    "outils de coupe et travail des métaux /// lames de scie"
  ],
  "categories.level0": [
    "promotions",
    "outils électriques",
    "outils manuels",
    "manutention, stockage et câblage",
    "abrasifs",
    "éclairage portatif et lampes de poche",
    "électrique",
    "santé & sécurité",
    "test et mesure",
    "batteries et accessoires",
    "outils de coupe et travail des métaux",
    "pneumatique",
    "tuyaux, tubes et raccords",
    "adhésifs et produits de scellement",
    "éclairage",
    "peintures, équipements et fournitures",
    "soudage et brasage",
    "entretien de conciergerie et des installations",
    "hydraulique",
    "produits chimiques"
  ],
  "manufacturer_name": [
    "milwaukee tool",
    "makita",
    "klein tools",
    "20561",
    "eaton",
    "phoenix",
    "walter surface technologies",
    "gray tools canada",
    "20326",
    "wera tools",
    "apex tool group",
    "knipex tools",
    "21741",
    "3m",
    "52767",
    "greenfield industries",
    "kleton",
    "surewerx usa inc",
    "stanley black& decker",
    "topring"
  ],
  "brand_name": [
    "20562",
    "21742",
    "milwaukee®",
    "false",
    "52769",
    "klein®",
    "20327",
    "412084",
    "412087",
    "411221",
    "414189",
    "gearwrench®",
    "20187",
    "20255",
    "20513",
    "21468",
    "32687",
    "410315",
    "411184",
    "412080"
  ],
  "categories.level3": [
    "électrique /// connecteurs de câblage /// accessoires pour borniers /// fiches de test de bornier - prises",
    "outils de coupe et travail des métaux /// perçage /// alésoirs /// alésoirs de construction / de pont",
    "outils de coupe et travail des métaux /// perçage /// coupe-trous /// fraises annulaires",
    "outils manuels /// pinces /// pinces coupantes /// pinces coupantes diagonales",
    "outils manuels /// pinces /// pinces de préhension /// pinces à bec long et à bec fin",
    "outils manuels /// poinçons, burins et graveurs /// poinçons /// poinçons d’alignement",
    "abrasifs /// coupure et meulage /// disques à tronçonner et meules /// meules à découper",
    "hydraulique /// actionneurs hydrauliques /// cylindres hydrauliques /// cylindres de serrage hydrauliques",
    "outils de coupe et travail des métaux /// perçage /// forets /// bits de câble",
    "outils de coupe et travail des métaux /// perçage /// forets /// forets de maçonnerie",
    "santé & sécurité /// équipement de protection individuelle (epi) /// gants et protection des mains/bras /// gants",
    "électrique /// outils électriques /// outils de câble/fil /// pinces à dénuder et coupe-câbles",
    "électrique /// outils électriques /// repêchage et tirage de câble /// cintreuses de câbles",
    "électrique /// outils électriques /// repêchage et tirage de câble /// tire-câbles - manuel",
    "abrasifs /// abrasifs enduits /// bandes et tambours de ponçage /// bandes spirales",
    "abrasifs /// bavures et pointes /// bavures et kit de bavure /// bavures à carbure",
    "abrasifs /// pièces et accessoires abrasifs /// accessoires abrasifs /// tampons à disque",
    "abrasifs /// ébavurage /// outils et accessoires d'ébavurage /// outils d'ébavurage",
    "cvc et réfrigération /// commandes cvc /// composants d'allumage /// thermocouples/thermopiles, générateurs mt",
    "outils de coupe et travail des métaux /// tenue d'outil /// porte-matrices et adaptateurs /// adaptateurs de matrice"
  ],
  "in_stock": [
    "1"
  ],
  "categories.level4": [
    "outils électriques /// préparation de surface et finition des outils électriques /// meuleuses et ponceuses électriques /// meuleuses pneumatiques /// aléseuses pneumatiques",
    "santé & sécurité /// équipement de protection individuelle (epi) /// gants et protection des mains/bras /// gants /// gants résistants aux coupures",
    "machinerie /// machines à travailler les métaux /// machines à tuyaux /// rainurage et entaillage de tuyaux /// machine à rainurer les tuyaux",
    "santé & sécurité /// équipement de protection individuelle (epi) /// protection contre les chutes /// équipement d'escalade d'arbres et de poteaux /// sangles de grimpeur d'arbre et de poteau",
    "outils de coupe et travail des métaux /// perçage /// forets /// accessoires et ensembles de forets /// ensembles de forets",
    "outils de coupe et travail des métaux /// perçage /// forets /// accessoires et ensembles de forets /// étuis et armoires de forets",
    "outils de coupe et travail des métaux /// perçage /// forets /// forets polyvalents /// forets de grande longueur",
    "outils de coupe et travail des métaux /// perçage /// forets /// forets polyvalents /// forets de longueur d'extension",
    "outils de coupe et travail des métaux /// perçage /// forets /// forets polyvalents /// forets longueur jobber",
    "outils de coupe et travail des métaux /// perçage /// fraises et outils de chanfreinage /// fraises et accessoires de fraisage /// fraises",
    "outils électriques /// outils électriques de coupe et de formage /// scies électriques /// scies sauteuses /// scies sauteuses sans fil",
    "outils électriques /// outils électriques de coupe et de formage /// sécateurs, grignoteuses et coupe-bordures électriques /// cisailles électriques /// cisailles sans fil",
    "santé & sécurité /// sécurité des installations /// alarmes et avertissements de sécurité /// dispositifs de signalisation antidéflagrants /// lumières stroboscopiques antidéflagrantes",
    "santé & sécurité /// équipement de protection individuelle (epi) /// gants et protection des mains/bras /// gants /// gants de soudage"
  ],
  "ad_drive_size": [
    "1/2 in",
    "3/8 in",
    "3/4 in"
  ],
  "ad_overall_length": [
    "3-1/2 in",
    "12 in",
    "2 in",
    "8 in",
    "10 in",
    "19-1/8 in",
    "6.75 in",
    "60 in",
    "7-1/4 in"
  ]
};

const FACET_WEIGHTS = {
  "categories.level2": 0.3851,
  "categories.level1": 0.2591,
  "categories.level0": 0.2174,
  "manufacturer_name": 0.1005,
  "brand_name": 0.0136,
  "categories.level3": 0.0095,
  "in_stock": 0.0048,
  "categories.level4": 0.004,
  "ad_drive_size": 0.0035,
  "ad_overall_length": 0.0025
};

const FACET_TO_RECORD_PATH = {
  "categories.level2": "categories.level2",
  "categories.level1": "categories.level1",
  "categories.level0": "categories.level0",
  "manufacturer_name": "manufacturer_name",
  "brand_name": "brand_name",
  "categories.level3": "categories.level3",
  "in_stock": "in_stock",
  "categories.level4": "categories.level4",
  "ad_drive_size": "ad_drive_size",
  "ad_overall_length": "ad_overall_length"
};

// RECORD_FIELD_MAP: maps canonical scoring field keys to dot-paths in the record.
// A path of "NONE" means this customer has no equivalent field — scored as neutral.
// Edit this in the field-map file (--field-map) and regenerate; do not edit here.
const RECORD_FIELD_MAP = {
  "price": "price",
  "compareAtPrice": "compare_at_price",
  "inventoryAvailable": "in_stock",
  "inventoryMap": "NONE",
  "recentlyOrderedCount": "NONE",
  "reviewAverage": "NONE",
  "reviewCount": "NONE",
  "collections": "NONE",
  "waysToShop": "NONE",
  "promoTags": "NONE",
  "swatchJson": "NONE",
  "productType": "NONE",
  "categoryHayFields": [
    "productType",
    "collections",
    "tags"
  ]
};

/*__GENERATED_CONFIG_END__*/

// ── CATEGORY PROFILES ────────────────────────────────────────────────────────
// Every product is scored with the `default` profile below unless you OPT IN to
// vertical-specific profiles. `default` is a balanced, schema-agnostic profile
// that works for any catalogue — the generator ships nothing vertical-specific.
//
// priceThreshold = the price (in your currency) at/above which the "good value"
// portion of the price score bottoms out. weights are the six component weights
// and must sum to 1.0.
//
// OPTIONAL: to make scoring category-aware, (1) add named profiles here and
// (2) add matching rules in detectCategory() below. Example:
//
//   const CATEGORY_PROFILES = {
//     power_tools: { priceThreshold: 400, weights: { demand: 0.25, price: 0.15,
//       reviews: 0.20, availability: 0.20, appeal: 0.12, merch: 0.08 } },
//     default: { ...as below... },
//   };
//
// The generator does NOT overwrite this section — your edits are preserved.

const CATEGORY_PROFILES = {
  default: {
    priceThreshold: 1000,
    weights: { demand: 0.22, price: 0.18, reviews: 0.20, availability: 0.17, appeal: 0.13, merch: 0.10 },
  },
};

// ── UTILITIES ────────────────────────────────────────────────────────────────

const clamp      = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
const nz         = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return 0;
};
const normalizeCap = (v, cap) => clamp(nz(v) / cap);
const normalizeLog = (v, cap = 50) => clamp(Math.log1p(Math.max(0, nz(v))) / Math.log1p(cap));

function safeLower(val) {
  if (Array.isArray(val)) return val.map((x) => (x ?? "")).join(" ").toLowerCase();
  if (val === null || val === undefined) return "";
  return String(val).toLowerCase();
}

function toArray(val) {
  if (Array.isArray(val)) return val;
  if (val === null || val === undefined) return [];
  return [val];
}

function objectValues(obj) {
  return obj && typeof obj === "object" && !Array.isArray(obj) ? Object.values(obj) : [];
}

function parseJsonSafe(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

// ── AVAILABILITY TRUTHINESS ───────────────────────────────────────────────────
//
// Different schemas use different types for "is this product available":
//   boolean true/false, number 1/0, string "true"/"yes"/"instock"/"available",
//   or French strings like "en inventaire"/"disponible".
// This helper normalises all of them to a reliable boolean.
// Unknown/null/undefined → false (conservative: don't count unavailable as available).

const IN_STOCK_STRINGS  = new Set(["true","yes","y","1","instock","in stock","available","en inventaire","disponible","in_stock"]);
const OUT_OF_STOCK_STRINGS = new Set(["false","no","0","outofstock","out of stock","unavailable","non disponible","indisponible","soldout","sold out","discontinued","epuise","épuisé"]);

function isAvailable(val) {
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  if (typeof val === "string") {
    const lc = val.toLowerCase().trim();
    if (IN_STOCK_STRINGS.has(lc))    return true;
    if (OUT_OF_STOCK_STRINGS.has(lc)) return false;
  }
  return false;
}

// ── RECORD FIELD ACCESSOR ────────────────────────────────────────────────────
//
// All scoring functions read record fields through here, using the canonical
// field keys defined in RECORD_FIELD_MAP.  A path of "NONE" (or a missing
// entry) returns undefined, which each scoring function treats as "no signal."
//
// Supports dot-notation and ["key"] bracket paths, e.g.:
//   "meta.reviews.average_rating"
//   'attributes["colour or finish"]'

function resolveRecordField(record, dotPath) {
  if (!dotPath || dotPath === "NONE") return undefined;
  const keys = dotPath
    .replace(/\["([^"]+)"\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur = record;
  for (const k of keys) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

// Convenience: reads a canonical key from RECORD_FIELD_MAP and resolves it.
function field(record, canonicalKey) {
  return resolveRecordField(record, RECORD_FIELD_MAP[canonicalKey]);
}

// ── CATEGORY DETECTION ───────────────────────────────────────────────────────
//
// Returns the CATEGORY_PROFILES key to use for a record. By default there is only
// one profile ("default"), so this always returns "default" and no product is
// treated as a special vertical.
//
// OPTIONAL: to enable category-aware scoring, add profiles to CATEGORY_PROFILES
// above, then add matching rules below. Build a lowercase haystack from whichever
// record fields describe the product and match against it, e.g.:
//
//   const hay = buildCategoryHaystack(record);
//   if (/drill|grinder|saw|impact|driver/.test(hay)) return "power_tools";
//   if (/abrasive|grinding|sanding|disc|wheel/.test(hay)) return "abrasives";
//
// buildCategoryHaystack() concatenates the fields listed in
// RECORD_FIELD_MAP.categoryHayFields (falling back to common attribute names).

function buildCategoryHaystack(record) {
  const hayFields = RECORD_FIELD_MAP.categoryHayFields;
  if (Array.isArray(hayFields) && hayFields.length > 0) {
    return hayFields.map((k) => safeLower(field(record, k))).join(" ");
  }
  return [
    safeLower(record?.product_type),
    safeLower(record?.type),
    safeLower(record?.categories),
    safeLower(record?.collections),
    safeLower(record?.brand),
    safeLower(record?.tags),
  ].join(" ");
}

function detectCategory(record) {
  // No vertical rules defined — every product uses the balanced default profile.
  // Add your own rules here (see comment above) once you add named profiles.
  return "default";
}

// ── SCORING COMPONENTS ───────────────────────────────────────────────────────

// Resolve inventoryMap field into an object of { key: qty }.
// Handles: object {store: qty}, scalar number (total qty), array of numbers.
function resolveInventoryMap(record) {
  const raw = field(record, "inventoryMap");
  if (raw == null) return {};
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { total: raw };             // scalar total qty — treat as one "store"
  }
  if (Array.isArray(raw)) {
    const out = {};
    raw.forEach((v, i) => { out[i] = v; });
    return out;
  }
  if (typeof raw === "object") return raw;
  return {};
}

function scoreDemand(record) {
  const recentOrders      = nz(field(record, "recentlyOrderedCount"));
  const recentOrdersScore = normalizeLog(recentOrders, 30);

  const invObj      = resolveInventoryMap(record);
  const storeCount  = objectValues(invObj).filter((n) => nz(n) > 0).length;
  const storesScore = normalizeCap(storeCount, 30);

  const siteAvailable = isAvailable(field(record, "inventoryAvailable")) ? 0.15 : 0;
  return clamp(0.6 * recentOrdersScore + 0.25 * storesScore + siteAvailable);
}

function scorePriceValue(record, categoryKey) {
  const price      = nz(field(record, "price"));
  const compare    = nz(field(record, "compareAtPrice"));
  const hasCompare = compare > 0 && compare > price;
  const discount   = hasCompare ? clamp(1 - price / compare, 0, 0.8) : 0;
  const threshold  = CATEGORY_PROFILES[categoryKey]?.priceThreshold ?? CATEGORY_PROFILES.default.priceThreshold;
  return clamp(
    0.7 * (hasCompare ? discount / 0.8 : 0) +
    0.3 * (price > 0 ? clamp((threshold - price) / threshold) : 0)
  );
}

function scoreReviews(record) {
  const avg = nz(field(record, "reviewAverage"));
  const cnt = nz(field(record, "reviewCount"));
  return clamp(0.75 * clamp(avg / 5) + 0.25 * normalizeLog(cnt, 200));
}

function scoreAvailability(record) {
  const invObj     = resolveInventoryMap(record);
  const unitsTotal = objectValues(invObj).reduce((a, n) => a + (nz(n) > 0 ? nz(n) : 0), 0);
  const siteFlag   = isAvailable(field(record, "inventoryAvailable")) ? 1 : 0;
  return clamp(0.7 * normalizeLog(unitsTotal, 300) + 0.3 * siteFlag);
}

// ── ANALYTICS-DRIVEN APPEAL SCORING ─────────────────────────────────────────
//
// Scores a record by how many of its filterable field values appear in the
// most-clicked value sets, weighted by each facet's relative click share.

function scoreAppeal(record) {
  const facetList = Object.keys(POPULAR_VALUES);
  if (facetList.length === 0) return 0.5;

  let weightedHits = 0;
  let totalWeight  = 0;

  for (const attr of facetList) {
    const weight     = FACET_WEIGHTS[attr]   || 0;
    const popularSet = new Set(POPULAR_VALUES[attr] || []);
    const recordPath = FACET_TO_RECORD_PATH[attr];
    if (!recordPath || recordPath === "NONE" || popularSet.size === 0) continue;

    const rawVal = resolveRecordField(record, recordPath);
    const vals   = toArray(rawVal).map((v) => safeLower(v));
    const matches = vals.filter((v) => v && popularSet.has(v)).length;
    const hit     = matches > 0 ? clamp(matches / Math.max(vals.length, 1)) : 0;

    weightedHits += weight * hit;
    totalWeight  += weight;
  }

  return totalWeight > 0 ? clamp(weightedHits / totalWeight) : 0.5;
}

// ── ANALYTICS-DRIVEN MERCHANDISING SCORING ──────────────────────────────────

function scoreMerchandising(record) {
  const rawCollections = field(record, "collections");
  const cols  = Array.isArray(rawCollections) ? rawCollections : [];

  const rawWays = field(record, "waysToShop");
  const ways    = toArray(rawWays).map((x) => safeLower(x));

  // promoTags: coerce boolean-true to a one-element array so boolean promo flags count.
  const rawPromo = field(record, "promoTags");
  const promoRaw = rawPromo === true || rawPromo === 1 ? ["promo"] : rawPromo;
  const promo    = toArray(promoRaw).map((x) => safeLower(x));

  const featuredKeywords = /(sale|clearance|deal|best seller|new arrival|save today|featured)/i;
  const featuredCount    = cols.reduce((c, name) => (featuredKeywords.test(String(name)) ? c + 1 : c), 0);
  const collectionsScore = normalizeCap(featuredCount, 8);

  const waysSet   = new Set(ways);
  const waysScore =
    (waysSet.has("save today")  ? 0.35 : 0) +
    (waysSet.has("best seller") ? 0.35 : 0) +
    (waysSet.has("new arrival") ? 0.30 : 0);

  const promoScore = promo.length ? clamp(promo.length / 4) : 0;

  // Pick the top-level category facet generically (…lvl0 / …level0 / "categor…")
  const topCatAttr = Object.keys(POPULAR_VALUES).find(
    (a) => POPULAR_VALUES[a]?.length > 0 && /(^|\.)categor|(lvl0|level0)$/i.test(a)
  );
  let catBonus = 0;
  if (topCatAttr) {
    const topCats   = new Set(POPULAR_VALUES[topCatAttr]);
    const recPath   = FACET_TO_RECORD_PATH[topCatAttr];
    const rawCats   = recPath && recPath !== "NONE" ? toArray(resolveRecordField(record, recPath)) : [];
    const matchCats = rawCats.filter((v) => topCats.has(safeLower(v)));
    catBonus        = matchCats.length > 0 ? 0.1 : 0;
  }

  return clamp(0.5 * collectionsScore + 0.25 * waysScore + 0.15 * promoScore + 0.1 * catBonus);
}

// ── MAIN COMPUTE ─────────────────────────────────────────────────────────────

function computeAllScores(record) {
  const categoryKey = detectCategory(record);
  const W           = CATEGORY_PROFILES[categoryKey]?.weights ?? CATEGORY_PROFILES.default.weights;

  const parts = {
    demand:       scoreDemand(record),
    price:        scorePriceValue(record, categoryKey),
    reviews:      scoreReviews(record),
    availability: scoreAvailability(record),
    appeal:       scoreAppeal(record),
    merch:        scoreMerchandising(record),
  };

  let blend = Object.keys(parts).reduce((s, k) => s + (W[k] || 0) * parts[k], 0);

  // Swatch variety bonus — tolerates array, JSON string, or number (count)
  const swatchPath = RECORD_FIELD_MAP.swatchJson;
  const swatchRaw  = swatchPath && swatchPath !== "NONE"
    ? resolveRecordField(record, swatchPath)
    : null;
  let swatchCount = 0;
  if (typeof swatchRaw === "number") {
    swatchCount = Math.round(swatchRaw);
  } else {
    const swatches = Array.isArray(swatchRaw) ? swatchRaw : parseJsonSafe(String(swatchRaw ?? "[]"), []);
    swatchCount    = Array.isArray(swatches) ? swatches.length : 0;
  }
  if (swatchCount >= 3) blend = clamp(blend + 0.03);

  return {
    categoryKey,
    parts,
    blend: clamp(Math.round(blend * 100), 1, 100),
  };
}

async function transform(record) {
  const { categoryKey, parts, blend } = computeAllScores(record);

  record.purchase_attraction_score = blend;
  record.score_demand              = Math.round(parts.demand       * 100);
  record.score_price               = Math.round(parts.price        * 100);
  record.score_reviews             = Math.round(parts.reviews      * 100);
  record.score_availability        = Math.round(parts.availability * 100);
  record.score_appeal              = Math.round(parts.appeal       * 100);
  record.score_merch               = Math.round(parts.merch        * 100);
  record.attractiveness_category   = categoryKey;

  return record;
}

module.exports = { transform };
