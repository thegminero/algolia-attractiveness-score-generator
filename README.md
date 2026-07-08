# Attractiveness Score Generator

A zero-dependency Node CLI that queries the Algolia Analytics API and generates a ready-to-deploy product attractiveness scoring transform, seeded with real filter-click data from your index.

## What it produces

For every product record the transform scores **seven attributes**:

| Attribute | Type | Description |
|---|---|---|
| `purchase_attraction_score` | 1–100 | Weighted blend of all six components |
| `score_demand` | 1–100 | Recent orders + store inventory coverage |
| `score_price` | 1–100 | Discount depth vs. category price threshold |
| `score_reviews` | 1–100 | Star rating weighted by review count |
| `score_availability` | 1–100 | Inventory units + site availability flag |
| `score_appeal` | 1–100 | Match against most-clicked facet values (analytics-driven) |
| `score_merch` | 1–100 | Collection, promo, and sale signals |
| `attractiveness_category` | string | Detected category (appliance, seating, mattress, …) |

Use `purchase_attraction_score` as a general sort/ranking signal. Use the individual `score_*` attributes to power specific Rails (e.g. "Best Deals" rail sorts by `score_price`, "Popular Right Now" sorts by `score_demand`).

## How it works

```
generate.js CLI
    │
    ├── Load / create field map   (--field-map)
    │     Maps canonical keys (price, reviewAverage …) to this
    │     client's actual record field paths
    │
    ├── Discovery pass            (--sample-record)
    │     Scans one real record + synonym dictionary to suggest
    │     field paths; prints a batch review report
    │
    ├── GET /2/filters            → top clicked facet attributes
    ├── GET /2/filters/{attr} ×N  → most popular values per facet
    │
    ├── Writes analytics-snapshot.json  (auditable, git-diffable)
    └── Injects config into transform.generated.js
                │
                └── GENERATED_CONFIG block (replaced on every run)
                      POPULAR_VALUES, FACET_WEIGHTS,
                      FACET_TO_RECORD_PATH, RECORD_FIELD_MAP
```

## Requirements

- Node 18+ (uses native `fetch` — no `npm install` needed)
- An Algolia **Analytics** API key with read access

## Quick start

Provide your Algolia API key one of two ways:

```bash
export ALGOLIA_API_KEY=your_api_key   # env var (best for shared/CI use)
```

