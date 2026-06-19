# Worker & Deployment Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on format:** Per request, this plan contains **instructions only, no code samples**. Each "write the test" / "implement" step describes precisely what to write — names, signatures, behaviour, and assertions in prose — so a skilled engineer reproduces it without a code block. Keep TDD discipline: test first, watch it fail, minimal implementation, watch it pass, commit.

**Goal:** Replace the six-target server-deployment matrix with a Docker-only server path plus a new GPU-worker provisioning subsystem (`packages/compute`) that the desktop app and CLI use to spin up, attach, and tear down remote RunPod-pod and Vast.ai workers.

**Architecture:** `deploy` = server publishing (Docker only). `compute` = worker provisioning, organised as a `WorkerProvider` interface with per-target implementations behind a `WorkerManager`. Workers follow a profiles→instances identity model persisted in SQLite (Drizzle). Attaching a worker re-points a runtime-mutable Python bridge at the worker's `wss://` URL + bearer token. A reaper enforces idle-stop, TTL, and orphan reconciliation because GPU instances bill continuously.

**Tech Stack:** TypeScript (ESM, strict), Vitest (packages), Jest (web), Drizzle ORM + better-sqlite3, tRPC, Fastify, React + Zustand + TanStack Query + MUI primitives, msgpack WebSocket bridge.

---

## File Structure

**Delete**
- `packages/deploy/src/runpod.ts`, `deploy-to-runpod.ts`, `runpod-api.ts`, `gcp.ts`, `deploy-to-gcp.ts`, `fly.ts`, `railway.ts`, `huggingface.ts`
- `packages/deploy/scripts/runpod-worker.ts`
- Matching test files under `packages/deploy/tests/` (runpod, gcp, runpod-api, google-cloud-run-api, and any fly/railway/huggingface tests)
- `docs/runpod-deployment.md`, `docs/gcp-deployment.md`

**Move**
- `packages/deploy/src/runpod-rest.ts` → `packages/compute/src/providers/runpod-rest.ts` (transport client reused by the RunPod provider)

**Create — persistence (`packages/models`)**
- `packages/models/src/schema/workers.ts` — Drizzle table defs for `worker_profiles`, `worker_instances`
- `packages/models/src/worker-profiles.ts` — profile CRUD accessors
- `packages/models/src/worker-instances.ts` — instance registry accessors
- A new migration file under the package's existing migrations directory

**Create — compute (`packages/compute`)**
- `package.json`, `tsconfig.json`, vitest config, `src/index.ts` (scaffold matching a sibling package)
- `src/providers/types.ts` — `WorkerProvider`, `WorkerSpec`, `WorkerStatus`, `ProvisionResult`, `ProviderInstance`
- `src/providers/runpod.ts` — `RunpodPodProvider`
- `src/providers/vast.ts` — `VastProvider`
- `src/manager.ts` — `WorkerManager`
- `src/reaper.ts` — idle-stop, TTL, orphan reconcile

**Modify**
- `packages/deploy/src/deployment-config.ts` — drop the five non-Docker schema variants from the union
- `packages/deploy/src/manager.ts` and `packages/cli/src/commands/deploy-helpers.ts` — drop the deleted factory entries
- `packages/cli/src/commands/deploy.ts` — drop the deleted `--type` choices
- `packages/deploy/src/docker-run.ts`, `compose.ts` — remove the `workflows`/`NODETOOL_WORKFLOWS` lines
- `packages/runtime/src/python-websocket-bridge.ts` — add runtime-mutable target (`setTarget`)
- `packages/websocket/src/trpc/router.ts` (+ new `packages/websocket/src/trpc/routers/worker.ts`) — `worker` router and attach wiring to the live bridge
- `packages/cli/src/...` — `nodetool worker` command group
- `web/src/...` — Workers panel, store/query, status-bar indicator

**Create — docs**
- `docs/worker-deployment.md`

---

## Group A — Server prune

Do this first: it removes broken/aspirational code and shrinks `deploy` so the rest of the work lands on clean ground.

