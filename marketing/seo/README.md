# SEO generation tooling

Two toolsets for generating SEO pages. Both produce artifacts a human reviews
before anything ships — no generator writes to a page-data module on its own.

- **[Model Page Copy Writer](#model-page-copy-writer)** — drafts a
  `/models/<slug>` page from a model slug + provider-coverage rows + pasted
  vendor facts. Output lands in [`drafts/`](drafts/) behind a
  [human-edit gate](drafts/README.md).
- **[Showcase seeder](#showcase-seeder)** — batch-generates showcase assets and
  a manifest, then ingests them into the page data the `/showcase/*` routes read.

## Model Page Copy Writer

Retargets the shipped `SEO Content Engine` example at a single `/models/<slug>`
page. Feed it a model slug, its provider-coverage rows, and the vendor facts you
paste in; it drafts the page in Markdown — YAML `title`/`description`, a blurb,
capability facts, FAQ candidates, and reviewer notes — and writes it to
`drafts/models/<slug>.md`.

- `model-page-copy-writer.json` — the graph. Import it in the NodeTool editor to
  run and tweak it visually.
- `model-page-copy-writer.ts` — the same graph exported as a runnable DSL.

The writer restates and organizes the facts you give it. It does not invent
specs, benchmarks, prices, or dates, and it flags its own uncertainty in a
`## Reviewer notes` block so you know what to verify.

### Run it from the CLI

Edit the three inputs and pick a model, then run **from the repo root** so the
draft lands in the right place:

1. Open `model-page-copy-writer.ts` and set:
   - `slug` → the model's URL slug (kebab-case; becomes the filename).
   - `coverage` → the model's rows from the provider-coverage table.
   - `facts` → the vendor facts, pasted.
   - the `writer` agent's `model` → any language model you have a key for. The
     shipped `model: {}` is a placeholder; the default `max_tokens` (16000) fits
     the common OpenAI and Anthropic models.
2. Run it:

   ```bash
   # from the repo root, so paths resolve to marketing/seo/drafts/models/
   npm run dev:nodetool -- run marketing/seo/model-page-copy-writer.ts
   ```

The draft is written to `marketing/seo/drafts/models/<slug>.md` and previewed in
the run output. Then work it per the [gate](drafts/README.md).

> The path is relative to the current directory, so run from the repo root. In
> the editor, the file lands in your NodeTool workspace instead — use the CLI
> when you want it in the repo.

### Competitor pages

The same graph drafts competitor comparison pages (PR-5, wave 2): paste the
competitor's facts into `facts` and its coverage/positioning into `coverage`,
and point `slug` at the competitor page. The output structure — blurb, facts,
FAQ, reviewer notes — carries over unchanged.

## Showcase seeder

Batch-generates showcase assets and a manifest, then ingests them into the
page data the `/showcase/*` routes read. Two steps: **seed** (generate) →
**ingest** (publish).

### Layout

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

### Seed

For each `template × model`, an LLM (Claude Code) writes `--count` prompt variants
in the template's domain, then the render provider (fal.ai) renders each. Every
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

Prompt writing goes through Claude Code (the Claude Agent SDK): no API key — it
spawns the `claude` CLI, which authenticates from the logged-in subscription
(`~/.claude`) locally, or from `CLAUDE_CODE_OAUTH_TOKEN` in CI. Rendering
requires `FAL_API_KEY` in the local secret store (the same store `nodetool serve`
uses) or the environment.

#### Budget

The run stops once the summed cost reaches `--budget-usd`, writing the manifest
up to that point — a killed batch is still a valid batch. LLM cost is the real
figure from the provider's cost counter; fal image/video calls don't report
cost, so their cost comes from a small per-model estimate table in `seed.ts`.

#### Dedup

The dedup key is `sha256(model + normalized-prompt)`. The seeder loads every
existing manifest under `out/`, skips prompts whose key already exists, and —
per `template × model` — only generates the shortfall below `--count`. Re-running
the same command adds zero rows.

### Model Duel

A thin wrapper over the seeder: render one **curated** prompt set through **two**
models and stamp both rows with a shared `params.duelId`, so PR-4's pair pages
can line up matched same-prompt outputs.

```bash
npx tsx seo/seed.ts --template movie-posters --duel flux-schnell,flux-dev
npx tsx seo/seed.ts --template product-trailers --duel kling,hailuo --dry-run
```

- `--duel <a>,<b>` replaces `--models` (they're mutually exclusive). Every prompt
  is rendered by both models; the two rows share `params.duelId` (the join key)
  and `params.duelPair` (the canonical, sorted pair slug).
- Prompts come from `prompts/duels/<pair>.md`, not the LLM — so `--count` and the
  prompt-writer are bypassed, so no Claude Code auth is needed. `--template`
  still supplies render settings (aspect ratio, media type) + categorization.
- The budget cap still applies (a killed duel is a valid partial batch).
- Idempotent: re-running adds zero rows. Dedup is namespaced by the canonical
  pair, so the argument order doesn't matter and duel rows are never suppressed
  by an unrelated single-model render of the same prompt (a pair page needs both
  halves).

#### Curated prompt sets

`prompts/duels/<pair>.md` holds the prompts, one per line — full render prompts,
not a prompt-writer system prompt. Markdown list markers (`- `, `* `, `1. `),
blank lines, `#` headings and `<!-- comments -->` are ignored, so the file can
carry a human-readable intro. Name the file with either argument order or the
sorted slug (`flux-dev-vs-flux-schnell.md`); the loader tries all three. Keep
5–8 prompts per pair, chosen to expose real differences (text rendering,
physics, motion). Shipped examples: `flux-schnell-vs-flux-dev.md` (image),
`kling-vs-hailuo.md` (video).

### Ingest

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

### Typecheck

`seo/` imports backend workspace packages and is excluded from the Next app
tsconfig. Typecheck it on its own:

```bash
npm run seo:typecheck
```
