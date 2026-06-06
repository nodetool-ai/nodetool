# @nodetool-ai/reve-nodes

[Reve](https://reve.com) image generation, editing, and remix nodes for NodeTool.

Wraps Reve's image API (https://api.reve.com/console/docs) and exposes three
workflow nodes:

| Node             | Node type         | Endpoint            | Description                                     |
| ---------------- | ----------------- | ------------------- | ----------------------------------------------- |
| **Create Image** | `reve.CreateImage` | `POST /v1/image/create` | Generate an image from a text prompt.           |
| **Edit Image**   | `reve.EditImage`   | `POST /v1/image/edit`   | Edit a reference image with a text instruction. |
| **Remix Image**  | `reve.RemixImage`  | `POST /v1/image/remix`  | Combine a prompt with 1–6 reference images.     |

## Configuration

Set the `REVE_API_KEY` secret (Settings → API Keys, or the `REVE_API_KEY`
environment variable). Requests authenticate with `Authorization: Bearer
<REVE_API_KEY>`.

## Shared parameters

- **aspect_ratio** — one of `16:9`, `9:16`, `3:2`, `2:3`, `4:3`, `3:4`, `1:1`.
  Edit/Remix also accept `none` (keep the reference ratio / let the model
  choose).
- **version** — model version (`latest`, dated pins, and the `-fast` variants
  for edit/remix).
- **postprocessing** — optional `upscale`, `remove_background`, `fit_image`, or
  `effect`.
- **test_time_scaling** — quality/effort multiplier (1–15).

## Remix prompt references

In Remix, reference individual images by index with XML tags:
`A cat wearing <img>0</img> in the style of <img>1</img>` (0 = first image).
