# fal-codegen

Code generator for `@nodetool/fal-nodes`. Reads the FAL Platform catalog and
OpenAPI schemas, then emits TypeScript node classes under
`../fal-nodes/src/generated/`.

Two JSON snapshots live alongside the generated files:

| File | Contains | Refreshed by |
|---|---|---|
| `fal-unit-pricing.json` | Unit prices per endpoint | workflow 1 |
| `fal-models.json` | Catalog metadata + OpenAPI schemas | workflow 2 |

---

## The 5 workflows

### 1 — Refresh pricing

Updates `fal-unit-pricing.json`. Run when FAL changes rates (~12 min: catalog
crawl + cooldown + batched pricing fetch).

```bash
npx tsx src/generate.ts --pricing-only --from-platform
```

---

### 2 — Refresh model schemas

Updates `fal-models.json` (catalog metadata + all OpenAPI schemas). Run when
FAL adds or changes models.

```bash
npx tsx src/generate.ts --models-only --from-platform
```

---

### 3 — Generate (fully offline)

Regenerates all `.ts` files from the two local snapshots. No network calls.
**Use this when iterating on the parser or generator.**

```bash
npx tsx src/generate.ts \
  --from-models-snapshot ../fal-nodes/src/generated/fal-models.json \
  --pricing-snapshot ../fal-nodes/src/generated/fal-unit-pricing.json
```

---

### 4 — Generate with live models, cached pricing

Fetches fresh catalog + OpenAPI from the API but reads prices from the local
snapshot. Good when you want up-to-date schemas without hitting the pricing
rate limit again.

```bash
npx tsx src/generate.ts --from-platform \
  --pricing-snapshot ../fal-nodes/src/generated/fal-unit-pricing.json
```

---

### 5 — Generate fully live

Fetches everything from the API in one pass (catalog + OpenAPI + pricing).
Slowest option; pricing 429s are likely on large catalogs — use a snapshot
instead unless the pricing data is genuinely stale.

```bash
npx tsx src/generate.ts --from-platform
```

---

## Useful flags

| Flag | Effect |
|---|---|
| `--dry-run` | Fetch/parse only; no files written |
| `--skip-pricing` | Set `falUnitPricing = null` on all nodes; skip pricing fetch |
| `--pricing-snapshot <path>` | Read prices from file instead of live API |
| `--pricing-only` | Write pricing snapshot only (no OpenAPI, no `.ts` emit) |
| `--models-only` | Write models snapshot only (no pricing, no `.ts` emit) |
| `--save-models-snapshot <path>` | Also write models snapshot during a `--from-platform` run |
| `--from-models-snapshot <path>` | Offline codegen from a saved models snapshot |
| `--fal-api-key <key>` | Override `FAL_API_KEY` for this run |
| `--output-dir <path>` | Output directory (default: `../fal-nodes/src/generated`) |

## Throttle env vars

| Variable | Default | Effect |
|---|---|---|
| `FAL_CATALOG_PAGE_GAP_MS` | `550` + jitter | Pause between catalog pages (`0` to disable) |
| `FAL_OPENAPI_BATCH_GAP_MS` | `500` + jitter | Pause between OpenAPI batch requests (`0` to disable) |
| `FAL_CATALOG_TO_PRICING_GAP_MS` | `120000` | CLI-level wait after catalog before pricing-only fetch (`0` to skip) |
| `FAL_PRICING_POST_CATALOG_COOLDOWN_MS` | auto-scaled | Override the built-in post-catalog pause inside the pricing fetcher |

## API key

Required for authenticated rate limits and for `GET /v1/models/pricing`.
Set `FAL_API_KEY` in the shell, in `../../.env` (nodetool repo root), or
pass `--fal-api-key <key>`.
