---
layout: page
title: "Troubleshooting Guide"
description: "Find a NodeTool error by its message or symptom, with the likely cause and the fix."
---

Search this page for the message on screen, or find the symptom below. Install problems (GPU drivers, CUDA) are in [Installation Troubleshooting]({{ '/installation' | relative_url }}#if-installing-goes-wrong).

---

## Quick checks

- **The failing node.** A failed node shows a red error box with the message, **View logs**, and **Report**. An animated ring means it is still running.
- **Provider keys.** In **Settings → Models & Providers**, confirm the key for the node's provider. The model menu marks a provider without a key "API key required".
- **Logs.** Press `l` in the editor to open the Logs panel (newest first, filter by **Info**, **Warn**, **Error**). `Ctrl/⌘ + Shift + T` opens the Trace panel with per-node timing.
- **Local models.** In **Model Manager** (**Tools → Model Manager** in the desktop app), confirm the model is installed.
- **Local servers.** For Ollama or another local engine, confirm it is running. NodeTool reports "Could not reach ..." when it is not.
- **Preview nodes.** Add a Preview node after each major step to see where the data stops.

> A failed node's **Report** button collects the error, node settings, and logs. See [Report a Bug from inside NodeTool](#report-a-bug-from-inside-nodetool).
{: .callout-tip}

---

## Errors by message

Text in `<angle brackets>` varies with your workflow.

| What you see | What it means | Fix |
|---|---|---|
| `Select a model` | An Agent or other LLM node has no model chosen. | Pick a model in the Inspector, or set a default in Settings → Default Models. See [Workflow Debugging]({{ '/workflow-debugging' | relative_url }}#understanding-error-messages). |
| `<PROVIDER>_API_KEY is not configured` (for example `COHERE_API_KEY is not configured`) | The node's provider has no key. The name in the message is the key to set. | Add the key in **Settings → Models & Providers**. See [Models & Providers]({{ '/models-and-providers' | relative_url }}). |
| `OPENAI_API_KEY is required` | The OpenAI provider has no key. | Add it in **Settings → Models & Providers**. See [Configuration]({{ '/configuration' | relative_url }}). |
| `Missing required secret: <key>` | A node or Code body reads a secret that is not stored. | Add the secret in Settings. See [Configuration]({{ '/configuration' | relative_url }}). |
| `Authentication failed: Invalid API key or token` | The provider returned 401 and rejected the key. | Replace the key in **Settings → Models & Providers**. |
| `Authentication failed: <provider> rejected the configured credentials. Check the API key in Settings → Models & Providers.` | The stored credential was refused. For sign-in providers the message says to sign in again. | Update the key or sign in again in **Settings → Models & Providers**. |
| `Rate limited: Too many requests or insufficient provider quota. Check your provider plan and try again later.` | The provider returned 429. You sent too many requests or used up your quota. | Wait and retry, or check your plan limits with the provider. |
| `Account billing or credit limit reached for <provider>. Check your <provider> plan or billing.` | The provider returned 402. Your account is out of credit. | Top up the account with the provider. See [Costs & Credits]({{ '/costs-and-credits' | relative_url }}). |
| `Account quota exhausted for <provider>/<model>. Check your <provider> quota or billing and try again later.` | A Gemini quota error. The account has no quota left for this model. | Check quota and billing with the provider, or choose another model. |
| `Model <model> was not found or is unavailable on <provider>. Choose another model or check account access.` | The provider returned 404 for the model id, or your account cannot use it. | Pick another model, or check that your account has access. See [Models & Providers]({{ '/models-and-providers' | relative_url }}). |
| `Property "<path>" selects model "<model>", which provider "<provider>" does not offer.` | Workflow validation found a model id the provider does not list. | Choose a model from the node's model menu. |
| `Property "<path>" selects provider "<provider>", which is not registered.` | Workflow validation found a provider that is not available on this install. | Choose a registered provider from the node's model menu. |
| `Could not reach <provider>/<model>. Check your internet connection, proxy settings, and — for local providers — that the server is running.` | A network failure before the provider answered. | Check your connection and proxy, and start the local server if the provider is local. |
| `Could not load Ollama models` | The model menu cannot reach Ollama. | Ollama is a separate program that NodeTool does not start. Install it from [ollama.com](https://ollama.com) and start it, or fix the `OLLAMA_API_URL` setting if it runs elsewhere. See [Models & Providers]({{ '/models-and-providers' | relative_url }}). |
| `The <provider>/<model> request is too large for the model context window. Shorten the conversation or remove some attachments and try again.` | The prompt is longer than the model's context window. | Shorten the input, remove attachments, or use a model with a larger window. |
| `Missing required workflow input "<name>"` | A workflow input has no value. | Give the input node a value, or pass the input when you run the workflow. |
| `Cycle detected in graph; a cycle may only close on the "next" or "condition" input of a Loop node.` | The graph loops back on itself. | Remove the connection that closes the cycle, or wire it into a [Loop node]({{ '/nodes/nodetool/control/loop' | relative_url }})'s `next` or `condition` input. |
| `Cannot connect these types` | The editor refused a connection between incompatible handle types. | Add a conversion node between the two, such as `nodetool.code.Code`. See [Type mismatch](#a-connection-wont-snap-or-an-input-is-empty). |
| `Cannot create a cyclic connection` | The new connection would close a cycle. | Connect to a different input, or restructure the graph. |
| `Python node "<type>" cannot execute: Python worker is not connected.` | The node needs the Python bridge and the worker is not running. | Check that Python is installed and the worker started. See [Installation]({{ '/installation' | relative_url }}). |
| `Collection '<name>' not found` | A search or index node names a collection that does not exist. | Run the indexing workflow first, and check the name matches. See [Collections]({{ '/collections' | relative_url }}). |
| `Model is booting, taking minutes.` | A hosted model is starting up. This is a status, not a failure. | Wait for the node to finish starting. |
| `WebSocket connection lost. The download may still be running on the server. Click Reconnect to restore progress updates.` | The Model Manager lost its live connection during a download. | Click **Reconnect**. If progress does not return, cancel and restart the download. |
| `Failed to save workflow: Server unreachable` | The editor cannot reach the NodeTool server. | Check that the server is running, then save again. |

---

## Runs and nodes

### My workflow is stuck or very slow

Symptom: the progress bar does not move or there is no output after several minutes. An animated ring means the node is running. "Model is booting, taking minutes." means a hosted model is starting.

- **Model not downloaded.** Install it in **Model Manager** before running.
- **Not enough memory.** The run crashes or hangs at specific nodes. Use a smaller or quantized model (Q4 instead of Q8), reduce batch size, or close other applications.
- **Network timeout (cloud models).** Check the connection and API keys, or switch to a local model.
- **Loop that never ends.** The editor blocks cycles except on a Loop node's `next` and `condition` inputs. A condition that never becomes false runs forever. Cancel the run and review the condition.

### A connection won't snap, or an input is empty

Symptom: the line snaps back, "Cannot connect these types" or "Cannot create a cyclic connection" appears, or the run stops on a required input that is empty. The rules are in [Data Types and Connections]({{ '/data-types' | relative_url }}#which-connections-are-accepted).

- **Wrong data type.** For example `List[String]` into a `String` input. Add a `nodetool.code.Code` node that returns the shape the next node wants.
- **Null or empty output.** The previous node returned null. Add a default value or check upstream with a Preview node.

### Preview shows empty or null output

Symptom: the Preview is blank or shows `null` and no error appears. Place a Preview after each node to find where data is lost.

- **A node failed quietly.** Check the Logs panel.
- **A filter removed everything.** A `FilterCode` or `FilterEqual` node dropped all items. Review its conditions.
- **A path does not exist.** Verify the path and its case (Linux and macOS are case-sensitive).

---

## Models and providers

### A model download fails or stalls

Symptom: the progress bar stops, "Connection timed out" or "HTTP error" appears, or the model fails to load after downloading. For `WebSocket connection lost`, click **Reconnect** as in the table above.

- **Disk space.** Models are stored in `~/.cache/huggingface/` by default. Set `HF_HOME` to a larger drive to move the cache.
- **Network interruption.** Retry from Model Manager. Behind a proxy, set `HTTP_PROXY` and `HTTPS_PROXY`.
- **Hugging Face rate limiting.** Wait and retry, or add a Hugging Face token in **Settings → Models & Providers** (create one at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)).
- **Corrupted download.** Delete the model in the Models panel and download again, or remove its folder from `~/.cache/huggingface/hub/`.

---

## Search and documents

### RAG returns irrelevant documents

Symptom: retrieved documents do not match the query. Run the search node alone with a known query and Preview what is embedded.

- **Documents not indexed.** Run the indexing workflow first. A missing collection fails with `Collection '<name>' not found`.
- **Embedding model mismatch.** Index and query with the same embedding model.
- **`top_k` too low.** Raise it. More documents improve recall and slow inference.
- **Chunks too short, too long, or cut mid-sentence.** Re-chunk with overlap and reindex.

---

## Deployment

### A deployment fails or the service won't start

Signs: `nodetool deploy apply` fails, the container exits immediately, the health check fails, or the service returns 503.

Start with `nodetool deploy logs <name>` and `nodetool deploy status <name>`. Review `deployment.yaml` for typos, confirm the workflow runs in the desktop app first, and confirm the target has enough CPU, RAM, and GPU and that API keys and tokens are set.

- **Invalid `deployment.yaml`.** Run `nodetool deploy plan <name>` or `nodetool deploy apply <name> --dry-run` to see what `apply` would do. Required fields are `host`, `image.name`, `container.name`, and `container.port`. The only deployment `type` is `docker`.
- **Missing environment variables.** Add them under `container.environment`:
  ```yaml
  container:
    name: nodetool
    port: 7777
    environment:
      HF_HOME: "/workspace/hf-cache"
  ```
  NodeTool writes a generated `SECRETS_MASTER_KEY` there, and a `server_auth_token`, when it loads a `deployment.yaml` that lacks them.
- **Volume mount errors (self-hosted).** Container logs show "Permission denied" or "No such file". Verify host paths exist, check that the user running Docker has access, and use absolute paths.
- **Docker not running (self-hosted).** Start the daemon with `sudo systemctl start docker`.
- **Port conflict.** "Port already in use". Change `container.port` in `deployment.yaml`, or find the conflicting container with `docker ps` and stop it with `docker stop <id>`.
- **Image not found.** Check `image.name`, `image.tag` (default `latest`), and `image.registry` (default `docker.io`) in `deployment.yaml`, and that the image exists in that registry. Verify with `docker images | grep nodetool` on the host.
- **SSH access fails (remote hosts).** `deploy apply` cannot reach the host. Check the `ssh` block (`user`, `key_path`, `port`) in `deployment.yaml` and test `ssh <user>@<host>` by hand.

---

## Debugging

- **Preview nodes.** `Input → Preview → Transform → Preview → LLM → Preview → Output` shows the data at each step.
- **Isolate a node.** Create a workflow with only the problem node and known inputs. If it works, the fault is upstream.
- **Log level.** In the desktop app, **Tools → Log Viewer** shows backend logs and **Tools → Performance Monitor** shows resource use. Set `NODETOOL_LOG_LEVEL=debug` (or `LOG_LEVEL`) before starting the app or `nodetool serve`, which accepts only `--host` and `--port`:

  ```bash
  NODETOOL_LOG_LEVEL=debug nodetool serve
  ```

- **Reproducible inputs.** Save sample files and feed them with `nodetool.input.FilePathInput` nodes.

See [Workflow Debugging]({{ '/workflow-debugging' | relative_url }}) for more.

---

## Getting Help

Ask on [Discord](https://discord.gg/WmQTWZRcYE) or file a bug at [GitHub Issues](https://github.com/nodetool-ai/nodetool/issues).

### Report a Bug from inside NodeTool

Every error carries a **Report** button that opens a form. Entry points:

- A failed node: **Report** on the red error box
- A failed job: **Report** in the Jobs panel
- An error notification: **Report** in the notification list
- A crashed screen or panel: **Report a bug** on the error screen
- Anywhere: command menu (`Cmd/Ctrl+K`) → **Report a Bug**

The form has three steps:

1. **Describe it.** What went wrong, steps to reproduce, what you expected.
2. **Check what you send.** The form lists every attachment: the error and stack trace, the failing node's settings, the workflow graph, the run logs, the browser console. Each row has a **View** button and a checkbox to leave it out. You can add screenshots.
3. **Send or save it.** What happens depends on where you run NodeTool:
   - **Web app on a hosted server, such as nodetool.ai:** **Send report**
     stores your description and the checked files on that server, where its
     operators read them. You need no GitHub account.
   - **Desktop app or local server:** **Save report bundle** writes one zip to
     your downloads. **Open GitHub issue** then opens a pre-filled issue. Drag
     the zip into it and submit. NodeTool uploads nothing, and the zip never
     leaves your machine if you close the dialog.

Only the rows you leave checked are sent or saved. API keys, tokens and
embedded media are stripped before anything is written to the file.

### What to include when you ask elsewhere

NodeTool version (**Settings → About**), operating system, the full error text, steps to reproduce, and the exported workflow JSON. The Report a Bug form gathers these for you.

---

## Related pages

- [Workflow Debugging]({{ '/workflow-debugging' | relative_url }}): step-by-step debugging with Preview nodes and logs
- [Editor Panels]({{ '/editor-panels' | relative_url }}): the Logs, Queue, and Trace panels
- [Installation Troubleshooting]({{ '/installation' | relative_url }}#if-installing-goes-wrong): hardware, CUDA, and installation issues
- [Models & Providers]({{ '/models-and-providers' | relative_url }}): provider keys and model choice
- [Model Manager]({{ '/models-manager' | relative_url }}): install and remove local models
- [Configuration]({{ '/configuration' | relative_url }}): settings, secrets, and environment variables
- [Deployment Guide]({{ '/deployment' | relative_url }}) and [Self-Hosted Deployment]({{ '/self-hosted-deployment' | relative_url }}): deployment-specific issues
