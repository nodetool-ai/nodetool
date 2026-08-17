---
layout: page
title: "Configuration Guide"
description: "Configure NodeTool settings, environment variables, secrets, and storage backends."
---



NodeTool uses a layered configuration system so local development, automated deployments, and production environments can share sensible defaults with minimal duplication. Settings come from environment variables and `.env` files, while secrets are stored encrypted at rest in a local SQLite database (managed via the CLI).

The configuration helpers live in the `@nodetool-ai/config` package (`environment.ts`). They are plain functions — `loadEnvironment()`, `getEnv()`, and `requireEnv()` — there is no `Environment` class and no `settings.yaml`/`secrets.yaml` loading.

![Settings Dialog](assets/screenshots/settings-dialog.png)

## Configuration Layers

`loadEnvironment()` loads `.env` files in this order, with later files overriding earlier ones; **system environment variables always win** over file values:

1. `.env`
2. `.env.<NODE_ENV>`
3. `.env.<NODE_ENV>.local`

`NODE_ENV` defaults to `development` when unset. Use `getEnv("KEY")` to read a value (returns `undefined` when unset) and `requireEnv("KEY")` to read a value that must be present (throws a descriptive error otherwise).

This hierarchy allows committed defaults, per-environment overrides, and developer-specific overrides to co-exist without file conflicts.

## Managing Settings & Secrets

The in-app Settings dialog is the easiest way to manage everything. It has a sidebar with subsections:

| Section | What it covers |
|---------|---------------|
| **General** | Theme, startup behavior, language |
| **Providers** | API keys for OpenAI, Anthropic, Google, etc. |
| **Default Models** | Pick the default LLM, image model, and embedding model |
| **Folders** | Workspace, cache, and asset directories |
| **Secrets** | Encrypted provider tokens and credentials |
| **Remote** | Point the app at a remote NodeTool server |
| **About** | Version and build info |

![Settings Subviews](assets/screenshots/settings-api-keys.png)

From the command line:

- `nodetool settings show [--json]` – print the resolved environment configuration.
- `nodetool secrets list` – list stored secret keys (values are never shown).
- `nodetool secrets store <key>` – store or update a secret (prompts for the value).
- `nodetool secrets get <key>` – print a stored secret value.

Secrets are encrypted and persisted in a local SQLite database, not in YAML files. There is no `nodetool settings edit` command and no `--secrets` option.

## Secret Storage and Master Key

Secrets saved through the CLI are encrypted with AES-256-GCM, using a per-user key derived from the master key via PBKDF2-SHA256 (100,000 iterations). `initMasterKey()` in `@nodetool-ai/security` resolves the master key in this order:

1. `SECRETS_MASTER_KEY` environment variable.
2. Local system keyring (macOS Keychain, Windows Credential Manager, or Secret Service via keytar).
3. Generates a new key and persists it to the keyring.

For shared deployments you **must** pre-provision the master key (via the `SECRETS_MASTER_KEY` environment variable) so every server can decrypt secrets generated locally. On a headless host with no keychain and no provisioned key, master-key initialization (and therefore startup) fails because there is no place to persist a generated key.

### Migrating Secrets to a Server

1. Export the master key once and set it on every server instance using the value from your deployment pipeline or secrets manager:

   ```bash
   export SECRETS_MASTER_KEY="<your-base64-master-key>"
   ```

2. The `nodetool deploy apply` command automatically synchronizes all secrets from your local database to the target server right after a successful deploy. If you ever need to do it manually, POST the encrypted payload to the admin endpoint using the worker bearer token:

   ```bash
   curl -H "Authorization: Bearer $NODETOOL_WORKER_TOKEN" \
        -H "Content-Type: application/json" \
        -X POST https://your-server.example.com/admin/secrets/import \
        --data-binary @secrets-export.json
   ```

   The server stores the ciphertext verbatim, so both sides must share the same master key.

## Storage Backend Selection

The storage backend is selected explicitly by `NODETOOL_STORAGE_BACKEND` (one of `file`, `s3`, or `supabase`; defaults to `file`). It is **not** auto-detected from the presence of S3 or Supabase credentials.

- `file` (default) — assets are written to the local assets directory.
- `s3` — requires `ASSET_BUCKET` (and, for the temp store, `TEMP_BUCKET`); reads `S3_REGION` and `S3_ENDPOINT` as needed.
- `supabase` — requires `SUPABASE_URL`, `SUPABASE_KEY`, and the relevant bucket var.

The asset store uses `ASSET_BUCKET`; the temp store uses `TEMP_BUCKET`. See `storage-config.ts` in `@nodetool-ai/config`.