### Task A1: Delete the non-Docker server deployers

**Files:**
- Delete: the eight `deploy/src` files and the script listed under "Delete" above
- Delete: the matching `packages/deploy/tests/*` files

- [ ] **Step 1: Establish the green baseline** — Run `npm run test --workspace=packages/deploy` and `npm run typecheck`. Record that they pass before any deletion, so later failures are attributable to this change.
- [ ] **Step 2: Delete the deployer source files and their tests** — Remove the eight source files and `scripts/runpod-worker.ts`, plus every test file under `packages/deploy/tests/` that targets runpod, runpod-api, gcp, google-cloud-run, fly, railway, or huggingface. Use `git rm` so deletions are staged.
- [ ] **Step 3: Find dangling references** — Run `npm run typecheck`. Expect failures only in `deploy/src/manager.ts`, `deploy/src/index.ts` (barrel exports), and `cli` files that import the deleted modules. Note them; they're fixed in A2.
- [ ] **Step 4: Commit the deletions** — Commit message: `chore(deploy): remove non-Docker server deployers (gcp, fly, railway, hf, runpod-serverless)`. (Typecheck is expected red until A2; this commit is the "delete" half of an atomic two-step — note that in the body.)

### Task A2: Slim the config union, manager, and CLI to Docker-only

**Files:**
- Modify: `packages/deploy/src/deployment-config.ts`
- Modify: `packages/deploy/src/manager.ts`, `packages/deploy/src/index.ts`
- Modify: `packages/cli/src/commands/deploy-helpers.ts`, `packages/cli/src/commands/deploy.ts`

- [ ] **Step 1: Update/trim the config tests first** — In the deploy config tests, remove cases asserting parsing of runpod/gcp/fly/railway/huggingface deployment objects, and add/keep a case asserting the union now rejects `type: "runpod"` (and the others) as invalid while still accepting `type: "docker"`. Run the test file; expect it to fail because the union still includes the old variants.
- [ ] **Step 2: Shrink the discriminated union** — In `deployment-config.ts`, reduce `AnyDeploymentSchema` to the Docker variant only; delete the RunPod/GCP/Fly/Railway/HuggingFace schemas, their state schemas, and their `getServerUrl` helpers. Remove now-unused exports from `index.ts`.
- [ ] **Step 3: Trim the factory map and CLI choices** — In `deploy-helpers.ts` remove the deleted factory entries so only the docker factory remains; in `deploy.ts` remove the deleted values from the `deploy add --type` choice list and its help text; remove the deleted imports from `manager.ts`.
- [ ] **Step 4: Verify green** — Run `npm run test --workspace=packages/deploy`, then `npm run typecheck`, then `npm run lint`. All pass. If `cli` has deploy tests referencing removed types, update them to docker-only.
- [ ] **Step 5: Commit** — Message: `feat(deploy): collapse deployment config to docker-only server target`.

### Task A3: Remove the dead `workflows` field and `NODETOOL_WORKFLOWS`

**Files:**
- Modify: `packages/deploy/src/deployment-config.ts` (the Docker `container.workflows` field)
- Modify: `packages/deploy/src/docker-run.ts` (around line 234), `packages/deploy/src/compose.ts` (around line 155)

- [ ] **Step 1: Adjust tests** — In the docker-run and compose tests, delete assertions that `NODETOOL_WORKFLOWS` is set from `container.workflows`. Add an assertion that the generated env/command contains **no** `NODETOOL_WORKFLOWS` key even when a `workflows` array is supplied. Run them; expect failure because the code still emits the var.
- [ ] **Step 2: Remove the field and its plumbing** — Delete the `workflows` property from the Docker container schema, and delete the `NODETOOL_WORKFLOWS` assignment branches in `docker-run.ts` and `compose.ts`.
- [ ] **Step 3: Verify** — Run `npm run test --workspace=packages/deploy`, `npm run typecheck`, `npm run lint`. Green.
- [ ] **Step 4: Commit** — Message: `chore(deploy): drop dead workflows/NODETOOL_WORKFLOWS field`.

