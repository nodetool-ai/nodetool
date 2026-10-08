---
layout: page
title: "Privacy and Data Handling"
permalink: /privacy
description: "Where NodeTool stores your data, how secrets are encrypted, what leaves your machine, and how local, self-hosted, and hosted modes differ."
---

This page states what NodeTool does with your data, based on the code. It describes behavior, not contractual terms. For the hosted service at app.nodetool.ai, read any terms that service publishes separately.

## Short version

- Workflows, assets, chat history, and settings are stored on the machine that runs the NodeTool server.
- Provider API keys are stored encrypted in the local database.
- Data leaves the machine when a node calls a provider you configured, when you install or download something, and when you turn on an opt-in feature.
- The desktop app contains no analytics. Error traces stay in your own database.

## Where data is stored

The NodeTool server keeps its state in a data directory. The desktop app runs this server on `127.0.0.1`, so it is reachable only from your machine.

| What | Default location |
|------|------------------|
| Database (`nodetool.sqlite3`): workflows, chat threads, memory, jobs, settings, encrypted secrets | `~/.local/share/nodetool/` on macOS and Linux, `%APPDATA%\nodetool\` on Windows |
| Assets (`assets/`) | Same directory |
| Vector store (`vectorstore.db`) | Same directory |
| Log file | `~/.local/share/nodetool/logs/nodetool.log` on macOS and Linux, `%LOCALAPPDATA%\nodetool\logs\nodetool.log` on Windows |

`DB_PATH`, `DATABASE_URL`, `ASSET_FOLDER`, `STORAGE_PATH`, and `VECTORSTORE_DB_PATH` move these. The full list of locations is in [Desktop App](desktop-app.md#where-your-data-lives) and [Configuration](configuration.md). Other storage backends are in [Storage](storage.md).

Desktop users can keep separate data sets in vaults. Each vault has its own database, assets, and collections. See [Desktop App](desktop-app.md#desktop-only-settings).

NodeTool does not set a retention limit on your workflows, assets, or chat messages. History such as autosaves, old versions, finished jobs, and run events is trimmed only when you ask, or on a schedule if you set `NODETOOL_STORAGE_AUTO_CLEANUP`. The windows are listed in [Configuration](configuration.md).

## How secrets are encrypted

Provider keys and other secrets are saved in the database as ciphertext. NodeTool encrypts each secret with AES-256-GCM, using a per-user key derived from a master key with PBKDF2-SHA256.

The master key comes from the first of these that exists:

1. The `SECRETS_MASTER_KEY` environment variable.
2. The operating system keychain: macOS Keychain, Windows Credential Manager, or the Linux Secret Service.
3. A new key that NodeTool generates and saves to the keychain.

In the Docker image, if `SECRETS_MASTER_KEY` is unset the entrypoint generates a key and saves it to `/workspace/.secrets_master_key` on the data volume.

A database copied to another machine can be decrypted only where the master key has the same value. Losing the master key means losing the stored secrets, and you re-enter them. Details are in [Configuration](configuration.md#secret-storage-and-master-key).

## What leaves your machine

NodeTool sends data only for these reasons.

### Provider calls

When a node or agent uses a cloud model, the server sends the prompt, input media, and the parameters to that provider with your key. This covers chat models, image, video, and audio generation, speech and transcription, embeddings, and web search tools such as SerpAPI. The provider's own policy then applies. NodeTool does not route these calls through a NodeTool server and does not mark up prices. See [Models and Providers](models-and-providers.md#local-vs-cloud).

Nodes that take a URL, such as a web fetch or an image URL, contact that URL. The server applies SSRF checks to URLs supplied by callers, providers, or models. See [URL Egress Inventory](url-egress-inventory.md).

### Downloads you start

Installing a node pack, a runtime package, a Python environment, or a model downloads files from their sources, such as GitHub, Hugging Face, or Ollama. Your account data is not part of those requests, apart from a Hugging Face token if you set `HF_TOKEN`.

### Desktop updates

Automatic updates are off by default. When you turn them on in **Settings**, the desktop app checks the GitHub releases of `nodetool-ai/nodetool`. With the setting off, the app makes no update check. See [Upgrading](upgrading.md).

### Opt-in diagnostics

| Feature | Default | What it sends |
|---------|---------|---------------|
| Error trace sync (`NODETOOL_ERROR_TRACE_SYNC_URL` and `NODETOOL_ERROR_TRACE_SYNC_TOKEN`) | Off | Redacted error traces, to the server URL you name |
| OpenTelemetry export (`OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, or `TRACELOOP_API_KEY`) | Off | Run spans, to the backend you name |
| Bug report dialog | Your action | A report you submit, which can attach the last hour of redacted server errors |

