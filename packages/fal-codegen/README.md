# @nodetool-ai/fal-codegen

Fetches OpenAPI schemas from FAL.ai and generates `fal-nodes/src/fal-manifest.json`.

```bash
npm run generate:fal
```

The root `generate:fal` script runs in strict mode. If any configured endpoint
cannot be fetched or parsed, generation fails instead of writing a partial
manifest. Remove stale endpoints from `src/configs/` or update them to the
current FAL endpoint IDs before regenerating.

Schemas are cached in `.codegen-cache/`. Use `-- --no-cache` from this workspace
when you need to refresh from FAL directly:

```bash
npm run generate --workspace=packages/fal-codegen -- --strict --no-cache
```

## Adding endpoints

Add them to `src/configs/`, then append them to the manifest without
re-fetching the ~1400 schemas already in it:

```bash
npx tsx scripts/append-new-endpoints.ts
```

The script fetches only endpoints the manifest is missing, applies their
config overrides, and appends them. It does not touch the pricing bundles —
those need `FAL_API_KEY` and come from a full `npm run generate:fal`.
