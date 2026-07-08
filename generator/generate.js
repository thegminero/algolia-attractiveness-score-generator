#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Attractiveness Script Generator
//
// Fetches Algolia Analytics filter-click data for a given index and produces:
//   1. analytics-snapshot.json  — raw + derived data (auditable, diffable)
//   2. transform.generated.js   — ready-to-use scoring script seeded with
//                                  analytics-derived weights, popular values,
//                                  and a fully configurable record field map
//
// Usage:
//   node generate.js --app-id <APP_ID> --index my_index [options]
//
// Required (one of):
//   --api-key <key>              Algolia API key with Analytics + Search access
//   ALGOLIA_API_KEY env var
//
// Required:
//   --app-id  <id>               Algolia Application ID
//   --index   <name>             Index name to analyse
//
// Optional:
//   --start-date <YYYY-MM-DD>    (default: 30 days ago)
//   --end-date   <YYYY-MM-DD>    (default: today)
//   --top-facets <n>             How many top facets to use   (default: 10)
//   --top-values <n>             Popular values per facet     (default: 20)
//   --out        <dir>           Output directory             (default: cwd)
//   --region     <us|de>         Analytics data-center: us (US apps) / de (EU apps)
//   --ignore-facets <a,b,c>      Extra facets to drop from the analysis
//   --field-map  <path.json>     Customer field-map file.  Created with defaults
//                                if it does not exist.  Confirmed entries are
//                                never overwritten.
//   --sample-record <path.json>  One catalog record OR an array of records.
//                                When provided, the discovery pass runs and
//                                updates non-confirmed entries in --field-map,
//                                then prints a summary report for review.
//                                Pass records from ONE index for best results.
// ---------------------------------------------------------------------------

"use strict";

const fs   = require("fs");
const path = require("path");

// ── helpers ─────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") || (a.startsWith("-") && a.length > 1)) {
      const key  = a.startsWith("--") ? a.slice(2) : a.slice(1);
      const next = argv[i + 1];
      const val  = next && !next.startsWith("-") ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

async function algoliaFetch(url, appId, apiKey) {
  const sep     = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${sep}x-algolia-application-id=${appId}`;
  const res     = await fetch(fullUrl, {
    headers: {
      "x-algolia-api-key": apiKey,
      "x-algolia-application-id": appId,
      accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Algolia Analytics API error ${res.status} for ${url}: ${body}`);
  }
  return res.json();
}

