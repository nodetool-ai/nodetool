# @nodetool-ai/cli-common

Helpers shared by the installed command features (`cli-workflow`, `cli-harness`,
`cli-chat` and the others). It registers no commands.

The package root exports `initializeCliRuntime`, `createRpcClient`, `isString`
and `isRecord`. Other modules are reached by subpath, such as
`@nodetool-ai/cli-common/debug-bundle`.

| Module | What it provides |
|---|---|
| `runtime-env` | `initializeCliRuntime(entryUrl)` sets `NODETOOL_HOST` (`npx`, `source` or `cli`, from the entry path) and `NODETOOL_CLI_VERSION` (from the entry's `package.json`) when unset. It throws on an unknown `NODETOOL_HOST`. |
| `rpc-client` | `createRpcClient(apiUrl)` builds an untyped tRPC client for `<apiUrl>/trpc`, batched over `POST`. |
| `debug-bundle` | `defaultDebugOutDir(kind, ref)` returns `nodetool-debug/<kind>-<slug>-<timestamp>`. `writeDebugBundle` writes `<kind>.json`, `report.json` and `report.md` into it. |
| `telemetry` | Opt-in anonymous CLI analytics: `startCliTelemetry`, `trackCliEvent`, `finishCliTelemetry`. Flushing waits at most `CLI_FLUSH_BUDGET_MS` (1 second). See [Product Analytics](../../docs/analytics.md). |
| `optional-node-root` | `optionalNodeRoot()` is `<data dir>/optional-node`, where `nodetool runtime add` installs heavy libraries the npm package does not ship. |
| `commands/` | Shared output formatting for validation and debug summaries, and the shared `<document> versions list|show|create|restore|delete` commands. |

Depends on `@nodetool-ai/protocol`, `@nodetool-ai/config`,
`@nodetool-ai/analytics` and `@nodetool-ai/pack-manager`. Run its tests with
`npm run test --workspace=packages/cli-common`.
