---
layout: page
title: "ComfyUI Setup: Endpoint and Ports"
description: "Point NodeTool's ComfyUI nodes at a server: a ComfyUI on your computer or another machine on your network, Comfy Cloud, or a rented GPU."
---

This page covers connecting NodeTool to a ComfyUI server and what that server must have installed.

> **Runs:** on your computer, another machine, a rented GPU, or Comfy Cloud. **Needs:** a Comfy key for Comfy Cloud, nothing for a local ComfyUI. The default local address is `127.0.0.1:8188`.
{: .callout-note}

The nodes, the workflow loader and the outputs are in [ComfyUI](comfyui.md).

---

## Choosing a path

| Path | Node | Who holds the models | Cost |
|---|---|---|---|
| ComfyUI on your own machine | Run ComfyUI Workflow | You, on your disk | Electricity |
| ComfyUI on a rented GPU | Run ComfyUI Workflow, or Run ComfyUI Workflow (Worker) | You, on the rented machine's volume | Per minute while the GPU is rented |
| Comfy Cloud | Run ComfyUI Workflow (Comfy Cloud) | Comfy | Per job, from your Comfy account |

Two questions usually settle it:

- **Do you have a GPU that fits the workflow?** If yes, run ComfyUI on it and
  point **Run ComfyUI Workflow** at it. Nothing leaves your machine and there is
  no start-up wait.
- **Do the weights have to stay yours?** A rented GPU keeps them on a volume you
  control. Comfy Cloud does not: you submit a graph and Comfy supplies the models.

A local ComfyUI is already running. A rented GPU takes time to boot and may need
model downloads. Comfy Cloud has no boot, but a full queue makes a run wait, and
the plan allows 1, 3, or 5 jobs at a time.

---

## A ComfyUI on your own machine

**Run ComfyUI Workflow** has an `endpoint` property, defaulting to
`127.0.0.1:8188`, which is where a stock ComfyUI listens. Start ComfyUI as
[ComfyUI's documentation](https://docs.comfy.org) describes, then run the node.
A bare `host:port` is enough, and a full `http://` or `https://` URL also works.

No credential is sent, so the server has to accept requests without one.

### Where `127.0.0.1` is resolved from

The ComfyUI nodes run on the NodeTool server, not in your browser tab.
`127.0.0.1:8188` means port 8188 on the machine running the NodeTool server. In
the desktop app that server runs on your computer, so a local ComfyUI is reached
with the default. If your NodeTool server runs somewhere else, such as a Docker
container or a self-hosted machine, that machine must be able to reach ComfyUI,
and `127.0.0.1` there means that machine.

### ComfyUI on another machine on your network

A ComfyUI that listens only on its own machine cannot be reached from any other
machine, including the one running NodeTool. ComfyUI has a `--listen` option that
makes it accept connections from the network, and `--port` changes the port from
8188. Both belong to ComfyUI, so see [ComfyUI's documentation](https://docs.comfy.org)
for the exact syntax and for install steps.

Once it listens, set `endpoint` to that machine's `host:port`, for example
`192.168.1.20:8188`. Anyone who can reach the address can submit workflows to it,
so keep it on a network you trust.

---

## On a rented GPU

Open the Workers panel and select **Start** beside a model. NodeTool rents a
RunPod GPU from a tested template and tries the next GPU when RunPod has no
capacity. When the row shows **Ready**, copy its URL into the `endpoint` of
**Run ComfyUI Workflow**. The first start can take several minutes.

The GPU shuts down after the time shown on the card and deletes its files, while
the NodeTool server runs. Anyone with the URL can use it. MiniMax H3 is tested.
Wan 2.2 and LTX 2.3 are untested.

Other ways to run ComfyUI on a rented GPU, including keeping it private behind a
token, are in [Worker Deployment](worker-deployment.md#comfyui-on-a-worker).

---

## Comfy Cloud

No GPU and no ComfyUI install. **Run ComfyUI Workflow (Comfy Cloud)** submits the
same API-format workflow to Comfy's hosted service.

A graph made of ComfyUI nodes also runs there as one job. Each node shows its
live status, and each saved file becomes an asset of the node that saved it.

1. Get a key at [platform.comfy.org](https://platform.comfy.org).
2. Add it on the Comfy Cloud card in **Settings → Models & Providers**.

The editor marks the node as unconfigured until the key is there, and a run
without it fails with `COMFY_API_KEY is required to run a workflow on Comfy Cloud`.
The same key authenticates any Comfy partner node inside the graph.

Comfy's own limits apply to the run: 1, 3, or 5 concurrent jobs by plan, and 30
minutes per job, 60 on Pro. Provider details are in
[Providers › Comfy Cloud](providers.md#comfy-cloud).

---

## What the server must already have

A workflow in API format names its checkpoints, LoRAs, VAEs, and node classes by
string. The ComfyUI that runs the workflow resolves those names, not NodeTool.
NodeTool downloads no weights and installs no extensions.

So the server needs, before the first run:

- **Every model file the workflow names**, under the filename the workflow uses.
  `sd_xl_base_1.0.safetensors` in the workflow is the name ComfyUI looks for in its
  own model folders, subfolder included.
- **Every custom node the workflow uses.** A node that is not installed on that
  ComfyUI is rejected at submit, exactly as it would be in ComfyUI's own UI.

Media inputs are the exception: a connected image, audio, or video is uploaded to
the server before the run, so input files do not have to exist there already.

A missing model or an unknown node fails the submit rather than the run. The node
reports `Submit failed (400)` with ComfyUI's own response included, which names the
offending node. The full message list is in [Troubleshooting](comfyui.md#troubleshooting).

### Checking what is there

NodeTool cannot list what a ComfyUI server has installed. Open ComfyUI's own UI
on that address and check the loader dropdowns. For Comfy Cloud there is nothing to
check from NodeTool, because what is installed is Comfy's business. That is why
the provider adds no models to the model pickers, as
[Providers › Comfy Cloud](providers.md#comfy-cloud) notes.

---

## A first run to prove the wiring

Use the smallest workflow you have, a text-to-image with one checkpoint and one
`SaveImage`, before anything ambitious.

1. Export it from ComfyUI with **Save (API Format)**.
2. Add **Run ComfyUI Workflow** to a graph and load the JSON with the node
   header's **Load Workflow** icon. See [Loading a workflow](comfyui.md#loading-a-workflow).
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

- [ComfyUI](comfyui.md): the three nodes, the loader, and the outputs
- [ComfyUI Recipes](comfyui-recipes.md): worked examples of ComfyUI nodes inside NodeTool graphs
- [Worker Deployment](worker-deployment.md#comfyui-on-a-worker): renting a GPU and running ComfyUI on a worker
- [ComfyUI from Code](developer/comfyui.md): the v2 API, the worker bridge, and running without the editor
- [Providers](providers.md): Comfy Cloud alongside every other provider, and where keys go
