---
layout: page
title: "FAL: Add Models & Nodes"
description: "How to add a new FAL endpoint as a generated NodeTool node — from config entry to running node."
---

FAL nodes in NodeTool are **generated**, not hand-written. A codegen pipeline fetches each endpoint's OpenAPI schema from `fal.ai`, converts it to a manifest, and the runtime loads node classes from that manifest.

> **Audience:** coding agents and contributors adding new FAL endpoints or fixing generated node behavior.

---

## TL;DR

1. Add the endpoint ID + `NodeConfig` to the right `src/configs/<category>.ts` file in `packages/fal-codegen/`.
2. Run `npm run generate:fal` from the repo root.
3. Run `npm run build:packages` (fal-nodes loads from `dist/`).
4. Run `npm run lint --workspace=packages/fal-codegen` and `npm run test --workspace=packages/fal-nodes`.
5. Open a PR — never commit manual edits to `fal-manifest.json`.

---

## Where things live

| Concern | Path |
|---|---|
| Endpoint configs (source of truth) | `packages/fal-codegen/src/configs/<category>.ts` |
| Config type definitions | `packages/fal-codegen/src/types.ts` |
| Schema fetcher (caches to `.codegen-cache/`) | `packages/fal-codegen/src/schema-fetcher.ts` |
| Schema → NodeSpec parser | `packages/fal-codegen/src/schema-parser.ts` |
| Config overrides applier | `packages/fal-codegen/src/node-generator.ts` |
| Codegen entry point | `packages/fal-codegen/src/generate.ts` |
| **Generated manifest (do not edit)** | `packages/fal-nodes/src/fal-manifest.json` |
| Runtime node class factory | `packages/fal-nodes/src/fal-factory.ts` |
| FAL API call utilities | `packages/fal-nodes/src/fal-base.ts` |
| Package entry point | `packages/fal-nodes/src/index.ts` |
| Pricing bundles (generated) | `packages/fal-nodes/src/generated/` |
| High-level provider (text→image, TTS, etc.) | `packages/runtime/src/providers/fal-provider.ts` |
| Manifest model loading | `packages/runtime/src/providers/manifest-models.ts` |

---

## How FAL nodes are generated

```
src/configs/<category>.ts   ← you edit this
        ↓
schema-fetcher.ts           fetches https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=...
                            caches each schema in packages/fal-codegen/.codegen-cache/<sha>.json
        ↓
schema-parser.ts            converts OpenAPI → NodeSpec (inputFields, outputType, enums)
        ↓
node-generator.ts           merges NodeConfig overrides (className, fieldOverrides, enumOverrides…)
        ↓
generate.ts                 writes packages/fal-nodes/src/fal-manifest.json
        ↓
fal-factory.ts              creates runtime node classes from manifest at startup
```

The root `generate:fal` script runs in strict mode by default: if any configured endpoint cannot be fetched or parsed, generation fails. Remove stale endpoints from the config or fix them before regenerating.

**Never edit `fal-manifest.json` directly.** Changes are overwritten on the next `npm run generate:fal`.

---

## Add a new FAL endpoint

### 1. Find the right config file

Pick the file in `packages/fal-codegen/src/configs/` that matches the endpoint's modality:

| Endpoint type | Config file |
|---|---|
| text → image | `text-to-image.ts` |
| image → video | `image-to-video.ts` |
| text → video | `text-to-video.ts` |
| text → speech | `text-to-speech.ts` |
| image → image | `image-to-image.ts` |
| other | matching `<input>-to-<output>.ts`, or `unknown.ts` |

### 2. Add a `NodeConfig` entry

Open the chosen config file and add a key inside `configs` whose value is a `NodeConfig`:

```typescript
// packages/fal-codegen/src/configs/text-to-image.ts
import type { ModuleConfig } from "../types.js";

export const config: ModuleConfig = {
  configs: {
    // ... existing entries ...

    "fal-ai/my-new-model": {
      className: "MyNewModel",
      docstring: "One sentence describing what the model does.",
      tags: ["image", "generation", "text-to-image", "txt2img"],
      useCases: [
        "Generate images from text descriptions",
        "Create concept art from prompts"
      ],
      fieldOverrides: {
        prompt: {
          description: "The text prompt to generate an image from"
        },
        image_size: {
          propType: "enum",
          enumRef: "ImageSizePreset",   // reuse a sharedEnum if available
          default: "landscape_4_3",
          description: "Output image size preset"
        },
        seed: {
          propType: "int",
          default: -1,
          description: "Seed for reproducible results. Use -1 for random"
        }
      }
    }
  }
};
```

**`NodeConfig` fields** (all optional — only add what needs overriding):

