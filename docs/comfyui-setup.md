---
layout: page
title: "ComfyUI Setup"
description: "Give NodeTool's ComfyUI nodes an endpoint: a local ComfyUI, a rented GPU, or Comfy Cloud, and the models each server has to already hold."
---

You have a ComfyUI workflow in API format and a NodeTool graph to put it in. What
is missing is a server to run it on. This page covers getting that endpoint and
what has to be installed on it.

The nodes themselves, their properties, the workflow loader and the output slots
are in [ComfyUI](comfyui.md).

---

## Choosing a path

| Path | Node | Who holds the models | Cost | Reachable by |
|---|---|---|---|---|
| ComfyUI on your own machine | `lib.comfy.RunWorkflow` | You, on your disk | Electricity | Nothing outside your machine, when it stays on loopback |
| ComfyUI on a rented GPU you expose | `lib.comfy.RunWorkflow` | You, on the pod's volume | Per minute while the pod is up | Anyone with the URL |
| NodeTool ComfyUI worker on a rented GPU | `lib.comfy.RunWorkflowOnWorker` | You, on the pod's volume | Per minute while the pod is up | The bearer token holder |
| Comfy Cloud | `lib.comfy.RunWorkflowOnCloud` | Comfy | Per job, from your Comfy account | Comfy's API key holder |

Three questions usually settle it:

- **Do you have a GPU that fits the workflow?** If yes, run ComfyUI locally and
  point the direct node at it. Nothing leaves the machine and there is no start-up
  wait.
- **Do the weights have to stay yours?** A rented GPU keeps them on a volume you
  control. Comfy Cloud does not: you submit a graph and Comfy supplies the models.
- **Is the endpoint allowed to be public?** A pod's proxy URL is reachable by
  anyone who has it, since the direct node sends no credential. The NodeTool
  ComfyUI worker keeps ComfyUI on loopback inside the container and puts a bearer
  token in front of it.

Cold starts differ. A local ComfyUI is already warm. A rented pod pays for boot
plus whatever model downloads its volume still needs. Comfy Cloud has no boot,
but a full queue answers `429` and the plan's concurrent-job limit is 1, 3, or 5.

---

## A ComfyUI on your own machine

`lib.comfy.RunWorkflow` has an `endpoint` property, defaulting to
`127.0.0.1:8188`. A bare `host:port` gets `http://` prepended. A full `http://`
or `https://` URL is taken as given.

