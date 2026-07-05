# @nodetool-ai/compute

Remote compute orchestration for [NodeTool](https://nodetool.ai) — provisions and reaps GPU workers on RunPod and Vast.ai.

This package manages the lifecycle of remote GPU workers: it provisions instances from worker profiles, tracks their connections, reconciles desired against actual state, and runs a reaper that tears down idle or orphaned instances. Providers for RunPod and Vast.ai sit behind a common `WorkerProvider` interface.

## Install

```bash
npm install @nodetool-ai/compute
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `WorkerManager` | class | Manages worker profiles, provisioning, and reconciliation |
| `WorkerManagerDeps` | type | Injectable dependencies for `WorkerManager` |
| `ReconcileSummary` | type | Result of a reconcile pass |
| `WorkerConnection` / `WorkerOrphan` | type | Tracked worker and orphaned-instance shapes |
| `startReaper` | function | Starts the background loop that reaps idle/orphaned workers |
| `runReaperOnce` | function | Runs a single reaper pass |
| `ReaperDeps` / `ReaperHandle` / `ReaperManager` | type | Reaper wiring and control handle |
| `RunpodPodProvider` | class | `WorkerProvider` implementation for RunPod |
| `VastProvider` | class | `WorkerProvider` implementation for Vast.ai |
| `WorkerProvider` | interface | Provision/status/terminate contract for a compute backend |
| `WorkerSpec` / `WorkerTarget` / `WorkerStatus` | type | Worker specification and status shapes |
| `ProviderInstance` / `ProvisionResult` | type | Provider-level instance and provisioning results |

## Usage

```ts
import { WorkerManager, startReaper } from "@nodetool-ai/compute";

const manager = new WorkerManager();
const summary = await manager.reconcile();

const reaper = startReaper({ manager });
// ... later
reaper.stop();
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