---

## Group B — Persistence (Drizzle models)

### Task B1: Worker tables schema + migration

**Files:**
- Create: `packages/models/src/schema/workers.ts`
- Create: a migration in the package's migrations directory
- Modify: the schema barrel/index that aggregates Drizzle tables
- Test: a new test file beside the package's existing model tests

- [ ] **Step 1: Write the failing schema test** — Add a test that opens a fresh in-memory (or temp-file) SQLite DB, runs the package's migration routine, and queries `sqlite_master` (or the equivalent) to assert both `worker_profiles` and `worker_instances` tables exist with the expected columns. Columns per the spec §5: profiles = `id, name (unique), target, image, spec (json text), token_policy, idle_timeout_minutes, max_lifetime_minutes, created_at, updated_at`; instances = `id, profile_name, target, provider_ref, ws_url, token, status, attached_to, created_at, last_activity_at, estimated_cost_usd`.
- [ ] **Step 2: Run to fail** — Run the new test file via `npm run test --workspace=packages/models`. Expect failure: tables do not exist.
- [ ] **Step 3: Define the tables** — In `schema/workers.ts` declare both Drizzle SQLite tables with the columns above (text PKs, `target` and `token_policy` as text, the two timeout columns nullable integers, `spec` as text holding JSON, timestamps as the package's existing timestamp convention). Export them and register them in the schema barrel.
- [ ] **Step 4: Author the migration** — Generate or hand-write a migration that creates both tables; ensure the package's migration runner picks it up. Re-run the test; expect pass.
- [ ] **Step 5: Commit** — Message: `feat(models): worker_profiles and worker_instances tables`.

### Task B2: Profile CRUD accessors

**Files:**
- Create: `packages/models/src/worker-profiles.ts`
- Modify: `packages/models/src/index.ts` (export the accessors)
- Test: beside the package's model tests

- [ ] **Step 1: Write failing tests** — Cover: `createWorkerProfile` persists and returns a profile; `getWorkerProfile(name)` returns it; `listWorkerProfiles()` returns all; `updateWorkerProfile(name, patch)` mutates fields and bumps `updated_at`; `deleteWorkerProfile(name)` removes it; creating a duplicate `name` rejects. Each test uses a fresh migrated DB.
- [ ] **Step 2: Run to fail** — `npm run test --workspace=packages/models` on the file; expect "function not defined".
- [ ] **Step 3: Implement** — Write the five accessor functions over the `worker_profiles` table, serialising `spec` to JSON on write and parsing on read, generating `id` with the package's existing id helper, and surfacing the unique-name violation as a thrown `Error`.
- [ ] **Step 4: Run to pass** — Re-run; green. Run `npm run typecheck`.
- [ ] **Step 5: Commit** — Message: `feat(models): worker profile accessors`.

### Task B3: Instance registry accessors

**Files:**
- Create: `packages/models/src/worker-instances.ts`
- Modify: `packages/models/src/index.ts`
- Test: beside the package's model tests

- [ ] **Step 1: Write failing tests** — Cover: `createWorkerInstance` persists with status `provisioning`; `getWorkerInstance(id)`; `listWorkerInstances({ status? })` filters by status; `updateWorkerInstance(id, patch)` (used to set `running`/`attached`/`stopped`, `ws_url`, `token`, `last_activity_at`, `estimated_cost_usd`); `touchWorkerInstance(id)` updates `last_activity_at` only; `deleteWorkerInstance(id)`. Assert that listing by `status: "running"` excludes `stopped` rows.
- [ ] **Step 2: Run to fail** — Run the file; expect failures.
- [ ] **Step 3: Implement** — Write the accessors over `worker_instances`, with the same id/timestamp conventions. `touchWorkerInstance` writes only `last_activity_at`.
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`.
- [ ] **Step 5: Commit** — Message: `feat(models): worker instance registry accessors`.

---

## Group C — Compute package core

### Task C1: Scaffold `packages/compute`

**Files:**
- Create: `packages/compute/package.json`, `tsconfig.json`, vitest config, `src/index.ts`

- [ ] **Step 1: Copy a sibling's scaffolding** — Base `package.json`/`tsconfig`/vitest config on a small leaf package (e.g. `packages/security`). Set name `@nodetool-ai/compute`, `"type": "module"`, the standard `build`/`test`/`typecheck` scripts, and declare dependencies on `@nodetool-ai/models`, `@nodetool-ai/security`, `@nodetool-ai/config`. Add it to the root workspace if the workspace list is explicit. `src/index.ts` starts as an empty barrel.
- [ ] **Step 2: Wire build order** — Confirm `npm run build:packages` builds `compute` after its dependencies (it derives order from `package.json` deps). Run `npm install` if the workspace needs to relink.
- [ ] **Step 3: Smoke build** — Run `npm run build --workspace=packages/compute` and `npm run typecheck`. Both pass on the empty package.
- [ ] **Step 4: Commit** — Message: `chore(compute): scaffold worker provisioning package`.

### Task C2: `WorkerProvider` interface and shared types

**Files:**
- Create: `packages/compute/src/providers/types.ts`
- Modify: `packages/compute/src/index.ts`
- Test: `packages/compute/src/__tests__/types.test.ts`

- [ ] **Step 1: Write a failing type-contract test** — Add a test that imports the types and constructs a trivial in-test fake `WorkerProvider` whose `provision` returns a fixed `ProvisionResult`, asserting the shape round-trips (it both documents and pins the interface). Define in prose: `WorkerSpec` = `{ name, image, target, gpu?, vcpu?, env?, token? }`; `WorkerStatus` = a string union `"provisioning" | "running" | "attached" | "stopping" | "stopped" | "error"`; `ProvisionResult` = `{ providerRef, wsUrl, token?, status }`; `ProviderInstance` = `{ providerRef, status }`; `WorkerProvider` = methods `provision(spec) → Promise<ProvisionResult>`, `status(ref) → Promise<WorkerStatus>`, `stop(ref) → Promise<void>`, `list() → Promise<ProviderInstance[]>`.
- [ ] **Step 2: Run to fail** — `npm run test --workspace=packages/compute`; expect module-not-found.
- [ ] **Step 3: Implement the types** — Author `types.ts` exactly as described; export everything from the barrel.
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`.
- [ ] **Step 5: Commit** — Message: `feat(compute): WorkerProvider interface and shared types`.

### Task C3: `RunpodPodProvider`

**Files:**
- Move: `packages/deploy/src/runpod-rest.ts` → `packages/compute/src/providers/runpod-rest.ts`
- Create: `packages/compute/src/providers/runpod.ts`
- Test: `packages/compute/src/__tests__/runpod-provider.test.ts`

- [ ] **Step 1: Relocate the transport client** — `git mv` `runpod-rest.ts` into `compute/src/providers/`. Fix its imports. Remove its export from the `deploy` barrel; add it (internal) to `compute`. Run `npm run typecheck`; fix any `deploy` references (there should be none after Group A).
- [ ] **Step 2: Write failing provider tests** — With the RunPod REST HTTP calls mocked (mirror the existing `runpod-api.test.ts` mocking style), assert: `provision(spec)` creates a pod from `spec.image`, polls until running, and returns `{ providerRef: podId, wsUrl: <proxy wss url>, token, status: "running" }`; `status(ref)` maps RunPod pod states to `WorkerStatus`; `stop(ref)` issues the real delete call; `list()` returns the live pods as `ProviderInstance[]`. Inject the API key as a constructor arg (do not read env inside the provider).
- [ ] **Step 3: Run to fail** — `npm run test --workspace=packages/compute`; expect failures.
- [ ] **Step 4: Implement** — Write `RunpodPodProvider implements WorkerProvider`, delegating to the relocated `runpod-rest` functions (`createPod`/`waitForPodEndpoint`/`getPod`/`deletePod`/`listPods`) and mapping their results to the interface shapes. The constructor takes `apiKey`.
- [ ] **Step 5: Run to pass** — Green; `npm run typecheck`; `npm run lint`.
- [ ] **Step 6: Commit** — Message: `feat(compute): RunpodPodProvider over the REST pod API`.

### Task C4: `WorkerManager` — provision/stop/list/status

**Files:**
- Create: `packages/compute/src/manager.ts`
- Modify: `packages/compute/src/index.ts`
- Test: `packages/compute/src/__tests__/manager.test.ts`

- [ ] **Step 1: Write failing tests** — Inject a fake `WorkerProvider` and a fake/real migrated models layer. Assert: `createProfile`/`listProfiles`/`deleteProfile` delegate to the model accessors; `provision(profileName)` looks up the profile, resolves the target's provider, generates a worker token when `token_policy === "generate"`, calls `provider.provision`, creates a `worker_instances` row transitioning `provisioning → running`, and returns the instance; `stop(instanceId)` calls `provider.stop` and marks the instance `stopped`; `stopAll()` stops every non-stopped instance; `list()`/`status(id)` read the registry (and refresh from `provider.status`). Add a test that the API key is loaded from the `nodetool_secrets` store (mocked) per target (`RUNPOD_API_KEY` / `VAST_API_KEY`), falling back to env.
- [ ] **Step 2: Run to fail** — Run the file; expect failures.
- [ ] **Step 3: Implement** — Write `WorkerManager` with a provider-factory map keyed by `target` (`runpod` → `RunpodPodProvider`, `vast` added in Group F), a private `loadApiKey(target)` (secret store first, env fallback — reuse the logic from the now-deleted `runpod-worker.ts`), and the methods above. Persist all state through the models accessors; never hold instance state only in memory.
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`; `npm run lint`.
- [ ] **Step 5: Build and commit** — Run `npm run build:packages` so downstream packages can import `@nodetool-ai/compute`. Commit: `feat(compute): WorkerManager provision/stop/list/status`.

---

## Group D — Attach seam and cost guard

### Task D1: Runtime-mutable bridge target (`setTarget`)

**Files:**
- Modify: `packages/runtime/src/python-websocket-bridge.ts`
- Test: `packages/runtime/src/__tests__/python-websocket-bridge.test.ts` (or the bridge's existing test file)

- [ ] **Step 1: Write failing tests** — With the `ws` client mocked: assert that after `setTarget(url, token)` the bridge closes the current socket and reopens against the new `url` with an `Authorization: Bearer <token>` header; assert that calling `setTarget` with the same url is a no-op (no needless reconnect); assert that a `null`/empty token sends no auth header. Confirm in-flight requests are rejected on the forced reconnect (matching existing reconnect semantics).
- [ ] **Step 2: Run to fail** — `npm run test --workspace=packages/runtime` on the file; expect failures.
- [ ] **Step 3: Implement** — Convert the captured-at-construction URL/token into mutable instance fields. Add `setTarget(url, token)`: if unchanged, return; else update the fields and force a reconnect through the existing reconnect path so `_openSocket` uses the new values. Keep env (`NODETOOL_WORKER_URL`/`NODETOOL_WORKER_TOKEN`) as the constructor default.
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`.
- [ ] **Step 5: Commit** — Message: `feat(runtime): re-pointable python websocket bridge (setTarget)`.

### Task D2: Active-worker pointer + `attach`/`detach`

**Files:**
- Modify: `packages/compute/src/manager.ts`
- Test: `packages/compute/src/__tests__/manager.test.ts`

- [ ] **Step 1: Write failing tests** — Assert `attach(instanceId)` reads the instance, writes the settings key `active_worker_instance_id` (via the settings model, mocked), marks the instance `attached`, and returns its `{ wsUrl, token }`; `detach()` clears the settings key and marks the previously-attached instance back to `running`; `getActiveWorker()` returns the attached instance or null. (The actual `bridge.setTarget` call is made by the caller in Group E, not inside the manager — keep the manager free of a runtime dependency.)
- [ ] **Step 2: Run to fail** — Run; expect failures.
- [ ] **Step 3: Implement** — Add `attach`/`detach`/`getActiveWorker` to `WorkerManager`, persisting the pointer in the existing `settings` table (singleton key for the desktop MVP). The methods return the connection info for the caller to apply to the bridge.
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`.
- [ ] **Step 5: Build + commit** — `npm run build:packages`; commit `feat(compute): worker attach/detach with active-worker pointer`.

### Task D3: Reaper — idle auto-stop and TTL

**Files:**
- Create: `packages/compute/src/reaper.ts`
- Modify: `packages/compute/src/index.ts`
- Test: `packages/compute/src/__tests__/reaper.test.ts`

- [ ] **Step 1: Write failing tests** — Using an injected clock (a function returning "now") and a fake `WorkerManager`/registry: assert that `runReaperOnce()` stops an instance whose `last_activity_at` is older than its profile's `idle_timeout_minutes`; does **not** stop one within the window; stops an instance older than `max_lifetime_minutes` regardless of activity; ignores instances whose profile sets neither limit. Assert each stop goes through `WorkerManager.stop` (so teardown + status update happen).
- [ ] **Step 2: Run to fail** — Run; expect failures.
- [ ] **Step 3: Implement** — Write `runReaperOnce(deps)` taking the manager, the clock, and a profile lookup; iterate non-stopped instances, resolve their profile's limits, and stop those past idle or TTL. Add a `startReaper(intervalMs)` that schedules `runReaperOnce` (used by the server; the timer itself need not be unit-tested).
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`.
- [ ] **Step 5: Commit** — Message: `feat(compute): reaper for idle-stop and TTL`.

### Task D4: Orphan reconcile

**Files:**
- Modify: `packages/compute/src/manager.ts` (add `reconcile()`)
- Test: `packages/compute/src/__tests__/manager.test.ts`

- [ ] **Step 1: Write failing tests** — With a fake provider whose `list()` returns a known set of live `providerRef`s: assert `reconcile()` marks DB instances that are `running`/`attached` but **absent** from the provider's live list as `stopped` (they died/were killed out-of-band); and surfaces, in its return value, any provider-live refs **not** tracked in the DB (true orphans) plus a count/estimated-cost summary. Assert it does not touch already-`stopped` rows.
- [ ] **Step 2: Run to fail** — Run; expect failures.
- [ ] **Step 3: Implement** — Add `reconcile()` to `WorkerManager`: for each target with tracked or live instances, diff `provider.list()` against the DB registry; reconcile statuses and return `{ orphans, liveCount, estimatedCostUsd }`.
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`; `npm run lint`.
- [ ] **Step 5: Build + commit** — `npm run build:packages`; commit `feat(compute): orphan reconcile against provider live list`.

---

## Group E — Surfaces

### Task E1: `worker` tRPC router + bridge wiring

**Files:**
- Create: `packages/websocket/src/trpc/routers/worker.ts`
- Modify: `packages/websocket/src/trpc/router.ts` (register `worker`)
- Modify: the server bootstrap so the router can reach the live Python bridge and a `WorkerManager` instance
- Test: `packages/websocket/src/__tests__/worker-router.test.ts`

- [ ] **Step 1: Write failing tests** — Calling the router procedures against a test context with a fake `WorkerManager` and a fake bridge: assert `worker.profiles.list/create/delete`, `worker.instances.list`, `worker.provision(profileName)`, `worker.stop(id)`/`worker.stopAll`, `worker.status(id)`, `worker.reconcile` delegate to the manager; and that `worker.attach(id)` calls `manager.attach`, then calls `bridge.setTarget(wsUrl, token)` with the returned connection info, while `worker.detach` calls `manager.detach` then points the bridge back at the env/stdio default.
- [ ] **Step 2: Run to fail** — `npm run test --workspace=packages/websocket` on the file; expect failures.
- [ ] **Step 3: Implement** — Author the `worker` router with those procedures (Zod-validated inputs, hierarchical naming consistent with sibling routers). In the server bootstrap, construct one `WorkerManager` and expose the active Python bridge handle to the tRPC context so `attach`/`detach` can re-point it. Register `worker` in the app router. On server start, also call `manager.reconcile()` and `startReaper()`.
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`; `npm run lint`.
- [ ] **Step 5: Build + commit** — `npm run build:packages`; commit `feat(websocket): worker tRPC router with attach/detach bridge wiring`.

### Task E2: `nodetool worker` CLI verbs

**Files:**
- Create: `packages/cli/src/commands/worker.ts`
- Modify: the CLI command registration entrypoint
- Test: `packages/cli/src/__tests__/worker-command.test.ts`

- [ ] **Step 1: Write failing tests** — With a fake `WorkerManager`, assert the command group parses and dispatches: `worker profile add|list|rm`, `worker create --profile <name> [--attach]` (and inline `--target/--gpu/--image` form), `worker list`, `worker status <id>`, `worker stop <id>`, `worker stop --all`. Assert `--attach` triggers `manager.attach` and prints the resulting `wsUrl`; assert `create` prints the new instance id + `wsUrl` + token.
- [ ] **Step 2: Run to fail** — `npm run test --workspace=packages/cli` on the file; expect failures.
- [ ] **Step 3: Implement** — Build the `worker` command group on the same `WorkerManager`, loading the DB + master key the way the deleted `runpod-worker.ts` script did. Register it in the CLI entrypoint alongside the existing commands. For headless `--attach`, write the active-worker pointer (a running server/desktop reads it; the CLI itself can also print export lines for `NODETOOL_WORKER_URL`/`NODETOOL_WORKER_TOKEN`).
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`; `npm run lint`.
- [ ] **Step 5: Commit** — Message: `feat(cli): nodetool worker command group`.

### Task E3: Workers UI panel

**Files:**
- Create: a `useWorkers` hook (TanStack Query over the `worker` tRPC procedures) under the web hooks directory
- Create: the Workers panel components under the web components tree (a profiles editor, a provision dialog, a live-instances table, a status-bar attached-indicator)
- Modify: the settings/menu structure to mount the panel
- Test: web tests beside the components (Jest + React Testing Library)

- [ ] **Step 1: Write failing tests** — With the tRPC client mocked: assert the instances table renders rows with status, uptime, estimated cost, and a Stop button that calls `worker.stop`; assert the provision dialog calls `worker.provision` with the chosen profile and shows provisioning → attached progression; assert the status-bar indicator appears only when an instance is `attached` and its quick-stop calls `worker.stop`. Use `getByRole`/`getByLabelText` and `userEvent`.
- [ ] **Step 2: Run to fail** — `cd web && npm test` on the new files; expect failures.
- [ ] **Step 3: Implement** — Build `useWorkers` (queries for profiles/instances with hierarchical keys, mutations for create/provision/attach/detach/stop with invalidation) and the panel components **using `ui_primitives` only** (no raw MUI), following the styling rules. Mount the panel in the settings/menu surface and add the status-bar indicator. Keep Zustand selectors narrow if any local store state is needed.
- [ ] **Step 4: Run to pass** — `cd web && npm test`; green. `cd web && npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** — Message: `feat(web): Workers panel — provision, attach, monitor, stop`.

---

## Group F — Second provider (Vast.ai)

### Task F1: `VastProvider`

**Files:**
- Create: `packages/compute/src/providers/vast.ts`
- Create: a small Vast HTTP client (beside it or inline) if no transport exists yet
- Modify: the `WorkerManager` provider-factory map to register `vast`
- Test: `packages/compute/src/__tests__/vast-provider.test.ts`

- [ ] **Step 1: Write failing tests** — With the Vast HTTP API mocked, assert: `provision(spec)` selects/launches a GPU offer running `spec.image`, polls until the instance is ready, and returns `{ providerRef: instanceId, wsUrl: "ws://<ip>:<port>", token, status: "running" }`; `status(ref)` maps Vast states to `WorkerStatus`; `stop(ref)` destroys the instance; `list()` returns live instances as `ProviderInstance[]`. The constructor takes `apiKey`.
- [ ] **Step 2: Run to fail** — `npm run test --workspace=packages/compute`; expect failures.
- [ ] **Step 3: Implement** — Write `VastProvider implements WorkerProvider` against the Vast HTTP API (launch from an offer with the worker image and a mapped port for 7777, poll readiness, derive the direct `ws://ip:port` URL, destroy on stop). Register it under `target: "vast"` in `WorkerManager` and add `VAST_API_KEY` to the secret-key resolution.
- [ ] **Step 4: Run to pass** — Green; `npm run typecheck`; `npm run lint`.
- [ ] **Step 5: Build + commit** — `npm run build:packages`; commit `feat(compute): VastProvider`.

---

## Group G — Docs and end-to-end validation

### Task G1: Documentation

**Files:**
- Create: `docs/worker-deployment.md`
- Delete: `docs/runpod-deployment.md`, `docs/gcp-deployment.md`
- Modify: `README.md` deployment tagline; `docs/deployment.md`; CLI docs in the root `CLAUDE.md` if they list deploy types

- [ ] **Step 1: Write the worker guide** — Document: the profiles→instances model; creating a profile; provisioning + attaching from the UI and the CLI; the cost guard (idle-stop, TTL, orphan reconcile); secret keys (`RUNPOD_API_KEY`, `VAST_API_KEY`); supported targets (RunPod pod, Vast.ai) and the manual-local-worker note.
- [ ] **Step 2: Prune server docs** — Delete the runpod/gcp server-deploy guides; update the README tagline and `docs/deployment.md` to "self-host with Docker; rent GPU workers (RunPod, Vast)". Update any `--type` lists in `CLAUDE.md`.
- [ ] **Step 3: Commit** — Message: `docs: worker-deployment guide; drop server-deploy targets`.

### Task G2: Manual end-to-end checklist (not automated)

- [ ] **Step 1: Provision** — With `RUNPOD_API_KEY` in the secret store, create a small-model profile and provision a RunPod pod via the CLI; confirm it reaches `running` and returns a `wss://` URL.
- [ ] **Step 2: Attach + run** — Attach it (UI or CLI), run a graph containing a Python node, and confirm the node executes on the remote worker (the bridge re-pointed; status `completed`).
- [ ] **Step 3: Cost guard** — Confirm idle-stop fires after the profile's idle window, and that `reconcile()` reports/cleans an out-of-band-killed instance.
- [ ] **Step 4: Teardown** — Stop the instance; confirm real provider teardown (pod gone from `list()`), then `stop --all` leaves nothing live.

---

## Self-Review

**Spec coverage** — every spec section maps to tasks: server prune §3 → A1–A3; identity/persistence §4.1–4.2 → B1–B3; module/providers §4.3 → C1–C4, F1; attach §4.4 → D1–D2, E1; cost guard §4.5 → D3–D4; surfaces §4.6 → E1–E3; data model §5 → B1; phasing §6 → group ordering (P1 = A–E, P2 = F); docs/non-goals §7 → G1 (parked items intentionally have no tasks); testing §8 → tests in every task + G2.

**Placeholder scan** — no "TBD/handle edge cases/similar to Task N" left; deletion tasks state exactly which files; each test step lists concrete assertions.

**Type consistency** — names used consistently across tasks: `WorkerProvider`, `WorkerSpec`, `WorkerStatus`, `ProvisionResult`, `ProviderInstance`, `WorkerManager` with `createProfile/listProfiles/deleteProfile/provision/stop/stopAll/list/status/attach/detach/getActiveWorker/reconcile`, `RunpodPodProvider`/`VastProvider`, bridge `setTarget`, settings key `active_worker_instance_id`, secret keys `RUNPOD_API_KEY`/`VAST_API_KEY`.

**Known deviations from defaults** — code samples omitted by request; Vast (`F1`) lands after the RunPod path is proven, per spec phasing, though both providers are in scope.
