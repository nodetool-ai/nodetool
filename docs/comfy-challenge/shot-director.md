# Shot Director — Open Source Higgsfield challenge entry

**NodeTool Shot Director: open cinematic presets, editable takes, rendered on Comfy.**

Pick a camera move, describe the shot, and render a 5-second cinematic take
from one still on **Comfy Cloud**. Revise into Take B without losing Take A,
compare the two, and open the NodeTool workflow and the pinned ComfyUI graph
behind both.

- App bundle: [`packages/base-nodes/nodetool/examples/apps/shot-director.app.json`](https://github.com/nodetool-ai/nodetool/blob/main/packages/base-nodes/nodetool/examples/apps/shot-director.app.json)
- Workflow: [`packages/base-nodes/nodetool/examples/nodetool-base/Shot Director.json`](https://github.com/nodetool-ai/nodetool/blob/main/packages/base-nodes/nodetool/examples/nodetool-base/Shot%20Director.json)
- Camera presets (open JSON): [`packages/presets/catalog/camera/`](https://github.com/nodetool-ai/nodetool/tree/main/packages/presets/catalog/camera)
- Comfy node: `lib.comfy.RunWorkflowOnCloud` in
  [`packages/integration-nodes/src/nodes/comfy-cloud.ts`](https://github.com/nodetool-ai/nodetool/blob/main/packages/integration-nodes/src/nodes/comfy-cloud.ts),
  using the Comfy API v2 SDK (`comfy-sdk.ts`).

## How it works

```text
Source still ─┐
Camera move ──┼─▶ Compose Shot (open preset → effective prompt + run record)
Direction ────┤          │
Seed ─────────┘          ▼
              Run on Comfy Cloud  (pinned ComfyUI API workflow, Comfy API v2)
                         │
                         ├─▶ take          (the rendered video)
                         ├─▶ comfy_job     (job id, status, output manifest)
                         └─▶ run_settings  (preset id + version, prompt, seed, model)
```

1. **Compose Shot** looks up the chosen camera preset from the open catalogue
   (`camera.dolly-in`, `camera.orbit`, `camera.crane-up`,
   `camera.pull-back-reveal`, `camera.handheld`, `camera.static`) and uses its
   `local-wan` prompt fragment, which is written for Wan models. It appends the
   fragment to your direction and emits a JSON run record.
2. **Run on Comfy Cloud** injects the image, prompt and seed into a pinned
   ComfyUI API-format graph and submits it through the Comfy API v2 SDK. Media
   inputs are uploaded as Comfy assets first. The rendered video streams back
   on the node's `58:video` output.
3. The app runs the same workflow as two operations, **Take A** and **Take B**,
   each with its own result slot, so a revision never overwrites the first take.

## The pinned Comfy workflow

Wan 2.2 TI2V 5B image-to-video, ComfyUI core nodes only, no partner/API nodes:

| Node | Class | Setting |
| --- | --- | --- |
| 37 | `UNETLoader` | `wan2.2_ti2v_5B_fp16.safetensors` |
| 38 | `CLIPLoader` | `umt5_xxl_fp8_e4m3fn_scaled.safetensors`, type `wan` |
| 39 | `VAELoader` | `wan2.2_vae.safetensors` |
| 48 | `ModelSamplingSD3` | shift 8 |
| 55 | `Wan22ImageToVideoLatent` | 1280×704, 121 frames |
| 3 | `KSampler` | 20 steps, cfg 5, `uni_pc` / `simple`, seed from the app |
| 57/58 | `CreateVideo` / `SaveVideo` | 24 fps |

The model weights are Wan 2.2 (Apache-2.0), which keeps the render path
open-weights.

## Run it

1. Get a Comfy API key at <https://platform.comfy.org> and add it as
   `COMFY_API_KEY` in NodeTool Settings (it stays server-side).
2. In NodeTool, open **Apps → Examples → Shot Director** and install it, or
   open the **Shot Director** workflow from the templates.
3. Upload a landscape still, pick a camera move, write a direction, and press
   **Generate Take A**. Change the move or direction and press
   **Generate Take B**.

Headless, from the repository. Pass the still as a `file://` ref, because the
CLI run context does not resolve the default `package://` sample:

```bash
COMFY_API_KEY=... npm run dev:nodetool -- run \
  "packages/base-nodes/nodetool/examples/nodetool-base/Shot Director.json" \
  --params '{"camera_move":"orbit","seed":7,"source_image":{"type":"image","uri":"file:///path/to/still.jpg"}}'
```

The golden-render script submits the same pinned graph straight through the
Comfy API v2 SDK and writes the video plus a run record:

```bash
COMFY_API_KEY=... node scripts/comfy-challenge/golden-render.mjs --move "dolly in" --seed 42 --out out/comfy-golden
```

## What is and isn't claimed

- Camera presets are **prompt guidance** for Wan 2.2, not geometric camera
  control. Motion quality varies per input.
- Comfy Cloud reports no per-job cost to NodeTool, so the run record holds the
  job id but no price.
- Real renders (job ids, outputs, latency) are listed in
  [`evidence.md`](evidence.md), including what has not been verified yet.
  A render on Comfy Cloud took 88 to 95 seconds from submit to finished.