Run spans include token counts and cost. They include prompt content only when `NODETOOL_TRACE_INCLUDE_CONTENT=1`.

### Analytics

The desktop app and self-hosted installs load no analytics. The web app loads the Plausible analytics script only when it is served from `app.nodetool.ai`. The code skips it on localhost, other hosts, and in the desktop app. The code comment describes it as cookieless.

## Error traces

NodeTool records server failures, failed workflow runs, and client crashes as error traces in its own database. It sends nothing to a third-party error tracker. A trace stores the error type, message, stack, app version, platform, and ids such as job and workflow ids. It does not store prompts, node inputs, outputs, or request bodies. Redaction removes credentials, tokens, email addresses, IP addresses, and home-directory names before a trace is saved. Traces older than 30 days are pruned.

Set `NODETOOL_ERROR_TRACES=off` to stop capture. The whole mechanism is described in [Error Tracing](error-tracing.md).

## Local models

Local models keep your prompts and media on the machine. NodeTool can run them through:

- Ollama, llama.cpp, vLLM, and LM Studio servers that you run yourself
- An in-process llama.cpp provider
- Transformers.js and whisper.cpp in the server
- Python nodes that use Hugging Face and MLX models, through a local process connected over stdio

The model files download once, then run offline. Mixing is allowed in one graph, so a single cloud node sends only its own inputs to its provider. Setup is in [Models and Providers](models-and-providers.md) and [Hugging Face](huggingface.md).

## Local, self-hosted, and hosted mode

The server picks its mode from its environment. Both `SUPABASE_URL` and `SUPABASE_KEY` must be set for Supabase mode.

| | Local mode | Supabase mode |
|--|------------|---------------|
| Login | None. Loopback requests, plus networks you list in `NODETOOL_TRUST_LOCAL_NETWORKS`, run as one user | A valid Supabase JWT is required on every request |
| Who sees the data | Whoever can reach the server as that user | Each signed-in user, scoped to their own records |
| Storage | Local disk by default | `NODETOOL_STORAGE_BACKEND` selects `file`, `s3`, or `supabase` |
| Workspaces | Folders on disk | Object storage under `workspaces/<user>/` by default when `NODETOOL_ENV=production` |

A self-hosted Docker server from `docker-compose.yml` runs in Local mode with no login. Do not expose it to the internet as it is. See [Self-Hosted Deployment](self-hosted-deployment.md), [Authentication](authentication.md), and [Security Hardening](security-hardening.md).

On NodeTool's hosted cloud, a generation can run on a curated model catalog with NodeTool's own provider keys and a credit balance. That provider is cloud-only. See [Costs and Credits](costs-and-credits.md#your-own-keys-or-hosted-credits).

## Export and erase your data

A server holds an export and an erase endpoint for the signed-in identity, even in Local mode:

| Endpoint | Effect |
|----------|--------|
| `GET /api/account/export` | Downloads everything the server holds about you as JSON |
| `DELETE /api/account` | Erases your data. The body must be `{"confirm": "DELETE MY ACCOUNT"}` |

See [API Reference](api-reference.md). Workflows and apps also export as bundles you can keep.

## Related pages

- [Configuration](configuration.md) for storage, secrets, and retention variables
- [Error Tracing](error-tracing.md) for what is recorded and how to turn it off
- [Security Hardening](security-hardening.md) for deployments
