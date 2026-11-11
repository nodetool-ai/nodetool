# @nodetool-ai/runtime-install

Installs the optional software NodeTool features load: the micromamba-managed
conda environment, Python with uv, the Python node packs, conda tools such as
yt-dlp and Rust, uv tools such as ManimGX, and the npm runtime libraries. The
desktop app, the CLI (`nodetool runtime`) and any other Node.js host share it,
so every host applies the same pins and install policy.

The design is the [runtime install design](../../docs/runtime-install-design.md)
and the [runtime package interface](../../docs/runtime-package-interface.md).

## Hosts

The install code depends on no host. A caller passes a `RuntimeInstallHost`
(`src/host.ts`) that supplies:

- the data directory, the conda environment path and where to record a new one
- the environment for child processes
- how to run npm, and where a bundled micromamba lives
- a settings store, which holds the detected PyTorch platform
- log, output, status and progress sinks

| Host | Adapter |
|---|---|
| Desktop app | `electron/src/runtimeHost.ts`: the app's paths and settings, bundled npm and micromamba, the folder prompt and the boot screen |
| CLI, server, native editor | `createNodeRuntimeHost()` from `@nodetool-ai/runtime-install/node-host`: `runtimeLocations()` for `NODETOOL_HOST`, the shared `settings.yaml`, npm next to the running Node |

`createNodeRuntimeHost()` throws on `NODETOOL_HOST=docker`, which installs
nothing at run time.

## Use

```ts
import { installPythonPack, runtimeRegistryFor } from "@nodetool-ai/runtime-install";
import { createNodeRuntimeHost } from "@nodetool-ai/runtime-install/node-host";

const host = createNodeRuntimeHost({ output: (line) => process.stderr.write(`${line}\n`) });
const registry = runtimeRegistryFor(host);
await registry.runToCompletion("python", "install");
await installPythonPack(host, "nodetool-ai/nodetool-huggingface");
```

`runtimeRegistryFor(host)` returns one registry per host, so the single-flight
guard per package id holds across callers. `runExclusive` queues micromamba
commands per root prefix and uv commands per environment within one process.

## Modules

| Module | Does |
|---|---|
| `micromamba.ts` | Finds or downloads the pinned micromamba and runs its commands |
| `conda.ts` | Creates the conda environment and installs or removes conda packages |
| `torch.ts` | Detects the PyTorch platform with torchruntime and maps it to a uv `--torch-backend` |
| `python.ts` | Installs `nodetool-core` and checks that the Python worker imports |
| `python-packs.ts` | Installs, updates and removes Python node packs with uv |
| `packages/` | The runtime package registry (`RUNTIME_PACKAGES`) and one class per install backend |

## Tests

```bash
npm run test --workspace=packages/runtime-install
```

The tests fake the host (`tests/fake-host.ts`) and mock `node:child_process`,
so they run no installer and touch no network.
