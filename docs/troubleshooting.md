---
layout: page
title: "Troubleshooting Guide"
description: "Find a NodeTool error by its message or symptom, with the likely cause and the fix."
---

Find your problem by the message on screen or by what is going wrong. For installation problems (GPU drivers, CUDA, platform issues), see [Installation Troubleshooting]({{ '/installation' | relative_url }}#if-installing-goes-wrong).

**Jump to:**
- [Quick checks](#quick-checks)
- [Errors by message](#errors-by-message)
- [Runs and nodes](#runs-and-nodes)
- [Models and providers](#models-and-providers)
- [Search and documents](#search-and-documents)
- [Deployment](#deployment)
- [Performance](#performance)
- [Debugging techniques](#debugging-techniques)
- [Getting help](#getting-help)

---

## Quick checks

Start here when a run fails and you do not know why.

- **The failing node.** A failed node shows a red error box with the message, a **View logs** button, and a **Report** button. An animated ring around a node means it is still running.
- **Provider keys.** Open **Settings → Models & Providers** and confirm the key for the provider your node uses. A provider without a key is marked "API key required" in the model menu.
- **The Logs panel.** Press `l` in the editor to open it. It lists log lines for the open workflow, newest first, and you can filter by **Info**, **Warn**, and **Error**. The Trace panel (`Ctrl/⌘ + Shift + T`) shows per-node timing.
- **The model.** For a local model, open **Model Manager** (logo menu, or **Tools → Model Manager** in the desktop app) and confirm the model is installed.
- **The local server.** For Ollama or another local engine, confirm it is running. NodeTool reports "Could not reach ..." when it is not.
- **Preview nodes.** Add a Preview node after each major step to see where the data stops.
- **Connections and file paths.** Check that required inputs are connected, handle colors match, and referenced files exist and are readable.

> **Tip:** A failed node's **Report** button collects the error, node settings, and logs for a bug report. See [Report a Bug from inside NodeTool](#report-a-bug-from-inside-nodetool).
{: .callout-tip}

---

## Errors by message

Search this page (`Ctrl/Cmd+F`) for the text you see. Text in `<angle brackets>` varies with your workflow.

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

Signs: the progress bar does not move, there is no output after several minutes, CPU or GPU use is low, or the app freezes.

First look at the node. An animated ring means it is running, an error box means it failed, and "Model is booting, taking minutes." means a hosted model is starting up. Then check CPU, RAM, GPU, and disk use in Task Manager (Windows) or Activity Monitor (macOS). Add Preview nodes after each major step to find where execution stalls.

- **Model not downloaded.** Open **Model Manager** and install the model. Install models before running workflows that use them.
- **Large file processing.** Process in batches or split the data, for example split large PDFs before indexing.
- **Not enough memory.** The workflow crashes or hangs at specific nodes. Close other applications, reduce batch size, use a smaller or quantized model (Q4 instead of Q8), or increase swap or the page file.
- **Network timeout (cloud models).** Check your connection and API keys, or switch to a local model to work offline.
- **An endless loop.** The workflow never completes and keeps processing. NodeTool blocks circular connections, but conditional logic can still loop forever. Review the workflow logic.

### A connection won't snap, or an input is empty

Signs: the connection snaps back and no edge is created, "Cannot connect these types" appears, "Cannot create a cyclic connection" appears for a cycle, or the workflow will not run because a required input is empty.

Handle colors show each slot's type, so match them. Click a node to read its input and output types, and use Preview nodes to check what a node actually produces.

- **Wrong data type.** For example, `List[String]` connected to a node that expects `String`. Add a conversion node, such as a `nodetool.code.Code` node that returns one item from the list.
- **Null or empty output.** The previous node returned null and the next expects data. Add validation or a default value.
- **Media type mismatch.** A node outputs an image and the next expects a different media type. Add a conversion node.

Any type to any other type: use `nodetool.code.Code` and return the shape the next node wants.

### Preview shows empty or null output

Signs: the Preview panel is blank, shows `null` or `undefined`, and no error appears.

Work backwards from the Preview to find where data is lost. Place a Preview after each node, and check warnings even when a node looks green.

- **A node failed silently.** Check the Logs panel for hidden errors. For example, an API call returned 404 without showing an error.
- **A filter removed everything.** A `FilterCode` or `FilterEqual` node removed all items. Review its conditions.
- **A timing issue.** NodeTool runs upstream nodes first, but custom nodes can break this. Confirm upstream nodes finish before downstream ones start.
- **A path or file does not exist.** Verify the path, prefer absolute paths, and check permissions, spelling, and case (Linux and macOS are case-sensitive).

---

## Models and providers

### The LLM gives poor results

Signs: irrelevant answers, hallucinations, repeated text, or incomplete responses.

Check the prompt in `Template` or `Agent` nodes, the model selection, and the temperature. Add few-shot examples, and use Preview nodes to inspect intermediate steps.

- **Vague prompt.** Be specific. "Summarize this" is weaker than "Summarize this document in 3 bullet points, focusing on action items".
- **Wrong model for the task.**
  - Creative writing: larger models (13B and up).
  - Factual Q&A: chat or instruct fine-tunes.
  - Code: code-specialized models.
  - Fast iteration: smaller models (7B).
- **Temperature.**
  - 0.0-0.3: deterministic and factual (Q&A, extraction).
  - 0.5-0.7: balanced (general chat).
  - 0.8-1.2: creative (stories, brainstorming).
- **Context window exceeded.** Responses are cut off or earlier context is forgotten. Shorten the input, retrieve relevant snippets with RAG instead of passing full documents, or use a model with a larger window.
- **Missing retrieval context (RAG).** Confirm the vector database is populated, increase the number of retrieved documents, check hybrid search parameters, and confirm embeddings are generated. See [the next section](#rag-returns-irrelevant-documents).

### A model download fails or stalls

Signs: the progress bar stops, "Connection timed out" or "HTTP error" appears, the model looks partially downloaded, or "Model not found" appears after downloading.

Check free disk space first (models run 4-20 GB each, `df -h` on macOS and Linux). Then check that you can reach [huggingface.co](https://huggingface.co), and look at the Models panel for download status.

- **Not enough disk space.** Models are stored in `~/.cache/huggingface/` by default, and you need at least 2x the model size free. Set `HF_HOME` to a larger drive to move the cache.
- **Network interruption.** Retry from Model Manager. Behind a proxy, set `HTTP_PROXY` and `HTTPS_PROXY`. Models of 12 GB and up can take 30+ minutes on slow connections.
- **Hugging Face rate limiting.** Wait a few minutes and retry. For frequent downloads, add a Hugging Face token in **Settings → Models & Providers**. Create one at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens).
- **Corrupted download.** The model appears downloaded but fails to load. Delete it in the Models panel and download again, or remove its folder from `~/.cache/huggingface/hub/`.

---

## Search and documents

### RAG returns irrelevant documents

Signs: retrieved documents do not match the query, relevance scores are low, or answers miss the question.

Check that documents are indexed in SQLite-vec (or your configured backend), use Preview nodes to see what is being embedded, run the search node alone with a known query, and review chunk size.

- **Documents not indexed.** Run an indexing workflow first. The collection count should match the number of chunks.
- **Poor chunking.** Retrieved text is too short, too long, or cut mid-sentence. Split on a semantic boundary with `nodetool.code.Code`, use chunks of about 500-1000 tokens, and add 50-100 tokens of overlap.
- **Embedding model mismatch.** Use the same embedding model to index and to query. If you indexed with `text-embedding-ada-002`, query with it too.
- **Query too vague.** Make the query more specific, or have an LLM expand or rephrase it before the search.
- **`top_k` too low.** Try 5-10 first. More documents improve recall but slow inference.

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

## Performance

### Speeding up a slow workflow

**Diagnosis:** Profile with Preview nodes to identify bottlenecks

**Optimization strategies:**

1. **Use local models for fast tasks**
   - Example: Local Whisper for transcription instead of API
   - Benefit: No network latency

2. **Batch processing**
   - Process multiple items together
   - Use `Chunk` to group stream items into batches and `Collect` to gather a stream into a list

3. **Parallel execution**
   - Split workflow into independent branches
   - NodeTool automatically parallelizes non-dependent nodes

4. **Cache results**
   - Save intermediate outputs to files
   - Reuse across workflow runs
   - Use `SaveText`, `SaveImage`, etc.

5. **Right-size models**
   - Don't use GPT-4 when GPT-3.5 suffices
   - Use quantized models (Q4) for faster inference
   - Balance quality vs speed

6. **Optimize chunking**
   - Smaller chunks = faster processing but may lose context
   - Larger chunks = slower but better context
   - Typical sweet spot: 500-1000 tokens

### Reducing memory use

**Diagnosis:** Monitor system resources during workflow execution

**Fixes:**

1. **Use smaller models** – Switch to quantized versions (Q4 instead of FP16)
2. **Process in batches** – Don't load all data into memory at once
3. **Clear caches** – Restart NodeTool periodically to clear accumulated memory
4. **Close Preview panels** – Preview nodes keep data in memory for display
5. **Limit parallel execution** – Reduce concurrent node execution

---

## Debugging Techniques

### Using Preview Nodes Effectively

**Strategy:** Add Preview nodes after every major transformation

**Example workflow:**
```
Input → Preview(1) → Transform → Preview(2) → LLM → Preview(3) → Output
```

**Benefits:**
- See exact data at each step
- Identify where data is corrupted/lost
- Verify transformations are correct
- Understand intermediate results

### Enable Verbose Logging

**Desktop app:**
1. Open **Tools → Log Viewer** to read the backend logs
2. Open **Tools → Performance Monitor** to watch resource use
3. To raise the log level, start the app with `NODETOOL_LOG_LEVEL=debug` set

**CLI/Server:**

`nodetool serve` only accepts `--host` and `--port`. Set the log level via the `NODETOOL_LOG_LEVEL` (or `LOG_LEVEL`) environment variable:

```bash
NODETOOL_LOG_LEVEL=debug nodetool serve
```

### Isolate Problem Nodes

**Strategy:** Test nodes individually

1. Create new workflow with just the problem node
2. Provide known good inputs
3. Verify outputs
4. If works in isolation, issue is with upstream data

### Use Reproducible Inputs

**Strategy:** Save test inputs as files

1. Create `test-inputs/` folder
2. Save sample images, text, audio
3. Use `nodetool.input.FilePathInput` nodes for consistent testing
4. Share test cases with teammates

---

## Getting Help

### Quick Self-Help Checklist

Before reaching out, try these steps — they resolve most issues:

1. **Read the error message** — it often contains the solution or a clear hint
2. **Run the [Quick checks](#quick-checks)** above
3. **Search this page** — use `Ctrl/Cmd+F` to find your error message in [Errors by message](#errors-by-message)
4. **Try a simpler workflow** — isolate the problem by testing with fewer nodes
5. **Restart NodeTool** — clears cached state and frees memory
6. **Check [Workflow Debugging]({{ '/workflow-debugging' | relative_url }})** — step-by-step debugging guide

### Where to Get Help

| Channel | Best For |
|---------|----------|
| **[Discord](https://discord.gg/WmQTWZRcYE)** | Real-time help, community tips, sharing workflows |
| **[GitHub Issues](https://github.com/nodetool-ai/nodetool/issues)** | Bug reports, feature requests, reproducible problems |
| **[Documentation]({{ '/' | relative_url }})** | Guides, API reference, node documentation |

### Report a Bug from inside NodeTool

Every error in NodeTool carries a **Report** button. It opens a form that
collects the technical detail for you, so you only have to describe what
happened.

You reach it from:

- A **failed node** — the Report button on the red error box
- A **failed job** — the Report button in the Jobs panel
- An **error notification** — the Report button in the notification list
- A **crashed screen or panel** — the "Report a bug" button on the error screen
- **Anywhere** — the command menu (`Cmd/Ctrl+K`) → **Report a Bug**

The form has three steps:

1. **Describe it.** What went wrong, the steps to reproduce, what you expected.
2. **Check what you send.** The form lists every file it will attach — the
   error and stack trace, the failing node's settings, the workflow graph, the
   run logs, the browser console. Each row has a **View** button that shows the
   exact content, and a checkbox to leave it out. You can add screenshots here
   too; a picture of the broken screen is the most useful thing you can attach.
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

### How to Ask Effectively

The Report a Bug form gathers your version, OS, error text, node settings and
workflow for you. When you ask elsewhere — Discord, an issue you write by hand
— include these:

1. **NodeTool version** — from **Settings → About**
2. **Operating system** — macOS/Windows/Linux + version
3. **What you're trying to do** — describe the goal, not just the error
4. **Full error message** — copy the complete text, not just "it doesn't work"
5. **Steps to reproduce** — exact sequence that causes the issue
6. **Screenshots** — especially of error messages or unexpected behavior
7. **Workflow file** — export the workflow JSON if possible

**Good example:**
> I'm running NodeTool 1.5.0 on macOS 14.1. When I run the Chat with Docs workflow (attached JSON), I get "Collection not found: docs". I've already run the Index PDFs workflow and can see the collection in the SQLite-vec store. Screenshots attached.

**Poor example:**
> Chat with docs doesn't work, help!

---

## Related pages

- [Workflow Debugging]({{ '/workflow-debugging' | relative_url }}): step-by-step debugging with Preview nodes and logs
- [Editor Panels]({{ '/editor-panels' | relative_url }}): the Logs, Queue, and Trace panels
- [Installation Troubleshooting]({{ '/installation' | relative_url }}#if-installing-goes-wrong): hardware, CUDA, and installation issues
- [Models & Providers]({{ '/models-and-providers' | relative_url }}): provider keys and model choice
- [Model Manager]({{ '/models-manager' | relative_url }}): install and remove local models
- [Configuration]({{ '/configuration' | relative_url }}): settings, secrets, and environment variables
- [Deployment Guide]({{ '/deployment' | relative_url }}) and [Self-Hosted Deployment]({{ '/self-hosted-deployment' | relative_url }}): deployment-specific issues
