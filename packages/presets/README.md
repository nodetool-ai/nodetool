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
