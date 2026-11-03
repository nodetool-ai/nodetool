# NodeTool on Comfy — render evidence

Real Comfy runs behind the [challenge entry](shot-director.md), recorded on
2026-11-03 from a cloud container with a Comfy API key. Every value below comes
from a job response or a file on disk. Nothing is estimated.

## Job 1: golden render (pinned graph, Comfy API v2 SDK)

Command:

```bash
COMFY_API_KEY=... node scripts/comfy-challenge/golden-render.mjs --out <dir>
```

| Field | Value |
| --- | --- |
| Comfy job id | `1864fe95-f7a5-44dd-8542-66c963213e14` |
| Status | `succeeded` |
| Wall time, submit to terminal | 95.3 s |
| Preset | `camera.dolly-in` v1 (`local-wan`) |
| Seed | 42 |
| Source | `recipe-inputs/coffee.jpg`, sha256 `d9b38864…cf0a9d1f` |
| Workflow sha256 | `a5c3b998…066f6692` |
| Output | H.264 MP4, 1280×704, 121 frames, 24 fps, 5.04 s, 4,353,844 bytes |

Direction: "Warm steam rises gently from the ceramic cup under soft morning
window light." The take opens on the still, then drifts into a window scene in
the last second. The direction mentions a window that the still does not show,
so the default direction is now grounded in what the still contains (below).

## Job 2: the NodeTool workflow, headless

Command (the source image is passed as a `file://` ref because the CLI run
context does not resolve `package://` assets):

```bash
COMFY_API_KEY=... npm run dev:nodetool -- run \
  "packages/base-nodes/nodetool/examples/nodetool-base/Shot Director.json" \
  --params '{"camera_move":"orbit","seed":7,"source_image":{"type":"image","uri":"file:///<repo>/packages/base-nodes/nodetool/assets/nodetool-base/recipe-inputs/coffee.jpg"}}'
```

| Field | Value |
| --- | --- |
| Comfy job id | `6baae0a5-b49b-4314-b010-af6bb99288e6` |
| Status | `succeeded` |
| Workflow wall time | 88 s (12:46:26 to 12:47:54 UTC) |
| Preset | `camera.orbit` v1 |
| Seed | 7 |
| Direction | "Steam curls up from the espresso cup on the dark wooden table among scattered coffee beans, warm low light." |
| Comfy output manifest | node 58, `video/shot-director_00001_.mp4`, `video/mp4`, 5,442,096 bytes |
| Output | H.264 MP4, 1280×704, 121 frames, 24 fps, 5.04 s |

`comfy_job` and `run_settings` came back as expected. The `take` output was
empty: Comfy Cloud reports the SaveVideo file with `type: "image"`, so the node
emitted it on `58:image` and the workflow's `58:video` edge never fired. The
video above was downloaded from the finished job by id. The fix
(`outputKind` in `packages/integration-nodes/src/nodes/comfy-sdk.ts`) routes
by content type, with a test built from the real manifest. Job 4 below found
a second cause.

Two earlier submissions failed in Comfy's input validation within 3 seconds and
rendered nothing (`eb10e018-6e6e-4858-9a6d-140b240b9508`,
`c880ece0-832f-40c9-9c64-fabb65f7719f`): the source image could not be read, the
node skipped it silently, and Comfy rejected the placeholder `input.png`. The
node now refuses to submit when a connected media ref cannot be read.

## Job 4: the workflow again, after the output fix

Same command as job 2 with `"camera_move":"crane up","seed":11`.

| Field | Value |
| --- | --- |
| Comfy job id | `1b27be8f-cfb6-4b66-8c05-08897324ac60` |
| Status | `succeeded` |
| Workflow wall time | 106 s (13:08:34 to 13:10:20 UTC) |
| Preset | `camera.crane-up` v1 |
| Output | H.264 MP4, 1280×704, 121 frames, 5.04 s, 2,852,572 bytes |

The `take` was still empty. The job's event stream ended without any
`outputReady` event, and the node only emitted files from that stream. The node
now also emits every output on the finished job that the stream did not
deliver. Replaying this finished job through the fixed node, with no new
submit, yields `58:video` (`video/mp4`, 2,852,572 bytes) followed by the
`output` manifest. The motion reads as a tilt down into the beans more than a
crane up, which is within the "prompt guidance, not camera control" caveat.

## Job 3: Comfy Router provider, text to image

