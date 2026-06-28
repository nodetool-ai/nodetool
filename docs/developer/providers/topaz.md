---
layout: page
title: "Topaz: Add Models & Nodes"
description: "Runbook for adding new Topaz image/video API endpoints and model variants to NodeTool."
---

**Navigation**: [docs/developer/index.md](../index.md) → **Topaz provider guide**

> **Audience**: coding agents and contributors adding new Topaz image or video endpoints, or new model variants within existing endpoints.

## TL;DR

1. Edit `packages/topaz-nodes/src/topaz-manifest.json` — one JSON object per endpoint (node).
2. `npm run build:packages` — copies the manifest to `dist/` and compiles the factory.
3. `npm run typecheck && npm run lint` — must pass before committing.
4. No new TypeScript files needed for standard endpoints; the factory generates the node class at runtime.

---

## Where things live

| What | Path |
|---|---|
| Manifest (all nodes) | `packages/topaz-nodes/src/topaz-manifest.json` |
| API + HTTP utilities | `packages/topaz-nodes/src/topaz-base.ts` |
| Runtime node factory | `packages/topaz-nodes/src/topaz-factory.ts` |
| Package entry point | `packages/topaz-nodes/src/index.ts` |
| Runtime provider (upscale only) | `packages/runtime/src/providers/topaz-provider.ts` |
| Manifest loader (for ImageModel list) | `packages/runtime/src/providers/manifest-models.ts` |
| Provider registration | `packages/runtime/src/providers/index.ts` |
| Unit tests | `packages/topaz-nodes/tests/topaz-base.test.ts` |

---

## How Topaz models and nodes are defined

**The manifest is the single source of truth.** Every Topaz node is described by one JSON object in `packages/topaz-nodes/src/topaz-manifest.json`. There is no code-generation script — the manifest is hand-maintained. At package load time `src/index.ts` reads the JSON and calls `loadTopazNodesFromManifest`, which feeds each entry to `createTopazNodeClass` in `topaz-factory.ts`. The factory builds a full `BaseNode` subclass at runtime — no decorators, no separate `.ts` file per node.

The build script (`package.json` `build`) compiles the TypeScript and then copies `src/topaz-manifest.json` to `dist/topaz-manifest.json` so the `package.json` `exports` entry `"./topaz-manifest.json"` resolves correctly. The runtime provider (`topaz-provider.ts`) loads the same file via `require()` to build its list of `ImageModel` objects, but only exposes the `enhance` and `enhance-gen` endpoints as upscale-task models. All other endpoints (sharpen, denoise, lighting, matting, restore) live solely as workflow nodes.

**Image nodes** call a single multipart POST → poll status → download flow implemented in `topazExecuteImageTask` (`topaz-base.ts`).

**Video nodes** drive a five-step pipeline: create job → accept (get presigned upload URLs) → PUT bytes → complete-upload → poll status → download. This requires `ffprobe` installed locally to probe the source video's resolution, frame rate, and duration before the job is created.

---

## Add a new model or node

### Case A — new model variant in an existing endpoint

Open `packages/topaz-nodes/src/topaz-manifest.json` and add the variant name to the `values` array of the relevant entry's `model` field:

```json
{
  "name": "model",
  "type": "enum",
  "default": "Standard V2",
  "title": "Model",
  "required": false,
  "values": [
    "Standard V2",
    "High Fidelity V2",
    "Upscale High Fidelity V3",
    "Low Resolution V2",
    "CGI",
    "Transparency Upscale",
    "Detail",
    "Faces",
    "Text Refine",
    "Standard V3"
  ]
}
```

That is the entire change. The factory picks up the new variant automatically.

If the new variant is in the `enhance` or `enhance-gen` endpoint, the runtime provider will also surface it as a new `ImageModel` entry named `topaz/image/enhance/Standard V3` (the `modelId/variant` pattern used in `buildVariantMap`).

### Case B — new image endpoint (new node)

Add one object to the top-level array in `topaz-manifest.json`. Copy the shape of an existing image entry:

