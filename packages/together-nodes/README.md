# @nodetool-ai/together-nodes

Together AI media nodes for [NodeTool](https://nodetool.ai) — one workflow node
per Together [serverless model](https://docs.together.ai/docs/serverless/models),
covering:

| Modality | Models | Nodes |
| --- | --- | --- |
| Text → Image | FLUX.1/.2, Imagen 4, Flash Image, Gemini 3 Pro Image, Ideogram 3, Seedream 3/4, SD3 | 15 |
| Image → Image | FLUX.2 pro/dev/flex, FLUX.1 Kontext pro/max, Gemini 3 Pro Image | 6 |
| Text → Video | Veo 2/3, Sora 2, Kling 2.1, Seedance 1, MiniMax, PixVerse, Vidu | 15 |
| Image → Video | (same, minus Veo 3 + Audio) | 14 |
| Text → Speech | Orpheus 3B, Kokoro 82M, Cartesia Sonic | 3 |
| Transcribe (ASR) | Whisper Large v3, Voxtral Mini, Parakeet | 3 |

**56 nodes total.** Chat / LLM and embedding capabilities are not surfaced as
per-model nodes here — they are served by the generic Agent / Embedding nodes
through `TogetherProvider` in `@nodetool-ai/runtime`.

## Install

```bash
npm install @nodetool-ai/together-nodes
```

## Configuration

Set `TOGETHER_API_KEY` in NodeTool's secret store (Settings → API Keys) or as an
environment variable.

## Architecture

This package is **self-contained**: `together-base.ts` re-implements the small
slice of the Together API the nodes need (images, speech, transcription, video
submit+poll) rather than importing the runtime's `TogetherProvider`. That mirrors
the `fal-nodes` / `atlascloud-nodes` / `replicate-nodes` convention and keeps the
package independently publishable.

- `src/together-manifest.json` — declarative catalog: one entry per
  `(model × task)` with its modality, model id, output type, and typed input
  fields. **Single source of truth.**
- `src/together-factory.ts` — turns each manifest entry into a `BaseNode`
  subclass; `process()` resolves asset inputs (SSRF-guarded), dispatches on
  modality to the base executors, and persists the result via NodeTool storage.
- `src/together-base.ts` — auth, asset→bytes resolution, and the per-modality
  Together API executors.
- `src/index.ts` — `registerTogetherNodes(registry)` + exports.

The same manifest is read by `@nodetool-ai/runtime`'s `together-provider`
(via `manifest-models.ts`) for its image/video model lists, so the node catalog
and the provider's model catalog can never drift.

## Regenerating the catalog

The manifest is generated from the catalog + field templates in
`scripts/generate-manifest.mjs`:

```sh
npm run gen:manifest   # rewrites src/together-manifest.json
npm run build          # tsc + copy manifest into dist/
npm test
```

Edit the catalog (model ids / names / supported tasks) or the per-modality field
templates in that script, then re-run `gen:manifest`.

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
