---
layout: page
title: "KIE: Add Models & Nodes"
description: "Runbook for adding KIE (kie.ai) models and nodes to NodeTool."
---

> **Audience:** Coding agents and contributors adding new KIE models or modifying
> KIE node behavior. This page covers the full cycle from manifest entry to
> verified node.

## TL;DR

`kie-manifest.json` and `packages/kie-codegen/src/configs/{image,audio,video}.ts`
are both **generated** from KIE's published docs. Do not edit either by hand.
`npm run generate:kie` re-fetches the docs, rewrites the configs, and rewrites
the manifest. A model that KIE lists in `https://docs.kie.ai/llms.txt` appears
after a regeneration. Persistent behavior changes go in the fetcher, parser,
writer, or generator code. Then build and verify.

## Where things live

| Path | Purpose |
|---|---|
| `packages/kie-codegen/src/schema-fetcher.ts` | Fetches `llms.txt` and the linked English docs pages |
| `packages/kie-codegen/src/schema-parser.ts` | Converts each page's embedded OpenAPI YAML to a `NodeConfig` |
| `packages/kie-codegen/src/config-writer.ts` | Writes the three module configs |
| `packages/kie-codegen/src/configs/{image,audio,video}.ts` | **Generated** module configs |
| `packages/kie-codegen/src/generate-configs.ts` | Fetches KIE docs, re-generates configs |
| `packages/kie-codegen/src/generate.ts` | Reads configs, writes manifest + pricing |
| `packages/kie-codegen/src/fixture-generate.ts` | Offline generation from `fixtures/`, used by the drift gate |
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
| `list[str]` / `list[int]` / `list[float]` / `list[dict]` | list of scalars or objects |

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

### 2. Check that the KIE docs list the model

`schema-fetcher.ts` reads `https://docs.kie.ai/llms.txt` and each linked page.
`schema-parser.ts` turns the page's embedded OpenAPI YAML into a node: class
name, `modelId`, title, fields, `uploads`, `validation`, and `conditionalFields`.
A Suno page that links an `old-model` version is replaced by that page. A page
that fails to fetch keeps the node's previous config.

If the model's page is missing from `llms.txt`, or the parser mishandles it,
fix the fetcher or parser rather than adding a config entry. Rules the parser
follows:

- URL media inputs become AssetRef fields: `image`, `video`, `audio`,
  `list[image]`, `list[video]`, `list[audio]`. Each needs an `uploads` entry.
  List fields set `isList: true` and the API `paramName`.
- Other arrays take their list type from the item schema (`list[dict]`,
  `list[int]`, `list[float]`, `list[str]`). They never fall back to
  `list[image]`, because the factory skips an asset-typed field that has no
  upload config.
- A `_url` or `_urls` parameter is media even when KIE declares it
  `type: object`. A `_file_urls` or `_link_urls` parameter stays `list[str]`.

Poll tuning: `pollInterval` (ms between status checks) and `maxAttempts` inherit
from the module's defaults (`defaultPollInterval`, `defaultMaxAttempts`) unless
overridden on the node entry. Image defaults are 1500 ms / 400 attempts, audio
defaults are 4000 ms / 120 attempts, and video defaults are 8000 ms / 450
attempts.

### 3. Regenerate the configs and manifest

```bash
npm run generate:kie
```

This runs `generate --all --refresh-configs` in `packages/kie-codegen`. It
rewrites `src/configs/*.ts`, writes `packages/kie-nodes/src/kie-manifest.json`,
and updates the pricing bundles in `packages/kie-nodes/src/generated/`. If the
KIE pricing API is unreachable, the run writes empty pricing bundles. To skip
the pricing fetch on purpose, pass `--no-pricing`:

```bash
npm run generate --workspace=packages/kie-codegen -- --all --refresh-configs --no-pricing
```

Without `--refresh-configs`, the run regenerates only the manifest from the
checked-in configs.

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

# Run kie-nodes and kie-codegen tests and the fixture drift gate
npm run test --workspace=packages/kie-nodes
npm run test --workspace=packages/kie-codegen
npm run generate:kie:check

# Run a single node in isolation (replace with the new node type)
npm run dev:nodetool -- node run kie.image.VendorNewModel \
  --props '{"prompt":"a red apple"}' --no-secrets

# Static validation of a workflow that uses the node
npm run dev:nodetool -- validate workflow.json --json
```

Check `git diff packages/kie-nodes/src/kie-manifest.json` to confirm only the
expected entry was added or changed.

## Contributing

Source: [https://github.com/nodetool-ai/nodetool](https://github.com/nodetool-ai/nodetool)  
Discord: [https://discord.gg/WmQTWZRcYE](https://discord.gg/WmQTWZRcYE)

Before opening a PR, run `npm run test:affected`, `npm run typecheck`, and
`npm run lint`. Patches to `kie-manifest.json` or `src/configs/*.ts` alone will
be rejected. Changes must come from the codegen pipeline. After an intended
generator change, refresh the drift fixtures with
`node scripts/provider-codegen-check.mjs --provider kie --write`.
