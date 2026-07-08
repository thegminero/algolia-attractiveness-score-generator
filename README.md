# Attractiveness Score Generator

A Node CLI that queries the Algolia Analytics API and generates a ready-to-deploy product attractiveness scoring transform, seeded with real filter-click data from your index.

## What it produces

For every product record the transform scores **seven attributes**:

| Attribute | Type | Description |
|---|---|---|
| `purchase_attraction_score` | 1–100 | Weighted blend of all six components |
| `score_demand` | 1–100 | Recent orders + store inventory coverage |
| `score_price` | 1–100 | Discount depth vs. price threshold |
| `score_reviews` | 1–100 | Star rating weighted by review count |
| `score_availability` | 1–100 | Inventory units + site availability flag |
| `score_appeal` | 1–100 | Match against most-clicked facet values (analytics-driven) |
| `score_merch` | 1–100 | Collection, promo, and sale signals |
| `attractiveness_category` | string | Scoring profile used (`default` unless you add verticals) |

Use `purchase_attraction_score` as a general sort/ranking signal. Use the individual `score_*` attributes to power specific rails (e.g. a "Best Deals" rail sorts by `score_price`, "Popular Right Now" sorts by `score_demand`).

## How it works

```
generate.js CLI
    │
    ├── (optional) Fetch sample records  (--fetch-samples)  → Search API
    │
    ├── Load / create field map          (--field-map, auto-created if missing)
    │     Maps canonical keys (price, reviewAverage …) to the
    │     index's actual record field paths
    │
    ├── Discovery pass                   (--sample-record)
    │     Scans real records + a synonym dictionary to suggest
    │     field paths; prints a batch review report
    │
    ├── GET /2/filters                   → top clicked facet attributes
    ├── GET /2/filters/{attr} ×N         → most popular values per facet
    │
    ├── Writes analytics-snapshot.json   (auditable, git-diffable)
    └── Injects config into transform.generated.js
                │
                └── GENERATED_CONFIG block (replaced on every run)
                      POPULAR_VALUES, FACET_WEIGHTS,
                      FACET_TO_RECORD_PATH, RECORD_FIELD_MAP
```

## Requirements

- Node 18+ (uses the built-in `fetch`)
- An **Analytics API key** (the `analytics` ACL) — required, to read filter-click data
- Optionally a **Search API key** (the `search` ACL) — only needed to auto-fetch sample records from the index. If you don't have one, skip it and pass your own records file instead.

> A single key that carries **both** ACLs works for everything — pass it as the analytics key (or via the legacy `--api-key` / `ALGOLIA_API_KEY`, which falls back for both).

## Quick start

Provide the keys via env vars (best for shared/CI use):

```bash
export ALGOLIA_ANALYTICS_API_KEY=your_analytics_key   # required
export ALGOLIA_SEARCH_API_KEY=your_search_key         # optional (sample fetch)
```

…or cache them in a config file for convenient local iteration (the interactive save offers this). Config files are saved under `local_configs/` by default, which is git-ignored so cached keys never get committed. Precedence is flag > config file > env var.

Three ways to run it — all do the same thing:

### 1. Interactive

Run it and answer the prompts (press Enter to accept the `[default]`):

```bash
./gen
```

Equivalently `node generator/generate.js`, or `gen` on Windows. At the end it can save your answers to a config file so the next run is a single command.

### 2. Config file

Interactive setup asks for a short **alias** first (e.g. `magento2_prod`, typically one per index) and saves `local_configs/<alias>.config.json`. Reuse it by alias — no folder or `.config.json` suffix needed:

```bash
./gen --config magento2_prod                              # → local_configs/magento2_prod.config.json
./gen --config local_configs/magento2_prod.config.json   # or a full path
```

`--config` accepts an alias, a filename, or a path. For an alias it looks in `local_configs/`, `configs/`, and the current directory.

To change an existing config later, edit it interactively with every prompt pre-filled — your answers are saved back to the same file:

```bash
./gen --edit bestbuy_en      # edit in place
./gen --edit                 # or omit the alias to pick from a list
./gen --delete bestbuy_en    # remove it (asks first; can also delete indices/bestbuy_en)
./gen --delete               # or omit the alias to pick from a list
```

If you run `./gen` with **no config** and configs already exist, it shows an arrow-key list (↑/↓ to move, Enter to select, Esc to cancel) so you can pick one to **run**, **edit**, or **delete** — or create a new one:

```
Select a config:
❯ bestbuy_en
  magento2_production_fr_products
  ＋ Create a new config
```

