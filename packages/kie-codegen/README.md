# @nodetool-ai/kie-codegen

Generates KIE node configs and `kie-nodes` manifest from [docs.kie.ai/llms.txt](https://docs.kie.ai/llms.txt).

## Update KIE nodes

From the repo root:

```bash
npm run generate:kie
npm run build --workspace=packages/kie-nodes
```

Review the diff in `packages/kie-codegen/src/configs/` and `packages/kie-nodes/src/kie-manifest.json` before committing.

**New models missing after regenerate?** The docs index is cached in `packages/kie-codegen/.codegen-cache/`. Refresh it, then regenerate:

```bash
npm run generate:configs --workspace=packages/kie-codegen -- --no-cache
npm run generate:kie
```

## Generated files

| Output | Purpose |
|--------|---------|
| `src/configs/image.ts`, `audio.ts`, `video.ts` | Parsed node configs |
| `../kie-nodes/src/kie-manifest.json` | Runtime manifest loaded by `kie-factory.ts` |

Do not edit generated files. Fix `schema-parser.ts`, `schema-fetcher.ts`, or `packages/kie-nodes/src/kie-factory.ts`, then run `npm run generate:kie` again.

## How it works

1. Fetch `llms.txt` and linked English API doc pages.
2. Extract embedded OpenAPI YAML from each page.
3. Write configs and manifest.

Codegen picks up standard task endpoints (`/api/v1/jobs/createTask`) and some audio/Suno paths. Other API shapes (for example `/api/v1/omni/*`) need parser and runtime support first.

Marketing pages like [kie.ai/gemini-omni](https://kie.ai/gemini-omni) are not used — only `docs.kie.ai` links from `llms.txt`.

## Verify

```bash
npm run lint --workspace=packages/kie-codegen
npm run test --workspace=packages/kie-codegen
```
