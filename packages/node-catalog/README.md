# Node catalog

`readCatalogIndex()` loads pack entries and exact node ownership.
`packForNodeType(type)` returns the owning pack.
`readCatalogNodes()` decompresses metadata and declared properties on first use.

Generate the checked-in catalog after building node packages:

```bash
npm run build:packages
npm run generate:node-catalog
npm run check:node-catalog
```

The generator runs every pack registrar in a separate process without inherited
secrets. It derives pack requirements from manifests and rejects duplicate node
ownership or property values that JSON cannot represent. The checked-in
`data/nodes.ndjson` is sorted by node type and object keys. The package build
writes `dist/nodes.ndjson.gz` and copies `data/index.json`.

Release tooling fills tarball integrity, install sizes and script allowlists.
The repository catalog uses empty integrity strings, zero install sizes and
empty script allowlists until those release artifacts are available.

`npm run bump-version <version>` updates catalog cohort versions and clears old
release pins before the package build copies the index into `dist/`.
