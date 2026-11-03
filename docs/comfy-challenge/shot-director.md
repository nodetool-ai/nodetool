# NodeTool on Comfy — Open Source Higgsfield challenge entry

**NodeTool: the open-source AI filmmaking studio, rendering on ComfyUI.**

Direct a film shot by shot in NodeTool's Storyboard. Pick a camera move for
each shot, render it on **Comfy Cloud** with a pinned, open-weights Wan 2.2
ComfyUI workflow, keep every take, and choose the take that goes into the
timeline. The ComfyUI graph behind every render is one click away and editable.

- Clip model: `comfyui-workflow/wan2.2-ti2v-5b` on the `comfy_cloud` provider,
  in [`comfy-workflow-models.ts`](https://github.com/nodetool-ai/nodetool/blob/main/packages/runtime/src/providers/comfy-workflow-models.ts)
- Editable graph: the [`Shot Director` example workflow](https://github.com/nodetool-ai/nodetool/blob/main/packages/base-nodes/nodetool/examples/nodetool-base/Shot%20Director.json).
  A test keeps it equal to the graph the provider runs.
- Camera presets (open JSON): [`packages/presets/catalog/camera/`](https://github.com/nodetool-ai/nodetool/tree/main/packages/presets/catalog/camera)
- Comfy node for graph authors: `lib.comfy.RunWorkflowOnCloud` in
  [`comfy-cloud.ts`](https://github.com/nodetool-ai/nodetool/blob/main/packages/integration-nodes/src/nodes/comfy-cloud.ts),
  using the Comfy API v2 SDK.

## How it works

```text
Storyboard shot ─▶ Render dialog: clip model "Wan 2.2 TI2V 5B (ComfyUI workflow)"
  still + camera preset          │
                                 ▼
  shot prompt + compiled preset clause (local-wan) ─▶ generate_media
                                 │
                                 ▼
  ComfyCloudProvider.imageToVideo ─▶ pinned graph, Comfy API v2 SDK
                                 │
                                 ▼
  take added to the shot ─▶ pick a take ─▶ timeline clip follows the pick
```

1. The shot's still is the first frame. The camera preset compiles to its
   `local-wan` clause, written for Wan models, and joins the shot prompt.
2. The provider writes prompt, seed, size (from the board's aspect ratio) and
   frame count (from the shot duration, at most 121 frames at 24 fps) into the
   pinned graph, uploads the still and submits the job. Cancelling the render
   cancels the Comfy job.
3. The result is a take on the shot. Earlier takes stay, and the timeline clip
   changes only when you pick a take in the gallery.

The Router partner models on the same provider (Seedance, Kling, Veo and others)
are a separate path. They are partner APIs and are not part of the open-weights
render path.

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
2. Open a storyboard, give a shot a still and a camera move, and open
   **Render clip**. Choose **Wan 2.2 TI2V 5B (ComfyUI workflow, open weights)**
   under Comfy Cloud and render. Render again for another take.
3. **Open ComfyUI workflow** in the render dialog opens an editable copy of the
   graph.

The example workflow also runs on its own. Headless, from the repository. Pass the still as a `file://` ref, because the
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
  A render on Comfy Cloud took 88 to 106 seconds from submit to finished.
