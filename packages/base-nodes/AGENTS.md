# base-nodes — Core Workflow Nodes

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **base-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first (output-contract, media-ref, and default rules apply to every node here). This overlay covers conventions specific to base-nodes.

## Example workflows (`nodetool/examples/nodetool-base/*.json`)

These graphs ship with the package and seed every install's example library. The
`.json` files here hold the full graphs; their listing metadata
(name/description/tags) lives in
`nodetool/package_metadata/nodetool-base.json`.

- **Model fields must ship empty.** Any prop whose value is a model object (its
  `type` ends in `_model` — `language_model`, `image_model`, `embedding_model`,
  `tts_model`, `asr_model`, `video_model`) must be blank: keep `type`, set `id`,
  `provider`, `name` (and `path` for `image_model`) to `""`. On load,
  [`web/src/utils/applyDefaultModels.ts`](../../web/src/utils/applyDefaultModels.ts)
  fills each empty model from the user's own default for that type — a hardcoded
  model id strands every user who lacks that provider/model. Empty is detected by
  `id === ""` / `provider === ""`. Upscale and Remove Background nodes take the
  user's task default (`IMAGE_TASK_DEFAULTS` there) before the image default.
- **Keep the intro `Comment` and the top-level `description` in sync with the
  graph.** Don't promise inputs or output nodes the graph doesn't contain (a
  "grid"/`Preview` step, a "count" input that was removed). Stale copy is the most
  common drift when a graph is edited in the app and re-saved.
- **Every example opens with an intro `Comment` at the top left, above a
  left-to-right graph.** Its `comment` is a Markdown string starting with
  `# <workflow name>` (or a saved Lexical state). The canvas ignores a
  `headline` field and renders a list of strings as an empty note.
  `tests/example-workflows-validation.test.ts` checks this.
- **The intro comment teaches the graph.** After the summary it has a
  `**How it works:**` paragraph that walks the data path by node title and a
  `**Try this:**` paragraph naming one property change and what it shows.
- **Media inputs ship with a sample so Run works at once.** Point an empty
  image, audio or video input at a file in
  `nodetool/assets/nodetool-base/recipe-inputs/` (`package://nodetool-base/recipe-inputs/<file>`),
  never at a local `/api/storage/` path or a hotlinked URL.
- **Every example must run under fakes.** `tests/example-workflows-execute.test.ts`
  fills empty models with a fake provider and empty media inputs with a sample,
  then requires each example to complete. An example that cannot goes in its
  `CANNOT_COMPLETE` list with the reason.
- **`etag` is not validated on load** — the loader returns it verbatim. No need to
  recompute it after a hand edit.
- **Don't hand-edit `electron/backend-bundle/examples/`** — it's gitignored and
  regenerated from this directory.
