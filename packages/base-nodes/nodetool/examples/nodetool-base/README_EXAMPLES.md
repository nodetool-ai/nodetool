# nodetool-base Example Workflows

Every `*.json` in this directory is a shipped example workflow. They are loaded
into the in-app gallery, exposed to agents through `get_example_workflow`, and
generate the public template pages under `marketing/src/routes/templates`.

Because each file becomes a gallery card and a public page, a new example has to
earn its place. The bar:

- **It does work.** A graph whose only nodes are a constant and an output
  teaches nothing the node reference does not.
- **It is not a re-skin.** If an existing example has the same node types and
  the same configuration, and only the prompt or the port names differ, edit
  that one instead of adding a second.
- **The description stands alone.** Under 80 characters and the marketing
  generator marks the page `indexable: false`. Say what the graph does and why
  the settings are what they are.
- **A thumbnail exists.** `packages/base-nodes/nodetool/assets/nodetool-base/<name>.jpg`,
  matched by workflow name. A missing thumbnail also drops the page from the
  index.

## Validating

```bash
npm run dev:nodetool -- validate "packages/base-nodes/nodetool/examples/nodetool-base/<name>.json"
npm run test --workspace=packages/base-nodes   # example-workflows-validation, *-examples-run
```

`packages/base-nodes/tests/example-workflows-validation.test.ts` checks every
file here against the live node registry — unknown node types, missing
properties and dangling edges fail the suite.

## After adding or removing a workflow

The marketing catalog is generated and CI fails when it is stale:

```bash
cd marketing && npm run gen:templates    # regenerates templateEntries.generated.ts + public/templates
```

## Thumbnails

`gallery_thumbnail_generator.ts` walks every `*.json` here, asks an LLM for an
icon concept from the workflow's name, description, tags and node types, then
renders it with FLUX.2 [klein] on fal.ai. Tint follows the gallery category
(Image=violet, Video=magenta, Audio=amber, Multimodal=cyan, Agents=blue,
Data & Web=green), mirroring `web/src/utils/templateCategories.ts`. Masters land
as PNG in `../../assets/nodetool-base/`; `scripts/convert-thumbnails.ts` encodes
the served 1280×720 `.jpg` cards.

```bash
# from repo root — only missing masters by default
npx tsx packages/base-nodes/nodetool/examples/nodetool-base/gallery_thumbnail_generator.ts
#   --all            regenerate every workflow
#   --only "Color"   regenerate workflows whose name matches
npx tsx packages/base-nodes/scripts/convert-thumbnails.ts
```

Requires `OPENAI_API_KEY` and `FAL_API_KEY` in the local secret store.
