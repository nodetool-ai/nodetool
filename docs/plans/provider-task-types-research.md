# Do we need more provider task types?

**Status:** Research, for decision
**Question:** Does `ProviderCapability` need new entries, and which?
**Related:** `packages/runtime/src/providers/base-provider.ts`,
`packages/runtime/src/providers/manifest-models.ts`,
`packages/runtime/src/context.ts`, `packages/execution/src/cost-ledger.ts`

---

## 1. Answer

Yes, for three: `text_to_sound_effects`, `audio_to_audio`, `video_to_audio`.
Everything else on the candidate list is either already covered by an existing
capability, reachable through a per-endpoint node, or too thin on provider
support to pay for the ten surfaces a capability touches.

The gap is not "the product cannot call these endpoints". Every FAL, Replicate
and KIE manifest entry becomes a node class at runtime
(`packages/fal-nodes/src/fal-factory.ts`), so all of them are usable on a
canvas. The gap is that they are invisible to the **generic capability layer**:
model pickers, the chat composer's media modes, `ui_search_models`, and every
flow that takes a `provider:model_id` pair instead of a node type.

## 2. What exists today

`ProviderCapability` (`base-provider.ts:191`) has 22 entries. A provider
advertises one by overriding the matching `BaseProvider` method;
`providerCapabilities()` reads the prototype to derive the set.

Provider coverage of the media capabilities, counted by which methods each
`*-provider.ts` overrides:

| Capability | Providers implementing |
|---|---|
| `text_to_image` / `image_to_image` | aki, atlascloud, evolink, fal, gemini, huggingface, kie, minimax, nodetool, openai, python, replicate, reve, together, xai (+codex, openrouter text-only) |
| `text_to_video` / `image_to_video` | atlascloud, evolink, fal, gemini, huggingface, kie, minimax, nodetool, openai, python, replicate, together, xai |
| `reference_to_video` | atlascloud, fal, kie, minimax, nodetool, python, replicate |
| `video_to_video` | fal, replicate |
| `lip_sync` | fal, replicate |
| `inpainting` | fal, kie, openai, replicate |
| `upscale_image` | fal, replicate, topaz |
| `remove_background` / `relight_image` | fal, replicate |
| `segment_image` | fal |
| `vectorize_image` | fal, replicate |
| `text_to_speech` | elevenlabs, gemini, huggingface, minimax, openai, python, together |
| `text_to_music` | fal, kie, minimax, python, replicate |
| `automatic_speech_recognition` | gemini, huggingface, minimax, openai, python |
| `generate_embedding` | cohere, gemini, huggingface, jina, minimax, mistral, node-llama-cpp, ollama, openai, python, voyage |
| `text_to_3d` / `image_to_3d` | meshy, rodin |

## 3. Findings

**F1 — 50 of 127 FAL audio endpoints are in no model list, on purpose.**
`isAudioTransformNode` (`manifest-models.ts:1159`) drops 43 endpoints matching
`audio-to-audio`, `speech-to-speech`, `video-to-audio`, `isolation`,
`voice-changer`, `inpaint`/`outpaint`, `extend-audio`, `super-resolution`.
`isSoundEffectNode` drops the rest; 7 of those are pure text→SFX generators
(`fal-ai/elevenlabs/sound-effects/v2`, `cassetteai/sound-effects-generator`,
`mirelo-ai/sfx1.6/text-to-audio`, `sonilo/v1.1/text-to-sound-effects`,
`beatoven/sound-effect-generation`, two `stable-audio-3` SFX checkpoints).
`isTTSNode` and `isMusicNode` both return false for them, so they appear in
neither the TTS nor the music picker. The exclusions are correct given the
capability set — a voice changer offered as a text-to-music model fails at call
time with nothing to work on. They are the symptom, not the bug.

**F2 — SFX already costs the product a workaround.** The game flow takes
`image_model` and `music_model` as `provider:model_id`, but takes
`sfx_node_type` as a raw registry node type
(`packages/agents/src/capabilities/workflows.specs.ts:751`), because there is
no SFX model list to pick from. That asymmetry is the missing capability
showing through the API.

**F3 — `audio_to_video` is half-plumbed.** `inferVideoTasks` already emits the
string (`manifest-models.ts:298`), `MediaGenerationMode` and `MediaMode` both
list it, and `MediaModeMenu` ships the entry with `enabled: false`.
`capabilityForMode("audio_to_video")` returns `null`, asserted by
`web/src/components/chat/composer/__tests__/useModeProviderSetup.test.tsx:48`.
23 FAL endpoints classify into it and can never be selected.

**F4 — video upscalers ride `video_to_video`.** `inferVideoTasks` routes
`upscal`/`super-resolution`/`vsr`/`enhancer` into `video_to_video` with a
comment saying why (keeping them out of the generation pickers). That puts 11
FAL and 5 Replicate upscalers next to restyle models in one picker, offering a
`prompt` and `strength` the upscalers ignore. Topaz's 2 video models
(`packages/topaz-nodes/src/topaz-manifest.json`) are unreachable at all —
`topaz-provider.ts` implements `upscaleImage` only.

