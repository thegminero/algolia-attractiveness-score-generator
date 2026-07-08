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
// (populated by generator/generate.js)
const POPULAR_VALUES       = {};
const FACET_WEIGHTS        = {};
const FACET_TO_RECORD_PATH = {};
const RECORD_FIELD_MAP     = {};
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
