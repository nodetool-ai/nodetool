# KIE Codegen

This package generates `packages/kie-codegen/src/configs/*.ts` and
`packages/kie-nodes/src/kie-manifest.json` from KIE's docs.

## Generation Flow

1. `src/schema-fetcher.ts` fetches `https://docs.kie.ai/llms.txt` and the linked
   English API docs pages.
2. `src/schema-parser.ts` extracts embedded OpenAPI YAML blocks and converts
   them to `NodeConfig` objects.
3. `src/config-writer.ts` writes `src/configs/image.ts`, `src/configs/audio.ts`,
   and `src/configs/video.ts`.
4. `src/generate.ts` reads those configs and writes
   `packages/kie-nodes/src/kie-manifest.json`.
5. `packages/kie-nodes/src/kie-factory.ts` loads that manifest at runtime and
   creates node classes dynamically.

`npm run generate:kie` performs the full flow above. The `src/configs/*.ts`
files are generated artifacts now; do not patch them by hand for persistent
changes.

## Editing Rules

- Do not edit `packages/kie-nodes/src/kie-manifest.json` directly.
- Do not edit `packages/kie-codegen/src/configs/*.ts` directly unless you are
  doing a temporary investigation; those files are regenerated from KIE docs.
- For persistent static node changes, update the parser/fetcher/writer rules,
  then run `npm run generate:kie`.
- If behavior affects all KIE nodes, prefer fixing `src/types.ts`,
  `src/node-generator.ts`, or `packages/kie-nodes/src/kie-factory.ts`.
- URL media inputs must expose AssetRef handles:
  - single image URL fields: `type: "image"`
  - single video URL fields: `type: "video"`
  - single audio URL fields: `type: "audio"`
  - multiple media URL fields: `type: "list[image]"`, `type: "list[video]"`,
    or `type: "list[audio]"`
- Upload configs for list fields must set `isList: true` and the API parameter
  name, for example `paramName: "reference_image_urls"`.
- Arrays that are not media get their list type from the item schema —
  `list[dict]`, `list[int]`, `list[float]`, `list[str]`. Never fall back to
  `list[image]`: an asset-typed field with no upload config is skipped by
  `kie-factory.ts`, so the parameter silently never reaches the request.
- A `_url`/`_urls` parameter is media even when KIE declares it `type: object`
  (Wan 3.0 reuses one YAML anchor for all of them). A `_file_urls` /
  `_link_urls` parameter is not media — it stays `list[str]`.

## Fixture mode and the drift gate

`npm run generate:kie` reads live docs pages and live pricing, so its output is
not reproducible and nothing catches a generator change that quietly moves a
node's type, default, or enum. Fixture mode is the reproducible half:
`src/fixture-generate.ts` reads the checked-in `fixtures/llms.txt` snapshot and
the docs-page fixtures named by `fixtures/generator-manifest.json`, and writes
the outputs that manifest declares — the three module configs, the three
node-source modules, and the manifest JSON. No network, no pricing, no
timestamps, so two runs are byte-identical.

`npm run generate:kie:check` generates into a temporary directory and diffs the
declared outputs against `fixtures/expected/`. It exits non-zero on any
difference, on a declared docs fixture that is absent, on a declared URL the
`llms.txt` snapshot no longer lists, and when it compared nothing at all.
`--strict` also fails on an expected file no manifest output declares.

When a generator change is intended, refresh the expected outputs with
`node scripts/provider-codegen-check.mjs --provider kie --write` and commit the
diff. Adding a fixture means adding the docs page under `fixtures/docs/` and the
entry in the generator manifest.

`.github/workflows/provider-codegen.yml` runs the check on every diff touching
this package.

## Verification

After changing KIE codegen or factory behavior:

```bash
npm run generate:kie
npm run generate:kie:check
npm run lint --workspace=packages/kie-codegen
npm run test --workspace=packages/kie-codegen
```

Then inspect `git diff` and confirm generated manifest changes are expected.