The process at that address has to serve ComfyUI's HTTP API and its WebSocket on
the same port. NodeTool submits to `/prompt`, follows the run on `/ws`, downloads
finished files from `/view`, reconciles anything it missed from
`/history/<prompt_id>`, uploads connected media through `/upload/image`, and
posts `/interrupt` when you cancel. A stock ComfyUI serves all of it on one
port. See [ComfyUI's documentation](https://docs.comfy.org) for how to start it.

Nothing is sent on this path except the prompt, so the endpoint has to accept an
unauthenticated submit.

### Where `127.0.0.1` is resolved from

The ComfyUI nodes are server-tagged (`node`, `workers`, `edge`, never `browser`),
so the submit is made by the NodeTool backend, not by your browser tab.
`127.0.0.1:8188` means "port 8188 on the machine running the NodeTool server". In
the desktop app the bundled backend runs on your machine, so a local ComfyUI is
reachable with the default. If your NodeTool server runs somewhere else, a
Docker container or a self-hosted box, then that host is what must reach ComfyUI,
and loopback there is its loopback.

### ComfyUI on another machine on the LAN

A ComfyUI bound to loopback is unreachable from any other machine, including the
one running NodeTool. ComfyUI's flag for binding a wider interface is `--listen`, and
`--port` moves it off 8188. Both belong to ComfyUI, not to NodeTool: see
[ComfyUI's documentation](https://docs.comfy.org) for the exact syntax and for
install steps.

Once it listens, set `endpoint` to that machine's `host:port`. Anyone who can
reach the address can submit prompts to it, so keep it on a network you trust.

---

## A rented GPU

### Expose ComfyUI yourself

Run ComfyUI on a pod and reach the port from outside: a RunPod pod's HTTP proxy
URL, a Cloudflare tunnel, an SSH tunnel. Put the resulting `https://` URL in
`endpoint` and use the direct node. The scheme is derived from the endpoint, so a
`https://` address upgrades the WebSocket to `wss://` on its own.

This publishes ComfyUI to whoever holds the URL. There is no `Authorization`
header on the direct node's requests, so the proxy URL is the only secret, and
anyone with it can queue prompts, read `/history`, and download outputs. Put a
tunnel with its own auth in front of it, or use the worker below.

### The NodeTool ComfyUI worker

Deploy `ghcr.io/nodetool-ai/nodetool-worker-comfy:latest`, which runs a
co-located ComfyUI that stays loopback-only inside the container, and drive it
with `lib.comfy.RunWorkflowOnWorker`. The node talks to the worker's bridge over
`wss://`, authenticated with the worker's bearer token in the `worker_token`
property. ComfyUI's own ports are never published.

Provisioning, the profile and instance model, and the idle-stop and TTL guards
that stop a forgotten pod billing are in
[Worker Deployment](worker-deployment.md). Pick the ComfyUI image from the
**Worker image preset** dropdown, or pass
`--image ghcr.io/nodetool-ai/nodetool-worker-comfy:latest` on the CLI.

The worker node has no workflow loader in the editor, so its `workflow` property
and dynamic handles are filled in by hand. That and the bridge path's slot naming
are in [Known limitations](comfyui.md#known-limitations).

---

## Comfy Cloud

No GPU and no ComfyUI install. `lib.comfy.RunWorkflowOnCloud` submits the same
API-format prompt to `https://cloud.comfy.org`.

1. Get a key at [platform.comfy.org](https://platform.comfy.org).
2. Store it as `COMFY_API_KEY`, either on the Comfy Cloud card in
   **Settings → Models & Providers** or with `nodetool secrets store
   COMFY_API_KEY`, which prompts for the value and writes it to the encrypted
   secret store.

The node declares `COMFY_API_KEY` in `requiredSettings`, so the editor badges it
as unconfigured until the key is there, and a run without it fails with
`COMFY_API_KEY is required to run a workflow on Comfy Cloud`.

The same key is sent with the workflow as `extra_data.api_key_comfy_org`, which
is what authenticates any partner (API) node inside the graph. One key covers
both the job and the API nodes in it.

Comfy's own limits apply to the run: 1, 3, or 5 concurrent jobs by plan, and 30
minutes per job, 60 on Pro. Provider details are in
[Providers › Comfy Cloud](providers.md#comfy-cloud).

---

## `comfy-api-proxy` for the Comfy API v2

`lib.comfy.RunWorkflow`'s `api` property selects the transport. `native` is
ComfyUI's own protocol. `v2` sends the workflow through the Comfy API v2 client
the Cloud node uses, pointed at `endpoint`.

ComfyUI core does not serve `/api/v2` yet, so a local ComfyUI needs Comfy-Org's
own adapter in front of it. It translates v2 onto the native protocol:

```bash
pip install comfy-api-proxy
comfy-api-proxy --comfyui http://127.0.0.1:8188 --port 8189
```

Then set `endpoint` to `127.0.0.1:8189` and `api` to `v2`. Leaving `api` on `v2`
while `endpoint` points at a plain ComfyUI gets a `404` on `/api/v2/jobs`.

No API key is sent on this path, so the proxy has to accept an unauthenticated
submit. What changes about the run, including the different output slot naming,
is in [Using the v2 API](comfyui.md#using-the-v2-api).

---

## What the server must already have

A workflow in API format names its checkpoints, LoRAs, VAEs, and node classes by
string. Those strings are resolved by the ComfyUI that runs the prompt, not by
NodeTool. NodeTool clones the prompt, writes the connected input values into
`prompt[nodeId].inputs[field]`, and posts it. It downloads no weights and
installs no extensions.

So the server needs, before the first run:

- **Every model file the workflow names**, under the filename the prompt uses.
  `sd_xl_base_1.0.safetensors` in the prompt is the name ComfyUI looks for in its
  own model folders, subfolder included.
- **Every custom node class the workflow uses.** A `class_type` that is not
  registered on that ComfyUI is rejected at submit, exactly as it would be in
  ComfyUI's own UI.

Media inputs are the exception: a connected image, audio, or video ref is
uploaded to the server before the prompt goes out, so input files do not have to
pre-exist.

A missing model or an unknown `class_type` fails the submit rather than the run.
The direct node reports `Submit failed (400)` with ComfyUI's own response body
included, which names the offending node. The full message list is in
[Troubleshooting](comfyui.md#troubleshooting).

### Checking what is there

On a worker, the Python bridge exposes `comfyObjectInfo()` for the node catalog
and `comfyModelsList(folder?)` for the model files on the volume. **No shipped
node calls either one.** They are reachable from code against a connected bridge,
which is what [Known limitations](comfyui.md#known-limitations) records. The
message shapes are in [Python Bridge Protocol](python-bridge-protocol.md).

For a ComfyUI you reach directly, NodeTool offers no enumeration at all. Open
ComfyUI's own UI on that endpoint and check the loader dropdowns.

For Comfy Cloud there is nothing to check from NodeTool: what is installed is
Comfy's business, and the Comfy API enumerates no models. That is why the
provider contributes none to the model pickers, as
[Providers › Comfy Cloud](providers.md#comfy-cloud) notes.

---

## A first run to prove the wiring

Use the smallest workflow you have, a text-to-image with one checkpoint and one
`SaveImage`, before anything ambitious.

1. Export it from ComfyUI with **Save (API Format)**.
2. Add **Run ComfyUI Workflow** to a graph and load the JSON with the header
   button. See [Loading a workflow](comfyui.md#loading-a-workflow).
3. Set `endpoint` if it is not `127.0.0.1:8188`.
4. Run it.

A healthy run writes this sequence to the node's log:

```
Running ComfyUI workflow (7 nodes) on 127.0.0.1:8188
Execution started
Executing CheckpointLoaderSimple (#4)
Executing KSampler (#3)
Output from #9
```

A sampler progress bar appears while `KSampler` runs, and the image arrives on
the `9:image` slot, keyed by the save node's ComfyUI id. A second run of the same
prompt logs `Reused cache for N node(s)` instead of re-executing the unchanged
nodes.

If the log stops at `WebSocket connection failed`, the endpoint is wrong or
ComfyUI is not listening. If it stops at `Submit failed (400)`, the server is
reachable but missing something the workflow names.

---

## Related

- [ComfyUI](comfyui.md) - the three nodes, their properties, the loader, and the outputs
- [ComfyUI Recipes](comfyui-recipes.md) - worked examples of ComfyUI nodes inside NodeTool graphs
- [Worker Deployment](worker-deployment.md) - renting a GPU and provisioning the ComfyUI worker image
- [Providers](providers.md) - Comfy Cloud alongside every other provider, and where keys go
