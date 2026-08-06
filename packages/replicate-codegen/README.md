# @nodetool-ai/replicate-codegen

Fetches OpenAPI schemas from Replicate and generates `replicate-nodes/src/replicate-manifest.json`.

The default repo command fetches schemas and writes the runtime manifest directly.
It runs in strict mode, so unavailable configured models fail the generation instead
of silently producing a partial manifest.

```bash
npm run generate:replicate
```

Set `REPLICATE_API_TOKEN` before running generation.

PowerShell:

```powershell
$env:REPLICATE_API_TOKEN = "YOUR_REPLICATE_API_KEY"
npm run generate:replicate
```

Git Bash on Windows may resolve a stale conda `npm` shim. Use `npm.cmd`:

```bash
export REPLICATE_API_TOKEN="YOUR_REPLICATE_API_KEY"
npm.cmd run generate:replicate
```

The generator's own flags are `--all | --module <name> | --from-metadata <path>`,
plus `--strict` and `--no-cache`. Every mode writes the manifest to
`packages/replicate-nodes/src/replicate-manifest.json`.