// Pull a handful of real records straight from the index via the Search API,
// so engineers don't have to export sample records by hand. Requires a key with
// search ACL on the index (an admin/search key; the analytics-only key may 403).
async function fetchSampleRecords(appId, apiKey, index, count = 10) {
  const url = `https://${appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(index)}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "x-algolia-api-key": apiKey,
      "x-algolia-application-id": appId,
      "content-type": "application/json",
    },
    body: JSON.stringify({ params: `query=&hitsPerPage=${count}&attributesToRetrieve=*&getRankingInfo=false` }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Search API ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  // Strip Algolia response-only metadata so discovery sees clean records.
  return (data.hits || []).map((h) => {
    const { _highlightResult, _snippetResult, _rankingInfo, _distinctSeqID, ...rest } = h;
    return rest;
  });
}

async function fetchConcurrent(tasks, concurrency = 5) {
  const results = [];
  let i = 0;
  async function run() {
    while (i < tasks.length) {
      const idx    = i++;
      results[idx] = await tasks[idx]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, run);
  await Promise.all(workers);
  return results;
}

// ── facet noise filter ───────────────────────────────────────────────────────
//
// Some "facets" in the analytics response are not shopper-facing refinements —
// they are backend filters the search implementation applies on every query
// (visibility flags, permission / customer-group gating, internal IDs, etc.).
// These inflate click counts but tell us nothing about product appeal, so we
// drop them by default. Engineers can extend the list per run via --ignore-facets
// or the "ignoreFacets" config key.

const NOISE_FACETS = new Set([
  "objectID",
]);

// Regex patterns for classes of backend / permission / internal facets.
const NOISE_PATTERNS = [
  /^visibility/i,          // visibility_search, visibility_catalog — backend filters
  /^catalog_permissions/i, // catalog_permissions.customer_group_* — permission gating
  /customer_group/i,       // any customer-group scoped permission facet
];

function isNoiseFacet(attr, extraIgnore) {
  if (NOISE_FACETS.has(attr)) return true;
  if (extraIgnore && extraIgnore.has(attr)) return true;
  if (/^\d+$/.test(attr)) return true;                 // bare numeric attribute names
  if (NOISE_PATTERNS.some((re) => re.test(attr))) return true;
  return false;
}

// ── weight derivation ────────────────────────────────────────────────────────

function deriveWeights(facets) {
  const total = facets.reduce((s, f) => s + f.count, 0);
  if (total === 0) return facets.map((f) => ({ ...f, weight: 0 }));
  return facets.map((f) => ({
    ...f,
    weight: Math.round((f.count / total) * 10000) / 10000,
  }));
}

// ── field map loading ────────────────────────────────────────────────────────

function loadDefaultFieldMap() {
  const defaultPath = path.join(__dirname, "field-map.default.json");
  if (!fs.existsSync(defaultPath)) {
    throw new Error(`field-map.default.json not found at ${defaultPath}`);
  }
  const raw     = JSON.parse(fs.readFileSync(defaultPath, "utf8"));
  const cleaned = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith("_")) cleaned[k] = v;
  }
  return cleaned;
}

function mergeFieldMaps(defaults, customer) {
  const merged = {};
  for (const [k, v] of Object.entries(defaults)) {
    if (k === "categoryHayFields") {
      merged[k] = customer[k] !== undefined ? customer[k] : v;
      continue;
    }
    merged[k] = customer[k] !== undefined ? customer[k] : v;
  }
  for (const [k, v] of Object.entries(customer)) {
    if (merged[k] === undefined) merged[k] = v;
  }
  return merged;
}

function loadFieldMap(fieldMapPath) {
  const defaults = loadDefaultFieldMap();
  if (!fieldMapPath || !fs.existsSync(fieldMapPath)) {
    return { map: defaults, wasCreated: true, existing: {} };
  }
  const existing = JSON.parse(fs.readFileSync(fieldMapPath, "utf8"));
  return { map: mergeFieldMaps(defaults, existing), wasCreated: false, existing };
}

function entryPath(entry) {
  if (entry == null) return "NONE";
  if (typeof entry === "string") return entry;
  return entry.path ?? "NONE";
}

function buildRecordFieldMap(mergedMap) {
  const out = {};
  for (const [k, v] of Object.entries(mergedMap)) {
    if (k === "categoryHayFields") {
      out[k] = Array.isArray(v) ? v : [];
    } else {
      out[k] = entryPath(v);
    }
  }
  return out;
}

// ── sample record loading ────────────────────────────────────────────────────
// Accepts a single object OR an array of objects.  Returns array of records.

function loadSampleRecords(filePath) {
  const raw  = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const recs = Array.isArray(raw) ? raw : [raw];
  if (recs.length === 0) throw new Error("sample-record file contains an empty array.");
  return recs;
}

// ── path aggregation ─────────────────────────────────────────────────────────
// Scans all records and builds a map of:
//   path → { freq, types: Set<string>, sampleValue }
// Arrays are treated as leaves with type "array" (or "array<type>" for homogeneous arrays).

function typeLabel(val) {
  if (val === null) return "null";
  if (Array.isArray(val)) {
    if (val.length === 0) return "array";
    const et = typeof val[0];
    return val.every((v) => typeof v === et) ? `array<${et}>` : "array<mixed>";
  }
  return typeof val;
}

function aggregatePaths(records) {
  // Map<dotPath, { freq, types: Set, sampleValue }>
  const agg = new Map();

  function walk(obj, prefix) {
    if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return;
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;
      // Recurse into nested objects (but not arrays — treat array as a leaf)
      if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        walk(v, full);
      }
      // Register the leaf (or the object node itself so its parent path is known)
      const existing = agg.get(full);
      if (existing) {
        existing.freq++;
        existing.types.add(typeLabel(v));
      } else {
        agg.set(full, { freq: 1, types: new Set([typeLabel(v)]), sampleValue: v });
      }
    }
  }

  for (const rec of records) {
    walk(rec, "");
  }

  return agg;
}

// ── type-aware candidate scoring ─────────────────────────────────────────────

// Expected value types per canonical field key.
// "any" means any type is acceptable (no bonus / penalty applied).
const EXPECTED_TYPES = {
  price:                  "number",
  compareAtPrice:         "number",
  inventoryAvailable:     "boolean",
  inventoryMap:           "object",
  recentlyOrderedCount:   "number",
  reviewAverage:          "number",
  reviewCount:            "number",
  collections:            "array",
  waysToShop:             "array",
  promoTags:              "any",     // can be array, boolean, or string
  swatchJson:             "any",
  productType:            "string",
  brand:                  "string",
};

// Noise suffixes stripped before tokenizing a field name.
const NOISE_SUFFIXES = new Set([
  "string", "mv", "double", "int", "long", "boolean", "text",
  "es", "en", "fr", "mx", "us", "cop", "usd",
  "guest", "registered", "early", "access",
]);

// Tokenize a dot-path leaf name into lowercase tokens, removing noise suffixes.
// "sortPrice_Guest" → ["sortprice"]  "averagescore_double" → ["averagescore"]
// "reviewavgrating_double" → ["reviewavgrating"]
function tokenizeLeaf(leafName) {
  const lc = leafName.toLowerCase();
  // Split on _ and - boundaries
  const raw = lc.split(/[_\-]+/).filter(Boolean);
  // Also split on camelCase transitions
  const camel = lc.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().split(/\s+/);
  const combined = new Set([...raw, ...camel]);
  // Remove noise tokens
  const tokens = [...combined].filter((t) => t.length > 1 && !NOISE_SUFFIXES.has(t));
  return tokens;
}

// Build alias token sets from the aliases array.
function buildAliasTokenSets(aliases) {
  // aliases is an array of synonym strings
  return aliases.map((a) => ({
    raw: a.toLowerCase(),
    tokens: new Set(tokenizeLeaf(a)),
  }));
}

// Score a candidate dot-path against the alias list and expected type.
// Returns a score 0–1.
function scoreCandidate(dotPath, meta, aliasTokenSets, expectedType) {
  const leafName   = dotPath.split(".").pop();
  const leafLc     = leafName.toLowerCase();
  const leafTokens = new Set(tokenizeLeaf(leafName));

  let baseScore = 0;

  for (const { raw, tokens } of aliasTokenSets) {
    // Tier 1: exact leaf match (case-insensitive)
    if (leafLc === raw) { baseScore = Math.max(baseScore, 1.0); break; }

    // Tier 2: token-set equality (all leaf tokens == all alias tokens)
    if (leafTokens.size > 0 && tokens.size > 0) {
      const sameSize = leafTokens.size === tokens.size;
      const allMatch = sameSize && [...leafTokens].every((t) => tokens.has(t));
      if (allMatch) { baseScore = Math.max(baseScore, 0.9); continue; }
    }

    // Tier 3: alias is a proper subset of leaf tokens OR leaf is proper subset of alias tokens
    // (handles "review_count" matching alias "reviewCount")
    if (leafTokens.size > 0 && tokens.size > 0) {
      const aliasInLeaf = [...tokens].every((t) => leafTokens.has(t));
      const leafInAlias = [...leafTokens].every((t) => tokens.has(t));
      if (aliasInLeaf || leafInAlias) { baseScore = Math.max(baseScore, 0.75); continue; }
    }

    // Tier 4: at least one shared token (partial overlap) — lower score
    if (leafTokens.size > 0 && tokens.size > 0) {
      const shared = [...leafTokens].filter((t) => tokens.has(t));
      if (shared.length > 0) {
        const ratio = shared.length / Math.max(leafTokens.size, tokens.size);
        baseScore = Math.max(baseScore, 0.4 * ratio);
      }
    }
  }

  if (baseScore === 0) return 0;

  // Value-type bonus / penalty
  let typeAdj = 0;
  if (expectedType && expectedType !== "any" && meta) {
    const actualTypes = [...meta.types];
    const typeMatch   = actualTypes.some((t) => {
      if (expectedType === "array") return t.startsWith("array");
      if (expectedType === "object") return t === "object";
      return t === expectedType;
    });
    // Only apply bonus/penalty for high-confidence name matches to avoid penalizing
    // legitimate fields with an occasional null value
    if (baseScore >= 0.75) {
      typeAdj = typeMatch ? 0.12 : -0.25;
    }
  }

  // Small frequency bonus (more records have this field → more likely canonical)
  const freqBonus = meta ? Math.min(meta.freq / 20, 0.03) : 0;

  return Math.max(0, Math.min(1, baseScore + typeAdj + freqBonus));
}

// ── field map aliases loader ─────────────────────────────────────────────────

function loadFieldAliases() {
  const aliasPath = path.join(__dirname, "field-aliases.json");
  if (!fs.existsSync(aliasPath)) return {};
  const raw = JSON.parse(fs.readFileSync(aliasPath, "utf8"));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!k.startsWith("_")) out[k] = Array.isArray(v) ? v : [];
  }
  return out;
}

// ── field discovery (rewritten) ──────────────────────────────────────────────
// Returns an array of change objects for the summary report, each with:
//   { key, status, oldPath, newPath, top3: [{path, score, types, freq}] }

const DISCOVERY_THRESHOLD = 0.65;
const TOP_N = 3;

function discoverFields(currentMap, pathMeta, aliases) {
  const canonicalKeys = Object.keys(currentMap).filter((k) => k !== "categoryHayFields");
  const changes       = [];

  for (const key of canonicalKeys) {
    const existing = currentMap[key];
    const source   = typeof existing === "object" ? existing.source : "default";

    if (source === "confirmed") {
      changes.push({ key, status: "CONFIRMED", oldPath: entryPath(existing), newPath: entryPath(existing), top3: [] });
      continue;
    }

    const keyAliases    = aliases[key] || [];
    const aliasTokenSets = buildAliasTokenSets(keyAliases);

    if (aliasTokenSets.length === 0) {
      changes.push({ key, status: "UNRESOLVED", oldPath: entryPath(existing), newPath: entryPath(existing), top3: [] });
      continue;
    }

    const expectedType = EXPECTED_TYPES[key] || "any";

    // Score every known path
    const scored = [];
    for (const [dotPath, meta] of pathMeta.entries()) {
      const s = scoreCandidate(dotPath, meta, aliasTokenSets, expectedType);
      if (s > 0) {
        scored.push({ path: dotPath, score: s, types: [...meta.types].join("|"), freq: meta.freq });
      }
    }

    scored.sort((a, b) => b.score - a.score || b.freq - a.freq);
    const top3   = scored.slice(0, TOP_N);
    const best   = top3[0];
    const oldPath = entryPath(existing);

    if (best && best.score >= DISCOVERY_THRESHOLD) {
      const newPath = best.path;
      if (newPath === oldPath) {
        changes.push({ key, status: "CONFIRMED-MATCH", oldPath, newPath, top3 });
      } else {
        const isNew = oldPath === "NONE" || source === "default";
        currentMap[key] = { path: newPath, source: "suggested" };
        changes.push({ key, status: isNew ? "SUGGESTED-NEW" : "SUGGESTED-CHANGED", oldPath, newPath, top3 });
      }
    } else {
      if (oldPath !== "NONE" && source !== "default") {
        // Has a non-default path already, no confident match found against new sample
        changes.push({ key, status: "CONFIRMED-MATCH", oldPath, newPath: oldPath, top3 });
      } else {
        currentMap[key] = { path: "NONE", source: "suggested-none" };
        changes.push({ key, status: "SUGGESTED-NONE", oldPath, newPath: "NONE", top3 });
      }
    }
  }

  return changes;
}

// ── summary report ───────────────────────────────────────────────────────────

const STATUS_ORDER = [
  "CONFIRMED",
  "CONFIRMED-MATCH",
  "SUGGESTED-NEW",
  "SUGGESTED-CHANGED",
  "SUGGESTED-NONE",
  "UNRESOLVED",
];

function printDiscoverySummary(changes, fieldMapPath, totalRecords) {
  const grouped = {};
  for (const s of STATUS_ORDER) grouped[s] = [];
  for (const c of changes) {
    (grouped[c.status] = grouped[c.status] || []).push(c);
  }

  const colW = 28;
  const pad  = (s, n) => String(s ?? "").padEnd(n);

  const line = "─".repeat(95);
  console.log(`\n┌${line}┐`);
  console.log(`│${"  FIELD MAP DISCOVERY REPORT".padEnd(95)}│`);
  if (totalRecords > 1) {
    console.log(`│${"  Aggregated from " + totalRecords + " sample records".padEnd(95)}│`);
  }
  console.log(`├${line}┤`);

  const labels = {
    "CONFIRMED":        "✔  CONFIRMED (locked, will not change on re-run)",
    "CONFIRMED-MATCH":  "✔  CONFIRMED-MATCH (auto-matched, already correct)",
    "SUGGESTED-NEW":    "●  SUGGESTED-NEW (set for first time — review, then change source to \"confirmed\")",
    "SUGGESTED-CHANGED":"▲  SUGGESTED-CHANGED (path updated — review and confirm or revert)",
    "SUGGESTED-NONE":   "○  SUGGESTED-NONE (no confident match — set path manually or accept NONE)",
    "UNRESOLVED":       "?  UNRESOLVED (no aliases defined — see field-aliases.json)",
  };

  for (const status of STATUS_ORDER) {
    const rows = grouped[status];
    if (!rows || rows.length === 0) continue;

    console.log(`│  ${labels[status]}`);
    console.log(`│  ${pad("Canonical key", colW)}  ${pad("Old path", colW)}  New path`);
    console.log(`│  ${"─".repeat(colW)}  ${"─".repeat(colW)}  ${"─".repeat(colW)}`);

    for (const { key, oldPath, newPath, top3 } of rows) {
      const changed = oldPath !== newPath ? " ◄" : "";
      console.log(`│  ${pad(key, colW)}  ${pad(oldPath, colW)}  ${newPath}${changed}`);

      // Show ranked alternatives for non-confirmed rows
      const showAlts = ["SUGGESTED-NEW", "SUGGESTED-CHANGED", "SUGGESTED-NONE"].includes(status);
      if (showAlts && top3 && top3.length > 0) {
        const alts = top3
          .map((c) => `${c.path} (${c.score.toFixed(2)}, ${c.types}, ${c.freq}/${totalRecords} recs)`)
          .join("  |  ");
        const altLine = `     candidates: ${alts}`;
        // Wrap long lines
        if (altLine.length > 93) {
          const parts = top3.map(
            (c) => `  •  ${c.path.padEnd(40)} score=${c.score.toFixed(2)}  type=${c.types}  freq=${c.freq}/${totalRecords}`
          );
          parts.forEach((p) => console.log(`│${p}`));
        } else {
          console.log(`│  ${altLine}`);
        }
      }
    }
    console.log("│");
  }

  console.log(`└${line}┘`);
  if (fieldMapPath) {
    console.log(`  Review the changes above, then open ${fieldMapPath}`);
    console.log(`  Change any entry's source to "confirmed" to lock it against future discovery runs.\n`);
  }
}

