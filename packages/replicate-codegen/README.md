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

To inspect generated TypeScript classes for debugging, run the package command
directly without `--manifest`. Files under `replicate-nodes/src/generated/` are
intermediate codegen output and are gitignored.