…or, for convenient local iteration, cache it in your config file (the interactive save offers this, and `*.config.json` is git-ignored so it won't be committed). Precedence is flag > config file > env var.

Then pick whichever way is easiest — all three do the same thing:

### 1. Interactive (no flags, no special characters to type)

Just run it and answer the prompts. Press Enter to accept the default in `[brackets]`:

```bash
./gen
```

(equivalently `node generator/generate.js`, or `gen` on Windows). At the end it can save your answers to a config file so next time is one command.

### 2. Config file (set it once per client, reuse forever)

Interactive setup asks for a short **alias** first (e.g. `acme_prod`) — and saves `<alias>.config.json`. You can then reuse it by alias, no `.config.json` needed:

```bash
./gen --config acme_prod            # → acme_prod.config.json
./gen --config clients/acme.config.json    # or a full path
```

`--config` accepts an alias, a filename, or a path, and also looks inside a `./configs` directory.

A config file is plain JSON:

```json
{
  "appId": "YOUR_APP_ID",
  "apiKey": "YOUR_API_KEY",
  "index": "my_index_prod",
  "startDate": "2026-06-01",
  "endDate": "2026-06-30",
  "out": "./output/acme",
  "fieldMap": "./clients/acme.field-map.json",
  "sampleRecord": "./clients/acme-sample-records.json"
}
```

`apiKey` is optional — include it for frictionless local re-runs, or omit it and use the `ALGOLIA_API_KEY` env var. Config files are git-ignored (`*.config.json`), so a cached key stays local.

### 3. Flags (best for scripts / CI)

```bash
./gen --index my_index_prod --app-id YOUR_APP_ID \
  --field-map ./clients/acme.field-map.json \
  --sample-record ./clients/acme-sample-records.json \
  --out ./output/acme
```

Run `./gen --help` for the full option list. Precedence is **flags > config file > env vars > defaults**.

Backend filters that shoppers never choose — visibility flags and permission/customer-group facets (`visibility_*`, `catalog_permissions.*`, `*customer_group*`) — are dropped automatically and reported. Add more with `--ignore-facets a,b,c` (or `"ignoreFacets"` in the config). The generated config is always specific to the analysed index: `FACET_TO_RECORD_PATH` is an identity map of the kept facets, and `RECORD_FIELD_MAP` starts from generic defaults (`NONE` for anything client-specific) rather than any reference client's schema.

## Zero-setup field mapping (recommended)

You don't hand-write anything. Interactive setup asks for an **alias**, then offers to **pull a few real records straight from the index** (Algolia Search API) and auto-suggest the field mappings. Everything for that client is kept together:

```
clients/<alias>/
  sample-records.json     ← fetched from the index for you
  field-map.json          ← auto-created, then filled in by discovery
  transform.generated.js  ← the scoring script
  analytics-snapshot.json
```

Non-interactive equivalent:

```bash
./gen --config acme_prod --fetch-samples 10
```

`--fetch-samples[=n]` pulls `n` records (default 10) and runs discovery automatically. It needs a key with **search access** to the index; if the key can't search, you'll get a clear message and can pass `--sample-record <file>` with an exported records JSON instead.

Then, on each run:
1. `field-map.json` is created with generic defaults if missing (reference: `generator/field-map.default.json`)
2. Discovery scans the sample records and suggests field paths (top-3 ranked candidates per field)
3. A batch report is printed — review it, set `source: "confirmed"` on the ones you trust
4. Re-run to regenerate with the confirmed mappings

## Multi-client field mapping

Algolia is schemaless — every client calls their fields something different (e.g. `price`, `final_price`, `prix`, `lowestprice_double`). The generator handles this with a **field-map file** per client and an intelligent discovery pass that analyses real records:

```json
{
  "price":              { "path": "prix",                 "source": "confirmed" },
  "compareAtPrice":     { "path": "compare_at_price",     "source": "confirmed" },
  "promoTags":          { "path": "NONE",                 "source": "confirmed" },
  "recentlyOrderedCount": { "path": "recent_orders",      "source": "suggested" }
}
```

- `source: "confirmed"` — locked; discovery will never overwrite, including explicit `"NONE"` values
- `source: "suggested"` — discovery set this; engineer should review and confirm
- `"NONE"` path — this client has no equivalent attribute; scoring degrades gracefully (neutral, no error)

The discovery pass accepts a **single record OR an array of records** (`--sample-record`). Passing more records gives better frequency data and fewer false positives. The report shows the **top 3 ranked candidates** per field (score, value type, frequency) so engineers can choose the right one when the best guess is ambiguous.

The synonym dictionary (`generator/field-aliases.json`) grows across clients and is shared by the whole team — add new naming conventions there as you discover them.

> **Note on verticals:** the script ships a single balanced `default` scoring profile — nothing vertical-specific is assumed, so every product is scored the same regardless of catalogue. To make scoring category-aware, opt in by adding profiles to `CATEGORY_PROFILES` and matching rules to `detectCategory()` in `generator/template.js` (both include inline examples).

## Repository structure

```
generator/
  generate.js              CLI — fetches analytics, discovery, writes outputs
  template.js              Master scoring script template
  field-map.default.json   Canonical field defaults (Shopify/Nacelle schema)
  field-aliases.json       EN/FR synonym dictionary for discovery (shared, grows over time)
  package.json
  README.md                Full CLI reference

clients/                   (suggested) Per-client field-map files
  acme/
    acme.field-map.json
    sample-record.json

output/                    Generated artifacts
  acme/
    analytics-snapshot.json
    transform.generated.js
```

See `generator/README.md` for the full CLI option reference, field-map format details, and customisation guide.
