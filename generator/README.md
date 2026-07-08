# Attractiveness Script Generator

A Node CLI that queries the Algolia Analytics API and generates a
ready-to-deploy product attractiveness scoring transform, seeded with real filter-click data.

## How it works

```
generate.js
    │
    ├── (optional) Fetch sample records  (--fetch-samples)  → Search API
    ├── Load / create field map  (--field-map, auto-created if missing)
    ├── Discovery pass           (--sample-record)  → updates non-confirmed paths
    ├── Print summary report
    │
    ├── GET /2/filters               → top clicked facet attributes
    ├── GET /2/filters/{attr} ×N     → popular values per facet
    │
    ├── Derives click-share weights and popular value sets
    ├── Writes analytics-snapshot.json
    └── Injects config block into transform.generated.js
```

---

## Output attributes written to every record

| Attribute | Type | Description |
|---|---|---|
| `purchase_attraction_score` | 1–100 | Weighted blend of all six components |
| `score_demand` | 1–100 | Recent orders + store coverage |
| `score_price` | 1–100 | Discount depth + vs. category price threshold |
| `score_reviews` | 1–100 | Star rating × review count |
| `score_availability` | 1–100 | Inventory units + site availability flag |
| `score_appeal` | 1–100 | Record values vs. most-clicked facet values |
| `score_merch` | 1–100 | Collection/promo/sale signals |
| `attractiveness_category` | string | Detected category (appliance, seating, …) |

Each `score_*` attribute can be used independently as an Algolia custom-ranking attribute, numeric facet, or filter, so different Rails/queries can sort by only the dimensions they care about.

---

## Requirements

- Node 18+ (uses the built-in `fetch`)
- An **Analytics API key** (`analytics` ACL) — required, to read filter-click data
- Optionally a **Search API key** (`search` ACL) — only to auto-fetch sample records from the index (a single key with both ACLs also works)

---

## Quick start (defaults only)

Three ways to invoke it (all equivalent):

```bash
export ALGOLIA_ANALYTICS_API_KEY=your_analytics_key   # required
export ALGOLIA_SEARCH_API_KEY=your_search_key         # optional (sample fetch)

# 1. Interactive — answer the prompts
#    (if configs already exist, it lists them first so you can run/edit/delete one)
./gen

# 2. Config file — reuse saved settings (by alias, filename, or path)
./gen --config magento2_prod
./gen --edit magento2_prod            # tweak an existing config, prompts pre-filled
./gen --edit                          # ...or omit the alias to pick from a list
./gen --delete magento2_prod          # remove a config (asks first)
./gen --delete                        # ...or omit the alias to pick from a list

# 3. Flags — scriptable / CI
./gen --index my_index_prod --app-id YOUR_APP_ID --out ./output
```

`./gen` is a short wrapper for `node generator/generate.js` (use `gen` on Windows). Run `./gen --help` for the full option list. Precedence: flags > config file > env vars > defaults.

Produces two files in `./output/`:

| File | Purpose |
|---|---|
| `analytics-snapshot.json` | Raw + derived analytics + field map used |
| `transform.generated.js` | Drop-in scoring transform, ready to deploy |

---

## Configuring record field names (any index schema)

Algolia is schemaless — every index names its record fields differently. The generator handles this through a **field-map file** that maps canonical scoring keys (e.g. `price`, `reviewAverage`, `promoTags`) to the actual dot-paths in that index's records.

### Easiest path — let the tool fetch the records

You don't need to export anything or hand-write a field map. Give an alias in interactive mode (or run non-interactively) and let it pull real records from the index:

```bash
./gen --config magento2_prod --fetch-samples 10
```

This pulls 10 real records via the Search API, saves them to `indices/<alias>/sample-records.json`, auto-creates `indices/<alias>/field-map.json`, and runs discovery — all in one command. (Requires a key with Search access to the index; otherwise fall back to Step 1–2 below with an exported records file.)

### Step 1 — create a field-map file

The field map is **created automatically** the first time you reference one — you never hand-write it from scratch:

```bash
node generator/generate.js \
  --index my_index_prod \
  --field-map ./indices/acme/field-map.json \
  --out ./output/acme
```

If `field-map.json` does not exist, it is created with **generic defaults** (see `generator/field-map.default.json` for the reference/annotated version). All entries start with `source: "default"`.

### Step 2 — run the discovery pass

Either use `--fetch-samples` (above) or provide your own records. The `--sample-record` flag accepts either a **single JSON object** or a **JSON array of records** — more records give the algorithm more data to confirm the right path and surface frequency counts:

```bash
node generator/generate.js \
  --index my_index_prod \
  --field-map  ./indices/acme/field-map.json \
  --sample-record ./indices/acme/sample-records.json \
  --out ./output/acme
```

