---
layout: page
title: "MiniMax: Add Models & Nodes"
description: "How to add new MiniMax models or workflow nodes to the NodeTool repo."
---

> **Audience:** contributors and coding agents adding new MiniMax models or workflow nodes.

## TL;DR

1. Add a model ID to the relevant catalogue array in `minimax-provider.ts` (for the generic provider) **and** to the matching constant in `minimax-base.ts` (for the node pack's `@prop` enum).
2. For a new node type, copy an existing node file in `packages/minimax-nodes/src/nodes/`, register it in `src/index.ts`, add a test under `tests/`.
3. Build: `npm run build:packages`.
4. Verify: `npm run typecheck`, then `npm run dev:nodetool -- node run minimax.<YourNodeType> --props '{...}'`.

---

## Where things live

| What | Path |
|---|---|
| Provider class (chat/image/video/TTS/music) | `packages/runtime/src/providers/minimax-provider.ts` |
| Shared node constants and helpers | `packages/minimax-nodes/src/minimax-base.ts` |
| Node implementations | `packages/minimax-nodes/src/nodes/*.ts` |
| Node pack entry point | `packages/minimax-nodes/src/index.ts` |
| Node pack tests | `packages/minimax-nodes/tests/*.ts` |
| Provider ID constant | `packages/protocol/src/api-types.ts` line 872 (`MINIMAX: "minimax"`) |
| Provider registration | `packages/runtime/src/providers/index.ts` line 215 |
| API docs | <https://platform.minimax.io/docs/api-reference/api-overview> |

---

## How MiniMax models and nodes are defined

**Provider catalogue (static arrays)**

`MinimaxProvider` in `minimax-provider.ts` overrides six `getAvailable*` methods. Each returns a hardcoded array — there is no live API discovery. The arrays are the source of truth for the generic nodes (chat, generic TTS, generic video).

```ts
// packages/runtime/src/providers/minimax-provider.ts
override async getAvailableVideoModels(): Promise<VideoModel[]> {
  return [
    { id: "MiniMax-Hailuo-2.3", name: "MiniMax Hailuo 2.3", provider: "minimax",
      supportedTasks: ["text_to_video", "image_to_video"] },
    // ...
  ];
}
```

**Node pack constants (in `minimax-base.ts`)**

`packages/minimax-nodes/src/minimax-base.ts` duplicates the model IDs as plain string arrays. These feed the `values` field in each node's `@prop` decorator, which drives UI drop-downs and validation.

```ts
// packages/minimax-nodes/src/minimax-base.ts
export const MINIMAX_T2V_MODELS: string[] = [
  "MiniMax-Hailuo-2.3",
  "MiniMax-Hailuo-2.3-Fast",
  "MiniMax-Hailuo-02",
  "T2V-01-Director"
];
```

**Why two places?** Nodes call MiniMax's REST API directly (not through the provider) so they can expose MiniMax-specific fields (emotion, volume, pitch, camera direction, lyrics) that the generic `BaseProvider` interface does not carry.

**Node registration**

`src/index.ts` exports `MINIMAX_NODES` (the full array) and `registerMinimaxNodes` (the registry helper). Every new node class must be imported and added to both.

---

## Add a new model or node

### Case A: new model ID in an existing node type

1. **Add the ID to `minimax-provider.ts`** in the matching `getAvailable*` method:

   ```ts
   { id: "MiniMax-Hailuo-3.0", name: "MiniMax Hailuo 3.0", provider: "minimax",
     supportedTasks: ["text_to_video", "image_to_video"] },
   ```

2. **Add the same ID to `minimax-base.ts`** in the matching constant:

   ```ts
   export const MINIMAX_T2V_MODELS: string[] = [
     "MiniMax-Hailuo-3.0",   // new
     "MiniMax-Hailuo-2.3",
     // ...
   ];
   ```

   Do the same for `MINIMAX_I2V_MODELS` if the model supports image-to-video.

3. The node's `@prop` enum picks up the new entry automatically — no change to the node file needed.

### Case B: new node type

Say MiniMax releases a new endpoint, e.g. `POST /v1/text_to_3d`.

1. **Create `packages/minimax-nodes/src/nodes/text-to-3d.ts`**, modelled on an existing node:

   ```ts
   import { BaseNode, prop } from "@nodetool-ai/node-sdk";
   import type { NodeClass } from "@nodetool-ai/node-sdk";
   import {
     assertBaseResp,
     getMinimaxApiKey,
     MINIMAX_BASE_URL,
     minimaxHeaders
   } from "../minimax-base.js";

   const TEXT_TO_3D_MODELS = ["3d-01"];

   export class MinimaxTextTo3DNode extends BaseNode {
     static readonly nodeType = "minimax.TextTo3D";
     static readonly body = "content_card";
     static readonly title = "MiniMax Text to 3D";
     static readonly description =
       "Generate a 3D model from a text prompt using MiniMax 3D-01.\n" +
       "3d, generation, text-to-3d, minimax\n\n" +
       "Use cases:\n" +
       "- Prototype 3D assets from descriptions\n" +
       "- Generate objects for scenes";
     static readonly metadataOutputTypes = { output: "model3d" };
     static readonly inlineFields: string[] = [];
     static readonly inputFields: string[] = ["prompt"];
     static readonly requiredSettings = ["MINIMAX_API_KEY"];
     static readonly autoSaveAsset = true;

     @prop({
       type: "enum",
       default: "3d-01",
       title: "Model",
       description: "The MiniMax 3D model to use.",
       values: TEXT_TO_3D_MODELS
     })
     declare model: any;

     @prop({
       type: "str",
       default: "A ceramic vase with floral patterns",
       title: "Prompt",
       description: "Text prompt describing the 3D object."
     })
     declare prompt: any;

     async process(): Promise<Record<string, unknown>> {
       const apiKey = getMinimaxApiKey(this._secrets);
       const prompt = String(this.prompt ?? "");
       if (!prompt) throw new Error("Prompt is required");

       const res = await fetch(`${MINIMAX_BASE_URL}/v1/text_to_3d`, {
         method: "POST",
         headers: minimaxHeaders(apiKey),
         body: JSON.stringify({ model: String(this.model ?? "3d-01"), prompt })
       });
       if (!res.ok) {
         throw new Error(`MiniMax text_to_3d failed: ${res.status} ${await res.text()}`);
       }
       const data = (await res.json()) as Record<string, unknown>;
       assertBaseResp(data, "text_to_3d");
       // parse response and return output ref
       return { output: { type: "model3d", data: "" } };
     }
   }

   export const TEXT_TO_3D_NODES: readonly NodeClass[] = [MinimaxTextTo3DNode];
   ```

2. **Register in `src/index.ts`**:

   ```ts
   import { TEXT_TO_3D_NODES } from "./nodes/text-to-3d.js";
   export { MinimaxTextTo3DNode } from "./nodes/text-to-3d.js";

   export const MINIMAX_NODES: readonly NodeClass[] = [
     ...VOICE_NODES,
     ...TEXT_TO_SPEECH_NODES,
     ...MUSIC_NODES,
     ...TEXT_TO_IMAGE_NODES,
     ...TEXT_TO_VIDEO_NODES,
     ...IMAGE_TO_VIDEO_NODES,
     ...TEXT_TO_3D_NODES  // add here
   ];
   ```

3. **Add a test** in `packages/minimax-nodes/tests/text-to-3d.test.ts`. Stub `fetch` with `vi.stubGlobal` (see any existing test for the pattern). At minimum assert the node calls the right endpoint and returns an output.

4. **Update `tests/registration.test.ts`** — add `"minimax.TextTo3D"` to both `registry.has(...)` checks and the `types` array.

---

## Verify

Run these in order after any change:

```bash
# 1. Type check all packages
npm run typecheck

# 2. Build (minimax-nodes loads from dist/)
npm run build:packages

# 3. Run a single node in isolation (no full server needed)
npm run dev:nodetool -- node run minimax.TextToSpeech \
  --props '{"text":"hello","voice_id":"English_Trustworth_Man","model":"speech-2.6-hd"}' \
  --no-secrets

# 4. Run the minimax-nodes test suite
npm run test --workspace=packages/minimax-nodes

# 5. Validate a workflow that uses the new node type
npm run dev:nodetool -- validate workflow.json
```

The `--no-secrets` flag lets the node runner skip the database. The node will
fail at the network call (no real API key), but a type error or missing-field
panic surfaces before that.

---

## How past commits did it

The minimax node pack and provider were introduced before the current git window,
but the two most recent commits that touched these files are:

- **`ca742050`** — version bump to `0.7.0-rc.26` (touched `packages/minimax-nodes/package.json` along with all other packages)
- **`f900e7a6`** — version bump to `0.7.0-rc.25`

These are housekeeping commits. The substantive minimax work (node pack creation, provider implementation) predates the visible history on this branch, but the pattern matches the `elevenlabs-nodes` pack (same direct-fetch approach, same `minimax-base.ts` ↔ `minimax-provider.ts` split).

To find the original introduction commit across all branches:

```bash
git log --all --oneline -- packages/minimax-nodes/src/index.ts | tail -1
```

---

## Contributing

Source: <https://github.com/nodetool-ai/nodetool>  
Discord: <https://discord.gg/WmQTWZRcYE>

Before opening a PR:

```bash
npm run check   # runs typecheck + lint + test for all packages
```

All three must pass. Do not commit if either `npm run typecheck` or `npm run lint` fails.