**F5 — `rerank` is advertised in settings and implemented nowhere.** The
Cohere and Jina setting descriptions (`setting-catalog.ts:382,387`) both name
reranking, `hf-models.ts:341` has a `reranker` model type, and
`api-types.ts:1134` groups Voyage and Jina under "Embeddings / reranking".
No provider method, no capability, no node. Three providers already configured
(cohere, jina, voyage) ship a rerank API.

**F6 — two unions share one name.** `ProviderCapability` is declared twice:
`base-provider.ts:191` (what a provider implements, 22 entries) and
`context.ts:292` (what a generation record can carry, 24 — adding
`render_model3d` and `bake_model3d_clip`, both local Blender work, not a
provider call). The split is intentional; the shared name is not, and nothing
keeps the 22 in sync.

**F7 — capability names and model-task names diverge for four tasks.**
The capability is `upscale_image` / `relight_image` / `segment_image` /
`vectorize_image`; the model task `inferImageTasks` emits and
`useModelsByProvider.ts:227` filters on is `upscale` / `relight` / `segment` /
`vectorize`. Every new task type has to pick a side, and today the choice is
made per surface.

**F8 — a new capability touches ten places.** `base-provider.ts` (union,
`providerCapabilities()`, method stub), `context.ts` (union, `dispatchCapability`
case, `generationMime`), `manifest-models.ts` (classifier + model loader),
`cost-ledger.ts` (`UNIT_BILLED_CAPABILITIES`), a generic node in
`{image,video,audio}-nodes`, `protocol/toolSchemas.ts`
(`MODEL_SEARCH_KINDS`), `web/hooks/useModelsByProvider.ts`,
`web/components/properties/ModelProperty.tsx`,
`web/core/chat/mediaPrediction.ts`, plus the composer mode map when it gets a
chat surface. None of it is hard; all of it is the real cost.

## 4. Recommendation

**R1 — add `text_to_sound_effects`.** 7 dedicated FAL generators plus
ElevenLabs' own SFX API, and F2 shows the product already paying for its
absence. Same shape as `text_to_music` (prompt + duration → encoded audio), so
it reuses `runEncodedGeneration` and the `textToMusic` param bag. Lets the game
flow take `sfx_model` like it takes `music_model`, and gives the timeline a
foley source.

**R2 — add `audio_to_audio`.** 43 FAL endpoints, ElevenLabs voice changer and
audio isolation, Replicate's separator and enhancer. It is one method taking
audio bytes plus a prompt, and it unblocks voice conversion, denoise, stem
separation and audio super-resolution as one family rather than four.
Fold `speech_to_speech` (2 endpoints) into it — the call shape is identical and
a separate capability buys nothing.

**R3 — add `video_to_audio`.** 6 FAL endpoints (`kling-video/video-to-audio`,
two `mirelo-ai/sfx` versions, `sam-audio/visual-separate`). Small, but it is
the one capability the storyboard→timeline pipeline cannot express at all:
score a rendered shot from the picture. Ship it after R1 — it produces the same
kind of output and can share the SFX node's surface.

**R4 — do not add `audio_to_video` yet; finish or delete the stub.** F3 says
the plumbing is half built and the UI entry is disabled. Either wire
`capabilityForMode` and a provider method, or drop the mode and the
`inferVideoTasks` branch so 23 endpoints stop classifying into a dead string.
Leaving it as is costs a test that asserts the null.

**R5 — split video upscaling out of `video_to_video`.** F4 is a picker bug, not
a missing capability: the same `upscale_image` capability could take video
bytes, or a new `upscale_video` could. Either way Topaz's video models need
`topaz-provider` to implement it. Lower priority than R1-R3 — these models are
reachable today, just badly presented.

**R6 — treat `rerank` as its own decision.** F5 is a retrieval capability, not
a media one, and its natural consumer is `packages/vectorstore` RAG, not a
model picker. Worth doing, worth scoping separately from this list.

**R7 — do not add** `3d_to_3d` (13 FAL + Meshy retexture/remesh; the model3d
editor covers the in-house path and no flow asks for it), `vision` /
`image_to_json` / `video_to_text` (38+3+3 endpoints, all served by
`generate_message` with image or video content), or `training` (70 FAL LoRA
endpoints, a different product).

**R8 — before any of the above, rename one of the two `ProviderCapability`
unions** (F6) and pick one vocabulary for task names (F7). Both are cheap now
and get more expensive with every capability added.

## 5. How the numbers were measured

Endpoint counts come from the checked-in manifests, tallied by `moduleName`:

```
packages/fal-nodes/src/fal-manifest.json          1600 entries
packages/replicate-nodes/src/replicate-manifest.json  662
packages/kie-nodes/src/kie-manifest.json              163
packages/topaz-nodes/src/topaz-manifest.json           11
```

FAL modules with no matching capability: `audio_to_audio` 42,
`audio_to_video` 23, `3d_to_3d` 13, `video_to_audio` 6, `speech_to_speech` 2,
plus `vision` 38 and `training` 70 (both out of scope per R7).

The audio exclusion counts in F1 were produced by running the
`AUDIO_TRANSFORM_KEYWORDS` and `SOUND_EFFECT_KEYWORDS` lists from
`manifest-models.ts` against every manifest entry with `outputType: "audio"`.
The provider table in §2 was produced by grepping each `*-provider.ts` for
overrides of the 19 optional `BaseProvider` methods — the same signal
`providerCapabilities()` reads at runtime.
