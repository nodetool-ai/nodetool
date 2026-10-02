---
layout: page
title: "ElevenLabs: Add Models & Nodes"
description: "How to add ElevenLabs TTS models, voices, and nodes to NodeTool — with exact paths, code snippets, and a verification checklist."
---

> **Audience:** Contributors and coding agents adding ElevenLabs models, voices, or nodes to NodeTool.

## TL;DR

1. Add the model id to the `MODELS` array in `elevenlabs-provider.ts` **and** the `@prop` `values` array in the relevant node file.
2. To add a voice, add one entry to `VOICE_ID_MAP` in both `elevenlabs-base.ts` and `elevenlabs-provider.ts`.
3. To add a node, create `packages/elevenlabs-nodes/src/nodes/<name>.ts`, export a `readonly NodeClass[]`, and add it to `src/index.ts`.
4. Run `npm run build:packages` (required — this package loads from `dist/`), then `npm run test:affected`, `npm run typecheck`, and `npm run lint`.

---

## Where things live

| What | Path |
|------|------|
| Provider (TTS, voice list, model list) | `packages/runtime/src/providers/elevenlabs-provider.ts` |
| Shared voice/key helpers | `packages/elevenlabs-nodes/src/elevenlabs-base.ts` |
| Node package entry | `packages/elevenlabs-nodes/src/index.ts` |
| TTS node | `packages/elevenlabs-nodes/src/nodes/text-to-speech.ts` |
| STT node | `packages/elevenlabs-nodes/src/nodes/speech-to-text.ts` |
| Realtime TTS node (WebSocket) | `packages/elevenlabs-nodes/src/nodes/realtime-tts.ts` |
| Realtime STT node (WebSocket) | `packages/elevenlabs-nodes/src/nodes/realtime-stt.ts` |
| Standard voice picker node | `packages/elevenlabs-nodes/src/nodes/standard-voice.ts` |
| Provider registration | `packages/runtime/src/providers/index.ts` (`registerBuiltinProvider(PROVIDER_IDS.ELEVENLABS, ...)`) |
| Node tests | `packages/elevenlabs-nodes/tests/` |

---

## How ElevenLabs models and nodes are defined

### Models

Models are **static arrays**, not fetched at runtime. Two separate places hold them:

**Provider** (`elevenlabs-provider.ts`): the `MODELS` array drives what `getAvailableTTSModels()` returns to the unified TTS picker:

```ts
const MODELS: Array<{ id: string; name: string }> = [
  { id: "eleven_v3", name: "Eleven v3" },
  { id: "eleven_multilingual_v2", name: "Multilingual v2" },
  // …
];
```

**Node** (`text-to-speech.ts` / `realtime-tts.ts`): each node's `model_id` prop carries its own `values` enum that controls what appears in the workflow UI:

```ts
@prop({
  type: "enum",
  default: "eleven_monolingual_v1",
  title: "Model",
  values: ["eleven_v3", "eleven_multilingual_v2", "eleven_turbo_v2_5", /* … */]
})
declare model_id: any;
```

The two lists are independent and not identical. The node's `model_id` enum also carries the speech-to-speech models `eleven_multilingual_sts_v2` and `eleven_english_sts_v2`, which the provider omits. Keep them in sync when adding a TTS model.

### Voices

Voices are also static. The canonical map lives in two files that mirror each other:

- `packages/elevenlabs-nodes/src/elevenlabs-base.ts` — used by all nodes (voice ID resolution, the `StandardVoice` node enum)
- `packages/runtime/src/providers/elevenlabs-provider.ts` — used by the provider to surface voices in the unified TTS picker

`VOICE_ID_MAP` maps display name to voice id. `VOICE_NAMES = Object.keys(VOICE_ID_MAP)` is passed to `StandardVoiceNode`'s enum values and to `getAvailableTTSModels()` voice lists. The `TextToSpeech` node's `voice_id` prop is a plain string that defaults to the Aria id, so it accepts any ElevenLabs voice id. The provider resolves a voice name through the map and passes an unknown value through as an id.

### Nodes

Each node file exports a `readonly NodeClass[]` named `<CATEGORY>_NODES`. `src/index.ts` spreads them all into `ELEVENLABS_NODES` and `registerElevenLabsNodes()` calls `registry.register()` on each.

The package loads from **`dist/`** (see `"main": "dist/index.js"` in `package.json`). TypeScript decorators (`@prop`) require a build step before any changes take effect.

---

## Add a new model or node

### Add a model to an existing node

**Step 1.** Add the model id to `MODELS` in `packages/runtime/src/providers/elevenlabs-provider.ts`:

```ts
const MODELS: Array<{ id: string; name: string }> = [
  { id: "eleven_v3", name: "Eleven v3" },
  { id: "eleven_multilingual_v3", name: "Multilingual v3" },  // new
  // …
];
```