`ComfyCloudProvider.textToImage` from the `feat/comfy-router-provider` branch,
model `luma/photon-flash-1`, aspect ratio 16:9.

| Field | Value |
| --- | --- |
| Router request id | `10e880b4-1f9e-434d-ace9-5bfa3c2f817c` |
| Path | `POST /v2/models/luma/photon-flash-1/requests` 201, 4 status polls, result 200 |
| End to end | 13.8 s |
| Output | JPEG, 2048×1152, 116,274 bytes |

## Job 5: Comfy Router provider, image to video

`ComfyCloudProvider.imageToVideo` from `feat/comfy-router-provider` at
`3038072d`, model `byteplus/seedance-1-0-pro-fast-251015`, the coffee still as
first frame, 5 s, 16:9.

| Field | Value |
| --- | --- |
| Router request id | `64e17545-0150-4048-817c-682868f52c65` |
| Request body | `content[]` with the text prompt and the image as `first_frame`, `ratio` 16:9, `duration` 5 |
| Path | `POST …/requests` 201, 8 status polls, result 200, video fetched from the signed URL |
| End to end | 57.5 s |
| Output | H.264 MP4, 1920×1088, 121 frames, 24 fps, 5.04 s, 15,642,432 bytes |

The take holds the source still and pushes in on the cup as prompted.

The Router path is a partner API, not part of the open-weights render path.

## Job 6: the storyboard clip model through the provider

`ComfyCloudProvider.imageToVideo` with model `comfyui-workflow/wan2.2-ti2v-5b`,
the path a storyboard shot render takes after `generate_media`. The prompt was
the default direction plus the clause `compileCameraPresets(["camera.dolly-in"])`
returns for this model, the coffee still, 5 s, 16:9, seed 21.

| Field | Value |
| --- | --- |
| End to end | 90.5 s |
| Output | H.264 MP4, 1280×704, 121 frames, 24 fps, 5.04 s, 4,267,129 bytes |

The provider does not return the Comfy job id to the caller, so this run has
no job id on record.

## Job 7: a storyboard shot rendered from the browser

A three-shot board created through `storyboards.create`, with the coffee still
on each shot, `camera.dolly-in` on shot 2 and the board's video model set to
`comfyui-workflow/wan2.2-ti2v-5b`. Driven with Playwright against `npm run dev`:
open the board, open **Render clip** on shot 2, press **Render clip**.

| Field | Value |
| --- | --- |
| Click to shot status `rendered` | 123.7 s |
| Shot after the render | `clip` set to a new video asset, `clip_versions` length 1 |
| Output | H.264 MP4, 1280×704, 121 frames, 5.04 s |

The render dialog showed the ComfyUI workflow note and **Open ComfyUI
workflow**. Pressing it opened an editable copy of the Shot Director example
with 10 nodes, including **Run ComfyUI Workflow (Comfy Cloud)**. The dialog now
closes after the copy opens, so the graph is in view.

## Jobs 8 and 9: the Wan 2.2 14B and LTX-2.3 graphs

Both graphs submitted through the Comfy API v2 SDK with the coffee still, the
compiled `camera.dolly-in` clause, seed 42.

| Model | Comfy job id | Submit to finished | Output |
| --- | --- | --- | --- |
| Wan 2.2 I2V A14B, 4-step lightx2v | `000d3078-57b1-4a16-8601-10169b3f9289` | 36.6 s | H.264, 832×480, 81 frames, 16 fps, 5.06 s |
| LTX-2.3 22B, two-pass | `3e3e5873-8e1a-4038-8d53-dc9fbca52fe7` | 42.0 s | H.264 1280×704, 121 frames, 24 fps, 5.04 s, plus AAC audio |

Wan 14B holds the still and pushes toward the cup. LTX-2.3 adds rising steam
and an audio track, and drifts away from the still in its last second.

MiniMax H3 has not been run. Its community license excludes the EU, the UK,
the US and South Korea, so its graph is checked against Comfy Cloud's node
schemas and model list only.

## Not yet verified

- The Director agent writing shots from a brief, the timeline following a
  picked take, and export, all in the browser.
- A storyboard render with the Wan 2.2 14B or LTX-2.3 models through the
  provider. Jobs 8 and 9 ran the same graphs straight through the SDK.
- A full workflow run that shows the take on the `take` output end to end.
  The fix is verified by replaying job 4, not by a new run.