| Field | Type | Purpose |
|---|---|---|
| `className` | `string` | PascalCase class name for the node |
| `docstring` | `string` | Node description shown in the UI |
| `tags` | `string[]` | Used for node search |
| `useCases` | `string[]` | Shown in node detail panel |
| `fieldOverrides` | `Record<string, Partial<FieldDef>>` | Override parsed field properties (type, default, description…) |
| `enumOverrides` | `Record<string, string>` | Rename enums: `{ ImageSize: "ImageSizePreset" }` |
| `enumValueOverrides` | `Record<string, Record<string, string>>` | Rename enum values |

`FieldDef` override keys: `propType`, `default`, `description`, `enumRef`, `min`, `max`.

Valid `propType` values: `"str"` `"float"` `"int"` `"bool"` `"image"` `"video"` `"audio"` `"enum"` `"list[image]"` `"list[video]"` `"list[audio]"` `"dict[str, any]"`.

### 3. (Optional) Add a shared enum

If the endpoint introduces a new enum that other nodes in the same module will reuse, add it to the `sharedEnums` block:

```typescript
export const config: ModuleConfig = {
  sharedEnums: {
    MyAspectRatio: {
      name: "MyAspectRatio",
      values: [
        ["SQUARE", "1:1"],
        ["WIDESCREEN", "16:9"],
        ["PORTRAIT", "9:16"]
      ],
      description: "Aspect ratio for output"
    }
  },
  configs: { /* ... */ }
};
```

Then reference it via `enumRef: "MyAspectRatio"` in a `fieldOverrides` entry.

### 4. Run codegen

```bash
# From the repo root:
npm run generate:fal
```

This fetches the schema (or reads from `.codegen-cache/` if cached), writes `packages/fal-nodes/src/fal-manifest.json`, and updates pricing bundles under `packages/fal-nodes/src/generated/` when `FAL_API_KEY` is set.

To force a fresh schema fetch (bypass cache):

```bash
npm run generate --workspace=packages/fal-codegen -- --strict --no-cache
```

---

## Verify

Run these in order after any config change:

```bash
# 1. Regenerate the manifest
npm run generate:fal

# 2. Check for TypeScript errors in codegen
npm run lint --workspace=packages/fal-codegen

# 3. Run codegen tests
npm run test --workspace=packages/fal-codegen

# 4. Build fal-nodes (loads manifest from dist/)
npm run build:packages

# 5. Run fal-nodes tests (exercises the generated node classes)
npm run test --workspace=packages/fal-nodes

# 6. Smoke-test one generated node (replace type and props as appropriate)
npm run dev:nodetool -- node run fal.text_to_image.FluxDev \
  --props '{"prompt": "a red apple on a white table"}' \
  --no-secrets
```

The node type follows the pattern `fal.<module_name>.<ClassName>`, where `module_name` comes from the config file key in `src/configs/index.ts` (e.g. `text_to_image`).

Before committing, inspect the manifest diff:

```bash
git diff packages/fal-nodes/src/fal-manifest.json | head -80
```

Confirm the new entry appears with the expected `className`, `inputFields`, and `outputType`.

---

## How past commits did it

The entire FAL codegen and node system was introduced in commit **`d1491abf`** ("add claude agent package"), which added all `src/configs/` files, the codegen pipeline, and the factory. That commit is the canonical reference for the shape of every config file and the runtime loading path.

Subsequent behavioral fixes follow a clear split:

- **`ff5824a6`** — fixed `schema-parser.ts` to collapse single-asset wrapper structs (`list[ImageInput]`) to `list[image]` with a `nestedAssetKey` hint; the fix lived in codegen, not the manifest.
- **`2997a678`** — added FAL billing reconciliation; changes touched `fal-base.ts`, `fal-factory.ts`, and `fal-billing.ts` in `fal-nodes/`.

Both commits follow the rule: **parser/codegen bugs go in `packages/fal-codegen/`; runtime bugs go in `packages/fal-nodes/`; never patch `fal-manifest.json`**.

---

## Fixing a wrong input or output on a generated node

| Problem | Where to fix |
|---|---|
| Field parsed with wrong type | `packages/fal-codegen/src/schema-parser.ts` |
| Field needs a different default or description | `fieldOverrides` in the endpoint's config entry |
| Enum name conflicts across nodes | `enumOverrides` in the config entry |
| Asset input defaults to `""` instead of `AssetRef` | `defaultForPropType()` in `packages/fal-nodes/src/fal-factory.ts` |
| Audio/video output missing preview | set `metadataOutputTypes` in the factory, not `outputTypes` |
| API call behavior (retry, upload, mapping) | `packages/fal-nodes/src/fal-base.ts` |

---

## Contributing

PRs are welcome. Open one at <https://github.com/nodetool-ai/nodetool>. Before pushing, run:

```bash
npm run check   # typecheck + lint + test across all workspaces
```

Join the discussion on [Discord](https://discord.gg/WmQTWZRcYE).
