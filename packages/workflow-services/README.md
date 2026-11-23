# Workflow services

HTTP-independent workflow packaging: the `.nodetool` bundle codec and the
export of workflow assets as package assets. Both are storage-agnostic. The
caller supplies the functions that read and write asset bytes.

## Bundles

A bundle is a zip with `manifest.json`, one `workflows/<file>.json` per
workflow, content-addressed `assets/<sha256>.<ext>` files shared across the
workflows, and an optional `thumbnail.jpg`. Export rewrites `asset://` and
`/api/storage/` references to `bundle://<file>`. Import rewrites them back to
whatever `storeAsset` returns.

```ts
import {
  packWorkflowsBundle,
  importWorkflowBundle
} from "@nodetool-ai/workflow-services";

const { bytes, skipped } = await packWorkflowsBundle({
  workflows: [{ id: "abc", name: "Demo", graph }],
  fetchAssetBytes: async (ref) => readAssetBytes(ref)
});

const result = await importWorkflowBundle(bytes, {
  storeAsset: async ({ bytes, fileName, contentType }) => ({
    uri: await saveAsset(bytes, fileName, contentType)
  }),
  verifyChecksums: true
});
```

`readAssetBytes` and `saveAsset` stand for your storage. `packWorkflowBundle`
packs a single workflow. `unpackWorkflowBundle` and `verifyBundleChecksums`
read a bundle without storing anything. Unpacking rejects archives over
512 MB uncompressed or with more than 10,000 entries. Remote and local-file
references are embedded only with `includeRemote: true`. References that
cannot be resolved stay as they are and appear in `skipped`.

`nodetool export-bundle` and `nodetool import-bundle` call this codec. See
[CLI](../../docs/cli.md).

## Package assets

`materializeWorkflowConstantAssets` turns a workflow into a shippable example.
It writes each user asset the graph references to
`<assetsRoot>/<packageName>/<file>` and rewrites the reference to
`package://<packageName>/<file>`. The server resolves those through
`/api/assets/packages/...`. `collectWorkflowAssets` and `transformMediaRefs`
are the lower-level steps the bundle codec shares.
