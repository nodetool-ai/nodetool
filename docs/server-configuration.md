---
layout: page
title: "Server Configuration"
description: "Configure a self-hosted NodeTool server: environment files, the secrets master key, 1Password, Supabase, TLS, Python nodes, multi-instance delivery, and reconnect windows."
---

A self-hosted server reads its configuration from environment variables and `.env` files. The desktop app sets these for you. Every variable is listed in [Environment Variables](environment-variables.md).

```bash
SECRETS_MASTER_KEY=<base64 key, the same on every instance>
NODETOOL_ENV=production
DATABASE_URL=postgres://nodetool:...@db:5432/nodetool
NODETOOL_STORAGE_BACKEND=s3
ASSET_BUCKET=nodetool-assets
TEMP_BUCKET=nodetool-temp
TLS_CERT=/etc/ssl/nodetool/cert.pem
TLS_KEY=/etc/ssl/nodetool/key.pem
```

Sign-in is configured separately, in [Authentication](authentication.md). Asset and vector storage are in [Storage](storage.md) and [Vector Storage](vector-storage.md).

## Environment files

The server loads `.env` files in this order, later files overriding earlier ones. **System environment variables always win** over file values.

1. `.env`
2. `.env.<NODE_ENV>`
3. `.env.<NODE_ENV>.local`

`NODE_ENV` defaults to `development`. It only selects which files load. `NODETOOL_ENV=production` is the switch that turns on production behavior. In a `nodetool deploy` target, pass variables through the `container.environment` map in `deployment.yaml`, or through your orchestrator.

## Secret Storage and Master Key

Provider keys and other secrets are encrypted with AES-256-GCM in the server's database. The encryption key derives from one master key, which the server finds in this order:

1. The `SECRETS_MASTER_KEY` environment variable.
2. The system keyring (macOS Keychain, Windows Credential Manager, or Linux Secret Service).
3. A newly generated key, saved to the keyring.

On a headless host with no keyring and no `SECRETS_MASTER_KEY`, the server cannot save a generated key, so it fails at startup. Set `SECRETS_MASTER_KEY` on every server and every replica, so all of them decrypt the same database.

### Moving Secrets to a Server

1. Set the same `SECRETS_MASTER_KEY` on every server instance, from your pipeline or secrets manager:

   ```bash
   export SECRETS_MASTER_KEY="<your-base64-master-key>"
   ```

2. Enter the secrets on the server, in **Settings** or with `nodetool secrets set` against that server. `nodetool deploy apply` does not copy local secrets. A database copied between machines decrypts only where `SECRETS_MASTER_KEY` has the same value.

`nodetool deploy add` generates a `SECRETS_MASTER_KEY` (32 random bytes, base64) in `container.environment` when none is set.

Rotating `SECRETS_MASTER_KEY` makes every stored secret unreadable, and it signs out SSO sessions and invalidates messaging-bridge and deployed-app tokens, which are signed with keys derived from it.

## 1Password on a Server

