---
layout: page
title: "Worker Deployment"
description: "Rent a GPU on RunPod or Vast.ai, attach it to NodeTool, and run Python nodes remotely — with a cost guard that tears it down."
---

NodeTool runs most graphs on your machine. When a node needs a GPU you don't
have — large image/video models, HuggingFace pipelines — you can **rent one for
the duration of the work** instead of buying hardware. A worker is a remote box
running the lean NodeTool Python worker image; your local NodeTool instance
**attaches** to it, runs the Python nodes there, and tears it down when you're
done.

This is a different subsystem from [server deployment](self-hosted-deployment.md).
A *server* is long-lived infrastructure that humans connect *into*. A *worker* is
an ephemeral, billing-sensitive box that one NodeTool instance connects *out* to.
Because GPUs bill by the minute, **teardown is the headline feature** — see the
[cost guard](#cost-guard) below.

---

## The model: profiles → instances

Two concepts, deliberately split:

| | **Worker profile** | **Worker instance** |
|---|---|---|
| What | A declarative, reusable preset | A live, running worker |
| Lifetime | Permanent until you delete it | Ephemeral — spin up, attach, tear down |
| Holds | target, image, GPU/vCPU spec, token policy, idle timeout, max lifetime | the provider's pod/instance id, the `wss://` URL, the bearer token, status, cost |
| Stored | `worker_profiles` table (DB) | `worker_instances` table (DB) |

A **profile** is the recipe ("an A40 RunPod pod running the HuggingFace worker
image, idle-stop after 15 minutes"). **Provisioning** a profile launches an
**instance**. Instances are never written to `deployment.yaml` — nothing should
ever be able to resurrect a torn-down GPU pod from declarative config. Both
tables live in NodeTool's SQLite DB so the UI and CLI share one source of truth.

---

## Prerequisites

- A **RunPod** account and API key ([runpod.io console → settings](https://www.runpod.io/console/user/settings)),
  or a **Vast.ai** account and API key.
- A worker container image — the published NodeTool worker image, or your own
  built from a NodeTool Python package. It must run `python -m nodetool.worker`
  on port 7777 (msgpack RPC, bearer-token auth).

### Worker images

| Image | Contents | Use for |
|-------|----------|---------|
| `ghcr.io/nodetool-ai/nodetool-worker:latest` | The lean Python worker | Python nodes, HuggingFace pipelines, LLM providers |
| `ghcr.io/nodetool-ai/nodetool-worker-comfy:latest` | Worker + a co-located, loopback-only ComfyUI | Everything above **plus** the **Run ComfyUI Workflow (Worker)** node |

A worker started from the ComfyUI image fronts ComfyUI over the worker bridge
(ComfyUI itself is never exposed outside the container) and reports
`worker.status.comfy.enabled: true`. The **Run ComfyUI Workflow (Worker)** node
runs an API-format ComfyUI workflow on such a worker. Pick the ComfyUI image
from the **Worker image preset** dropdown in the Profiles editor, or pass
`--image ghcr.io/nodetool-ai/nodetool-worker-comfy:latest` on the CLI.

Store the API key in the secret store so the manager can read it:

```bash
nodetool secrets store RUNPOD_API_KEY      # prompts for the value
nodetool secrets store VAST_API_KEY        # for Vast.ai
```

If the secret store is unreachable (headless/sandboxed), the manager falls back
to the `RUNPOD_API_KEY` / `VAST_API_KEY` environment variables.

---

## Supported targets

| Target | Provider | URL form | Teardown |
|--------|----------|----------|----------|
| `runpod` | RunPod **pod** (REST `rest.runpod.io/v1/pods`) | `wss://<podid>-7777.proxy.runpod.net` | deletes the pod |
| `vast` | Vast.ai instance | `ws://<ip>:<port>` | destroys the instance |

Both run the **same worker image** — there is no per-provider image work. Local
or LAN workers are also supported, but unmanaged: run the worker container
yourself and point `NODETOOL_WORKER_URL` (and `NODETOOL_WORKER_TOKEN`) at it.
There is no provisioning provider for local Docker — you start and stop it.

---

## Quick start (CLI)

```bash
# 1. Store your provider API key
nodetool secrets store RUNPOD_API_KEY

# 2. Create a reusable profile
nodetool worker profile add hf-a40 \
  --target runpod \
  --image ghcr.io/nodetool-ai/nodetool-worker:latest \
  --gpu "NVIDIA A40" \
  --idle-timeout 15 \
  --max-lifetime 120

# 3. Provision an instance from it and attach in one step
nodetool worker create --profile hf-a40 --attach

# 4. Watch what's live (and what it's costing)
nodetool worker list

# 5. Tear it down when you're done
nodetool worker stop <instance-id>
# or, the panic button:
nodetool worker stop --all
```

`worker create` prints the new instance id, its `wsUrl`, a **redacted** bearer
token, and its status. With `--attach` it also points your bridge at the worker
and prints `export NODETOOL_WORKER_URL=…`, followed by a commented hint for the
token (the raw token is never printed to stdout):

```bash
export NODETOOL_WORKER_URL=wss://…
# NODETOOL_WORKER_TOKEN was redacted; set it with:
#   export NODETOOL_WORKER_TOKEN=$(nodetool worker token <instance-id>)
```

Retrieve the full token on demand with `nodetool worker token <id>`, which prints
only the token so it pipes cleanly into `NODETOOL_WORKER_TOKEN`.

### CLI reference

```bash
nodetool worker profile add <name> --target <runpod|vast> --image <img> \
    [--gpu <type>] [--vcpu <n>] \
    [--token-policy <generate|fixed>] \
    [--idle-timeout <minutes>] [--max-lifetime <minutes>]
nodetool worker profile list [--json]
nodetool worker profile rm <name>

nodetool worker create --profile <name> [--attach]
nodetool worker create --target <t> --image <img> [--gpu <g>] [--attach]   # inline, one-off
nodetool worker list [--json]
nodetool worker status <id>          # refresh status from the provider
nodetool worker token <id>           # print the decrypted bearer token (pipeable)
nodetool worker stop <id>
nodetool worker stop --all
```

The inline form of `create` synthesises a throwaway profile from the flags, so
you don't have to define one first.

---

## Attaching from the UI

The **Workers** panel (in Settings) is the desktop-first surface:

1. **Profiles editor** — pick a target, image, GPU, idle timeout, and token
   policy, and save a reusable profile.
2. **Provision** — "Start" launches an instance and shows live progress
   (`provisioning → running → attached`).
3. **Live-instances table** — every running worker with its status, uptime, and
   **estimated cost**, plus attach/detach and stop actions.
4. **Status-bar indicator** — when a worker is attached, a status-bar badge shows
   it and offers a one-click quick-stop.

Attaching re-points NodeTool's Python bridge at the worker's `wss://` URL and
bearer token **without a restart**; detaching reverts to the local stdio worker.
The active worker is a single DB pointer (`active_worker_instance_id` in the
`settings` table) that any NodeTool instance reads — which is why a self-hosted
Docker server can adopt a worker by the same mechanism.

---

## Cost guard

GPU pods and Vast instances bill **continuously** — there's no scale-to-zero in
pod mode. The laptop sleeps, the app crashes, a tab gets forgotten. Four
mechanisms keep a stray worker from quietly billing for days:

| Guard | What it does |
|-------|--------------|
| **Real teardown** | Every `stop` issues the provider's true delete/destroy — never just a status flip. |
| **Idle auto-stop** | The reaper stops an instance after its profile's `idle_timeout_minutes` of bridge inactivity (the bridge tracks `last_activity_at`). |
| **Hard TTL** | Optional `max_lifetime_minutes` — an absolute kill switch regardless of activity. |
| **Orphan reconcile** | On startup/refresh, NodeTool diffs the DB's `running` instances against the provider's live list. Workers killed out-of-band are marked stopped; provider-live boxes the DB doesn't track are surfaced as **orphans** with a "N workers live, ~$X/hr" summary and a one-click stop-all. |

Set both `--idle-timeout` and `--max-lifetime` on every profile you provision
from. A profile that sets neither opts its instances out of the reaper entirely
— do that only deliberately.

---

## How provisioning works

1. `WorkerManager.provision(profileName)` looks up the profile and resolves the
   target's provider (RunPod or Vast).
2. If the profile's `token_policy` is `generate`, it mints a high-entropy bearer
   token for the worker.
3. The provider launches the image on the chosen GPU/spec, polls until the box
   is running, and derives the WebSocket URL.
4. A `worker_instances` row is written and transitioned `provisioning → running`.
5. On `attach`, the manager writes the active-worker pointer, marks the instance
   `attached`, and hands the `{ wsUrl, token }` to the bridge.

All state is persisted through the DB — the manager never holds instance state
only in memory, so a forgotten pod is always recoverable from the registry.

---

## Related

- [Self-Hosted Deployment](self-hosted-deployment.md) — run the NodeTool **server** on your own infra with Docker.
- [Deployment Guide](deployment.md) — overview of server self-hosting and GPU workers.
- [CLI Reference](cli.md) — full `nodetool` command reference.
</content>
</invoke>
