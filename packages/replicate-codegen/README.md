# @nodetool-ai/replicate-codegen

Fetches OpenAPI schemas from Replicate and generates `replicate-nodes/src/replicate-manifest.json`.

Two-step process: fetches schemas → writes TS classes to `replicate-nodes/src/generated/`, then extracts the manifest from those classes.

```bash
npm run generate:replicate
```
