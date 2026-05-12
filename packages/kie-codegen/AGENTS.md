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

## Verification

After changing KIE codegen or factory behavior:

```bash
npm run generate:kie
npm run lint --workspace=packages/kie-codegen
npm run test --workspace=packages/kie-codegen
```

Then inspect `git diff` and confirm generated manifest changes are expected.