A secret can hold a [1Password secret reference](configuration.md#1password-secret-references) instead of the key. NodeTool picks the first 1Password backend whose settings are present:

| Backend | Selected when | Authentication |
|---|---|---|
| 1Password Connect server | `OP_CONNECT_HOST` and `OP_CONNECT_TOKEN` are set | The Connect token |
| SDK with a service account | `OP_SERVICE_ACCOUNT_TOKEN` is set | The service account token. Use this for servers and Docker. |
| SDK through the desktop app | An account is connected in Settings, or `NODETOOL_1PASSWORD_ACCOUNT` is set to the account name shown in the 1Password sidebar, or its UUID | The 1Password app asks you to approve NodeTool, and the approval lasts until 10 minutes of inactivity. |
| 1Password CLI (`op read`) | None of the above | Whatever `op` is signed in with |

| Variable | Default | Effect |
|---|---|---|
| `NODETOOL_1PASSWORD_ACCOUNT` | unset | The account the desktop app integration signs in to |
| `NODETOOL_1PASSWORD_CLI` | `op` | Path to the `op` binary for the CLI backend |
| `NODETOOL_1PASSWORD_CACHE_TTL_SECONDS` | `300` | How long a read value stays in memory. A rotated item is picked up after this time. |
| `NODETOOL_1PASSWORD_USER_REFERENCES` | `true` on a local install, `false` on a shared deployment | Whether references stored by users in Settings or with `nodetool secrets set` are read |

Every reference is read with the server's 1Password credentials. On a shared deployment (`SUPABASE_URL` and `SUPABASE_KEY` set), a user who stored a reference could read any item the server's service account can see. NodeTool therefore ignores user-stored references there and reads only references in the server's environment. Set `NODETOOL_1PASSWORD_USER_REFERENCES=true` only when every user may read every item the service account can see.

A reference that cannot be read counts as an unset secret. The server log names the reference and the reason, never the value.

References resolve wherever NodeTool reads a stored secret. Variables the server reads directly from its environment, and `SECRETS_MASTER_KEY`, are not covered. To cover them, start the server under [`op run`](https://developer.1password.com/docs/cli/reference/commands/run/), which replaces every reference in the environment first:

```bash
op run --env-file=.env -- nodetool serve
```

## Supabase Settings

```bash
NODETOOL_STORAGE_BACKEND=supabase
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_KEY=<service-role-key>
ASSET_BUCKET=assets
TEMP_BUCKET=assets-temp
```

- Storage uses Supabase buckets only when `NODETOOL_STORAGE_BACKEND=supabase`. See [Storage](storage.md#supabase-storage).
- Sign-in switches to Supabase mode when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set. Storage and sign-in are configured independently. See [Authentication](authentication.md#authentication-modes).
- `NODE_SUPABASE_URL`, `NODE_SUPABASE_KEY`, `NODE_SUPABASE_SCHEMA` (default `public`), and `NODE_SUPABASE_TABLE_PREFIX` point user-provided nodes at a separate project, kept apart from the server's own credentials and tables.
- `SUPABASE_KEY` is a service role key. Keep it on the server.

The full walkthrough is [Supabase Deployment](supabase-deployment.md).

## Serving the Web UI and TLS

`STATIC_FOLDER` points at the directory holding the built web app's `index.html`. When it is unset or names a missing directory, the server serves only its API, and every other path answers `404`.

```bash
STATIC_FOLDER=/app/web/dist nodetool serve
```

When it is set, the server serves that directory at `/` and answers any other extension-less `GET` outside the API paths with `index.html`, so a reload on a client-side route works. The Docker image and the desktop app set it to their bundled copy.

TLS is on when both a certificate and a key resolve:

```bash
TLS_CERT=/etc/ssl/nodetool/cert.pem \
TLS_KEY=/etc/ssl/nodetool/key.pem \
REDIRECT_PORT=8080 \
nodetool serve --host 0.0.0.0 --port 8443
```

- A variable naming a missing path is ignored. The server then looks for `cert.pem` and `key.pem` in its working directory and up to five parent directories, so a stray pair beside the process turns TLS on with neither variable set.
- With TLS active, logged URLs use `https` / `wss`, and a plain HTTP listener on `REDIRECT_PORT` (default `80`) answers `301` to `https://<request Host>:<server port><path>`.
- Ports below 1024 need elevated privileges. When the server may not bind the redirect port, it logs that the redirect listener was skipped and keeps serving HTTPS.

Most deployments terminate TLS at a reverse proxy instead. See [Security Hardening](security-hardening.md#network-security).

## Python Nodes

Python nodes run in a worker process that the server starts and talks to over stdio. The server picks the interpreter in this order:

1. `NODETOOL_PYTHON`, an absolute path to the executable. Nothing else is tried, so a wrong path is a hard failure.
2. An active `CONDA_PREFIX` whose environment is named `nodetool` or `conda_env`, or whose path contains `nodetool/conda_env`.
3. The first of these that exists:
   - Windows: the desktop app's `nodetool\conda_env` under `%ALLUSERSPROFILE%` (or `%APPDATA%` when unset), then `envs\nodetool` under `Miniconda3`, `miniconda3`, `Anaconda3`, or `anaconda3` in your home folder, then `C:\ProgramData\nodetool\conda_env`.
   - macOS: `~/nodetool_env`, then `~/miniconda3/envs/nodetool` and `~/anaconda3/envs/nodetool`.
   - Linux: `~/.local/share/nodetool/conda_env`, `/opt/nodetool/conda_env`, then `~/miniconda3/envs/nodetool` and `~/anaconda3/envs/nodetool`.

With none available, the server logs `Python not found — Python nodes will not be available` at startup and runs everything else normally.

```bash
NODETOOL_PYTHON=/opt/conda/envs/nodetool/bin/python nodetool serve
```

The interpreter needs `nodetool-core` and the packs installed from PyPI. See [Python nodes without the desktop app](advanced-install.md#python-nodes-without-the-desktop-app).

- The worker starts with the server. With `NODETOOL_PYTHON_ON_DEMAND=true` it starts when a workflow first needs a Python node, and Python-only providers such as `huggingface-local` and MLX appear in model menus only after that. Settings has no field for it. Set it in the environment, or store it under the same name with the agent's `set_setting` tool. The server reads it at startup.
- Python nodes run on the device PyTorch finds: Apple Metal (MPS), then CUDA, then CPU. `NODETOOL_TORCH_DEVICE` overrides that with `cuda`, `cuda:<N>`, `mps`, or `cpu`. The worker reads it at start. Hardware limits are in [GPU requirements](advanced-install.md#gpu-requirements).
- With `NODETOOL_ENV=production` the server refuses to connect to a Python worker, and a workflow reaching a Python node fails with "Python bridge is disabled in production". `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1` overrides that. The published Docker image ships no Python worker, so also derive an image that installs `nodetool-core` and point `NODETOOL_PYTHON` at it. See [Self-hosted deployment](self-hosted-deployment.md#mcp-over-http-and-python-nodes).
- The three `NODETOOL_PYTHON_*_TIMEOUT_MS` variables bound how long the server waits on the worker. Raise `NODETOOL_PYTHON_EXECUTE_TIMEOUT_MS` past its 12-minute default for longer nodes.
- `NODETOOL_WORKER_NAMESPACES` limits which node namespaces the worker loads. Unset, it loads everything installed.

```bash
NODETOOL_PYTHON_ON_DEMAND=true NODETOOL_WORKER_NAMESPACES=nodetool.image nodetool serve
```

## Video Input on Vision Models

OpenAI-compatible chat APIs accept no video. When a video goes to such a model, the server samples the clip into still frames, labels each with its timestamp, and sends them with a header naming the frame count and sample rate. A provider that reads video natively (Gemini) gets the whole clip.

- `NODETOOL_VIDEO_FRAME_FALLBACK=0` turns sampling off, so such a request is refused again.
- `NODETOOL_VIDEO_FRAME_MAX_FRAMES` is frames per clip (default `16`).
- `NODETOOL_VIDEO_FRAME_MAX_FPS` caps the sample rate (default `1`). A clip too long for the frame budget to reach this rate is sampled more sparsely so the frames span the whole clip.
- `NODETOOL_VIDEO_FRAME_MAX_DIMENSION` is the longest edge of each frame in pixels (default `768`). Frames are never upscaled.

```bash
NODETOOL_VIDEO_FRAME_MAX_FRAMES=8 NODETOOL_VIDEO_FRAME_MAX_FPS=0.5 nodetool serve
```

## Reconnect Windows

A chat turn and a workflow run outlive the browser connection that started them. The server buffers each one's messages, so a client that reconnects gets what it missed. The protocol is in the [WebSocket API](websocket-api.md#resume_chat).

### Chat Turn Replay

- `NODETOOL_CHAT_DETACH_GRACE_MS`: a running turn with no attached client is aborted after this long when set to a positive integer. Disabled by default (`0`).
- `NODETOOL_CHAT_REPLAY_RETENTION_MS`: how long a finished turn is kept (default 5 minutes).
- `NODETOOL_CHAT_REPLAY_BUFFER_EVENTS`: messages buffered per turn (default 2000).
- `NODETOOL_CHAT_IDLE_TIMEOUT_MS`: how long a turn may go without producing anything before it is stopped (default 3 minutes). Time spent in a running tool does not count. The thread gets a note that says the model sent nothing and asks the user to send the message again or pick another model.

Zero or invalid values use the default. Assistant and tool messages are saved as they arrive, so an expired buffer loses only text that was still streaming.

### Job Run Replay

- `NODETOOL_JOB_DETACH_GRACE_MS`: a running job with no attached client is cancelled after this long (default 10 minutes), so an abandoned browser tab cannot keep a workflow spending provider budget.
- `NODETOOL_JOB_REPLAY_RETENTION_MS`: how long a finished run is kept (default 5 minutes).
- `NODETOOL_JOB_REPLAY_BUFFER_EVENTS`: messages buffered per run (default 2000).

```bash
NODETOOL_JOB_DETACH_GRACE_MS=1800000 nodetool serve
```

A value that is not a positive integer is ignored. The run's final status is saved in the database, so after the buffer expires a reconnecting client still gets the status, without the events.

These size one process's buffer. Routing a reconnect to the process that holds the run is covered in [Multi-instance deployments](websocket-api.md#multi-instance-deployments).

## Cross-instance resource changes

With PostgreSQL and a valid `NODETOOL_INSTANCE_ID` (or `FLY_MACHINE_ID`), each replica tells the others about changed workflows, assets and other resources over PostgreSQL LISTEN/NOTIFY. Without an instance id, PostgreSQL stays local. SQLite always delivers in memory and opens no listener connection.

- Set `DIRECT_URL` to a direct or session-mode connection to the **same database** as `DATABASE_URL`. When absent, the listener uses `DATABASE_URL`.
- When the listener cannot connect through `DIRECT_URL`, the server logs a warning and listens on `DATABASE_URL` unless that uses port 6543. A host without an IPv6 route cannot reach Supabase's direct endpoint, so point `DIRECT_URL` at the session-mode pooler there.
- Startup rejects port 6543, because transaction pooling cannot hold LISTEN subscriptions. Other transaction poolers need a direct or session-mode endpoint too.
- Budget one dedicated listener connection per replica on top of `DATABASE_POOL_MAX`.
- Run the `resource_change_outbox` migration before starting replicas. A notification larger than 7500 bytes is stored in that table, and a one-minute timer deletes rows older than a minute.

Delivery is best effort, not a durable event log. When a listener reconnects, each connected browser reloads its resource lists, as it does after its own reconnect.

## Hugging Face Tokens and Cache

Create a token at [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens). Each feature reads it from a different place.

| Feature | Token source |
|---|---|
| HuggingFace provider and `huggingface.*` nodes | The stored `HF_TOKEN` secret, then the `HF_TOKEN` environment variable. Paste it into the HuggingFace card in **Settings → Models & Providers**, or run `nodetool secrets store HF_TOKEN` |
| Model Manager downloads, local or to an attached worker | The stored `HF_TOKEN` secret, then the `HF_TOKEN`, `HF_API_TOKEN`, or `HUGGING_FACE_HUB_TOKEN` environment variable, then the token file from `hf auth login` (`$HF_TOKEN_PATH`, or `token` under `$HF_HOME`, default `~/.cache/huggingface/token`). The server sends the token to a worker, which has no token of its own |
| `nodetool models download-hf` | The environment variables, then the token file. The stored secret is not read |
| Hub search in the Model Manager | The `HF_TOKEN` or `HUGGING_FACE_HUB_TOKEN` environment variable, sent when set |
| Downloads a Python node starts while it runs | The stored `HF_TOKEN` when the node declares it, otherwise the worker's environment and token file |

A token pasted in Settings covers Model Manager downloads. A Python node that downloads on its own may not receive it. In that case set `HF_TOKEN` in the environment before starting NodeTool, or run `hf auth login`.

### Cache locations

Hub downloads use the standard Hugging Face hub cache, `~/.cache/huggingface/hub` by default. NodeTool resolves it the way the `huggingface_hub` library does: `HF_HUB_CACHE`, then `HUGGINGFACE_HUB_CACHE`, then `$HF_HOME/hub`, then `$XDG_CACHE_HOME/huggingface/hub`. Downloads, the **Installed** list, llama.cpp, whisper.cpp, and the Python worker all read the same directory. On Linux with `XDG_CACHE_HOME` set, as in the Flatpak build, the desktop app keeps using `~/.cache/huggingface/hub` when it already holds models. The full rule is under [`HF_HUB_CACHE`](environment-variables.md).

Transformers.js models download to `<data-dir>/transformers-js-cache`, or to `TRANSFORMERS_JS_CACHE_DIR` if set. This cache is separate from the Hugging Face hub cache. Ollama keeps its models in its own directory.

### Hub mirror

Where huggingface.co is unreachable, set `HF_ENDPOINT` to a mirror such as `https://hf-mirror.com`, in **Settings** under HF or in the environment. Model Manager downloads, Hub search, llama.cpp GGUF downloads, and Transformers.js model downloads then use that host, and your HF token is sent to it. The Settings value applies to downloads the server starts, `nodetool models list-hf` and `download-hf`, and Python node downloads. Transformers.js models fetched on first run, and Python nodes, read it when the server starts, so restart NodeTool after you change it. Inference Providers, sign-in, and the token check stay on huggingface.co.

## Agent Run Limits

An agent run (a chat turn, its sub-agents, and any agent node it starts) shares one budget. See [Costs and credits](costs-and-credits.md#limiting-spend) for how the limits behave.

| Setting | Default | What it bounds |
|---|---|---|
| `NODETOOL_AGENT_TURN_COST_CAP_USD` | 5.00 | Provider spend for the whole run, in US dollars. `0` means no cap. Clearing the value restores the default |
| `NODETOOL_AGENT_TURN_DEADLINE_MS` | 1800000 (30 minutes) | Wall-clock time for the run |
| `NODETOOL_AGENT_MAX_TURNS` | 200 | Model turns in total. This still holds for a local model with no price |
| `NODETOOL_AGENT_UNPRICED_TOKEN_CEILING` | 400000 | Prompt tokens for a turn on a model the catalog does not price |

The cost cap works as admission. A turn whose worst case would cross the cap is refused before the call, so the money is not spent first. A model without a catalog price has no worst case, so it is bounded by the token ceiling and counted as unpriced rather than free. On the command line, `--cost-cap <usd>` overrides the dollar cap for one run, and `0` lifts it, which suits a local-only install. See [Run budget](cli.md#run-budget) and the [Agent CLI](agent-cli.md).

## If it fails

- **Startup fails while initializing the master key**: the host has no keyring. Set `SECRETS_MASTER_KEY`.
- **Stored keys read as unset after a move or restore**: `SECRETS_MASTER_KEY` differs from the one that encrypted them. Restore the old key, or enter the secrets again.
- **`Python not found — Python nodes will not be available`**: set `NODETOOL_PYTHON` or install the conda environment. See [Python Nodes](#python-nodes).
- **"Python bridge is disabled in production"**: set `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1` and use an image with a Python worker.
- **Every non-API path answers `404`**: `STATIC_FOLDER` is unset or names a missing directory.

## Related

- [Environment Variables](environment-variables.md)
- [Authentication](authentication.md)
- [Storage](storage.md)
- [Self-Hosted Deployment](self-hosted-deployment.md)
- [Deployment Guide](deployment.md)
