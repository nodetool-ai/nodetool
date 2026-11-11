---
layout: page
title: "Worker Deployment"
description: "Provision a RunPod, Vast.ai or Verda GPU worker, attach it to NodeTool to run Python nodes remotely, and stop or terminate it with the cost guard."
---

A worker is a rented GPU box running the NodeTool Python worker image. Your local NodeTool instance attaches to it, runs Python nodes there, and tears it down afterward.

```bash
nodetool secrets store RUNPOD_API_KEY
nodetool worker profile add hf-a40 --target runpod --image ghcr.io/nodetool-ai/nodetool-worker:latest --gpu "NVIDIA A40" --idle-timeout 15
nodetool worker create --profile hf-a40 --attach
```

> **Runs:** on a RunPod pod, a Vast.ai instance, or a Verda VM. **Needs:** `RUNPOD_API_KEY`, `VAST_API_KEY`, or `VERDA_CLIENT_ID` and `VERDA_CLIENT_SECRET`, and a worker image that serves `python -m nodetool.worker` on port 7777. **Bills** while the worker exists. **Hardware:** the worker image needs NVIDIA driver 580 or newer on the host (see [Worker images](#worker-images)).
{: .callout-note}

Workers differ from a [server](self-hosted-deployment.md): a server is long-lived and people connect into it, while a worker is ephemeral and one instance connects out. Because a rented GPU bills while it exists, read the [cost guard](#cost-guard) first, including the difference between stopping and terminating.

---

## The model: profiles → instances

| | **Worker profile** | **Worker instance** |
|---|---|---|
| What | A declarative, reusable preset | A live, running worker |
| Lifetime | Permanent until you delete it | Ephemeral — spin up, attach, tear down |
| Holds | target, image, GPU, vCPU, volume size, optional SSH public key, token policy, idle timeout, max lifetime | the provider's pod/instance id, the `ws://` or `wss://` URL, the bearer token, status, estimated cost |
| Stored | `worker_profiles` table (DB) | `worker_instances` table (DB) |

**Provisioning** a profile launches an instance. Instances are never written to `deployment.yaml`, so declarative config cannot resurrect a torn-down pod. Both tables live in NodeTool's database, shared by the UI and CLI.

---

## Prerequisites

- A **RunPod** API key ([console settings](https://www.runpod.io/console/user/settings)), a **Vast.ai** API key, or a **Verda** cloud API client id and secret ([API credentials](https://docs.verda.com/welcome-to-verda/api-credentials/)). Verda's cloud credentials are separate from its inference key and are deleted when the team member who created them leaves the project.
- A worker image that runs `python -m nodetool.worker` on port 7777 (msgpack RPC, bearer-token auth), either published or built from a NodeTool Python package.

### Worker images

| Image | Contents | Use for |
|-------|----------|---------|
| `ghcr.io/nodetool-ai/nodetool-worker:latest` | The lean Python worker | Python nodes, HuggingFace pipelines, LLM providers |
| `ghcr.io/nodetool-ai/nodetool-worker-comfy:latest` | Worker + a co-located, loopback-only ComfyUI | Everything above **plus** the **Run ComfyUI Workflow (Worker)** node |

The worker image installs PyTorch 2.14 from PyPI, whose Linux build uses CUDA 13.0, so the GPU host needs NVIDIA driver 580 or newer. On an older driver the HuggingFace nodes run on the CPU or fail their VRAM checks. NodeTool does not filter hosts by CUDA version, so check the driver of the host you rent.

The ComfyUI image fronts ComfyUI over the worker bridge (it is never exposed outside the container) and reports `worker.status.comfy.enabled: true`. The **Run ComfyUI Workflow (Worker)** node runs an API-format ComfyUI workflow on it. Pick it from the **Worker image preset** dropdown in the Profiles editor or pass `--image ghcr.io/nodetool-ai/nodetool-worker-comfy:latest`. See [ComfyUI](comfyui.md).

Store the API key in the secret store:

```bash
nodetool secrets store RUNPOD_API_KEY      # prompts for the value
nodetool secrets store VAST_API_KEY        # for Vast.ai
nodetool secrets store VERDA_CLIENT_ID     # for Verda (both are required)
nodetool secrets store VERDA_CLIENT_SECRET
```

If the secret store is unreachable, the manager falls back to environment variables of the same names.

---

## Supported targets

| Target | Provider | URL form | Teardown |
|--------|----------|----------|----------|
| `runpod` | RunPod **pod** (REST `rest.runpod.io/v1/pods`) | `wss://<podid>-7777.proxy.runpod.net` | deletes the pod and its volume |
| `vast` | Vast.ai instance (`console.vast.ai/api/v0`) | `ws://<ip>:<port>` | destroys the instance and its disk |
| `verda` | Verda **VM** (REST `api.verda.com/v1`) | `ws://<ip>:7777` | deletes the instance and permanently deletes its OS volume |

The teardown column is what **terminate** does. Each target also has a cheaper **stop** (pause), see [Cost guard](#cost-guard). All three run the same worker image. Local or LAN workers are unmanaged: run the container yourself and point `NODETOOL_WORKER_URL` and `NODETOOL_WORKER_TOKEN` at it. There is no provisioning provider for local Docker.

### Verda

Verda rents virtual machines, so a profile needs two images: the guest OS (`osImage`, a CUDA + Docker image from `GET /v1/images`, picked from the live catalog when unset) and the worker container (`image`). Its `gpu` field is a Verda **instance type** such as `1H100.80S.30V`, not a GPU name. List ids with `GET /v1/instance-types`. A type absent from every location has no capacity right now.

Cost-relevant differences from RunPod and Vast:

- **Verda bills a shut-down instance at the full rate**, so NodeTool's pause does not shut the machine down. It deletes the instance and retains the OS volume, which ends the GPU charge and keeps the model cache. Resuming boots a **new machine** from that volume, so its IP and provider handle change.
- **Terminate deletes the OS volume permanently.** A trashed volume still holds storage quota and can be restored only for a charge, so NodeTool does not use it. Cached models are gone.
- **Only Pay As You Go is used**, in prepaid ten-minute increments. Running out of balance can discontinue instances and delete volumes. Long-term contracts and spot instances are never chosen for you.
- **A bearer token is required.** The worker publishes port 7777 on a public IP, and Verda's [security guide](https://docs.verda.com/cpu-and-gpu-instances/securing-your-instance/) notes that a UFW rule does not block a Docker-published port. The provider refuses a worker with no token, so keep `token_policy` on `generate`.

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

`worker create` prints the instance id, its `wsUrl`, a **redacted** bearer token, and its status. With `--attach` it also points your bridge at the worker and prints the export line, with a commented hint for the token (the raw token is never printed):

```bash
export NODETOOL_WORKER_URL=wss://…
# NODETOOL_WORKER_TOKEN was redacted; set it with:
#   export NODETOOL_WORKER_TOKEN=$(nodetool worker token <instance-id>)
```

`nodetool worker token <id>` prints only the token, so it pipes into `NODETOOL_WORKER_TOKEN`.

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

The inline form of `create` makes a throwaway profile named `inline-<target>-<timestamp>`.

- `--disk <gb>` sizes the persistent volume (default 100). The worker's `HF_HOME` is `/workspace/huggingface`, so the Hugging Face cache survives pause and resume.
- `--ssh-key <file>` takes an OpenSSH **public** key file, exposes port 22, and passes the key to the worker as `PUBLIC_KEY`. Without it the bridge is the only way in.
- `--token-policy generate` (default) mints a random bearer token per instance. `fixed` mints none.
- `--idle-timeout` and `--max-lifetime` take positive whole minutes.

`worker models` manages the Hugging Face cache on a worker over its bridge, for the given worker id or the attached worker. `download` sends your `HF_TOKEN` (secret store, then environment) because the worker has no credential of its own. `-a` and `-i` filter files by glob. The worker image must report bridge protocol version 2 or later.

---

## Attaching from the UI

Open the **Workers** tab in the bottom panel.

1. **Set up a worker.** With no profile, the empty panel and **Start Worker** open the setup form. A missing provider key is requested inline, checked against the provider (RunPod), and stored. Verda needs two credentials, so the form links to Settings. A blank name becomes the provider and GPU, such as "RunPod A40". **Create and start** saves the profile and launches a worker. **Manage Profiles** opens the same form with existing profiles listed.
2. **Start Worker.** Choose a profile. Progress runs `provisioning → running → attached`. A worker started from the panel attaches once it answers a health probe, unless another worker is attached by then. **Attach** stays disabled until the probe answers.
3. **Instance rows** show status, uptime, and **estimated cost**, with **Attach**, **Detach**, **Resume**, **Stop** (pause), and **Terminate** (destroy).
4. **Reconcile** runs the orphan check on demand. **Stop All** pauses every listed worker.
5. A status-bar badge shows an attached worker and offers **Stop attached worker**, which pauses it.

Attaching re-points NodeTool's Python bridge at the worker's `wss://` URL and token without a restart. Detaching reverts to the local stdio worker. The active worker is one database pointer (`active_worker_instance_id` in the `settings` table) that any NodeTool instance reads, so a self-hosted Docker server can adopt a worker the same way.

---

## Cost guard

GPU pods and Vast instances bill continuously, with no scale-to-zero in pod mode. Two operations release a worker, and they differ in what keeps billing:

| Operation | Effect | Still billing |
|-----------|--------|---------------|
| **Stop** (pause) | Releases the GPU, keeps the volume and cached models. The instance is marked `stopped` and can be resumed. | The volume, at a lower rate |
| **Terminate** | Destroys the worker and its volume. The instance is marked `terminated`. | Nothing |

`worker stop`, **Stop**, **Stop All**, and the status-bar quick-stop all pause. Only **Terminate** and the hard TTL destroy. Four guards catch a stray worker:

| Guard | What it does |
|-------|--------------|
| **Terminate** | Issues the provider's real delete/destroy for the worker and its volume, never just a status flip. Available in the Workers panel. |
| **Idle auto-pause** | The reaper **pauses** an instance after its profile's `idle_timeout_minutes` of bridge inactivity (the bridge tracks `last_activity_at`). Attaching or resuming resets the clock. |
| **Hard TTL** | Optional `max_lifetime_minutes`. The reaper **terminates** an instance older than this regardless of activity. If both limits fire, the TTL wins. |
| **Orphan reconcile** | At server startup and on **Reconcile**, NodeTool diffs the DB's `running` and `attached` instances against the provider's live list. Workers killed out-of-band are marked `stopped`. Running provider workers the DB doesn't track are reported as **orphans** with a live count and estimated cost. The panel banner tells you to stop them in your provider console, because NodeTool holds no record to act on. |

The reaper runs inside the NodeTool server and checks every 60 seconds. If you provision from the CLI with no server running, nothing enforces the idle timeout or TTL, so terminate by hand. A failed database write during `provision` terminates the new worker so nothing untracked keeps billing.

A profile that sets neither `--idle-timeout` nor `--max-lifetime` opts its instances out of the reaper. Set both on every profile unless that is deliberate.

---

## How provisioning works

1. `WorkerManager.provision(profileName)` looks up the profile and resolves the
   target's provider (RunPod, Vast or Verda).
2. If the profile's `token_policy` is `generate`, it mints a high-entropy bearer
   token for the worker.
3. The provider launches the image on the chosen GPU and spec with persistent storage for the model cache (`HF_HOME=/workspace/huggingface`), polls until the box is running, and derives the WebSocket URL.
4. A `worker_instances` row is written and transitioned `provisioning → running`.
5. On `attach`, the manager writes the active-worker pointer, marks the instance
   `attached`, and hands the `{ wsUrl, token }` to the bridge.

All state is persisted in the database, so a forgotten pod is recoverable from the registry.

---

## If it fails

- **`<NAME> not found in the secret store or environment. Store with: nodetool secrets store <NAME>`**: the provider key is missing (`RUNPOD_API_KEY`, `VAST_API_KEY`, or both `VERDA_*` names).
- **`Worker profile not found: <name>`** or **`Unsupported worker target: <target>`**: the profile name or `--target` is wrong. Targets are `runpod`, `vast`, `verda`.
- **`Verda workers publish port 7777 on a public IP, so a bearer token is required.`**: use `token_policy` `generate`.
- **`Worker instance '<id>' runs a ComfyUI server with no worker bridge, so it cannot attach.`**: use its endpoint in `lib.comfy.RunWorkflow`. A plain ComfyUI image is supported on `runpod` only (`Target '<target>' does not support an unmodified ComfyUI image. Use runpod.`).
- **Orphan banner after Reconcile**: the provider has running workers NodeTool has no record of. Stop them in the provider console.

## Related

- [Self-Hosted Deployment](self-hosted-deployment.md)
- [Deployment Guide](deployment.md)
- [CLI Reference](cli.md)
</content>
</invoke>
