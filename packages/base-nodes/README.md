# @nodetool-ai/base-nodes

Compatibility shell that re-exports the eleven domain-specific node packages:
`core`, `text`, `llm`, `data`, `document`, `image`, `audio`, `video`,
`integration`, `code`, and `automation` nodes.

Depend on this package to pull in the full set of core workflow nodes; depend on
an individual `@nodetool-ai/*-nodes` package for a narrower slice.

> Uses decorators and loads from `dist/`. After changing node packages, run
> `npm run build:packages` before `npm run dev`.

## Develop

```bash
npm run build --workspace=packages/base-nodes
npm run test  --workspace=packages/base-nodes
npm run lint  --workspace=packages/base-nodes
```

To author a new node, see [@nodetool-ai/node-sdk](../node-sdk/README.md).
