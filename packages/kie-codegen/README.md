# @nodetool-ai/kie-codegen

Generates KIE node configs and `kie-nodes` manifest data from the KIE docs.

`https://docs.kie.ai/llms.txt` is the machine-readable index. Each linked API
doc page contains an embedded OpenAPI YAML block. `npm run generate:kie` fetches
that source data, rewrites `src/configs/*.ts`, then writes
`../kie-nodes/src/kie-manifest.json`.

```bash
npm run generate:kie
```
