---
layout: page
title: "Worker Deployment"
description: "Rent a GPU on RunPod, Vast.ai or Verda, attach it to NodeTool, and run Python nodes remotely — with a cost guard that tears it down."
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
Because a rented GPU bills while it exists, **teardown is the headline feature**.
Read the [cost guard](#cost-guard) below, including the difference between
stopping and terminating a worker.

---

## The model: profiles → instances

Two concepts, deliberately split:

| | **Worker profile** | **Worker instance** |
|---|---|---|
| What | A declarative, reusable preset | A live, running worker |
| Lifetime | Permanent until you delete it | Ephemeral — spin up, attach, tear down |
| Holds | target, image, GPU, vCPU, volume size, optional SSH public key, token policy, idle timeout, max lifetime | the provider's pod/instance id, the `ws://` or `wss://` URL, the bearer token, status, estimated cost |
| Stored | `worker_profiles` table (DB) | `worker_instances` table (DB) |

A **profile** is the recipe ("an A40 RunPod pod running the HuggingFace worker
image, idle-stop after 15 minutes"). **Provisioning** a profile launches an
**instance**. Instances are never written to `deployment.yaml` — nothing should
ever be able to resurrect a torn-down GPU pod from declarative config. Both
tables live in NodeTool's SQLite DB so the UI and CLI share one source of truth.

---

## Prerequisites

- A **RunPod** account and API key ([runpod.io console → settings](https://www.runpod.io/console/user/settings)),
  a **Vast.ai** account and API key, or a **Verda** cloud API client id and
  secret ([API credentials](https://docs.verda.com/welcome-to-verda/api-credentials/)).
  Verda's cloud credentials are separate from its inference key, and are deleted
  when the team member who created them is removed from the project.
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
`--image ghcr.io/nodetool-ai/nodetool-worker-comfy:latest` on the CLI. See
[ComfyUI](comfyui.md) for the node's properties, input handles, and the
`comfy.*` bridge surface.

Store the API key in the secret store so the manager can read it:

```bash
nodetool secrets store RUNPOD_API_KEY      # prompts for the value
nodetool secrets store VAST_API_KEY        # for Vast.ai
nodetool secrets store VERDA_CLIENT_ID     # for Verda (both are required)
nodetool secrets store VERDA_CLIENT_SECRET
```

If the secret store is unreachable (headless/sandboxed), the manager falls back
to the environment variables of the same names.

---

## Supported targets

| Target | Provider | URL form | Teardown |
|--------|----------|----------|----------|
| `runpod` | RunPod **pod** (REST `rest.runpod.io/v1/pods`) | `wss://<podid>-7777.proxy.runpod.net` | deletes the pod and its volume |
| `vast` | Vast.ai instance (`console.vast.ai/api/v0`) | `ws://<ip>:<port>` | destroys the instance and its disk |
| `verda` | Verda **VM** (REST `api.verda.com/v1`) | `ws://<ip>:7777` | deletes the instance and permanently deletes its OS volume |

The target column shows what **terminate** does. Each target also has a cheaper
**stop** (pause), described under [Cost guard](#cost-guard).

All three run the **same worker image** — there is no per-provider image work. Local
or LAN workers are also supported, but unmanaged: run the worker container
yourself and point `NODETOOL_WORKER_URL` (and `NODETOOL_WORKER_TOKEN`) at it.
There is no provisioning provider for local Docker — you start and stop it.

### Verda

Verda rents **virtual machines**, not containers, so a Verda profile needs two
images: the guest OS (`osImage`, a CUDA + Docker image from `GET /v1/images`)
and the worker container (`image`, as on every target). Leave `osImage` unset
and the provider picks a CUDA+Docker image from the live catalog.

Its `gpu` field is a Verda **instance type** — `1H100.80S.30V`, not a GPU name.
List the live ids with `GET /v1/instance-types`; availability is per-location,
and a type absent from every location has no capacity right now.

Three behaviours differ from RunPod and Vast, all of them cost-relevant:

- **Verda bills a shut-down instance at the full rate**, and removed its
  hibernate action for that reason. So NodeTool's pause does **not** shut the
  machine down: it deletes the instance and retains the OS volume, which ends
  the GPU charge while keeping the model cache. Resuming boots a **new machine**
  from that volume, so its IP — and its provider handle — change.
- **Terminate deletes the OS volume permanently.** A trashed volume still holds
  storage quota and can be restored for a charge covering the deleted interval,
  which is not what teardown promises. The cached models are gone for good.
- **Only Pay As You Go is used.** Long-term contracts are prepaid, and spot
  instances can be discontinued mid-workflow; neither is chosen for you.

A Verda worker publishes port 7777 on a public IP, and Verda's own [security
guide](https://docs.verda.com/cpu-and-gpu-instances/securing-your-instance/)
warns that a UFW rule does not block a Docker-published port. The provider
therefore refuses to launch a worker with no bearer token — keep
`token_policy` on `generate` unless you have a specific reason not to.

Pay As You Go bills in prepaid ten-minute increments, and running out of balance
can discontinue instances and delete volumes. A low balance is not harmless
billing metadata.

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
  --disk 100 \
  --idle-timeout 15 \
  --max-lifetime 120

# 3. Provision an instance from it and attach in one step
nodetool worker create --profile hf-a40 --attach

# 4. Watch what's live (and what it's costing)
nodetool worker list

# 5. Pause it when you're done (keeps the volume and model cache)
nodetool worker stop <instance-id>
# or pause every live worker:
nodetool worker stop --all
```

`worker stop` pauses. The CLI has no terminate command. To destroy a worker and
its volume, use **Terminate** in the Workers panel, or let `--max-lifetime`
destroy it.

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
nodetool worker profile add <name> --target <runpod|vast|verda> --image <img> \
    [--gpu <type>] [--vcpu <n>] [--disk <gb>] [--ssh-key <pubkey-file>] \
    [--token-policy <generate|fixed>] \
    [--idle-timeout <minutes>] [--max-lifetime <minutes>]
nodetool worker profile list [--json]
nodetool worker profile rm <name>

nodetool worker create --profile <name> [--attach]
nodetool worker create --target <t> --image <img> [--gpu <g>] [--attach]   # inline, one-off
                       # the inline form also takes --vcpu, --disk, --ssh-key,
                       # --token-policy, --idle-timeout, --max-lifetime
nodetool worker list [--json]
nodetool worker status <id>          # refresh status from the provider
nodetool worker token <id>           # print the decrypted bearer token (pipeable)
nodetool worker stop <id>             # pause: release the GPU, keep the volume
nodetool worker stop --all            # pause every live worker

nodetool worker models list [worker-id] [--json]
nodetool worker models download [worker-id] --repo-id <owner/name> \
    [--file-path <path>] [-a <glob>]... [-i <glob>]...
nodetool worker models delete [worker-id] --repo-id <owner/name>
```

The inline form of `create` synthesises a throwaway profile named
`inline-<target>-<timestamp>` from the flags, so you don't have to define one
first.

Flag notes:

- `--disk <gb>` sizes the persistent volume. The worker's `HF_HOME` is
  `/workspace/huggingface`, so the Hugging Face cache lives there and survives
  pause and resume. The default is 100.
- `--ssh-key <file>` takes an OpenSSH **public** key file. It exposes port 22
  and passes the key to the worker as `PUBLIC_KEY`, so you can log in to debug.
  Without it, the bridge is the only way in.
- `--token-policy generate` (the default) mints a random bearer token for each
  instance. `fixed` mints none.
- `--idle-timeout` and `--max-lifetime` take positive whole minutes.

`worker models` manages the Hugging Face cache on a worker over its bridge. Pass
a worker id, or omit it to use the attached worker. `download` sends your
`HF_TOKEN` (from the secret store, then the environment) because the worker has
no Hugging Face credential of its own, and `-a` and `-i` filter files by glob.
The worker image must report bridge protocol version 2 or later.

---

## Attaching from the UI

The **Workers** tab in the bottom panel is the main surface:

1. **Manage Profiles** — pick a provider, name, GPU, vCPU, disk (GB), idle
   timeout, max lifetime, worker image, and token policy, and save a reusable
   profile. The dialog warns when the provider's API key is missing.
2. **Start Worker** — choose a profile and launch an instance. Progress runs
   `provisioning → running → attached`. **Attach** stays disabled until the
   worker answers a health probe.
3. **Instance rows** — each live or paused worker shows its status, uptime, and
   **estimated cost**, with **Attach**, **Detach**, **Resume**, **Stop** (pause),
   and **Terminate** (destroy) actions.
4. **Reconcile** and **Stop All** — Reconcile runs the orphan check on demand.
   Stop All pauses every listed worker.
5. **Status-bar indicator** — when a worker is attached, a badge shows it and
   offers **Stop attached worker**, which pauses it.

Attaching re-points NodeTool's Python bridge at the worker's `wss://` URL and
bearer token **without a restart**; detaching reverts to the local stdio worker.
The active worker is a single DB pointer (`active_worker_instance_id` in the
`settings` table) that any NodeTool instance reads — which is why a self-hosted
Docker server can adopt a worker by the same mechanism.

---

## Cost guard

GPU pods and Vast instances bill **continuously** — there's no scale-to-zero in
pod mode. The laptop sleeps, the app crashes, a tab gets forgotten. Two
operations release a worker, and they differ in what keeps billing:

| Operation | Effect | Still billing |
|-----------|--------|---------------|
| **Stop** (pause) | Releases the GPU, keeps the volume and cached models. The instance is marked `stopped` and can be resumed. | The volume, at a lower rate |
| **Terminate** | Destroys the worker and its volume. The instance is marked `terminated`. | Nothing |

`worker stop`, **Stop**, **Stop All**, and the status-bar quick-stop all pause.
Only **Terminate** and the hard TTL destroy. Four mechanisms keep a stray worker
from quietly billing for days:

| Guard | What it does |
|-------|--------------|
| **Terminate** | Issues the provider's real delete/destroy for the worker and its volume, never just a status flip. Available in the Workers panel. |
| **Idle auto-pause** | The reaper **pauses** an instance after its profile's `idle_timeout_minutes` of bridge inactivity (the bridge tracks `last_activity_at`). Attaching or resuming resets the clock. |
| **Hard TTL** | Optional `max_lifetime_minutes`. The reaper **terminates** an instance older than this regardless of activity. If both limits fire, the TTL wins. |
| **Orphan reconcile** | At server startup and on **Reconcile**, NodeTool diffs the DB's `running` and `attached` instances against the provider's live list. Workers killed out-of-band are marked `stopped`. Running provider workers the DB doesn't track are reported as **orphans** with a live count and estimated cost. The panel banner tells you to stop them in your provider console, because NodeTool holds no record to act on. |

The reaper runs inside the NodeTool server and checks every 60 seconds. If you
provision from the CLI with no server running, nothing enforces the idle timeout
or TTL, so terminate by hand. A failed database write during `provision` also
terminates the new worker, so no untracked resource is left billing.

Set both `--idle-timeout` and `--max-lifetime` on every profile you provision
from. A profile that sets neither opts its instances out of the reaper entirely
— do that only deliberately.

---

## How provisioning works

1. `WorkerManager.provision(profileName)` looks up the profile and resolves the
   target's provider (RunPod, Vast or Verda).
2. If the profile's `token_policy` is `generate`, it mints a high-entropy bearer
   token for the worker.
3. The provider launches the image on the chosen GPU/spec with persistent
   storage for the model cache (`HF_HOME=/workspace/huggingface`), polls until the box is running, and derives the
   WebSocket URL.
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
