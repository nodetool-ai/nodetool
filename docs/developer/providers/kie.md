---
layout: page
title: "KIE: Add Models & Nodes"
description: "Runbook for adding KIE (kie.ai) models and nodes to NodeTool."
---

> **Audience:** Coding agents and contributors adding new KIE models or modifying
> KIE node behavior. This page covers the full cycle from manifest entry to
> verified node.

## TL;DR

`kie-manifest.json` is **generated** — do not edit it directly. The source of
truth is `packages/kie-codegen/src/configs/{image,audio,video}.ts`. Edit those
configs, run `npm run generate:kie`, then build and verify.

## Where things live

| Path | Purpose |
|---|---|
| `packages/kie-codegen/src/configs/image.ts` | Image-node config source |
| `packages/kie-codegen/src/configs/audio.ts` | Audio-node config source (TTS, music) |
| `packages/kie-codegen/src/configs/video.ts` | Video-node config source |
| `packages/kie-codegen/src/generate.ts` | Reads configs, writes manifest + pricing |
| `packages/kie-codegen/src/generate-configs.ts` | Fetches KIE docs, re-generates configs |
| `packages/kie-nodes/src/kie-manifest.json` | **Generated** — do not edit |
| `packages/kie-nodes/src/kie-factory.ts` | Creates node classes from manifest at runtime |
| `packages/kie-nodes/src/kie-base.ts` | API submission, polling, upload, result conversion |
| `packages/kie-nodes/src/index.ts` | Loads manifest, exports `KIE_NODES` registry |
| `packages/runtime/src/providers/kie-provider.ts` | `KieProvider` — chat + media generation |
| `packages/runtime/src/providers/manifest-models.ts` | Reads manifest to build model lists |

## How KIE nodes and models are defined

### The manifest

`packages/kie-nodes/src/kie-manifest.json` is an array of `KieManifestEntry`
objects. Each entry becomes one node class at runtime via `kie-factory.ts`.
The node type is `kie.<moduleName>.<className>`.

A minimal image-generation entry looks like this:

```json
{
  "className": "BytedanceSeedream",
  "moduleName": "image",
  "modelId": "bytedance/seedream",
  "title": "Seedream3.0 - Text to Image",
  "description": "...",
  "outputType": "image",
  "pollInterval": 1500,
  "maxAttempts": 400,
  "fields": [
    {
      "name": "prompt",
      "type": "str",
      "default": "",
      "title": "Prompt",
      "description": "...",
      "required": true
    },
    {
      "name": "guidance_scale",
      "type": "float",
      "default": 2.5,
      "title": "Guidance Scale",
      "min": 1,
      "max": 10
    }
  ],
  "validation": [
    { "field": "prompt", "rule": "not_empty", "message": "Prompt is required" }
  ]
}
```

### Field types

| `type` value | UI / wire type |
|---|---|
| `str` | text input |
| `int` / `float` | number input |
| `bool` | checkbox |
| `enum` | dropdown; requires `values: string[]` |
| `image` | single image AssetRef |
| `audio` / `video` | single audio/video AssetRef |
| `list[image]` / `list[video]` / `list[audio]` | list of AssetRefs |
| `list[str]` | list of strings |

### Upload descriptors

When a field holds an AssetRef that the KIE API expects as a URL, declare an
`uploads` entry. The factory uploads the asset and injects the URL under the
correct API parameter name before submitting the task.

```json
"uploads": [
  {
    "field": "images",
    "kind": "image",
    "isList": true,
    "paramName": "image_urls"
  }
]
```

- `field` — the node property name (must match a field in `fields`)
- `kind` — `"image"`, `"audio"`, or `"video"`
- `isList` — set `true` when the API receives an array of URLs
- `paramName` — API request body key; defaults to `<field>_url` (single) or `<field>_urls` (list)
- `groupKey` — group multiple fields into one array parameter (e.g., `image1 + image2 → image_urls`)
- `isVideoClip` — builds `{url, start, ends}` clip payloads instead of plain URLs

### Conditional fields

`conditionalFields` controls whether a scalar field is included in the request:

| `condition` | Behavior |
|---|---|
| `gte_zero` | Include only when `Number(value) >= 0` |
| `truthy` | Include only when the value is truthy |
| `not_default` / (anything else) | Always include |

### Model surfacing

`manifest-models.ts` reads the manifest to build the provider's model lists:

- `outputType === "image"` → `getAvailableImageModels()`
- `outputType === "video"` → `getAvailableVideoModels()`
- `outputType === "audio"` and name/id contains a TTS signal → `getAvailableTTSModels()`
- `outputType === "audio"` and name/id contains a music signal → `getAvailableMusicModels()`

