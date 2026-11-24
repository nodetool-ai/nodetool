# @nodetool-ai/cli-execution

The in-process execution layer behind `nodetool run`, `validate`, `debug` and
`node run`. It registers no commands. The command features in
[`cli-workflow`](../cli-workflow/README.md) and `cli-harness` call it.

The package root exports `configureCliPackHost`, `registerCliPacks`,
`getCliPackSource` and `installLocalModelInterfaces`. Everything else is a
subpath import.

| Module | What it provides |
|---|---|
| `packs/host` | Configures the pack host and registers installed packs into a node registry for a CLI run. |
| `local-model-interfaces` | `installLocalModelInterfaces()` gives local runs asset and timeline-sequence persistence against the database that `setupDb()` opens. Every command that runs a graph installs it, so `debug` and `workflows run` behave the same. |
| `node-registry` | `buildFullRegistry()` and the built-in pack policies for CLI and DSL runs. |
| `run-dsl`, `run-dsl-supervised` | Load and run a TypeScript DSL workflow file, optionally under a supervisor agent. |
| `supervisor` | The supervisor flags (`addSupervisorOptions`, `parseSupervisorFlags`) and handle. The default model is `DEFAULT_SUPERVISOR_MODEL`. |
| `run-budget` | The cost and time bounds one agent run shares, with `--cost-cap` and `--timeout` overrides, and the stop reason and summary line. |
| `run-json` | The JSON form of a run result for `--json` output. |
| `validate` | `runValidate`, the static graph check behind `nodetool validate`. |
| `node/run-node` | `runSingleNode`, behind `nodetool node run`. |
| `debug/` | The debug harness: `runDebug`, the server and browser runners, the verdict, and the Markdown report. See [`nodetool debug`](../../docs/harnesses.md#nodetool-debug-workflow-debug-harness). |
| `sandbox-catalog` | Installs the sandbox module catalog and discovers pack type declarations. |

Run its tests with `npm run test --workspace=packages/cli-execution`.