// ── help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
Attractiveness Script Generator

Three easy ways to run it:

  1. Interactive (no flags — just answer the prompts):
       node generator/generate.js
       ./gen                       (short wrapper, macOS/Linux)
       gen                         (short wrapper, Windows)

  2. Config file (put settings in a JSON file once, then reuse):
       ./gen --config groupeld_fr_prod          (alias → groupeld_fr_prod.config.json)
       ./gen --config configs/acme.config.json  (or a full path)
     Interactive setup asks for an alias first and saves <alias>.config.json.
     --config accepts the alias, the filename, or a path; it also looks in ./configs.

  3. Flags (scriptable / CI):
       node generator/generate.js --index my_index --app-id APPID ...

Options (flags override config file, which overrides env vars, which override defaults):
  --config <path>            Load settings from a JSON config file
  --app-id <id>              Algolia Application ID          (env ALGOLIA_APP_ID)
  --api-key <key>            API key w/ Analytics + Search    (env ALGOLIA_API_KEY)
  --index <name>             Index to analyse                (env ALGOLIA_INDEX)
  --region <us|de>           Analytics data-center: 'us' for US-hosted apps,
                             'de' for EU-hosted apps         (default us)
  --start-date <YYYY-MM-DD>  Period start                    (default 30 days ago)
  --end-date <YYYY-MM-DD>    Period end                      (default today)
  --top-facets <n>           How many top facets             (default 10)
  --top-values <n>           Popular values per facet        (default 20)
  --out <dir>                Output directory                (default current dir)
  --field-map <path>         Per-index field-map JSON file (auto-created with
                             defaults if missing; see generator/field-map.default.json)
  --sample-record <path>     One record or an array of records (auto-discovery)
  --fetch-samples[=n]        Pull n real records (default 10) from the index via
                             the Search API and use them for auto-discovery
                             (needs a key with search access to the index)
  --ignore-facets <a,b,c>    Extra facets to drop (backend/permission facets
                             like visibility_* are dropped automatically)
  --interactive, -i          Force interactive prompts
  --help, -h                 Show this help

