# Shot Director — render evidence

Real Comfy runs behind the [Shot Director entry](shot-director.md), recorded on
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
by content type, with a test built from the real manifest. The fix has not
been re-run against Comfy yet.

Two earlier submissions failed in Comfy's input validation within 3 seconds and
rendered nothing (`eb10e018-6e6e-4858-9a6d-140b240b9508`,
`c880ece0-832f-40c9-9c64-fabb65f7719f`): the source image could not be read, the
node skipped it silently, and Comfy rejected the placeholder `input.png`. The
node now refuses to submit when a connected media ref cannot be read.

## Job 3: Comfy Router provider, text to image

`ComfyCloudProvider.textToImage` from the `feat/comfy-router-provider` branch,
model `luma/photon-flash-1`, aspect ratio 16:9.

| Field | Value |
| --- | --- |
| Router request id | `10e880b4-1f9e-434d-ace9-5bfa3c2f817c` |
| Path | `POST /v2/models/luma/photon-flash-1/requests` 201, 4 status polls, result 200 |
| End to end | 13.8 s |
| Output | JPEG, 2048×1152, 116,274 bytes |

The Router path is a partner API, not part of the open-weights render path.

## Not yet verified

- The app's Take A and Take B operations in the NodeTool UI, including the take
  being saved as an asset.
- A Comfy Router video model through the provider.
