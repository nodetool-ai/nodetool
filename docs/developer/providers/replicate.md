---
layout: page
title: "Replicate: Add Models & Nodes"
description: "How to add a new Replicate model as a NodeTool node using the codegen pipeline."
---

> **Audience:** Coding agents and contributors adding Replicate models to NodeTool. This guide assumes familiarity with the monorepo structure described in [CLAUDE.md](https://github.com/nodetool-ai/nodetool/blob/main/CLAUDE.md).

## TL;DR

1. Add the model's `"owner/name"` entry to the matching config file in `packages/replicate-codegen/src/configs/`.
2. Export `REPLICATE_API_TOKEN` and run `npm run generate:replicate`.
3. Run `npm run build:packages` (replicate-nodes loads from `dist/`).
4. Verify with `npm run dev:nodetool -- node run replicate.<module>.<ClassName> --props '{...}'`.

Do **not** hand-edit `packages/replicate-nodes/src/replicate-manifest.json` — it is generated output.

---

## Where things live

| Path | Purpose |
|---|---|
| `packages/replicate-codegen/src/configs/` | One TypeScript file per module (e.g. `image-generate.ts`). Edit these to add models. |
| `packages/replicate-codegen/src/configs/index.ts` | Imports every module config and exports `allConfigs`. Register new config files here. |
| `packages/replicate-codegen/src/generate.ts` | CLI entry point for the generator. Fetches Replicate schemas and writes the manifest. |
| `packages/replicate-codegen/src/schema-fetcher.ts` | Fetches/caches OpenAPI schemas from `api.replicate.com`. Cache lives in `.schema-cache/replicate/`. |
| `packages/replicate-codegen/src/schema-parser.ts` | Parses the OpenAPI schema into a `NodeSpec`. |
| `packages/replicate-codegen/src/node-generator.ts` | Applies `NodeConfig` overrides (`className`, `returnType`, `fieldOverrides`) onto a `NodeSpec`. |
| `packages/replicate-codegen/src/types.ts` | `ModuleConfig`, `NodeConfig`, `NodeSpec`, `FieldDef`, `EnumDef`. |
| `packages/replicate-nodes/src/replicate-manifest.json` | **Generated.** Node definitions consumed at runtime. Never edit by hand. |
| `packages/replicate-nodes/src/replicate-factory.ts` | Builds `NodeClass` instances from manifest entries at runtime. |
| `packages/replicate-nodes/src/replicate-base.ts` | Shared Replicate API utilities: `replicateSubmit`, `assetToUrl`, output converters. |
| `packages/replicate-nodes/src/index.ts` | Exports `REPLICATE_NODES` (array of `NodeClass`) and `registerReplicateNodes`. |
| `packages/runtime/src/providers/replicate-provider.ts` | `ReplicateProvider` — chat, image, video, audio, TTS, ASR, embeddings. |
| `packages/runtime/src/providers/manifest-models.ts` | Reads the manifest to surface image/video/music model lists to the UI. |
| `packages/runtime/src/providers/index.ts` | Registers `ReplicateProvider` under `PROVIDER_IDS.REPLICATE`. |

---

## How Replicate nodes are generated

The codegen pipeline runs in four steps:

1. **Config lookup** — `generate.ts` reads `allConfigs` from `configs/index.ts`. Each config maps a Replicate model id (`"owner/name"`) to a `NodeConfig` (class name, return type, field overrides).

2. **Schema fetch** — `SchemaFetcher` calls `https://api.replicate.com/v1/models/<owner>/<name>` to get the model's OpenAPI input/output schema. Results are cached under `.schema-cache/replicate/` (keyed by SHA-256 of the model id). Pass `--no-cache` to force a fresh fetch.

3. **Parsing and override** — `SchemaParser` converts the OpenAPI schema to a `NodeSpec`. `NodeGenerator.applyConfig()` then merges the `NodeConfig` overrides onto it (renames class, sets `outputType`, fixes `propType` for image/audio/video fields that Replicate types as `string`).

4. **Manifest write** — The generator writes every `NodeSpec` as a `ManifestEntry` to `packages/replicate-nodes/src/replicate-manifest.json`. At runtime, `replicate-factory.ts` reads this file and produces `NodeClass` objects via `createReplicateNodeClass()`.

The node type for a manifest entry follows the pattern `replicate.<moduleName>.<className>` where `moduleName` uses dots instead of dashes (e.g. `replicate.image.generate.Flux_Schnell`).

---

## Add a new Replicate model

### Step 1 — Choose the right config file

Pick the config whose module matches the model's task:

| File | Module key | Covers |
|---|---|---|
| `image-generate.ts` | `image.generate` | Text-to-image, image-to-image |
| `image-enhance.ts` | `image.enhance` | Enhancement, retouching |
| `image-upscale.ts` | `image.upscale` | Upscaling |
| `image-background.ts` | `image.background` | Background removal |
| `video-generate.ts` | `video.generate` | Text/image to video |
| `video-enhance.ts` | `video.enhance` | Video enhancement |
| `audio-generate.ts` | `audio.generate` | Music, sound generation |
| `audio-speech.ts` | `audio.speech` | TTS |
| `audio-transcribe.ts` | `audio.transcribe` | ASR |
| `text-generate.ts` | `text.generate` | Text LLMs via Replicate |
| `embedding.ts` | `embedding` | Embedding models |

If none fit, create a new file (see Step 1b below).

### Step 2 — Add the model entry

Add one key to the `configs` object in the chosen file. The key is the Replicate model id exactly as it appears in the URL (`replicate.com/<owner>/<name>`).

Minimal entry (no image inputs):

```typescript
"acme-org/my-flux-variant": {
  className: "MyFluxVariant",
  returnType: "image"
}
```

Entry with image inputs (Replicate types these as `string`; NodeTool needs `image`/`video`/`audio`):

```typescript
"acme-org/my-img2img": {
  className: "MyImg2Img",
  returnType: "image",
  fieldOverrides: {
    image: { propType: "image" },
    mask: { propType: "image" }
  }
}
```

Full `NodeConfig` shape (all fields optional):

```typescript
interface NodeConfig {
  className?: string;           // PascalCase; if omitted the parser derives one
  docstring?: string;           // Override the model description
  tags?: string[];
  useCases?: string[];
  returnType?: string;          // "image" | "video" | "audio" | "str"
  fieldOverrides?: Record<string, Partial<FieldDef>>;   // propType corrections
  enumOverrides?: Record<string, string>;               // rename enum classes
  enumValueOverrides?: Record<string, Record<string, string>>;
}
```

`returnType` is required for media-producing models. Without it the factory cannot map the output to the right `AssetRef` type.

Asset input `propType` rules — Replicate schemas type all URLs as `string`. Override these manually:

| Field carries | Set `propType` to |
|---|---|
| Single image | `"image"` |
| Single video | `"video"` |
| Single audio | `"audio"` |
| List of images | `"list[image]"` |

### Step 1b (optional) — Create a new config file

If no existing module fits, create `packages/replicate-codegen/src/configs/<domain>-<task>.ts`:

```typescript
// packages/replicate-codegen/src/configs/image-3d.ts
import type { ModuleConfig } from "../types.js";

export const image3dConfig: ModuleConfig = {
  configs: {
    "acme-org/mesh-gen": {
      className: "MeshGen",
      returnType: "image"
    }
  }
};
```

Then register it in `packages/replicate-codegen/src/configs/index.ts`:

```typescript
import { image3dConfig } from "./image-3d.js";
// ...
export const allConfigs: Record<string, ModuleConfig> = {
  // ...existing entries...
  "image.3d": image3dConfig,
};
```

The module key (`"image.3d"`) becomes the `moduleName` in the manifest (stored as `"image-3d"`) and the middle segment of every node's type string (`replicate.image.3d.<ClassName>`).

---

## Verify

Run these in order after adding the config entry:

```bash
# 1. Generate the manifest (fetches from Replicate API; uses cache by default)
export REPLICATE_API_TOKEN="r8_..."
npm run generate:replicate

# 2. Regenerate without cache if the model schema was recently updated
REPLICATE_API_TOKEN="r8_..." npm run generate --workspace=packages/replicate-codegen -- --all --strict --no-cache

# 3. Build — replicate-nodes loads from dist/, so rebuild is required
npm run build:packages

# 4. Type-check the codegen package
npm run lint --workspace=packages/replicate-codegen

# 5. Run codegen tests
npm run test --workspace=packages/replicate-codegen

# 6. Smoke-test the node (confirm it appears in the registry and properties look right)
npm run dev:nodetool -- node run replicate.image.generate.MyFluxVariant \
  --props '{"prompt": "a red fox"}' --no-secrets --json

# 7. Full check
npm run check
```

If the model id is wrong or the model is private/unavailable, the generator exits with an error listing the failures. Fix the id or remove the entry.

---

## How past PRs did it

The Replicate codegen and manifest have been in place since the initial commit. The three commits on record for this branch (`ca742050`, `f900e7a6`, `d1491abf`) are version bumps. To see how a specific model was added, look for commits that touch `packages/replicate-codegen/src/configs/` and `packages/replicate-nodes/src/replicate-manifest.json` together:

```bash
git log --oneline -- packages/replicate-codegen/src/configs packages/replicate-nodes/src/replicate-manifest.json
```

The pattern is always: one config file edit + the regenerated manifest in the same commit.

---

## Contributing

Open a PR against `main` at [github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool). Before pushing:

```bash
npm run lint        # must pass
npm run typecheck   # must pass
```

Questions? Join the [Discord](https://discord.gg/WmQTWZRcYE).