(When input isn't an interactive terminal — e.g. piped or CI — it falls back to a numbered prompt.)

A config file is plain JSON:

```json
{
  "appId": "YOUR_APP_ID",
  "analyticsApiKey": "YOUR_ANALYTICS_KEY",
  "searchApiKey": "YOUR_SEARCH_KEY",
  "index": "my_index_prod",
  "startDate": "2026-06-01",
  "endDate": "2026-06-30",
  "out": "./output"
}
```

The keys are optional in the file — include them for frictionless local re-runs, or omit them and use the `ALGOLIA_ANALYTICS_API_KEY` / `ALGOLIA_SEARCH_API_KEY` env vars. `searchApiKey` can be left out entirely if you're not auto-fetching samples. Config files live in the git-ignored `local_configs/` folder, so cached keys stay local.

### 3. Flags (best for scripts / CI)

```bash
./gen --index my_index_prod --app-id YOUR_APP_ID --fetch-samples 10 --out ./output
```

Run `./gen --help` for the full option list. Precedence is **flags > config file > env vars > defaults**.

Backend filters that shoppers never choose — visibility flags and permission/customer-group facets (`visibility_*`, `catalog_permissions.*`, `*customer_group*`) — are dropped automatically and reported. Add more with `--ignore-facets a,b,c` (or `"ignoreFacets"` in the config). The generated config is always specific to the analysed index: `FACET_TO_RECORD_PATH` is an identity map of the kept facets, and `RECORD_FIELD_MAP` starts from generic defaults (`NONE` for anything index-specific) rather than any preset schema.

## Zero-setup field mapping (recommended)

You don't hand-write anything. Interactive setup asks for an alias, then offers to **pull a few real records straight from the index** (Algolia Search API) and auto-suggest the field mappings. Everything for that index is grouped together:

```
indices/<alias>/
  sample-records.json     ← fetched from the index for you
  field-map.json          ← auto-created, then filled in by discovery
  transform.generated.js  ← the scoring script
  analytics-snapshot.json
```

Non-interactive equivalent:

```bash
./gen --config magento2_prod --fetch-samples 10
```

`--fetch-samples[=n]` pulls `n` records (default 10) and runs discovery automatically — this is why the key needs **Search** access. If it can't search the index, you'll get a clear message and can pass `--sample-record <file>` with an exported records JSON instead.

Then, on each run:
1. `field-map.json` is created with generic defaults if missing (reference: `generator/field-map.default.json`)
2. Discovery scans the sample records and suggests field paths (top-3 ranked candidates per field)
3. A batch report is printed — review it, set `source: "confirmed"` on the ones you trust
4. Re-run to regenerate with the confirmed mappings

## Field mapping (any index schema)

Algolia is schemaless — every index names its fields differently (e.g. `price`, `final_price`, `prix`, `lowestprice_double`). The generator adapts via a **field-map file** plus a discovery pass that analyses real records:

```json
{
  "price":                { "path": "prix",             "source": "confirmed" },
  "compareAtPrice":       { "path": "compare_at_price", "source": "confirmed" },
  "promoTags":            { "path": "NONE",             "source": "confirmed" },
  "recentlyOrderedCount": { "path": "recent_orders",    "source": "suggested" }
}
```

- `source: "confirmed"` — locked; discovery will never overwrite, including explicit `"NONE"` values
- `source: "suggested"` — discovery set this; review and confirm
- `"NONE"` path — this index has no equivalent attribute; scoring degrades gracefully (neutral, no error)

The discovery pass accepts a **single record OR an array of records** (`--sample-record`). More records give better frequency data and fewer false positives. The report shows the **top 3 ranked candidates** per field (score, value type, frequency) so you can pick the right one when the best guess is ambiguous.

The synonym dictionary (`generator/field-aliases.json`) is a plain JSON file committed to the repo. It doesn't grow on its own: when discovery misses a field because an index used an unusual name, add that name to the relevant key's list and commit it — future runs (and teammates who pull) then match it automatically.

> **Note on verticals:** the script ships a single balanced `default` scoring profile — nothing vertical-specific is assumed, so every product is scored the same regardless of catalogue. To make scoring category-aware, opt in by adding profiles to `CATEGORY_PROFILES` and matching rules to `detectCategory()` in `generator/template.js` (both include inline examples).

## Repository structure

```
generator/
  generate.js              CLI — fetches analytics, discovery, writes outputs
  template.js              Master scoring script template
  field-map.default.json   Canonical field defaults (generic)
  field-aliases.json       EN/FR synonym dictionary for discovery (shared, grows over time)
  package.json
  README.md                Full CLI reference

indices/<alias>/           Per-index working files — whole folder git-ignored (customer-specific)
  field-map.json
  sample-records.json
  analytics-snapshot.json
  transform.generated.js    ← deploy this as the index's transform; don't commit it

local_configs/             Saved configs; whole folder git-ignored (may hold API keys)
  <alias>.config.json
```

> Only `generator/` is meant to be committed. Everything the tool generates per index (`indices/`), your saved configs (`local_configs/`), and any stray `transform.generated.js` / `analytics-snapshot.json` are git-ignored.

See `generator/README.md` for the full CLI option reference, field-map format details, and customisation guide.