Config file keys (camelCase): appId, apiKey, index, region, startDate, endDate,
  topFacets, topValues, out, fieldMap, sampleRecord, ignoreFacets, fetchSamples.
The API key can be cached in the config file for convenient LOCAL re-runs (the
interactive save offers this, and *.config.json is git-ignored). For anything
committed or shared, prefer the ALGOLIA_API_KEY env var instead.
`);
}

// ── config file + option resolution ────────────────────────────────────────────

// Resolve a --config value that may be a full path OR a short alias.
// Tries, in order: the value as-is, value + ".config.json", and both of those
// inside a ./configs directory. Returns the first existing absolute path.
// e.g. "groupeld_fr_prod" → ./groupeld_fr_prod.config.json (or ./configs/…).
function resolveConfigPath(input) {
  const candidates = [input];
  if (!input.endsWith(".json")) candidates.push(`${input}.config.json`);
  candidates.push(path.join("configs", input));
  if (!input.endsWith(".json")) candidates.push(path.join("configs", `${input}.config.json`));

  const tried = [];
  for (const c of candidates) {
    const abs = path.resolve(c);
    tried.push(abs);
    if (fs.existsSync(abs)) return abs;
  }
  return { notFound: true, tried };
}

function loadConfigFile(configPath) {
  const resolved = resolveConfigPath(configPath);
  if (resolved && resolved.notFound) {
    console.error(`Error: no config file found for "${configPath}". Looked for:`);
    resolved.tried.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  const abs = resolved;
  try {
    return JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    console.error(`Error: could not parse config file ${abs}: ${e.message}`);
    process.exit(1);
  }
}

// Resolve options with precedence: CLI flag > config file > env var > default.
function resolveOptions(args) {
  const cfg = args.config ? loadConfigFile(args.config) : {};

  const pick = (flag, cfgKey, envKey, def) => {
    if (args[flag] !== undefined && args[flag] !== true) return args[flag];
    if (cfg[cfgKey] !== undefined) return cfg[cfgKey];
    if (envKey && process.env[envKey] !== undefined) return process.env[envKey];
    return def;
  };

  return {
    config:       args.config || null,
    appId:        pick("app-id", "appId", "ALGOLIA_APP_ID", undefined),
    apiKey:       pick("api-key", "apiKey", "ALGOLIA_API_KEY", undefined),
    index:        pick("index", "index", "ALGOLIA_INDEX", undefined),
    region:       pick("region", "region", null, "us"),
    startDate:    pick("start-date", "startDate", null, daysAgo(30)),
    endDate:      pick("end-date", "endDate", null, today()),
    topFacets:    parseInt(pick("top-facets", "topFacets", null, 10), 10),
    topValues:    parseInt(pick("top-values", "topValues", null, 20), 10),
    out:          pick("out", "out", null, process.cwd()),
    fieldMap:     pick("field-map", "fieldMap", null, null),
    sampleRecord: pick("sample-record", "sampleRecord", null, null),
    ignoreFacets: normalizeList(pick("ignore-facets", "ignoreFacets", null, [])),
    fetchSamples: pick("fetch-samples", "fetchSamples", null, null),
  };
}

// Accepts a comma/space separated string OR an array; returns a clean string array.
function normalizeList(val) {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : String(val).split(/[,\s]+/);
  return arr.map((s) => String(s).trim()).filter(Boolean);
}

// ── interactive mode ─────────────────────────────────────────────────────────

// Buffered line reader — works with both an interactive TTY and piped stdin
// (readline/promises drops lines that arrive between question() calls when piped).
function createLineReader() {
  const readline = require("node:readline");
  const rl = readline.createInterface({ input: process.stdin });
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on("line", (line) => {
    if (waiters.length) waiters.shift()(line);
    else queue.push(line);
  });
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });
  return {
    question(prompt) {
      process.stdout.write(prompt);
      return new Promise((resolve) => {
        if (queue.length) resolve(queue.shift());
        else if (closed) resolve(null);
        else waiters.push(resolve);
      });
    },
    close() { rl.close(); },
  };
}

// Make sure config files (which may cache an API key) are never committed.
// Adds patterns to the nearest .gitignore, walking up from the config file to
// find a repo root; otherwise creates one next to the config file.
function ensureGitignore(configAbsPath) {
  const patterns = ["*.config.json", ".env", "indices/**/sample-records.json"];
  try {
    let dir = path.dirname(configAbsPath);
    let repoRoot = null;
    for (let i = 0; i < 8; i++) {
      if (fs.existsSync(path.join(dir, ".git"))) { repoRoot = dir; break; }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const target = path.join(repoRoot || path.dirname(configAbsPath), ".gitignore");
    const existing = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
    const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
    const missing = patterns.filter((p) => !have.has(p));
    if (missing.length === 0) return;
    const header = existing.includes("# attractiveness generator") ? "" : "\n# attractiveness generator — local config may hold an API key\n";
    fs.writeFileSync(target, existing + (existing && !existing.endsWith("\n") ? "\n" : "") + header + missing.join("\n") + "\n");
  } catch {
    // Non-fatal: gitignore is a convenience, never block generation on it.
  }
}

// Slugify an arbitrary string into a filesystem-safe token.
function slugify(s) {
  const out = String(s || "index").replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "");
  return out || "index";
}

function configFileNameFor(name) {
  return `${slugify(name)}.config.json`;
}

// Per-index working directory, e.g. indices/groupeld_fr_prod
function indexDirFor(alias) {
  return path.resolve("indices", slugify(alias));
}

async function runInteractive(opts) {
  const rl = createLineReader();

  const ask = async (label, def, { mask = false } = {}) => {
    const shown = mask && def ? "********" : def;
    const hint  = shown !== undefined && shown !== null && shown !== "" ? ` [${shown}]` : "";
    const raw   = await rl.question(`  ${label}${hint}: `);
    const ans   = (raw === null ? "" : raw).trim();
    return ans === "" ? def : ans;
  };

  const askYesNo = async (label, defaultYes) => {
    const hint = defaultYes ? "[Y/n]" : "[y/N]";
    const raw  = (await rl.question(`  ${label} ${hint}: `));
    const ans  = (raw === null ? "" : raw).trim().toLowerCase();
    if (ans === "") return defaultYes;
    return ans === "y" || ans === "yes";
  };

  console.log("\nInteractive setup — press Enter to accept the default shown in [brackets].\n");

  const alias = await ask("Config alias — short name for this customer/config, e.g. groupeld_fr_prod (a customer may have many indices)", opts._alias || "");
  opts._alias = (alias || "").trim() || null;

  // When an alias is given, keep everything for this index together under
  // indices/<alias>/ and default the field map + output there automatically.
  const indexDir = opts._alias ? indexDirFor(opts._alias) : null;
  if (indexDir) {
    if (!opts.fieldMap) opts.fieldMap = path.join(indexDir, "field-map.json");
    opts.out = indexDir;
  }

  opts.appId        = await ask("Algolia Application ID", opts.appId);
  opts.apiKey       = await ask("API key with Analytics + Search access (blank = use ALGOLIA_API_KEY env)", opts.apiKey, { mask: true });
  opts.index        = await ask("Index name", opts.index);
  opts.startDate    = await ask("Start date (YYYY-MM-DD)", opts.startDate);
  opts.endDate      = await ask("End date (YYYY-MM-DD)", opts.endDate);
  opts.out          = await ask("Output directory", opts.out);

  // ── Sample records for field auto-discovery ──────────────────────────────
  // The easiest path: let the tool pull a few real records from the index.
  if (opts.appId && opts.apiKey && opts.index && !opts.sampleRecord) {
    console.log("");
    console.log("  To map this index's fields (price, stock, reviews…), the tool can pull a few");
    console.log("  real records straight from the index and auto-suggest the mappings.");
    const doFetch = await askYesNo("Fetch sample records from Algolia now?", true);
    if (doFetch) {
      const n = parseInt(await ask("How many records to fetch", 10), 10) || 10;
      const targetDir = indexDir || path.resolve(opts.out || process.cwd());
      try {
        process.stdout.write(`  Fetching ${n} records from "${opts.index}"… `);
        const hits = await fetchSampleRecords(opts.appId, opts.apiKey, opts.index, n);
        if (hits.length === 0) {
          console.log("none returned (empty index or query).");
        } else {
          fs.mkdirSync(targetDir, { recursive: true });
          const samplePath = path.join(targetDir, "sample-records.json");
          fs.writeFileSync(samplePath, JSON.stringify(hits, null, 2));
          opts.sampleRecord = samplePath;
          if (!opts.fieldMap) opts.fieldMap = path.join(targetDir, "field-map.json");
          console.log(`saved ${hits.length} → ${path.relative(process.cwd(), samplePath)}`);
        }
      } catch (e) {
        console.log("failed.");
        console.log(`  ${e.message.split("\n")[0]}`);
        console.log("  (The key needs search access to this index. You can also drop a records JSON");
        console.log(`   file in and pass it as the sample record file in advanced options.)`);
      }
    }
  }

  console.log("");
  const wantAdvanced = await askYesNo("Configure advanced options (region, facet counts, field mapping, ignored facets)?", false);
  if (wantAdvanced) {
    console.log("");
    opts.region       = await ask("Analytics data-center region — 'us' for US-hosted apps, 'de' for EU-hosted", opts.region);
    opts.topFacets    = parseInt(await ask("How many top facets to use", opts.topFacets), 10);
    opts.topValues    = parseInt(await ask("Top values per facet", opts.topValues), 10);
    opts.fieldMap     = (await ask("Field-map file for this index (blank = none)", opts.fieldMap || "")) || null;
    opts.sampleRecord = (await ask("Sample record(s) file to auto-discover fields (blank = none)", opts.sampleRecord || "")) || null;
    const ignore      = await ask("Extra facets to ignore, comma-separated (backend/permission facets are dropped automatically)", (opts.ignoreFacets || []).join(","));
    opts.ignoreFacets = normalizeList(ignore);
  }

  // ── Save settings for next time (default: yes, to ./<alias>.config.json) ──
  console.log("");
  const defaultConfigPath = path.join(process.cwd(), configFileNameFor(opts._alias || opts.index));
  const relPath = path.relative(process.cwd(), defaultConfigPath) || defaultConfigPath;
  console.log("  Saving your answers to a config file lets you re-run everything later with a single");
  console.log("  command: ./gen --config <file>  (git-ignored; you choose whether to cache the API key).");
  const doSave = await askYesNo(`Save these settings to ${relPath}?`, true);

  if (doSave) {
    const customPath = await ask("  Config file path", relPath);
    const abs = path.resolve(customPath);

    const cacheKey = opts.apiKey
      ? await askYesNo("  Also cache the API key in this file for easy local re-runs? (do NOT commit it)", true)
      : false;

    const toSave = {
      appId: opts.appId,
      index: opts.index,
      region: opts.region,
      startDate: opts.startDate,
      endDate: opts.endDate,
      topFacets: opts.topFacets,
      topValues: opts.topValues,
      out: opts.out,
      fieldMap: opts.fieldMap,
      sampleRecord: opts.sampleRecord,
      ignoreFacets: opts.ignoreFacets || [],
    };
    if (cacheKey) toSave.apiKey = opts.apiKey;

    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(toSave, null, 2));
    ensureGitignore(abs);

    // Reuse token: if the file is a ./<name>.config.json in cwd, the alias form
    // (./gen --config <name>) works; otherwise show the relative path.
    const inCwd     = path.dirname(abs) === process.cwd();
    const baseAlias = path.basename(abs).replace(/\.config\.json$/, "");
    const reuseToken = inCwd && path.basename(abs).endsWith(".config.json")
      ? baseAlias
      : (path.relative(process.cwd(), abs) || abs);

    console.log(`\n  Saved config → ${abs}`);
    if (cacheKey) {
      console.log(`  API key cached in this file — it's git-ignored, keep it local and never commit it.`);
    } else {
      console.log(`  API key not saved — keep it in the ALGOLIA_API_KEY env var.`);
    }
    console.log(`  Next time just run:  ./gen --config ${reuseToken}\n`);
  }

  rl.close();
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) { printHelp(); process.exit(0); }

  const opts = resolveOptions(args);

  // Interactive when explicitly requested, or when nothing was provided and a TTY is available.
  const forceInteractive = args.interactive === true || args.i === true;
  const nothingProvided   = !opts.index && !opts.config;
  if (forceInteractive || (nothingProvided && process.stdin.isTTY)) {
    await runInteractive(opts);
  }

  const appId        = opts.appId;
  const apiKey       = opts.apiKey;
  const index        = opts.index;
  const region       = opts.region;
  const startDate    = opts.startDate;
  const endDate      = opts.endDate;
  const topFacets    = opts.topFacets;
  const topValues    = opts.topValues;
  const outDir       = path.resolve(opts.out || process.cwd());
  let   fieldMapArg  = opts.fieldMap     ? path.resolve(opts.fieldMap)     : null;
  let   sampleRecArg = opts.sampleRecord ? path.resolve(opts.sampleRecord) : null;

  if (!appId)  { console.error("Error: Application ID is required (--app-id, config appId, or ALGOLIA_APP_ID)"); process.exit(1); }
  if (!apiKey) { console.error("Error: API key is required (--api-key or ALGOLIA_API_KEY env)"); process.exit(1); }
  if (!index)  { console.error("Error: index is required (--index, config index, or ALGOLIA_INDEX)"); process.exit(1); }

  // ── Step 0 (optional): auto-fetch sample records from the index ───────────
  // Enabled by --fetch-samples[=n] or "fetchSamples" in the config. Saves the
  // engineer from exporting records by hand and feeds the discovery pass.
  const wantFetch = (opts.fetchSamples != null && opts.fetchSamples !== false) || args["fetch-samples"] === true;
  if (!sampleRecArg && wantFetch) {
    const raw = opts.fetchSamples;
    const n   = Number.isInteger(raw) ? raw : (parseInt(raw, 10) || 10);
    try {
      console.log(`\nFetching ${n} sample records from "${index}" via the Search API…`);
      const hits = await fetchSampleRecords(appId, apiKey, index, n);
      if (hits.length > 0) {
        fs.mkdirSync(outDir, { recursive: true });
        const samplePath = path.join(outDir, "sample-records.json");
        fs.writeFileSync(samplePath, JSON.stringify(hits, null, 2));
        sampleRecArg = samplePath;
        if (!fieldMapArg) fieldMapArg = path.join(outDir, "field-map.json");
        console.log(`  Saved ${hits.length} records → ${samplePath}`);
      } else {
        console.log("  No records returned; skipping auto-discovery.");
      }
    } catch (e) {
      console.error(`  Could not fetch samples: ${e.message.split("\n")[0]}`);
      console.error("  Provide --sample-record manually, or ensure the key has search access to this index.");
    }
  }

  // ── Step 1: load / initialise field map ──────────────────────────────────

  const { map: mergedMap, wasCreated } = loadFieldMap(fieldMapArg);

  if (fieldMapArg && wasCreated) {
    fs.mkdirSync(path.dirname(fieldMapArg), { recursive: true });
    fs.writeFileSync(fieldMapArg, JSON.stringify(mergedMap, null, 2));
    console.log(`\nCreated field map → ${fieldMapArg}`);
    console.log("  All entries have source: \"default\". Run with --sample-record to auto-discover paths.");
  }

  // ── Step 2: discovery pass ───────────────────────────────────────────────

  if (sampleRecArg) {
    if (!fs.existsSync(sampleRecArg)) {
      console.error(`Error: sample record file not found at ${sampleRecArg}`);
      process.exit(1);
    }
    const records  = loadSampleRecords(sampleRecArg);
    const pathMeta = aggregatePaths(records);
    const aliases  = loadFieldAliases();
    const changes  = discoverFields(mergedMap, pathMeta, aliases);

    if (fieldMapArg) {
      fs.writeFileSync(fieldMapArg, JSON.stringify(mergedMap, null, 2));
    }

    printDiscoverySummary(changes, fieldMapArg, records.length);
  }

  // ── Step 3: fetch top facets ─────────────────────────────────────────────

  const base = `https://analytics.${region}.algolia.com/2/filters`;
  const qs   = `endDate=${endDate}&index=${encodeURIComponent(index)}&limit=1000&startDate=${startDate}`;

  console.log(`\nFetching top facets for index "${index}" (${startDate} → ${endDate})…`);

  const extraIgnore = new Set(opts.ignoreFacets || []);
  const facetsData  = await algoliaFetch(`${base}?${qs}`, appId, apiKey);
  const rawFacets   = facetsData.attributes || [];
  const allFacets   = rawFacets.filter((f) => !isNoiseFacet(f.attribute, extraIgnore));
  const dropped     = rawFacets.filter((f) => isNoiseFacet(f.attribute, extraIgnore));
  const kept        = allFacets.slice(0, topFacets);

  if (kept.length === 0) {
    console.error("No usable facets returned. Check your date range and index name.");
    process.exit(1);
  }

  if (dropped.length > 0) {
    console.log(`  Ignored ${dropped.length} backend/permission facet(s): ${dropped.map((f) => f.attribute).join(", ")}`);
    console.log("    (add more via --ignore-facets a,b,c or the \"ignoreFacets\" config key)");
  }
  console.log(`  Found ${allFacets.length} usable facets, using top ${kept.length}:`);
  kept.forEach((f) => console.log(`    ${f.attribute.padEnd(45)} ${f.count} clicks`));

  // ── Step 4: popular values per facet ────────────────────────────────────

  console.log("\nFetching popular values per facet…");
  const valueTasks = kept.map((facet) => async () => {
    const attr = encodeURIComponent(facet.attribute);
    const data = await algoliaFetch(`${base}/${attr}?${qs}`, appId, apiKey);
    const values = (data.values || []).slice(0, topValues).map((v) => ({
      value: v.value,
      count: v.count,
    }));
    console.log(`  ${facet.attribute}: ${values.length} values`);
    return { attribute: facet.attribute, count: facet.count, values };
  });

  const facetDetails = await fetchConcurrent(valueTasks, 5);
  const weighted     = deriveWeights(facetDetails);

  // ── Step 5: build snapshot ────────────────────────────────────────────────

  // Facet → record-path mapping. In Algolia, a facet's analytics attribute name
  // is the same attribute name stored on the record, so an identity map is the
  // correct, index-specific default (no hardcoded schema). If an index
  // stores the value under a different path, edit RECORD-side via the field map
  // or adjust this entry in the generated config.
  const facetToRecordPath = {};
  for (const f of weighted) {
    facetToRecordPath[f.attribute] = f.attribute;
  }

  const recordFieldMap = buildRecordFieldMap(mergedMap);

  const snapshot = {
    meta: {
      index,
      startDate,
      endDate,
      topFacets,
      topValues,
      generatedAt: new Date().toISOString(),
      fieldMapPath: fieldMapArg || null,
    },
    facets: weighted,
    facetToRecordPath,
    recordFieldMap,
  };

  fs.mkdirSync(outDir, { recursive: true });
  const snapshotPath = path.join(outDir, "analytics-snapshot.json");
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot written → ${snapshotPath}`);

  // ── Step 6: generate transform script ────────────────────────────────────

  const generatedPath = path.join(outDir, "transform.generated.js");
  const scriptContent = buildScript(snapshot, generatedPath);
  fs.writeFileSync(generatedPath, scriptContent);
  console.log(`Transform script  → ${generatedPath}`);
  console.log("\nDone. Edit the GENERATED_CONFIG block at the top of the script to fine-tune.\n");
}

// ── config block builder ─────────────────────────────────────────────────────

function buildConfigBlock(snapshot) {
  const { meta, facets, facetToRecordPath, recordFieldMap } = snapshot;

  const popularValues = {};
  for (const f of facets) {
    popularValues[f.attribute] = f.values.map((v) => String(v.value).toLowerCase());
  }

  const facetWeights = {};
  for (const f of facets) {
    facetWeights[f.attribute] = f.weight;
  }

  const rerunNote = meta.fieldMapPath
    ? `--field-map ${meta.fieldMapPath}`
    : "--field-map <path/to/field-map.json> [--sample-record <path/to/records.json>]";

  const lines = [
    "/*__GENERATED_CONFIG_START__*/",
    `// Generated: ${meta.generatedAt}`,
    `// Index:     ${meta.index}`,
    `// Period:    ${meta.startDate} → ${meta.endDate}`,
    `// Re-run:    node generator/generate.js --app-id <APP_ID> --index ${meta.index} --start-date ${meta.startDate} --end-date ${meta.endDate} ${rerunNote}`,
    "//",
    "// Everything between the START/END markers is overwritten on each generator run.",
    "// Make your permanent changes OUTSIDE these markers or in generator/template.js.",
    "",
    "const POPULAR_VALUES = " + JSON.stringify(popularValues, null, 2) + ";",
    "",
    "const FACET_WEIGHTS = " + JSON.stringify(facetWeights, null, 2) + ";",
    "",
    "const FACET_TO_RECORD_PATH = " + JSON.stringify(facetToRecordPath, null, 2) + ";",
    "",
    "// RECORD_FIELD_MAP: maps canonical scoring field keys to dot-paths in the record.",
    "// A path of \"NONE\" means this customer has no equivalent field — scored as neutral.",
    "// Edit this in the field-map file (--field-map) and regenerate; do not edit here.",
    "const RECORD_FIELD_MAP = " + JSON.stringify(recordFieldMap, null, 2) + ";",
    "",
    "/*__GENERATED_CONFIG_END__*/",
  ];

  return lines.join("\n");
}