## Using Environment Variables in Code

When adding a feature that reads configuration:

1. Read the variable with `getEnv("YOUR_ENV_VAR")` from `@nodetool-ai/config` so `.env` load order is respected.
2. If the value is required, use `requireEnv("YOUR_ENV_VAR")` so a missing key raises a descriptive error.
3. Document the new entry in `.env.example`.

## Recommended Workflow

```bash
cp .env.example .env.development.local
vim .env.development.local           # add OpenAI/Anthropic/HF tokens, S3 credentials, etc.

nodetool secrets store OPENAI_API_KEY  # encrypt a provider key into the secrets DB (optional)
nodetool settings show               # verify resolved configuration
```

Use `.env.<env>.local` for machine-specific overrides and keep secrets out of version control. When deploying, provide environment variables via your orchestrator or the `deployment.yaml` `env` section—NodeTool will merge them automatically at runtime.

## Supabase Settings

NodeTool integrates with Supabase for both user authentication and asset storage.

Set the following to enable Supabase:

- `NODETOOL_STORAGE_BACKEND=supabase` – select the Supabase storage backend
- `SUPABASE_URL` – your project URL, e.g. `https://<ref>.supabase.co`
- `SUPABASE_KEY` – a service role key (server-side only)
- `ASSET_BUCKET` – Supabase Storage bucket used for assets (e.g. `assets`)
- `TEMP_BUCKET` – bucket for temporary assets (e.g. `assets-temp`)
- Use a separate Supabase for user-provided nodes:
  - `NODE_SUPABASE_URL` – user/node project URL (kept distinct from core `SUPABASE_URL`)
  - `NODE_SUPABASE_KEY` – service role key for user/node data (kept distinct from core `SUPABASE_KEY`)
  - `NODE_SUPABASE_SCHEMA` – optional schema for node tables (defaults to `public`)
  - `NODE_SUPABASE_TABLE_PREFIX` – optional prefix applied to node tables to avoid collisions with core tables

Behavior:

