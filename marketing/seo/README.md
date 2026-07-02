# Showcase seeder

Batch-generates showcase assets and a manifest, then ingests them into the
page data the `/showcase/*` routes read. Two steps: **seed** (generate) →
**ingest** (publish).

## Layout

```
seo/
  seed.ts               # batch generator (npx tsx)
  templates.ts          # template registry (slug → category, media type, domain)
  showcase-schema.ts    # ShowcaseRecord (manifest.jsonl row shape)
  prompts/<category>.md  # per-category system prompt for the prompt writer
  out/<batch>/          # gitignored: manifest.jsonl + assets/ (seeder output)
../scripts/ingest-showcase.mjs   # gate + publish + regenerate page data
../src/data/showcase.ts          # ShowcaseEntry type (page contract)
../src/data/showcaseEntries.generated.ts   # written by ingest — do not edit
../public/showcase/<batch>/      # committed images (ingest destination)
```

## Seed

For each `template × model`, an LLM (OpenAI) writes `--count` prompt variants in
the template's domain, then the render provider (fal.ai) renders each. Every
render appends one row to `out/<batch>/manifest.jsonl`.

```bash
# from marketing/ (or repo root, adjusting the path)
npx tsx seo/seed.ts --template movie-posters --models flux-schnell --count 5 --budget-usd 2
npm run seo:seed -- --template product-shots --models flux-schnell,flux-dev --count 10 --batch launch
npx tsx seo/seed.ts --template movie-posters --models flux-schnell --count 3 --dry-run
```

Flags: `--template` (required), `--models` (csv, required), `--count` (default 5),
`--budget-usd` (default 5), `--batch` (default: a deterministic slug so
re-running the same command is idempotent), `--provider` (default `fal_ai`),
`--dry-run` (no network — deterministic fake prompts + 1×1 PNGs, for offline
checks).

Requires `OPENAI_API_KEY` and `FAL_API_KEY` in the local secret store (the same
store `nodetool serve` uses) or the environment.

### Budget

The run stops once the summed cost reaches `--budget-usd`, writing the manifest
up to that point — a killed batch is still a valid batch. LLM cost is the real
figure from the provider's cost counter; fal image/video calls don't report
cost, so their cost comes from a small per-model estimate table in `seed.ts`.

### Dedup

The dedup key is `sha256(model + normalized-prompt)`. The seeder loads every
existing manifest under `out/`, skips prompts whose key already exists, and —
per `template × model` — only generates the shortfall below `--count`. Re-running
the same command adds zero rows.

## Ingest

```bash
npm run seo:ingest                 # all batches
node scripts/ingest-showcase.mjs --batch movie-posters-fluxschnell
node scripts/ingest-showcase.mjs --dry-run   # report only
```

The index gate drops a row unless: the prompt is ≥ 15 chars, it isn't a
near-duplicate of an already-accepted prompt, and its asset exists and decodes.

Asset handling:
- **Images** are copied into `public/showcase/<batch>/` and committed. When
  `sharp` is installed they're re-encoded to ≤ 300 KB; otherwise committed
  as-is with a warning.
- **Video** rows carry an absolute URL (R2 / media.nodetool.ai) in the manifest,
  passed through untouched. A local video path (dev fallback, no uploader wired
  yet) is copied like an image.

Ingest then regenerates `src/data/showcaseEntries.generated.ts` (sorted by
route for deterministic diffs).

## Typecheck

`seo/` imports backend workspace packages and is excluded from the Next app
tsconfig. Typecheck it on its own:

```bash
npm run seo:typecheck
```
