---
layout: page
title: "MiniMax: Add Models & Nodes"
description: "How to add new MiniMax models or workflow nodes to the NodeTool repo."
---

> **Runs:** cloud. **Needs:** `MINIMAX_API_KEY`. The provider constructor throws `MINIMAX_API_KEY is required` without it.
{: .callout-note}

## TL;DR

1. Add a model ID to the relevant catalogue array in `minimax-provider.ts` (for the generic provider) **and** to the matching constant in `minimax-base.ts` (for the node pack's `@prop` enum).
2. For a new node type, copy an existing node file in `packages/minimax-nodes/src/nodes/`, register it in `src/index.ts`, add a test under `tests/`.
3. Build: `npm run build:packages`.
4. Verify: `npm run typecheck`, then `npm run dev:nodetool -- node run minimax.<YourNodeType> --props '{...}'`.

## Where things live

| What | Path |
|---|---|
| Provider class (chat/image/video/TTS/music, and the endpoint calls the nodes use) | `packages/runtime/src/providers/minimax-provider.ts` |
| Shared node constants and helpers | `packages/minimax-nodes/src/minimax-base.ts` |
| Node implementations | `packages/minimax-nodes/src/nodes/*.ts` |
| Node pack entry point | `packages/minimax-nodes/src/index.ts` |
| Node pack tests | `packages/minimax-nodes/tests/*.ts` |
| Provider ID constant | `packages/protocol/src/api-types.ts` (`PROVIDER_IDS.MINIMAX`) |
| Provider registration | `packages/runtime/src/providers/index.ts` (`registerBuiltinProvider(PROVIDER_IDS.MINIMAX, ...)`) |
| API docs | <https://platform.minimax.io/docs/api-reference/api-overview> |

## How MiniMax models and nodes are defined

**Provider catalogue (static arrays)**

`MinimaxProvider` in `minimax-provider.ts` overrides five `getAvailable*` methods (language, image, video, TTS, music). Each returns a hardcoded array. There is no live API discovery. The arrays are the source of truth for the generic nodes (chat, generic TTS, generic video).

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
  "MiniMax-Hailuo-02",
  "T2V-01-Director"
];
```

**Why two places?** Nodes build MiniMax's own request body so they can expose MiniMax-specific fields (emotion, volume, pitch, camera direction, lyrics) that the generic capability methods do not carry. They send it with `callMinimax` from `minimax-base.ts`, which calls `context.callProviderEndpoint`. `MinimaxProvider.callEndpoint` holds the API key, posts to the endpoint family named by `route` (`tts`, `music`, `image` or `video`), checks `base_resp`, and writes the generation record. Result URLs download through `context.downloadProviderMedia`. Nodes never read the API key.

**Node registration**

`src/index.ts` exports `MINIMAX_NODES` (the full array) and `registerMinimaxNodes` (the registry helper). Every new node class must be imported and added to both.

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

   Do the same for `MINIMAX_I2V_MODELS` if the model supports image-to-video. TTS and music models have matching constants (`MINIMAX_TTS_MODELS`, `MINIMAX_MUSIC_MODELS`). The image node lists `image-01` inline in its `@prop` (`nodes/text-to-image.ts`). Chat models exist only in the provider, because the pack has no chat node.

3. The node's `@prop` enum picks up the new entry automatically — no change to the node file needed.

### Case B: new node type

Say MiniMax releases a new endpoint, for example `POST /v1/text_to_3d`. The 3D node below is an illustrative sketch. The pack has no 3D node today. A new endpoint family first needs a `route` in `MINIMAX_ENDPOINT_PATHS` in `minimax-provider.ts` (here `text_to_3d: "text_to_3d"`), and its name added to `MinimaxRoute` and the capability list of `callMinimax` in `minimax-base.ts`.

1. **Create `packages/minimax-nodes/src/nodes/text-to-3d.ts`**, modelled on an existing node:

   ```ts
   import { BaseNode, prop } from "@nodetool-ai/node-sdk";
   import type { NodeClass } from "@nodetool-ai/node-sdk";
   import type { ProcessingContext } from "@nodetool-ai/runtime";
   import { callMinimax } from "../minimax-base.js";

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

     async process(
       context?: ProcessingContext
     ): Promise<Record<string, unknown>> {
       const prompt = String(this.prompt ?? "");
       if (!prompt) throw new Error("Prompt is required");
       if (!context) {
         throw new Error("MiniMax Text to 3D requires a processing context");
       }

       const model = String(this.model ?? "3d-01");
       const data = await callMinimax(context, {
         route: "text_to_3d",
         capability: "text_to_3d",
         model,
         input: { model, prompt },
         nodeId: this.__node_id || undefined
       });
       // parse `data` and return output ref
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

3. **Add a test** in `packages/minimax-nodes/tests/text-to-3d.test.ts`. Use `scriptedMinimax` from `tests/scripted.ts`, which answers the provider from scripted replies (see any existing test for the pattern). At minimum assert the recorded endpoint call's `route`, `model` and `input`, the node output, and the `prediction` message.

4. **Update `tests/registration.test.ts`** — add `"minimax.TextTo3D"` to both `registry.has(...)` checks and the `types` array.

## Verify

Run these in order after any change:

```bash
# 1. Build (the build is tsc, so it type-checks the backend packages; minimax-nodes loads from dist/)
npm run build:packages

# 2. Type check web, electron and mobile
npm run typecheck

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
fail when the provider is built (no real API key), but a type error or
missing-field panic surfaces before that.
