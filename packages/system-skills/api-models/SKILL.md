---
name: api-models
description: "Call nodetool.models from a code action: pick the best configured model for a capability, search for a model the user named, browse a provider's catalog, set a node's model property, or make one language-model call. Load before the first call into nodetool.models."
---

# nodetool.models

Model discovery for this install. It knows which providers have credentials
and which local models are downloaded. Never guess a model id: pick one here,
then pass it on. Credentials and provider setup are
`nodetool-model-provider-config`.

## Calls

| Call | Does | Answers |
| :--- | :--- | :--- |
| `pick(capability, {query, provider_hint, model_hint, prefer_local})` | Resolves ONE model. | The top result: `{provider, model_id, ref, …}` |
| `find(capability, {query, task, provider_hint, model_hint, prefer_local, limit})` | Ranks candidates. `limit` defaults to 5. | `{results, ref, note?, query_matched?}` |
| `list({provider, model_type, downloaded_only, limit})` | Browses every configured model. | `{results}` |
| `forProvider(provider)` | Lists one provider's language models. | The provider catalog |
| `generate(prompt, model, {system, images, max_tokens, temperature})` | One language-model call, with optional images. No asset is made. | `{provider, model, text}` |

`capability` is one of `text_to_image`, `image_to_image`, `segment_image`,
`text_to_video`, `image_to_video`, `reference_to_video`, `text_to_speech`,
`text_to_music`, `audio_to_audio`, `automatic_speech_recognition`,
`generate_embedding` and `generate_message`.

`model_type` for `list` is one of `language`, `image`, `video`, `tts`,
`music`, `audio_to_audio`, `asr` and `embedding`.

## What a result carries

- `provider` and `model_id` — the route. Every `nodetool.media.*` call takes
  the whole result, `{provider, model_id}`, or a `"provider/model_id"` string.
- `ref` — the typed value `{type, provider, id, name}`. Assign it **verbatim**
  to a node's `*_model` property. The flat `model_id` field does not fit that
  property.
- For ranked media models: `canonical`, `ranked_task`, `rank` and `of`, and
  `alternate_routes` for other providers that serve the same model. One model
  is one row, not one row for each route.
- `prompting_skill` — the name of the shipped guide for that model line. Load
  it with `load_skill` before you write the prompt.

## Rules

- `pick` with no options is the good default. For image, video, speech and
  music, the order comes from a quality leaderboard for the task. Do not shop
  around.
- When the user named a model, search in the same call:
  `pick("text_to_image", {query: "flux schnell"})`. `query` is free text over
  the model id and name. All words must appear, and separators do not matter.
- `pick` throws when no configured provider offers the capability, and when a
  `query` matches nothing. It never answers with an unrelated model. Report
  the miss or call `find` to see what is configured.
- `task` is a hint against the supported tasks of a model. It is not a search
  box. Use `query` to search by name.
- A judge for `nodetool.media.critique`, `compare`, `scoreAdherence` and
  `understandVideo` is a chat model that reads images or video:
  `pick("generate_message", {query: "gemini"})`, for example. It is not the
  model that made the picture.

## Examples

```js
// The best image model, straight into a generation.
const model = await nodetool.models.pick("text_to_image");
const shot = await nodetool.media.generateImage("a red fox in snow", model);

// A node property wants the typed ref.
const tts = await nodetool.models.pick("text_to_speech");
wf.node("speech_1").set({ model: tts.ref });

// One text call with an image.
const llm = await nodetool.models.pick("generate_message");
const { text } = await nodetool.models.generate(
  "Name the dominant colour in one word.", llm, { images: [shot.asset_uri] }
);
```