```json
{
  "className": "RemoveBackground",
  "moduleName": "image",
  "modelId": "topaz/image/remove-bg",
  "title": "Topaz Remove Background",
  "description": "Topaz Image API — background removal.\n\n    topaz, image, background, removal\n\n    Multipart POST /image/v1/remove-bg/async.",
  "outputType": "image",
  "submitEndpoint": "https://api.topazlabs.com/image/v1/remove-bg/async",
  "statusEndpoint": "https://api.topazlabs.com/image/v1/status/{process_id}",
  "downloadEndpoint": "https://api.topazlabs.com/image/v1/download/{process_id}",
  "pollInterval": 3000,
  "maxAttempts": 400,
  "fields": [
    {
      "name": "image",
      "type": "image",
      "title": "Image",
      "description": "Source image.",
      "required": true,
      "uploadField": true
    },
    {
      "name": "output_format",
      "type": "enum",
      "default": "png",
      "title": "Output Format",
      "required": false,
      "values": ["jpeg", "png", "tiff"]
    }
  ],
  "validation": []
}
```

Key rules:

- `className` — PascalCase, unique across the manifest. Becomes the node class name and part of the node type: `topaz.<moduleName>.<className>`.
- `modelId` — slash-separated string, unique across the manifest. Used as the primary key in the provider's variant map.
- Exactly one field must set `"uploadField": true`. This is the asset (image or video) the factory reads and sends to Topaz.
- `submitEndpoint` must be an absolute URL. `statusEndpoint` and `downloadEndpoint` use `{process_id}` as a placeholder.
- `pollInterval` is in milliseconds; `maxAttempts` × `pollInterval` sets the total timeout budget.

### Case C — new video endpoint

Copy either `EnhanceVideo` or `InterpolateVideo` from the manifest. Video entries add:

- `"outputType": "video"`
- `"videoKind": "upscale"` or `"videoKind": "interpolate"`
- `"requiredRuntimes": ["ffmpeg"]` — tells the UI the node needs ffmpeg/ffprobe installed
- `"acceptEndpoint"` and `"completeEndpoint"` for the two extra pipeline steps
- A `"video"` typed field with `"uploadField": true`

The factory detects `outputType === "video"` and routes through `topazExecuteVideoTask`, which calls `ffprobe` to probe the source before creating the job.

---

## Verify

After editing the manifest, run these commands in order:

```bash
# 1. Build the package (compiles TS and copies manifest to dist/)
npm run build:packages

# 2. Type-check the whole repo
npm run typecheck

# 3. Lint
npm run lint

# 4. Run the topaz-nodes unit tests
npm run test --workspace=packages/topaz-nodes

# 5. Run a node in isolation to confirm it loads from the manifest
#    (replace 'topaz.image.SharpenImage' with your new className)
npm run dev:nodetool -- node run topaz.image.SharpenImage \
  --props '{"image":{"type":"image","uri":"https://example.com/photo.jpg"}}' \
  --no-secrets

# 6. Static validation: confirm the manifest-derived node type is known
npm run dev:nodetool -- validate workflow.json
```

Step 5 will hit a missing-API-key error in `--no-secrets` mode, which is expected — the goal is to confirm the node *type* resolves and all fields load without a panic. A `TOPAZ_API_KEY` not configured error means the node registered correctly.

---

## How past PRs did it

The Topaz package was introduced in commit `b0bb9b0b` (branch `react-doctor safe sweep`) which added all 11 manifest entries, the factory, base utilities, and the runtime provider together. The full file set is visible in `git show --stat b0bb9b0b | grep topaz`:

```
packages/runtime/src/providers/topaz-provider.ts         |  345 +
packages/runtime/tests/providers/topaz-provider.test.ts  |  225 +
packages/topaz-nodes/package.json                        |   46 +
packages/topaz-nodes/src/index.ts                        |   45 +
packages/topaz-nodes/src/topaz-base.ts                   |  652 +
packages/topaz-nodes/src/topaz-factory.ts                |  270 +
packages/topaz-nodes/src/topaz-manifest.json             | 1084 +
packages/topaz-nodes/tests/topaz-base.test.ts            |  411 +
```

The pattern for adding a single new endpoint is smaller: one manifest entry, no other files.

---

## Contributing

Source: <https://github.com/nodetool-ai/nodetool>  
Discord: <https://discord.gg/WmQTWZRcYE>

Before opening a PR, run `npm run check` (typecheck + lint + tests). The manifest is the right place to document API-level details (endpoint URL, poll interval, field constraints) — keep the description field useful for future readers.