- Storage is used for Supabase buckets only when `NODETOOL_STORAGE_BACKEND=supabase`; the backend is chosen explicitly, not auto-detected from the presence of credentials.
- Authentication enters Supabase mode (enforced auth) when **both** `SUPABASE_URL` and `SUPABASE_KEY` are set — storage and auth are configured independently. See [Authentication](authentication.md#authentication-modes).

Security notes:

- Use the service role key only in server environments. Do not expose it to clients.
- Public buckets make generated URLs directly accessible. For private buckets, add a signing step.

## Python Nodes

Python nodes run in a separate worker process that NodeTool spawns and talks to
over stdio. The server picks the interpreter in this order:

1. `NODETOOL_PYTHON`, if set — an absolute path to the executable. Nothing else
   is tried, so a wrong path is a hard failure rather than a silent fallback.
2. An active `CONDA_PREFIX`, when the environment name looks like a NodeTool one.
3. NodeTool's own managed environment.

With none of them available the server logs `Python not found — Python nodes
will not be available` at startup and runs everything else normally.

```bash
NODETOOL_PYTHON=/opt/conda/envs/nodetool/bin/python nodetool serve
```

The bridge is a local-only feature: when `NODETOOL_ENV=production` it refuses to
connect, and a workflow reaching a Python node fails with "Python bridge is
disabled in production". Set `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION=1` to
override that on a host where you do want the worker.

The three `NODETOOL_PYTHON_*_TIMEOUT_MS` variables bound how long the server
waits on the worker. Raise `NODETOOL_PYTHON_EXECUTE_TIMEOUT_MS` past its
12-minute default for nodes that legitimately run longer.

`NODETOOL_WORKER_NAMESPACES` narrows which Python node namespaces the worker
loads. Its value is passed through unchanged as `--namespaces <value>` when the
worker is spawned, and the worker parses it; unset, the flag is not passed and
the worker loads everything installed.

```bash
NODETOOL_WORKER_NAMESPACES=nodetool.image nodetool serve
```

## Protocol Validation

Two settings schema-check messages in flight. Both accept `1`/`true` to force
validation on and `0`/`false` to force it off; unset, both default to **on**
under `NODE_ENV=test` or Vitest and **off** everywhere else — a malformed frame
should fail the test that produced it rather than throw mid-stream on a
production connection.

- `NODETOOL_VALIDATE_OUTBOUND_WS` — every server→client WebSocket frame whose
  `type` matches a known message schema is parsed against it before it goes on
  the wire. Frames with an unrecognized or absent `type` are left alone. A
  failure throws where the frame was sent.
- `NODETOOL_VALIDATE_BRIDGE_FRAMES` — the same check on frames arriving from the
  Python worker. A frame that fails is rejected with a structured, non-fatal
  error instead of being dispatched as malformed data.

Turn one on outside tests when you are chasing a protocol bug and want it to
surface at its source:

```bash
NODETOOL_VALIDATE_OUTBOUND_WS=1 nodetool serve
```

## JavaScript Sandbox Threading

The QuickJS sandbox behind Code nodes, CodeAct, and JS scripts runs on a worker
thread whenever it can. A CPU-bound guest blocks whichever thread runs it, and
on the server's main thread that freeze takes the event loop with it — including
the WebSocket `stop` frame that would have cancelled the run. On a worker,
cancelling is `terminate()`, immediate for a spinning guest and a parked one
alike.

Two settings change that choice:

- `NODETOOL_SANDBOX_INPROC=1` runs every guest on the calling thread. It is
  treated as a chosen fallback, so it warns about nothing.
- `NODETOOL_SANDBOX_WORKER=require` refuses to fall back at all. A run that
  cannot reach a worker fails with `the sandbox worker path is required
  (NODETOOL_SANDBOX_WORKER=require) but unavailable: <reason>` instead of
  running in-process.

Some runs stay in-process with no setting involved. A run that streams its
inputs does, because the synchronous `stream.open` probe is served from a
worker-local mirror that must be seeded with the handle names; those runs park
on takes and yield constantly, so the freeze the worker exists for cannot build
up. Globals that cannot be structured-cloned keep a run on this thread too. The
by-design cases are quiet; an environmental one warns once per process:

```
sandbox: running in-process (<reason>); a CPU-bound guest will block this thread until its timeout
```

```bash
NODETOOL_SANDBOX_INPROC=1 nodetool serve
```

## Development-Only Settings

Two settings exist for local development and are off unless set:

- `NODETOOL_ENABLE_TEST_TOPUP=1` allows the credits top-up mutation to mint
  credits with no payment behind it. Without it the mutation is refused. Minted
  credits unlock spend on platform-owned keys, so leave this unset on anything
  reachable by someone else.
- `NODETOOL_SEED_DEMO_COSTS=1` seeds ~90 days of plausible spend, plus the demo
  workflows whose names it references, so the Costs dashboard has something to
  show. The seed is idempotent — a marker row stops it re-running.

```bash
NODETOOL_SEED_DEMO_COSTS=1 nodetool serve
```

## Test Harness Settings

These configure the harnesses, not the server. `nodetool debug --browser` sets
the two `NODETOOL_DEBUG_*` variables below from its own flags; you set them by
hand only when driving the Playwright spec directly.

- `NODETOOL_DEBUG_STAGES` — `1` or `true` captures a canvas screenshot at every
  stage of the run into `stages/` under the output directory, up to 16
  intermediate frames plus the final one. This is what `nodetool debug
  --stages` turns on, and it is off otherwise because each frame costs a
  screenshot.
- `NODETOOL_DEBUG_TIMEOUT` — per-run timeout in milliseconds for the in-page
  run, which is how `nodetool debug --timeout` reaches the browser surface.
  Read as a positive integer; anything else is ignored. The spec waits 30s
  longer than the value, and never less than its 5-minute floor, so polling
  outlives the run it is watching.
- `NODETOOL_E2E_EXAMPLES_DIR` — the examples directory the e2e test server
  serves at `/api/examples`. A path that does not exist is ignored rather than
  fatal; the server then looks for
  `packages/base-nodes/nodetool/examples/nodetool-base` and `examples/workflows`
  under the repo root. The resolved path is printed in the server's readiness
  line.

The graph, output directory, and run params come from `NODETOOL_DEBUG_GRAPH`,
`NODETOOL_DEBUG_OUT`, and `NODETOOL_DEBUG_PARAMS`:

```bash
cd web
NODETOOL_DEBUG_GRAPH=/tmp/graph.json \
NODETOOL_DEBUG_OUT=/tmp/debug-out \
NODETOOL_DEBUG_STAGES=1 \
NODETOOL_DEBUG_TIMEOUT=120000 \
npm run test:debug-harness
```

The run writes `record.json`, `screenshot.png`, and — with stages on —
`stages/` and `stages.json` into the output directory. It also starts its own
hermetic backend on `127.0.0.1:7777`, so stop any server already on that port
first; the harness refuses to run against one rather than exercise a real
database with real providers.

### Hermetic providers

The user-journey suite (`web/tests/journeys`) sends chat messages and runs whole
workflows with no API keys and no network. `NODETOOL_FAKE_PROVIDERS=1` puts the
suite's backend (`screenshot-server.ts`) in hermetic mode: every registered LLM
provider is re-registered as a deterministic fake, and external or
media-generating nodes — fal, Replicate, search, HTTP, image/video/audio
generation — resolve to an executor that returns type-correct placeholder
outputs derived from the node's output metadata. Structural nodes
(input/output/control) and pure-compute nodes (text, data, math) still run for
real, so the assertions mean something. Every faked LLM call returns the string
`deterministic e2e response`.

`npm run test:journeys` sets the variable itself — `tests/journeys/globalSetup.ts`
does `process.env.NODETOOL_FAKE_PROVIDERS ??= "1"`. Set it by hand only when
starting that backend yourself. The screenshot and visual suites leave it off,
because they only render pages and never run a node.

- `NODETOOL_FAKE_DEBUG=1` logs each node's REAL/FAKE resolution to stderr, which
  is how you find out why a node you expected to be faked ran for real.
- `NODETOOL_ENABLE_FAKE_PROVIDER=1` registers the separate `fake` provider id as
  a builtin, so a workflow can select it the way it selects any other provider.
  Ignored when `NODETOOL_ENV=production`.

```bash
NODETOOL_FAKE_PROVIDERS=1 NODETOOL_FAKE_DEBUG=1 npm run test:journeys
```

## Chat Turn Replay

A chat or agent turn outlives the WebSocket connection that started it. Every
frame the turn emits is stamped with an increasing `chat_seq` and appended to a
bounded buffer; a client that reconnects sends
`{command: "resume_chat", data: {thread_id, last_seq}}` and gets the missed tail
replayed. Three variables size that machinery:

- `NODETOOL_CHAT_DETACH_GRACE_MS` — a running turn nobody is attached to is
  aborted after this long (default 10 minutes).
- `NODETOOL_CHAT_REPLAY_RETENTION_MS` — a finished turn is kept this long so a
  client reconnecting just after it ended still gets the tail (default 5
  minutes).
- `NODETOOL_CHAT_REPLAY_BUFFER_EVENTS` — frames buffered per turn (default
  2000).

Each is read as a positive integer; a value that is not one is ignored and the
default used. Assistant and tool messages are persisted independently of the
buffer, so an expired or truncated replay costs only unpersisted stream chunks —
the client refetches thread history over REST.

## Job Run Replay

A workflow run outlives the WebSocket connection that started it, the same way
a chat turn does. Every frame the run emits is stamped with an increasing
`job_seq` and appended to a bounded buffer; a client that reconnects sends
`{command: "reconnect_job", data: {job_id, last_seq}}` and gets the missed tail
replayed, followed by live frames if the run is still going. Three variables
size that machinery:

- `NODETOOL_JOB_DETACH_GRACE_MS` — a running job nobody is attached to is
  cancelled after this long (default 10 minutes), so an abandoned client cannot
  leave a workflow burning provider spend forever.
- `NODETOOL_JOB_REPLAY_RETENTION_MS` — a finished session is kept this long so a
  client reconnecting just after the run ended still gets the tail (default 5
  minutes).
- `NODETOOL_JOB_REPLAY_BUFFER_EVENTS` — frames buffered per run (default 2000).

```bash
NODETOOL_JOB_DETACH_GRACE_MS=1800000 nodetool serve
```

Each is read as a positive integer; a value that is not one is ignored and the
default used. Terminal state is persisted to the `jobs` table independently of
the buffer, so an expired or truncated replay degrades to `reconnect_job`'s
persisted-row fallback — the run's real status, just without its events.

These size one process's buffer. Getting a reconnect to the process that *holds*
the run is a separate concern; see
[Multi-instance deployments](websocket-api.md#multi-instance-deployments).

## Environment Variables Index

![API Settings](assets/screenshots/settings-api-keys.png)

| Variable | Purpose | Secret | Notes |
|----------|---------|--------|-------|
| `NODE_ENV` | Environment name (`development`, `test`, `production`) | no | Defaults to `development`; controls `.env` file load order |
| `SUPABASE_URL` / `SUPABASE_KEY` | Enable Supabase auth mode (both required) | `SUPABASE_KEY` | When both are set, the server enforces auth and validates Supabase JWTs. See [Authentication](authentication.md#authentication-modes) |
| `SERVER_AUTH_TOKEN` | Deploy-tooling bearer token (`@nodetool-ai/deploy`) | yes | Generated automatically if unset; not used by the websocket server's auth mode selection |
| `NODETOOL_TRUST_LOCALHOST` | Allow loopback connections to bypass auth as user `1` | no | Defaults **off** when auth is enforced (Supabase), **on** otherwise. Leave off behind a reverse proxy/SSH tunnel where the proxy connects from loopback. |
| `NODETOOL_TRUST_LOCAL_NETWORKS` | ⚠️ Source CIDRs trusted as user `1` **without a password** (Local mode only) | no | Comma-separated IPs/CIDRs; ignored in Supabase mode. Needed so Docker's NAT'd bridge traffic isn't rejected — scope to the bridge (`172.16.0.0/12`), **never `0.0.0.0/0`** on a public IP. See [Authentication → Local mode in Docker](authentication.md#local-mode-in-docker). |
| `NODETOOL_TRUSTED_PROXIES` | Reverse proxies whose `X-Forwarded-For` is trusted | no | Comma-separated IPs/CIDRs. When unset, `X-Forwarded-For` is ignored and the socket peer address is used. |
| `NODETOOL_LOCAL_FILE_ROOTS` | Directories the file browser and local-file previews may read | no | Platform-delimited (`:` on POSIX, `;` on Windows), `~` expands. Defaults to the user's home directory. Both surfaces are disabled entirely when `NODETOOL_ENV=production`. See [Security hardening](security-hardening.md#local-file-access). |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Provider access | yes | Set only the providers you use |
| `HF_TOKEN` / `FAL_API_KEY` / `REPLICATE_API_TOKEN` | HuggingFace-family providers | yes | Optional per workflow |
| `OLLAMA_API_URL` | Local Ollama base URL | no | Default `http://127.0.0.1:11434` |
| `NODETOOL_GOOGLE_WORKSPACE` | Force the Google Workspace integration (Drive, Gmail, Docs, Sheets, Calendar) on or off | no | `1`/`true` on, `0`/`false` off. Unset follows Supabase auth mode — those nodes sign in with the token a Google login returns, so a local install with no login hides them instead of offering an integration that can only error. Set `1` on a local server pointed at a hosted Supabase project |
| `DB_PATH` / `DATABASE_URL` | Database connection | no | Set only one. `DB_PATH` configures SQLite; `DATABASE_URL` supports PostgreSQL (`postgres://`, `postgresql://`) and SQLite (`file:`, `sqlite:`) |
| `NODETOOL_STORAGE_BACKEND` | Storage backend (`file`, `s3`, `supabase`) | no | Default `file`. Selected explicitly — not auto-detected from credentials |
| `S3_*` | S3-compatible storage settings | yes | Includes access keys and region |
| `ASSET_BUCKET` / `TEMP_BUCKET` | Asset and temp buckets (s3 / supabase backends) | no | Use signed URLs for private buckets |
| `NODETOOL_VECTOR_PROVIDER` / `VECTORSTORE_DB_PATH` | Vector store config | no | Default backend is local SQLite-vec; switch to `pinecone` or `supabase` for remote. See [Indexing](indexing.md). |
| `NODE_SUPABASE_URL` / `NODE_SUPABASE_KEY` / `NODE_SUPABASE_SCHEMA` / `NODE_SUPABASE_TABLE_PREFIX` | User/node Supabase config | `NODE_SUPABASE_KEY` | Kept separate from core Supabase credentials and tables |
| `NODETOOL_RATE_LIMIT_DISABLED` | Disable per-IP HTTP rate limiting | no | Limiter is **on** by default; localhost is always exempt |
| `NODETOOL_RATE_LIMIT_MAX` | Max HTTP requests per window per IP | no | Default `1000` |
| `NODETOOL_RATE_LIMIT_WINDOW_MS` | Rate-limit window length (ms) | no | Default `60000` (1 minute) |
| `NODETOOL_RATE_LIMIT_TRUST_PROXY` | Key the limiter by `X-Forwarded-For` (`req.ip`) instead of the socket address | no | Enable **only** behind a trusted proxy that sets the header |
| `NODETOOL_WS_RATE_LIMIT_DISABLED` | Disable the per-connection WebSocket inbound message cap | no | Cap is **on** by default |
| `NODETOOL_WS_RATE_LIMIT_MAX` | Max inbound WS messages per window per connection | no | Default `200`; over-cap clients are closed with code `1008` |
| `NODETOOL_WS_RATE_LIMIT_WINDOW_MS` | WebSocket rate-limit window length (ms) | no | Default `1000` (1 second) |
| `NODETOOL_WS_HEALTH_DISABLED` | Disable the per-connection ping / idle-timeout watchdog | no | Watchdog is **on** by default; it terminates half-open peers that never sent a close frame |
| `NODETOOL_WS_PING_INTERVAL_MS` | How often each WebSocket peer is pinged | no | Default `20000` |
| `NODETOOL_WS_IDLE_TIMEOUT_MS` | Peer silence before the connection is terminated | no | Default `70000`; keep above the client's own 45s liveness threshold |
| `NODETOOL_WS_MAX_BUFFERED_BYTES` | Outbound buffer per connection before sends wait for drain | no | Default `8388608` (8 MiB) |
| `NODETOOL_WS_DRAIN_TIMEOUT_MS` | How long a send waits for a slow reader before it is dropped | no | Default `30000`; the drop uses code `1001` so clients reconnect |
| `NODETOOL_WS_MAX_QUEUED_FRAMES` | Undelivered inbound frames per connection before it is closed | no | Default `2000`; closes with code `1008` |
| `NODETOOL_WS_MAX_MESSAGE_BYTES` | Largest inbound WebSocket frame accepted before it is deserialized | no | Default `268435456` (256 MiB). MsgPack can expand a small frame into a huge structure, so the raw byte length is checked first. A non-numeric or non-positive value falls back to the default rather than turning the cap off |
| `NODETOOL_MAX_UPLOAD_BYTES` | Largest payload a single storage upload may write | no | Default `1073741824` (1 GiB). Applies to every backend (file, S3, Supabase); an over-size write throws instead of reaching the backend. Same strict parsing as the frame cap |
| `NODETOOL_PACKAGE_REGISTRY_URL` | Index the node-pack browser reads available packs from | no | Default `https://raw.githubusercontent.com/nodetool-ai/nodetool-registry/main/index.json`. Point it at your own index to offer an internal pack list. See [Node Packs](node-packs.md) |
| `NODETOOL_DISABLE_TRIGGERS` | Skip trigger ingestion on this process (no dispatcher, scheduler, file watcher, or webhook route) | no | Ingestion is **on** by default. Set to `1` when a second server shares one database, or for an embedded server that must not start background work |
| `NODETOOL_EXTENSION_DIST` | Directory holding the built Chrome extension served by `/api/extension/download` | no | Set by the desktop app to its bundled copy. When unset (or pointing at a directory with no `manifest.json`), the server walks up from its own directory and the working directory looking for `chrome-extension/dist`. See [Chrome Extension](chrome-extension.md#downloading-a-prebuilt-copy) |
| `NODETOOL_ENABLE_EXTENSION_BRIDGE` | Keep the `/ws/extension` CDP bridge open when `NODETOOL_ENV=production` | no | Off in production unless set to exactly `1`; on everywhere else. The bridge is unauthenticated and single-connection — whoever connects becomes *the* extension socket and can proxy CDP through the server — so enable it only on a deployment that actually drives the browser extension. When disabled the server logs that at startup and the route is not registered |
| `NODETOOL_SHIPPED_PACKS_DIR` | Roots the sandbox packs that ship with NodeTool are read from | no | Comma-, semicolon-, or `PATH`-separator-delimited, same as `NODETOOL_PACK_SEARCH_PATHS`. Candidates that do not exist are dropped, so a bad path yields no packs rather than an error. Unset, the loader looks for `_sandbox/` beside the bundled `server.mjs` (packaged desktop app, Docker image), then walks up to `packages/sandbox-packs` (a checkout). Set it only for a host that stages the packs somewhere else. See [Sandbox package design](sandbox-package-design.md) |
| `NODETOOL_SANDBOX_INPROC` | Run every QuickJS guest on the calling thread instead of a worker | no | `1` only. A chosen fallback, so it warns about nothing. A CPU-bound guest then blocks the thread — on the server's main thread that freezes the event loop, including the frame that would have cancelled the run. See [JavaScript sandbox threading](#javascript-sandbox-threading) |
| `NODETOOL_SANDBOX_WORKER` | Require the sandbox worker path | no | `require` only. A run that cannot reach a worker fails with `the sandbox worker path is required (NODETOOL_SANDBOX_WORKER=require) but unavailable: <reason>` rather than falling back in-process. Runs that stream their inputs never reach a worker, so this fails them |
| `NODETOOL_GPU_VALIDATE` | Escape hatch for the WGSL linearity validator | no | `off` disables it. The validator rejects a shader module whose WGSL contradicts its declared premultiplied-alpha contract, at module load. Use it to ship a hotfix while the shader is corrected, not as a standing setting; read once per process |
| `NODETOOL_GPU_DEBUG` | Comma-separated GPU debug passes to enable | no | `premul` scans every premultiplied output texture after dispatch and logs texels that break the invariant (`rgb ≤ a`, `rgb ≥ 0`, no NaN): `NODETOOL_GPU_DEBUG=premul`. Off by default and zero cost when off — the pass is never encoded. Read once per process |
| `NODETOOL_CACHE_DIR` | Per-user cache root for derived artifacts NodeTool can always rebuild | no | Everything under it is safe to delete — it is deliberately separate from the data directory. Unset, it is `%LOCALAPPDATA%\nodetool\cache` on Windows and `$XDG_CACHE_HOME/nodetool` (falling back to `~/.cache/nodetool`) elsewhere. The compiled sandbox guest modules live in `sandbox-modules/` under it, cached by content digest; see [Sandbox package design](sandbox-package-design.md) |
| `NODETOOL_PACKAGE_ASSETS_DIR` | Directory `package://<pkg>/<file>` refs are resolved from on disk | no | Set by the server at startup to the first package-assets root it finds, so in-process workflow execution reads the bytes directly instead of an HTTP round-trip to its own `/api/assets/packages/…` route. Set it yourself only when embedding the runtime with no server in the process. Refs are confined to the root — a path escaping it is refused |
| `NODETOOL_BASE_EXAMPLES_DIR` | Directory the shipped example workflows are read from | no | Overrides detection when it exists on disk; a path that does not exist is ignored rather than fatal. Unset, the server looks beside its own entry point (the packaged layout), then at `packages/base-nodes/nodetool/examples/nodetool-base` (the monorepo layout). With none found it logs `Examples directory not found` and template workflows are unavailable. The resolved path is logged at startup |
| `NODETOOL_PYTHON` | Python interpreter the Python bridge spawns | no | An absolute path to the executable. When unset, an active `CONDA_PREFIX` that looks like a NodeTool env is tried, then NodeTool's own managed env. See [Python Nodes](#python-nodes) |
| `NODETOOL_ALLOW_PYTHON_BRIDGE_IN_PRODUCTION` | Let the Python bridge connect when `NODETOOL_ENV=production` | no | Off unless set to exactly `1`. Otherwise a production server refuses to spawn the worker: Python nodes are a local-only feature |
| `NODETOOL_PYTHON_EXECUTE_TIMEOUT_MS` | How long one Python node invocation may run | no | Default `720000` (12 minutes) |
| `NODETOOL_PYTHON_STATUS_TIMEOUT_MS` | How long a worker status request waits | no | Default `30000` |
| `NODETOOL_PYTHON_DOWNLOAD_IDLE_TIMEOUT_MS` | Silence from a worker-side model download before it is abandoned | no | Default `300000` (5 minutes). Idle time, not total — a slow download that keeps reporting progress is not cut off |
| `NODETOOL_WORKER_NAMESPACES` | Narrow which Python node namespaces the worker loads | no | Passed through unchanged as `--namespaces <value>`. Unset, the flag is not passed and the worker loads everything installed. See [Python Nodes](#python-nodes) |
| `NODETOOL_VALIDATE_OUTBOUND_WS` | Schema-check every server→client WebSocket frame before sending | no | `1`/`true` on, `0`/`false` off. Unset, on under `NODE_ENV=test`/Vitest and off elsewhere. See [Protocol validation](#protocol-validation) |
| `NODETOOL_VALIDATE_BRIDGE_FRAMES` | Schema-check every frame arriving from the Python worker | no | Same values and default as `NODETOOL_VALIDATE_OUTBOUND_WS`. A failing frame is rejected, not dispatched |
| `NODETOOL_ENABLE_TEST_TOPUP` | Allow the credits top-up that mints credits with no payment | no | `1`/`true` only; off otherwise and the mutation is refused. Development servers only. See [Development-only settings](#development-only-settings) |
| `NODETOOL_SEED_DEMO_COSTS` | Seed demo spend for the Costs dashboard at startup | no | `1` only. Idempotent — a marker row stops it re-running |
| `NODETOOL_DEBUG_STAGES` | Capture a canvas screenshot at every stage of a browser debug run | no | `1` or `true`. Set by `nodetool debug --stages`; off otherwise. Up to 16 intermediate frames land in `stages/` under the output directory. See [Test harness settings](#test-harness-settings) |
| `NODETOOL_DEBUG_TIMEOUT` | Per-run timeout (ms) for the in-page run of the browser debug harness | no | How `nodetool debug --timeout` reaches the browser surface. Read as a positive integer; anything else is ignored and the harness's 5-minute floor applies |
| `NODETOOL_E2E_EXAMPLES_DIR` | Examples directory the e2e test server serves at `/api/examples` | no | A path that does not exist is ignored; the server then tries `packages/base-nodes/nodetool/examples/nodetool-base` and `examples/workflows` under the repo root |
| `NODETOOL_FAKE_PROVIDERS` | Run the user-journey backend hermetically — every LLM provider and every external/media node is a deterministic fake | no | `1` only. `npm run test:journeys` sets it itself; the screenshot and visual suites leave it off. Structural and pure-compute nodes still run for real. See [Hermetic providers](#hermetic-providers) |
| `NODETOOL_FAKE_DEBUG` | Log each node's REAL/FAKE resolution in hermetic mode | no | `1` only, written to stderr. Use it when a node you expected to be faked ran for real |
| `NODETOOL_ENABLE_FAKE_PROVIDER` | Register the `fake` provider id as a builtin, so a workflow can select it | no | `1` only, and ignored when `NODETOOL_ENV=production`. Separate from `NODETOOL_FAKE_PROVIDERS`, which fakes the providers that are already registered |
| `NODETOOL_PACK_SEARCH_PATHS` | Extra `node_modules` directories to load node packs from | no | Comma-, semicolon-, or `PATH`-separator-delimited (`:` is not a separator on Windows, so drive letters survive). Paths that do not exist are dropped. Searched before the walk up from the working directory. See [Node Packs](node-packs.md) |
| `NODETOOL_OPTIONAL_NODE_MODULES` | A single extra `node_modules` directory for pack loading | no | The one-path form of `NODETOOL_PACK_SEARCH_PATHS`; both are read, and the desktop app uses this to point the loader at its bundled install root |
| `NODETOOL_PACKS_REQUIRE_ALLOWLIST` | Default `allowUnlisted` to false without production mode | no | `1` only. Same trust default `NODETOOL_ENV=production` gives, without disabling the local-only features production mode turns off. The packaged desktop app sets it — its optional-node directory holds user-installed code, but it needs the Python bridge, file browser, and the rest of the local surface. An explicit `allowUnlisted` in `packs.json` still wins |
| `NODETOOL_CHAT_DETACH_GRACE_MS` | How long a running chat turn survives with no client attached | no | Default `600000` (10 minutes), then the turn is aborted so an abandoned client cannot leave an agent working forever. See [Chat turn replay](#chat-turn-replay) |
| `NODETOOL_CHAT_REPLAY_RETENTION_MS` | How long a finished turn is kept for a late reconnect | no | Default `300000` (5 minutes) |
| `NODETOOL_CHAT_REPLAY_BUFFER_EVENTS` | Frames buffered per turn for replay | no | Default `2000`. A client whose `last_seq` predates the buffer is told the replay is incomplete and refetches thread history over REST |
| `NODETOOL_JOB_DETACH_GRACE_MS` | How long a running workflow job survives with no client attached | no | Default `600000` (10 minutes), then the run is cancelled so an abandoned client cannot leave a workflow spending forever. See [Job run replay](#job-run-replay) |
| `NODETOOL_JOB_REPLAY_RETENTION_MS` | How long a finished run is kept for a late reconnect | no | Default `300000` (5 minutes) |
| `NODETOOL_JOB_REPLAY_BUFFER_EVENTS` | Frames buffered per run for replay | no | Default `2000`. Beyond the buffer, `reconnect_job` falls back to the persisted `jobs` row — the run's status without its events |
| `LOG_LEVEL` / `NODETOOL_LOG_LEVEL` | Logging level | no | Defaults to `info` (`NODETOOL_LOG_LEVEL` takes precedence) |
| `SECRETS_MASTER_KEY` | Master key for secret encryption | yes | See [Secret Storage and Master Key](#secret-storage-and-master-key) |
| `RUNPOD_API_KEY` | RunPod deployments | yes | Used by CLI and providers |
| `NODETOOL_CONTAINER_RUNTIME` | Container runtime the self-hosted deploy tooling drives | no | `docker` or `podman`; any other value is ignored. Unset, a local target probes for `docker` then `podman` and falls back to `docker`, and a remote target resolves the same way in the shell it runs. Set `NODETOOL_CONTAINER_RUNTIME=podman` on a host with both installed. See [Deployment](deployment.md) |
| `NODETOOL_WORKER_TOKEN` | Worker bearer token for admin endpoints | yes | Rotate regularly |
| `NODETOOL_ADMIN_TOKEN` | Admin bearer token the `nodetool deploy` user and database subcommands send to a remote deployment | yes | Equivalent to their `--token` flag, which wins when both are set. Without either, an interactive shell prompts for it and a non-interactive one exits `1`. See [Deployment](deployment.md) |

Use `nodetool settings show` to view resolved values and verify the merge order.

## Related Documentation

- [Storage Guide](storage.md) – how asset storage backends are selected.  
- [Deployment Guide](deployment.md) – passing environment variables in `deployment.yaml`.  
- [CLI Reference](cli.md) – settings-related commands.
