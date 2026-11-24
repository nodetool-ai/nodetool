---
layout: page
title: "Configuration in Code"
description: "How NodeTool code reads configuration, settings and secrets, plus the variables that only matter when developing, testing or building NodeTool."
---

```ts
import { loadEnvironment, getEnv, requireEnv } from "@nodetool-ai/config";

loadEnvironment();                        // .env, .env.<NODE_ENV>, .env.<NODE_ENV>.local
const url = getEnv("OLLAMA_API_URL");     // undefined when unset
const bucket = requireEnv("ASSET_BUCKET"); // throws a descriptive error when unset
```

This page is for people working on NodeTool's code. Operators configure a server through [Server Configuration](../server-configuration.md) and [Environment Variables](../environment-variables.md). Users change settings in the app, see [Settings](../configuration.md).

## Reading configuration

The helpers live in `@nodetool-ai/config` (`packages/config/src/environment.ts`). `loadEnvironment()` loads `.env`, then `.env.<NODE_ENV>`, then `.env.<NODE_ENV>.local`, later files overriding earlier ones. System environment variables always win over file values. There is no `Environment` class and no `settings.yaml` or `secrets.yaml`.

New code that reads configuration uses these helpers, and every new variable gets a line in `.env.example` and a row in [Environment Variables](../environment-variables.md), or in [Build and test variables](#build-and-test-variables) when only development reads it.

## Settings

Stored settings are defined in `packages/config/src/setting-catalog.ts`. A setting read through the server checks the database first, then the environment variable of the same name (`getSetting` in `packages/websocket/src/settings-registry.ts`).

The catalog lists `AUTOSAVE_ENABLED`, `AUTOSAVE_INTERVAL_MINUTES`, `AUTOSAVE_MIN_INTERVAL_SECONDS`, `AUTOSAVE_MAX_VERSIONS_PER_WORKFLOW`, and `AUTOSAVE_KEEP_DAYS`, but no server code reads them. The **Autosave & version history** section of Settings writes client-side settings, so setting these variables has no effect.

## Secrets

Secrets are encrypted with AES-256-GCM. The per-user key derives from the master key through PBKDF2-SHA256 (100,000 iterations). `initMasterKey()` in `@nodetool-ai/security` resolves the master key from `SECRETS_MASTER_KEY`, then the system keyring through `keytar`, then generates one and saves it to the keyring.

Read a secret through `getSecret()` or `Secret.getResolvedValue()` in `@nodetool-ai/models`. Those resolve [1Password references](../configuration.md#1password-secret-references). Code that reads `process.env` directly does not.

## Deploy token helpers

`@nodetool-ai/auth` defines the abstract `AuthProvider` base class (header and WebSocket token extraction, `verifyToken`), plus the `AuthResult` and `TokenType` types.

`@nodetool-ai/deploy` ships static-token helpers in `packages/deploy/src/auth.ts`:

```ts
function getServerAuthToken(): string;   // SERVER_AUTH_TOKEN env, then deployment.yaml, then generate and save
function getTokenSource(): "environment" | "config" | "generated";
function generateSecureToken(): string;  // crypto.randomBytes(32).toString("base64url")
function verifyServerToken(auth: string): Promise<"authenticated">;  // timing-safe compare
function loadAuthConfig(): Record<string, unknown>;
function saveAuthConfig(config: Record<string, unknown>): void;  // file mode 0600
```

The token is stored as `server_auth_token` in `~/.config/nodetool/deployment.yaml`. The deploy tooling passes it to the container as `SERVER_AUTH_TOKEN`, which the server accepts in Local mode only (`packages/websocket/src/lib/server-auth-token.ts`). See [Authentication](../authentication.md#authentication-modes).

## Protocol Validation

Two settings schema-check messages in flight. Both accept `1`/`true` to force validation on and `0`/`false` to force it off. Unset, both are **on** under `NODE_ENV=test` or Vitest and **off** elsewhere.

- `NODETOOL_VALIDATE_OUTBOUND_WS` parses every server→client WebSocket frame whose `type` matches a known schema before it is sent. Frames with an unrecognized or absent `type` are left alone. A failure throws where the frame was sent.
- `NODETOOL_VALIDATE_BRIDGE_FRAMES` applies the same check to frames from the Python worker. A failing frame is rejected with a structured, non-fatal error instead of being dispatched.

```bash
NODETOOL_VALIDATE_OUTBOUND_WS=1 nodetool serve
```

## JavaScript Sandbox Threading

The QuickJS sandbox behind Code nodes, CodeAct, and JS scripts runs on a worker thread whenever it can. A CPU-bound guest blocks the thread that runs it. On the server's main thread that freezes the event loop, including the WebSocket `stop` frame that would cancel the run. On a worker, cancelling is `terminate()`.

- `NODETOOL_SANDBOX_INPROC=1` runs every guest on the calling thread, with no warning.
- `NODETOOL_SANDBOX_WORKER=require` refuses to fall back. A run that cannot reach a worker fails with `the sandbox worker path is required (NODETOOL_SANDBOX_WORKER=require) but unavailable: <reason>`.

Runs that stream their inputs stay in-process, because the synchronous `stream.open` probe is served from a worker-local mirror seeded with the handle names. Globals that cannot be structured-cloned also keep a run on this thread. Environmental fallbacks warn once per process:

```
sandbox: running in-process (<reason>); a CPU-bound guest will block this thread until its timeout
```

## Development-Only Settings

- `NODETOOL_ENABLE_TEST_TOPUP=1` lets the credits top-up mutation mint credits with no payment. Without it the mutation is refused. Minted credits unlock spend on platform-owned keys, so leave it unset on anything reachable by someone else.
- `NODETOOL_SEED_DEMO_COSTS=1` seeds about 90 days of spend, plus the demo workflows it references, for the Costs dashboard. A marker row makes the seed idempotent.

```bash
NODETOOL_SEED_DEMO_COSTS=1 nodetool serve
```

## Test Harness Settings

These configure the harnesses, not the server. `nodetool debug --browser` sets the two `NODETOOL_DEBUG_*` variables from its own flags. Set them by hand only when driving the Playwright spec directly.

- `NODETOOL_DEBUG_STAGES`: `1` or `true` captures a canvas screenshot at every stage into `stages/` under the output directory, up to 16 intermediate frames plus the final one. It is what `nodetool debug --stages` turns on.
- `NODETOOL_DEBUG_TIMEOUT`: per-run timeout in milliseconds for the in-page run (`nodetool debug --timeout`). Non-positive-integer values are ignored. The spec waits 30s longer than the value, never less than its 5-minute floor.
- `NODETOOL_E2E_EXAMPLES_DIR`: examples directory the e2e test server serves at `/api/examples`. A missing path is ignored. The server then looks for `packages/base-nodes/nodetool/examples/nodetool-base` and `examples/workflows` under the repo root, and prints the resolved path in its readiness line.
- `NODETOOL_TEST_CHROME`: the Chrome binary the `packages/browser` integration suite drives. Branded Google Chrome ignores `--load-extension`, so the suite needs Chrome for Testing. `test:integration` installs one under `<repo>/chrome`. Point this at an existing binary to skip the download. `CHROME_PATH` is the fallback, and a missing path is ignored.
- `NODETOOL_QA_STATE`: read by the test-suite backend (`screenshot-server.ts`) only. `empty` starts with no workflows, threads, assets, or secrets. `failing-run` adds one workflow that fails until fixed. `other-provider` adds one workflow whose model needs an Anthropic key, so its run fails at the credential check. Any other value seeds the usual demo data. The `agentic-qa` skill uses it.

```bash
cd web
NODETOOL_DEBUG_GRAPH=/tmp/graph.json \
NODETOOL_DEBUG_OUT=/tmp/debug-out \
NODETOOL_DEBUG_STAGES=1 \
NODETOOL_DEBUG_TIMEOUT=120000 \
npm run test:debug-harness
```

The run writes `record.json`, `screenshot.png`, and with stages on, `stages/` and `stages.json` into the output directory. It starts its own hermetic backend on `127.0.0.1:7777`. Stop any server on that port first, because the harness refuses to run against one.

### Hermetic providers

The user-journey suite (`web/tests/journeys`) runs with no API keys and no network. `NODETOOL_FAKE_PROVIDERS=1` puts the suite's backend (`screenshot-server.ts`) in hermetic mode. Every registered LLM provider is re-registered as a deterministic fake, and external or media-generating nodes (fal, Replicate, search, HTTP, image, video, audio) return type-correct placeholder outputs derived from the node's output metadata. Structural and pure-compute nodes still run for real. Every faked LLM call returns `deterministic e2e response`.

`npm run test:journeys` sets the variable itself (`tests/journeys/globalSetup.ts` does `process.env.NODETOOL_FAKE_PROVIDERS ??= "1"`). The screenshot and visual suites leave it off.

- `NODETOOL_FAKE_DEBUG=1` logs each node's REAL/FAKE resolution to stderr.
- `NODETOOL_REAL_PROVIDERS` lists provider ids, comma-separated, that stay real while the rest are faked. Ids are trimmed and empty entries dropped. It has no effect unless `NODETOOL_FAKE_PROVIDERS=1`.
- `NODETOOL_ENABLE_FAKE_PROVIDER=1` registers the separate `fake` provider id as a builtin. Ignored when `NODETOOL_ENV=production`.

```bash
cd web
NODETOOL_FAKE_PROVIDERS=1 NODETOOL_FAKE_DEBUG=1 npm run test:journeys
```

## Backend Bundle Targeting

These configure the build, not the server. The packaged Electron backend is one bundled `server.mjs` plus a flat `_modules/` directory staged by [`scripts/bundle-backend.mjs`](https://github.com/nodetool-ai/nodetool/blob/main/scripts/bundle-backend.mjs). Staging prunes dependencies that ship prebuilt binaries for every OS and architecture down to one target.

- `NODETOOL_BUNDLE_PLATFORM`: platform to keep prebuilds for. Defaults to `process.platform` (`darwin`, `linux`, `win32`).
- `NODETOOL_BUNDLE_ARCH`: architecture to keep prebuilds for. Defaults to `process.arch` (`x64`, `arm64`).

Set both only when cross-building.

```bash
NODETOOL_BUNDLE_PLATFORM=win32 NODETOOL_BUNDLE_ARCH=x64 node scripts/bundle-backend.mjs
```

[`scripts/verify-backend-bundle.mjs`](https://github.com/nodetool-ai/nodetool/blob/main/scripts/verify-backend-bundle.mjs) reads the same variables and resolves the `@seydx/node-av-<platform>-<arch>` binary it expects (`node-av-win32-<arch>-msvc` on Windows), so verification needs the target the staging run used. When no prebuild matches, staging warns and keeps every prebuild, so a mis-set variable costs size, never a missing binary.

## Build and test variables

| Variable | Purpose | Secret | Notes |
|----------|---------|--------|-------|
| `NODETOOL_PACKS_CLI_ROOT` | CLI root of the active pack resolution | no | Set by pack activation, not by hand. Child processes inherit it so a command feature installed in the pack project resolves host modules from the right CLI. See [Pack manager](https://github.com/nodetool-ai/nodetool/blob/main/packages/pack-manager/README.md) |
| `NODETOOL_SANDBOX_INPROC` / `NODETOOL_SANDBOX_WORKER` | Sandbox threading: `1` runs guests in-process, `require` refuses in-process fallback | no | See [JavaScript sandbox threading](#javascript-sandbox-threading) |
| `NODETOOL_GPU_VALIDATE` | Escape hatch for the WGSL linearity validator | no | `off` disables it. The validator rejects at module load a shader whose WGSL contradicts its declared premultiplied-alpha contract. Use it for a hotfix while the shader is corrected. Read once per process |
| `NODETOOL_GPU_DEBUG` | Comma-separated GPU debug passes | no | `premul` scans every premultiplied output texture after dispatch and logs texels that break the invariant (`rgb ≤ a`, `rgb ≥ 0`, no NaN). Zero cost when off, because the pass is never encoded. Read once per process |
| `NODETOOL_VALIDATE_OUTBOUND_WS` / `NODETOOL_VALIDATE_BRIDGE_FRAMES` | Schema-check outbound WebSocket frames, and frames from the Python worker | no | `1`/`true` on, `0`/`false` off. Unset: on under `NODE_ENV=test`/Vitest, off elsewhere. See [Protocol validation](#protocol-validation) |
| `NODETOOL_ENABLE_TEST_TOPUP` / `NODETOOL_SEED_DEMO_COSTS` | Credits top-up without payment, and demo spend for the Costs dashboard | no | `1` only. Development servers only. See [Development-only settings](#development-only-settings) |
| `NODETOOL_DEBUG_STAGES` / `NODETOOL_DEBUG_TIMEOUT` / `NODETOOL_E2E_EXAMPLES_DIR` / `NODETOOL_TEST_CHROME` / `NODETOOL_QA_STATE` | Test harness inputs | no | See [Test harness settings](#test-harness-settings) |
| `NODETOOL_FAKE_PROVIDERS` / `NODETOOL_FAKE_DEBUG` / `NODETOOL_REAL_PROVIDERS` / `NODETOOL_ENABLE_FAKE_PROVIDER` | Hermetic fake providers for the user-journey backend | no | See [Hermetic providers](#hermetic-providers) |
| `NODETOOL_TSC_VERSION` | Compiler used by the shared TypeScript launcher | no | Build-time only. `7` (native TypeScript 7 CLI) by default. `6` selects the TypeScript 6 JavaScript compiler for a rollback or to compare diagnostics. Other values fail before compilation. Compiler-API consumers keep importing the pinned TypeScript 6 package either way |
| `NODETOOL_TSC_HEAP_MB` | V8 heap (MiB) for the TypeScript 6 compiler child process | no | Build-time only. Default `8192`, passed as `--max-old-space-size` only when `NODETOOL_TSC_VERSION=6`. Digits only, otherwise the default. Ignored when `NODE_OPTIONS` already carries `--max-old-space-size` |
| `NODETOOL_BUNDLE_PLATFORM` / `NODETOOL_BUNDLE_ARCH` | Target the backend-bundle scripts prune prebuilt binaries to | no | Build-time only. Default `process.platform` / `process.arch`. Set both only when cross-building. See [Backend Bundle Targeting](#backend-bundle-targeting) |
| `NODETOOL_FETCH_ALL_NODE_RUNTIMES` | Download Node binaries for every packaging target | no | Build-time only. `1` exactly. Makes `electron/scripts/fetch-node-runtime.mjs` fetch all four (`darwin-arm64`, `darwin-x64`, `win32-x64`, `linux-x64`) instead of the host's. A target named on the command line wins. Cached binaries are skipped |
| `NODETOOL_PROBE_OPENAI_MODEL` / `NODETOOL_PROBE_GEMINI_MODEL` | Model the live provider contract probe sends | no | Read only by `npm run probe:providers`. Defaults `gpt-5.4-mini` and `gemini-3-flash`. The budget is charged at the manifest's declared estimate, not the override's actual cost. See [Provider contract probes](../provider-contract-probes.md#probing-a-different-model) |

## Related

- [Environment Variables](../environment-variables.md)
- [Server Configuration](../server-configuration.md)
- [Dev Environment](../dev-environment.md)
- [Harness Reference](../harnesses.md)