Task classification (`text_to_image`, `image_to_image`, `text_to_video`, etc.)
is inferred from the model id and title. Add `supportedTasks` to the manifest
entry to override inference.

## Add a new KIE model

### 1. Find the KIE API model id and endpoint shape

Check [https://docs.kie.ai](https://docs.kie.ai) or the KIE dashboard. Note:
- `modelId` (e.g. `vendor/model-name`)
- Output type (`image`, `video`, `audio`)
- Input fields and their types/defaults/constraints
- Any media upload fields (where the API wants a URL, not raw bytes)

### 2. Add the node config to the right config file

Open the appropriate config file in `packages/kie-codegen/src/configs/`. Add a
new entry to the `nodes` array. Match the existing shape exactly:

```typescript
// packages/kie-codegen/src/configs/image.ts
{
  "className": "VendorNewModel",          // PascalCase, used as node class name
  "modelId": "vendor/new-model",          // KIE model id
  "title": "New Model - Text to Image",   // Human-readable label
  "description": "...",                   // Shown in the node panel
  "outputType": "image",                  // "image" | "video" | "audio"
  "fields": [
    {
      "name": "prompt",
      "type": "str",
      "default": "",
      "title": "Prompt",
      "description": "...",
      "required": true
    },
    {
      "name": "aspect_ratio",
      "type": "enum",
      "default": "1:1",
      "title": "Aspect Ratio",
      "values": ["1:1", "16:9", "9:16"]
    }
  ],
  "validation": [
    { "field": "prompt", "rule": "not_empty", "message": "Prompt is required" }
  ]
}
```

If the model takes image inputs, add an `uploads` array:

```typescript
"uploads": [
  {
    "field": "input_image",
    "kind": "image",
    "paramName": "image_url"
  }
]
```

The `fields` entry for `input_image` must use `"type": "image"` (not `"str"`).
Never use raw URL strings as field types — the factory uploads AssetRefs.

Poll tuning: `pollInterval` (ms between status checks) and `maxAttempts` inherit
from the module's defaults (`defaultPollInterval`, `defaultMaxAttempts`) unless
overridden on the node entry. Image defaults are 1500 ms / 400 attempts; video
defaults are 8000 ms / 450 attempts.

### 3. Regenerate the manifest

```bash
npm run generate:kie
```

This writes `packages/kie-nodes/src/kie-manifest.json` and updates the pricing
bundles in `packages/kie-nodes/src/generated/`. If the KIE pricing API is
unreachable, pass `--no-pricing` to write empty bundles and proceed:

```bash
npm run generate --workspace=packages/kie-codegen -- --all --no-pricing
```

### 4. Rebuild

`kie-nodes` loads from `dist/`, so a build is required before the new node
appears at runtime:

```bash
npm run build:packages
```

## Verify

```bash
# Type-check codegen and runtime packages
npm run typecheck

# Run kie-nodes and kie-codegen tests
npm run test --workspace=packages/kie-nodes
npm run test --workspace=packages/kie-codegen

# Run a single node in isolation (replace with the new node type)
npm run dev:nodetool -- node run kie.image.VendorNewModel \
  --props '{"prompt":"a red apple"}' --no-secrets

# Static validation (catches unknown field types, missing required props)
npm run dev:nodetool -- validate --json
```

Check `git diff packages/kie-nodes/src/kie-manifest.json` to confirm only the
expected entry was added or changed.

## How past changes were made

**commit e9e03f42** (`fix(kie): map video_list to native list[video]`) — changed
the Gemini Omni `video_list` field from a bespoke `video_clip_list` type to the
canonical `list[video]`. Touched `packages/kie-codegen/src/configs/video.ts`,
`kie-factory.ts`, `kie-manifest.json`, and `node-sdk/src/field-classification.ts`.
The factory's `isVideoClip` upload flag still builds `{url, start, ends}` clip
payloads internally.

**commit 6de0ef90** (`feat(nodes): make content-card body fully metadata-driven`)
— the factory gained `body: "content_card"` for all media-output nodes so the
frontend renders them as content cards without hardcoded namespace checks. Any
new KIE node with `outputType === "image" | "video" | "audio"` automatically
gets this flag through the factory.

Both changes went through the config → `generate:kie` → `build:packages` cycle
described above.

## Contributing

Source: [https://github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)  
Discord: [https://discord.gg/WmQTWZRcYE](https://discord.gg/WmQTWZRcYE)

Before opening a PR, run `npm run check` (typecheck + lint + tests). Patches to
`kie-manifest.json` alone will be rejected — changes must come from the config
files and codegen pipeline.
