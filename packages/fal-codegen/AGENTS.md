# FAL Codegen

This package generates `packages/fal-nodes/src/fal-manifest.json` from FAL
OpenAPI schemas.

## Generation Flow

1. `src/configs/` lists FAL endpoint IDs and local overrides.
2. `src/schema-fetcher.ts` fetches schemas from
   `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=...` and caches
   them in `.codegen-cache/`.
3. `src/schema-parser.ts` converts provider OpenAPI schemas to NodeTool specs.
4. `src/node-generator.ts` applies local config overrides.
5. `npm run generate:fal` writes `packages/fal-nodes/src/fal-manifest.json`.

To add endpoints without regenerating everything, list them in `src/configs/`
and run `npx tsx scripts/append-new-endpoints.ts`, which fetches only what the
manifest is missing.

## Editing Rules

- Do not edit `packages/fal-nodes/src/fal-manifest.json` directly.
- Provider schema interpretation belongs in `schema-parser.ts`.
- Endpoint-specific fixes belong in `src/configs/`.
- Runtime behavior for all generated FAL nodes belongs in
  `packages/fal-nodes/src/fal-factory.ts` or `fal-base.ts`.

## Fixture mode and the drift gate

`npm run generate:fal` reads live schemas and live pricing, so its output is not
reproducible and nothing catches a generator change that quietly moves a node's
type, default, or enum. Fixture mode is the reproducible half:
`src/fixture-generate.ts` reads only the schema fixtures under `fixtures/`, named
by `fixtures/generator-manifest.json`, and writes the outputs that manifest
declares — a node-source module per fixture module, plus the manifest JSON. No
network, no pricing, no timestamps, so two runs are byte-identical.

`npm run generate:fal:check` generates into a temporary directory and diffs the
declared outputs against `fixtures/expected/`. It exits non-zero on any
difference, on a declared fixture that is absent, on a fixture whose endpoint
`src/configs/` no longer carries, and when it compared nothing at all. `--strict`
also fails on an expected file no manifest output declares.

When a generator change is intended, refresh the expected outputs with
`node scripts/provider-codegen-check.mjs --provider fal --write` and commit the
diff. Adding a fixture means adding the schema under `fixtures/schemas/`, the
entry in the generator manifest, and the output paths it feeds.

`.github/workflows/provider-codegen.yml` runs the check on every diff touching
this package.

## Verification

After changing FAL codegen:

```bash
npm run generate:fal
npm run generate:fal:check
npm run lint --workspace=packages/fal-codegen
npm run test --workspace=packages/fal-codegen
```

Inspect generated manifest diffs before committing.