// ── script injector ──────────────────────────────────────────────────────────

const CONFIG_START = "/*__GENERATED_CONFIG_START__*/";
const CONFIG_END   = "/*__GENERATED_CONFIG_END__*/";

function injectConfigBlock(existing, newBlock) {
  const startIdx = existing.indexOf(CONFIG_START);
  const endIdx   = existing.indexOf(CONFIG_END);
  if (startIdx === -1 || endIdx === -1) return null;
  return existing.slice(0, startIdx) + newBlock + existing.slice(endIdx + CONFIG_END.length);
}

function buildScript(snapshot, outputPath) {
  const configBlock = buildConfigBlock(snapshot);

  if (fs.existsSync(outputPath)) {
    const existing = fs.readFileSync(outputPath, "utf8");
    const injected = injectConfigBlock(existing, configBlock);
    if (injected !== null) return injected;
  }

  const templatePath = path.join(__dirname, "template.js");
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at ${templatePath}`);
  }
  const template = fs.readFileSync(templatePath, "utf8");
  const injected = injectConfigBlock(template, configBlock);
  if (injected === null) {
    throw new Error("template.js is missing the /*__GENERATED_CONFIG_START__*/ / /*__GENERATED_CONFIG_END__*/ markers.");
  }
  return injected;
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
