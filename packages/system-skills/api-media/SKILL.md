---
name: api-media
description: "Call nodetool.media or nodetool.generations from a code action: generate or edit images, video, speech and music with a picked model, transcribe and embed, judge images with a vision model, read a video, run ffmpeg or ffprobe, download a video, and read the status and cost of a generation. Load before the first call into these namespaces."
---

# nodetool.media and nodetool.generations

`nodetool.media` makes one result with one picked model and saves it as an
asset. No workflow is needed. `nodetool.generations` is the record of every
media generation: status, cost, and the assets it made. The model comes from
`nodetool.models.pick` (see `api-models`). How to word a prompt for one model
line is the `*-prompting` skill that `find_model` names in `prompting_skill`.

## Generation calls

Each call takes `model` as a `pick`/`find` result, `{provider, model_id}`, or
a `"provider/model_id"` string.

| Call | Options | Capability to pick |
| :--- | :--- | :--- |
| `generateImage(prompt, model, opts)` | `width`, `height`, `quality`, `negative_prompt`, `output_file`, `background` | `text_to_image` |
| `editImage(inputFile, prompt, model, opts)` | `reference_files`, `strength`, `target_width`, `target_height`, `negative_prompt`, `output_file`, `background` | `image_to_image` |
| `generateVideo(prompt, model, opts)` | `duration_seconds`, `aspect_ratio`, `resolution`, `num_frames`, `negative_prompt`, `output_file`, `background` | `text_to_video` |
| `animateImage(inputFile, model, opts)` | `prompt`, `duration_seconds`, `aspect_ratio`, `resolution`, `num_frames`, `output_file`, `background` | `image_to_video` |
| `videoFromReferences(referenceFiles, model, opts)` | `prompt`, `use_reference_video_audio`, `duration_seconds`, `aspect_ratio`, `resolution`, `output_file`, `background` | `reference_to_video` |
| `speak(text, model, opts)` | `voice`, `speed`, `output_file`, `background` | `text_to_speech` |
| `generateMusic(prompt, model, opts)` | `lyrics`, `duration_seconds`, `output_file`, `background` | `text_to_music` |
| `transcribe(inputFile, model, opts)` | `language`, `prompt` | `automatic_speech_recognition` |
| `embed(text, model, opts)` | `dimensions`. `text` is a string or an array. | `generate_embedding` |

A generation answers with `asset_id`, `asset_uri` (`asset://…`),
`generation_id`, `mime_type` and `bytes`, plus `path` when you passed
`output_file`. An input file (`inputFile`, `reference_files`) is an
`asset://` URI or a workspace path.

- `editImage` is the call for "make it like this". Pass the attached image or
  an approved earlier result as `inputFile`, and further images to match in
  `reference_files`.
- `videoFromReferences` is for a shot that more than one reference defines: a
  character plus a garment, a product plus a location. The prompt then says
  the action and the camera, not the subjects.
- Models honour `duration_seconds` loosely. Measure the result with
  `ffprobe` before you cut to it.
- To put words on a picture, draw them yourself with `createCanvas` and
  `fillText`, or with `renderText` from
  `@nodetool-ai/sandbox-flow/lib.image.draw`.

### Background generations

`background: true` returns at once with
`{generation_id, status: "running", background: true}`. Collect the result
with `nodetool.generations.wait(receipt)`. A run can have 16 open at most.
Start several, then wait for all of them in the same action:

```js
const model = await nodetool.models.pick("text_to_video");
const receipts = await Promise.all(prompts.map((p) =>
  nodetool.media.generateVideo(p, model, { background: true })));
const done = await Promise.all(receipts.map((r) =>
  nodetool.generations.wait(r, { timeout_seconds: 900 })));
```

## Handles and saving

`image.*`, `audio.*` and `video.*` (guest globals, no `nodetool.` prefix) take
a generation result, its `asset_uri` or an asset id, and answer run-local
handles. `video.addAudio(videoHandle, audioHandle)` combines media, for
example. Save a finished handle with `nodetool.media.toImage(handle)`,
`toAudio(handle)` or `toVideo(handle)` before the action ends. A handle is dead
in the next action. Do not pull bytes into the guest.

Hold each result in a local variable and feed it straight into the next call.
Record the uris a later action or turn will need with `nodetool.memory.save`,
and never re-run generation for something already saved.

## Judging

The judge is a chat model that reads images (`pick("generate_message")` on a
vision model), not the model that made the picture.

| Call | Answers |
| :--- | :--- |
| `critique(image, brief, visionModel, {taste_profile})` | A pass/revise verdict and concrete defects with locations and fixes. Feed the fixes into the next prompt. When it names no defect, make fresh variations. |
| `compare(images, brief, visionModel, {taste_profile})` | The winner of 2–8 candidates by a pairwise knockout, each match judged twice with the order swapped, plus every verdict |
| `scoreAdherence(image, brief, visionModel, {questions})` | Yes/no answers to up to 12 checks made from the brief, and the fraction that passed |
| `understandVideo(video, prompt, videoModel, {max_tokens})` | `{text, truncated}`. Gemini reads the whole clip with audio. Other models get still frames with no audio. A `truncated` answer is half an answer: raise `max_tokens` or use a model that does not reason. |

## Host binaries

| Call | Does |
| :--- | :--- |
| `ffmpeg(args, {inputs, output_file, timeout_seconds})` | Runs ffmpeg in the workspace with no shell. `args` is the argv after the binary. Paths are workspace-relative, and URLs are refused. `inputs` stages assets first as `{"a.mp4": "asset://…"}` (8 files at most). `output_file` is saved as an asset. The default timeout is 180 s, the maximum 600 s. |
| `ffprobe(path, {inputs, timeout_seconds})` | Reads the format and streams. `path` may be an `asset://` URI. The answer has a `summary` with `duration_seconds`, `width`, `height` and `has_audio` as real numbers and booleans. |
| `downloadVideo(url, outputFile, {format, timeout_seconds})` | Downloads a public video with yt-dlp, up to 2 GiB. |

```js
// Concatenate two assets in one call.
await nodetool.media.ffmpeg(
  ["-i", "a.mp4", "-i", "b.mp4", "-filter_complex",
   "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]", "-map", "[v]", "-map", "[a]",
   "out.mp4"],
  { inputs: { "a.mp4": uriA, "b.mp4": uriB }, output_file: "out.mp4" }
);
```

## nodetool.generations

Every generation result carries `generation_id`. Read the cost with `get`
instead of guessing it.

| Call | Answers |
| :--- | :--- |
| `list({status, provider, capability, thread_id, job_id, since, limit, start_key})` | Generations, newest first, with status, cost, errors and assets |
| `get(idOrResult)` | One generation in full: request parameters, cost and how it was priced, the provider request id, the assets |
| `wait(idOrResult, {timeout_seconds})` | Waits for a background generation. The default is 300 s. A timeout answers the current record; call again to keep waiting. |
| `cancel(idOrResult)` | Stops a running generation. It answers `cancelled: false` when the generation already settled. |
| `reconcile(idOrResult)` | Asks the provider what it billed and replaces the estimate |
| `fromProvider(provider, {model, status, since, until, limit, cursor})` | The provider's own history, from any machine. `fal_ai` answers. |
| `getFromProvider(provider, requestId, {model})` | One provider-side generation, with the output urls it still hosts. This recovers a lost asset. |

Statuses are `pending`, `running`, `recovering`, `completed`, `failed`,
`cancelled`, `needs_attention` and `interrupted`. `completed` means the
output is durable. A failed, cancelled or interrupted generation can still be
billed.
