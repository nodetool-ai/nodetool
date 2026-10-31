# Presets

Browser-safe schemas, model families and deterministic generation preset compilation.
Install with `npm install @nodetool-ai/presets`.

`compilePresets(ids, { modelId, mode, prompt, catalog })` returns
`{ prompt, params, applied, warnings }`. It throws for unknown ids, unsupported
modes and incompatible stacks. Structured fragments replace the current prompt
first, then add their prefix and suffix. Strings append with a space.

`createCatalog(data)` validates an array and exposes `getPreset(id)`,
`byAlias(text)` and `filter({ kind, mode })`. `loadCatalog(loader)` accepts
a synchronous JSON reader. On the server, use the registered asset:

```ts
import { loadPackageAssetJson } from "@nodetool-ai/config";
import { loadCatalog } from "@nodetool-ai/presets";

const catalog = loadCatalog(() => loadPackageAssetJson(
  { pkg: "@nodetool-ai/presets", path: "preset-catalog.json" },
  import.meta.url
));
```

`presetToWorkflow(preset, { model: { provider, id, name?, path? }, mode,
resolveWorkflow? })` returns `{ nodes, edges }` in saved-template format.
Each node has `{ id, type, data, position }`. The graph wires `StringInput`
(`prompt`) → `Template` (`{{ prompt }}`) → the mode's generic generation node
→ `Output` (`result`). Image-conditioned modes add `ImageInput`. Reference
video mode connects media to `reference_images` and `reference_videos`.
The compiler selects the model-family fragment and supplies generation params.
A replacement fragment intentionally replaces the user prompt.

For a preset with `workflow`, the host must supply the synchronous
`resolveWorkflow(name)` callback. Ejection returns a deep copy of that graph
instead of generating nodes. Unsupported modes and missing resolvers throw.
Video inputs require reference-video mode.

The root entry also exports `presetSchema`, `fragmentSchema`,
`presetJsonSchema`, `modelFamily` and their types. No source module imports
Node APIs. Hosts own disk access.

`default` and `local-wan` are explicit family selectors. Local hosts may qualify
the latter as `local-wan/<model>` or `local-wan:<model>`. Provider manifests do
not identify local execution, so remote Wan ids keep their provider family.

Edit individual files in `catalog/<kind>/<id>.json`. Run
`npm run build --workspace=packages/presets` to regenerate the catalogue index
and JSON Schema. `npm run generate:check --workspace=packages/presets`
rejects drift. Tests validate every source file.

See [backend dependency rules](../AGENTS.md#package-dependency-order).

`compileCameraPresets(ids, { modelId, mode, catalog })` returns an optional
`ShotPromptContext.compiledCamera` object, `{ clause, replacesEquipment }`.
It compiles against an empty prompt, so fragments cannot replace the shot's
action. The clause replaces free-text movement. A rig-slot selection also
replaces equipment. Move-only selections keep equipment.

`cameraPresetIdsForMovement(movement, catalog)` resolves a legacy movement
through `byAlias` to zero or one camera preset ids for UI preselection. It
never changes stored boards or opts free-text shots into preset rendering.

Effect presets (`kind: "effect"`, slot `effect`) take an image and run in mode
`image_to_video` or `image_edit`. The first alias of an image-to-video effect is
the phrase the Effects Gallery template inserts after "proceeds to". After
editing `catalog/effect/`, rebuild this package and run
`node scripts/presets/sync-effects-template.mjs` to update the template's
options. The same script with `--check` runs in this package's tests and fails
on drift.