**Step 2.** Add the same id to the `values` array of the `model_id` prop in the relevant node(s). For `TextToSpeechNode` in `packages/elevenlabs-nodes/src/nodes/text-to-speech.ts`:

```ts
@prop({
  type: "enum",
  default: "eleven_monolingual_v1",
  title: "Model",
  values: [
    "eleven_v3",
    "eleven_multilingual_v3",   // new
    "eleven_multilingual_v2",
    // …
  ]
})
declare model_id: any;
```

Repeat for `realtime-tts.ts` if the model supports streaming.

### Add a voice

**Step 1.** Add the entry to `VOICE_ID_MAP` in `packages/elevenlabs-nodes/src/elevenlabs-base.ts`:

```ts
export const VOICE_ID_MAP: Record<string, string> = {
  // existing entries …
  Matilda: "XrExE9yKIg1WjnnlVkGX",  // new
};
```

**Step 2.** Mirror the same entry in `packages/runtime/src/providers/elevenlabs-provider.ts`:

```ts
const VOICE_ID_MAP: Record<string, string> = {
  // existing entries …
  Matilda: "XrExE9yKIg1WjnnlVkGX",  // new
};
```

`VOICE_NAMES` derives from `Object.keys(VOICE_ID_MAP)` in both files, so no other change is needed.

### Add a node

**Step 1.** Create `packages/elevenlabs-nodes/src/nodes/<name>.ts`. Follow the shape of an existing node — extend `BaseNode`, set the required static fields, use `@prop` for inputs, implement `process()`:

```ts
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import { getElevenLabsApiKey } from "../elevenlabs-base.js";

export class SoundEffectNode extends BaseNode {
  static readonly nodeType = "elevenlabs.SoundEffect";
  static readonly body = "content_card";
  static readonly title = "Sound Effect";
  static readonly description = "Generate a sound effect from a text prompt.";
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly requiredSettings = ["ELEVENLABS_API_KEY"];

  @prop({ type: "str", default: "", title: "Prompt",
          description: "Text description of the sound to generate." })
  declare prompt: any;

  async process(): Promise<Record<string, unknown>> {
    const apiKey = getElevenLabsApiKey(this._secrets);
    const prompt = String(this.prompt ?? "");
    if (!prompt) throw new Error("Prompt is required");

    const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: prompt })
    });
    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${await response.text()}`);
    }
    const data = Buffer.from(await response.arrayBuffer()).toString("base64");
    return { output: { type: "audio", data: `data:audio/mpeg;base64,${data}` } };
  }
}

export const SOUND_EFFECT_NODES: readonly NodeClass[] = [SoundEffectNode];
```

**Step 2.** Register it in `packages/elevenlabs-nodes/src/index.ts`:

```ts
import { SOUND_EFFECT_NODES } from "./nodes/sound-effect.js";

export const ELEVENLABS_NODES: readonly NodeClass[] = [
  ...TEXT_TO_SPEECH_NODES,
  ...SPEECH_TO_TEXT_NODES,
  ...REALTIME_TTS_NODES,
  ...REALTIME_STT_NODES,
  ...STANDARD_VOICE_NODES,
  ...SOUND_EFFECT_NODES,  // new
];
```

**Step 3.** Add a test in `packages/elevenlabs-nodes/tests/<name>.test.ts` and add a `registry.has("elevenlabs.SoundEffect")` assertion in `tests/registration.test.ts`.

---

## Verify

```bash
# Build first — required because this package loads from dist/
npm run build:packages

# Type check all packages
npm run typecheck

# Run the elevenlabs-nodes test suite
npm run test --workspace=packages/elevenlabs-nodes

# Smoke-test a node in isolation (no workflow needed)
npm run dev:nodetool -- node run elevenlabs.TextToSpeech \
  --props '{"text":"hello","voice_id":"9BWtsMINqrJLrRacOk9x"}' \
  --no-secrets

# Validate a workflow that uses the node (if you have one)
npm run dev:nodetool -- validate workflow.json

# Affected tests and the harness gate before committing
npm run test:affected
npm run lint
npm run dev:nodetool -- harness gate --base origin/main
```

---

The `tests/` files assert enum contents through `getDeclaredProperties()`, for example `TextToSpeechNode.getDeclaredProperties().find(p => p.name === "model_id")`. Follow that pattern in new tests.

---

## Contributing

Source and issues: <https://github.com/nodetool-ai/nodetool>  
Community discussion: <https://discord.gg/WmQTWZRcYE>

Run the Verify steps and make sure they pass before opening a PR. Two things catch most mistakes before review: `npm run build:packages` (catches missing exports, wrong import paths) and `npm run test --workspace=packages/elevenlabs-nodes` (catches registration gaps and API contract regressions).