The CLI prints a **single batch summary report** with ranked alternatives for every suggested field:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│  FIELD MAP DISCOVERY REPORT
│  Aggregated from 25 sample records
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│  ✔  CONFIRMED (locked, will not change on re-run)
│  compareAtPrice                    compare_at_price                  compare_at_price
│
│  ●  SUGGESTED-NEW (set for first time — review, then change source to "confirmed")
│  price                             price                             final_price ◄
│  •  final_price          score=0.92  type=number    freq=20/25
│  •  price                score=0.71  type=number    freq=25/25
│  •  list_price           score=0.68  type=number    freq=10/25
│
│  ○  SUGGESTED-NONE (no confident match — set path manually or accept NONE)
│  promoTags                         named_tags.promo                  NONE ◄
│  •  on_sale              score=0.55  type=boolean   freq=18/25
```

### Step 3 — review and confirm

Open `acme.field-map.json` and inspect the suggested entries. When a path is correct, change `source` from `"suggested"` to `"confirmed"`:

```json
{
  "price": { "path": "prix", "source": "confirmed" },
  "promoTags": { "path": "NONE", "source": "confirmed" }
}
```

`"NONE"` is a valid, explicit signal: it means this index has no equivalent attribute. The scoring function will degrade gracefully (neutral contribution, no error). Setting `source: "confirmed"` prevents future discovery runs from overwriting it.

### Step 4 — regenerate

Re-run the generator with the updated field-map. The discovery pass will no longer touch confirmed entries.

---

## The field-map file format

```json
{
  "price":            { "path": "prix",  "source": "confirmed" },
  "compareAtPrice":   { "path": "compare_at_price", "source": "confirmed" },
  "inventoryAvailable": { "path": "NONE", "source": "confirmed" },
  "recentlyOrderedCount": { "path": "recently_ordered_count", "source": "suggested" }
}
```

| Source value | Meaning |
|---|---|
| `"default"` | Inherited from `field-map.default.json`; discovery may update |
| `"suggested"` | Discovery pass found a match; not yet reviewed by an engineer |
| `"suggested-none"` | Discovery found no match and wrote NONE; review manually |
| `"confirmed"` | Locked — discovery will never overwrite, even if path is "NONE" |

---

## How matching works

The discovery pass uses **token-based matching** — field names are split on `_`, `-`, and camelCase boundaries, then noise suffixes (`_string_mv`, `_double`, `_int`, `_long`, `_boolean`, `_text`) are stripped before comparing. This means:

- `averagescore_double` matches `reviewAverage` because `averagescore` is an alias
- `sortPrice_Guest` does NOT match `price` because `sortprice` is not in the alias list (safe from false positives)
- `final_price` matches `price` with score 0.92 because `final` + `price` tokens are present

Candidates are also scored for **value type fitness**: a field that contains numbers gets a bonus when mapped to `price`/`reviewAverage`, and a penalty if mapped to `inventoryAvailable` (which expects boolean). The top 3 ranked candidates are shown in the report per field.

## Extending the synonym dictionary

`generator/field-aliases.json` is a plain JSON file committed to the repo — it's shared with the team through git, not through any auto-learning. When discovery misses a field because an index used an unusual name, add that name to the relevant key's list and commit it, so future runs (and teammates who pull) match it automatically:

```json
"reviewAverage": [
  "average_rating", "avg_rating", "rating", "note_moyenne",
  "customer_rating"     ← add new synonym here
]
```

## Optional: category-aware scoring

By default the script ships a **single balanced `default` profile** — no vertical-specific weights are assumed, so every product is scored the same way regardless of catalogue. This is intentional: the generator has no way to know an index's verticals, and hardcoding furniture/appliance verticals into every generated script would be noise.

If you want category-aware scoring (different component weights or price thresholds per vertical), opt in by editing `generator/template.js` (or the generated script, outside the config markers):

1. Add named profiles to `CATEGORY_PROFILES` (e.g. `power_tools`, `abrasives`)
2. Add matching rules to `detectCategory()` — use `buildCategoryHaystack(record)` to get a lowercase string of the product's descriptive fields, then match with regex

Both functions include inline examples showing exactly how.

---

## All CLI options

| Flag | Config key | Env var | Default | Description |
|---|---|---|---|---|
| `--config` | — | — | — | Load settings from a JSON config file (alias, filename, or path) |
| `--edit [alias]` | — | — | — | Edit an existing config interactively (prompts pre-filled), saved back to the same file. Omit the alias to pick from an arrow-key list |
| `--delete [alias]` | — | — | — | Delete a config file (asks first; can also remove its `indices/<alias>` working dir). Omit the alias to pick from an arrow-key list |
| `--app-id` | `appId` | `ALGOLIA_APP_ID` | *(required)* | Algolia Application ID |
| `--analytics-api-key` | `analyticsApiKey` | `ALGOLIA_ANALYTICS_API_KEY` | *(required)* | API key with the `analytics` ACL |
| `--search-api-key` | `searchApiKey` | `ALGOLIA_SEARCH_API_KEY` | *(optional)* | API key with the `search` ACL; only for auto-fetching sample records |
| `--api-key` | `apiKey` | `ALGOLIA_API_KEY` | *(optional)* | Legacy combined Analytics+Search key; used as a fallback for both |
| `--index` | `index` | `ALGOLIA_INDEX` | *(required)* | Index name to analyse |
| `--start-date` | `startDate` | — | 30 days ago | Period start (`YYYY-MM-DD`) |
| `--end-date` | `endDate` | — | today | Period end (`YYYY-MM-DD`) |
| `--top-facets` | `topFacets` | — | `10` | How many top facets to use |
| `--top-values` | `topValues` | — | `20` | Popular values per facet |
| `--out` | `out` | — | current dir | Output directory |
| `--region` | `region` | — | `us` | Analytics **data-center**: `us` for US-hosted apps, `de` for EU-hosted apps (only change if your Algolia app lives in the EU) |
| `--field-map` | `fieldMap` | — | — | Path to the field-map JSON file (auto-created if missing) |
| `--sample-record` | `sampleRecord` | — | — | One record OR array of records (auto-discovery) |
| `--fetch-samples[=n]` | `fetchSamples` | — | — | Pull `n` real records (default 10) from the index via the Search API for auto-discovery (needs search access) |
| `--ignore-facets` | `ignoreFacets` | — | — | Extra facets to drop, comma-separated (backend/permission facets are dropped automatically) |
| `--interactive`, `-i` | — | — | — | Force interactive prompts |
| `--help`, `-h` | — | — | — | Show usage help |

Precedence: **flags > config file > env vars > defaults**. For shared/CI use, supply the keys via `ALGOLIA_ANALYTICS_API_KEY` / `ALGOLIA_SEARCH_API_KEY`; for local iteration you can cache them in the (git-ignored) config file.

---

## The generated config block

At the top of `transform.generated.js`:

```js
/*__GENERATED_CONFIG_START__*/
// Generated: 2026-07-07T13:00:00.000Z
// ...
const POPULAR_VALUES       = { ... };
const FACET_WEIGHTS        = { ... };
const FACET_TO_RECORD_PATH = { ... };
const RECORD_FIELD_MAP     = { ... };  // ← field-map for this index
/*__GENERATED_CONFIG_END__*/
```

Only the content between the markers is replaced on re-run. Manual edits outside (category profiles, scoring logic) survive every regeneration.

The generated config is **index-specific**, never a hardcoded template:

- `POPULAR_VALUES` / `FACET_WEIGHTS` come straight from this index's analytics.
- `FACET_TO_RECORD_PATH` is an **identity map** of the facets that were kept (in Algolia a facet's analytics name equals its record attribute name), so it reflects your index rather than any preset schema.
- `RECORD_FIELD_MAP` starts from **generic defaults** — only the near-universal fields (`price`, `compare_at_price`, availability) get a best-guess path; everything else defaults to `NONE` until you map it via `--field-map` + `--sample-record`.

---

## Backend / permission facets are filtered out

Analytics counts every filter applied at query time, including backend filters the shopper never chose — visibility flags and permission/customer-group gating. These are dropped automatically (patterns: `visibility_*`, `catalog_permissions.*`, anything containing `customer_group`, bare numeric attribute names). The run prints exactly what it ignored:

```
Ignored 4 backend/permission facet(s): visibility_search, catalog_permissions.customer_group_7, ...
```

To drop additional facets, pass `--ignore-facets a,b,c` or set `"ignoreFacets": ["a","b"]` in your config file (or answer the advanced prompt in interactive mode).

---

## Sharing across engineers

Commit `generator/` to the shared repo. When you use an alias, everything for an index is grouped under `indices/<alias>/` automatically:

```
generator/              ← commit: shared tooling, used for every index
  generate.js
  template.js
  field-map.default.json
  field-aliases.json      ← grows over time

indices/                ← per-index working files (grouped by alias)
  magento2_prod/
    field-map.json          ← auto-created, reviewed & confirmed  (commit)
    sample-records.json     ← fetched from the index              (usually .gitignore)
    analytics-snapshot.json ← last run                            (optional)
    transform.generated.js  ← the scoring script                  (commit)

local_configs/          ← saved configs; whole folder git-ignored (may hold API keys)
  magento2_prod.config.json
```

Field-map files are worth committing (the confirmed mappings are real work). Fetched `sample-records.json` and everything under `local_configs/` are best kept local.
