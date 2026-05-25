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

## Editing Rules

- Do not edit `packages/fal-nodes/src/fal-manifest.json` directly.
- Provider schema interpretation belongs in `schema-parser.ts`.
- Endpoint-specific fixes belong in `src/configs/`.
- Runtime behavior for all generated FAL nodes belongs in
  `packages/fal-nodes/src/fal-factory.ts` or `fal-base.ts`.

## Verification

After changing FAL codegen:

```bash
npm run generate:fal
npm run lint --workspace=packages/fal-codegen
npm run test --workspace=packages/fal-codegen
```

Inspect generated manifest diffs before committing.
