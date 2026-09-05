# ComfyUI integration on the Comfy SDK

**Status:** Proposed
**Date:** 2026-09-05

Add Comfy Cloud as a NodeTool provider and run ComfyUI workflows through the
official `@comfyorg/sdk` wherever a Comfy API v2 surface exists: Comfy Cloud
now, the `nodetool-worker-comfy` image once it serves v2, and a bare local
ComfyUI once ComfyUI core does. The native-protocol executor stays only for the
last case, and goes away when that day comes.

## Current state

Three surfaces, none of them a provider:

| Surface | Node | Transport | Auth | Streams outputs |
|---|---|---|---|---|
| Any ComfyUI server | `lib.comfy.RunWorkflow` | `packages/runtime/src/comfy-executor.ts`: raw `fetch` + `ws` against `/prompt`, `/ws?clientId`, `/history`, `/view`, `/upload/image`, `/interrupt` | none | yes, per save node |
| `nodetool-worker-comfy` | `lib.comfy.RunWorkflowOnWorker` | worker bridge, `comfy.*` frame family (`packages/runtime/src/python-bridge-base.ts`, `packages/protocol/src/bridge-frames.ts`) | worker bearer token, held in a plain node prop | no, buffered |
| Comfy Cloud | none | | | |

Shared by both nodes: the workflow is API-format JSON in a `workflow` prop,
dynamic inputs are keyed `<comfyNodeId>:<field>` and spliced into the prompt
before submit, and outputs are base64 media refs. The Load Workflow dialog,
PNG metadata extraction and handle derivation in
`web/src/utils/comfyDynamicSchema.ts` target one node type,
`DYNAMIC_COMFY_NODE_TYPE` in `web/src/constants/nodeTypes.ts`. The worker node
gets none of that UI.

Gaps the current code has regardless of this design:

- No `PROVIDER_IDS` entry, no secret in `setting-catalog.ts`, no settings card,
  no `setProviderCost` call.
- `lib.comfy.RunWorkflow` destructures only `{ result }` from `executeComfy`,
  so the `cancel()` handle and `POST /interrupt` are dead code. Neither node
  takes an `AbortSignal`.
- The worker node's output slot names come from the worker's blob keys, not the
  `<id>:<kind>` convention, so downstream wiring needs a real run first.
- `include_temp` exists on `ComfyExecuteOptions` but no node exposes it.

## Facts that constrain the design

Verified against the SDK source (`@comfyorg/sdk` 0.1.9) and the v2 OpenAPI
spec vendored in `Comfy-Org/comfy-typescript-sdk`.

1. **Comfy Cloud has two APIs.** v1 (`/api/prompt`, `/ws`, `X-API-Key`)
   mirrors local ComfyUI and is deprecated. v2 (`/api/v2/jobs`,
   `/api/v2/assets`, SSE `/events`, `Authorization: Bearer`) is a jobs-plus-
   assets contract with ten endpoints. The SDK speaks v2 only.
2. **ComfyUI core does not serve v2.** Comfy-Org's `comfy-api-proxy` (Python,
   aiohttp, pip) translates v2 to the native protocol in front of a ComfyUI on
   port 8189. Its README describes the proxy as the adapter that will
   "eventually" move into core.
3. **The high-level client has no base-URL argument.** `new Comfy({ apiKey })`
   reads `COMFY_BASE_URL` from the environment per construction. Setting that
   variable per node run is process-global and races. The package also exports
   `ComfyLow(baseUrl, apiKey)` from `@comfyorg/sdk/low` and the factories built
   on it (`AssetFactory`, `JobFactory`, `Job`, `WorkflowFactory`), so a
   per-instance base URL is reachable without forking. What `Comfy` keeps
   private is the submit loop: asset materialization plus 429 `Retry-After`
   backoff, about forty lines.
4. **v2 lists no models, nodes or checkpoints,** and the job response carries
   no cost. `job.metrics` is an open map with undocumented keys. Billing is per
   GPU second by plan. Insufficient credits is HTTP 402, a full queue is 429
   with `Retry-After`.
5. **Input overrides are `graph[nodeId].inputs[field] = value`,** the same
   shape as our handle convention. Media inputs become
   `{ __type: "core/ASSET", info: { id, hash, file_path } }` after a blake3
   dedup upload the SDK performs. UI-format JSON is rejected before any request
   (`looksLikeUiFormat`), the same rule `normalizeComfyPrompt` applies.
6. **Dependencies.** ESM only, Node 22 or newer, `zod ^4.4.3` (matches
   `packages/runtime`), `hash-wasm`, `eventsource-parser`. No native addon.
7. **Progress.** `job.events()` yields `Progress | Preview | OutputReady |
   StatusChange | Log`, discriminated on `kind`, with polling as the source of
   truth when the stream drops. `outputReady` carries an `Output` with
   `toBytes()`, `node_id`, `type` (`image | video | audio | text | file |
   latent`) and `content_type`. Signed output URLs expire, so bytes are pulled
   during the run.
8. **Limits.** Concurrent API jobs: 1, 3 or 5 by plan. Max runtime 30 minutes,
   60 on Pro. Idempotency keys are single use and expire after 24 hours.

## Target state

| Surface | Node | Transport | Base URL | Auth |
|---|---|---|---|---|
| Comfy Cloud | `lib.comfy.RunWorkflowOnCloud` (new) | `@comfyorg/sdk` | `https://cloud.comfy.org` | `COMFY_API_KEY` secret |
| `nodetool-worker-comfy` | `lib.comfy.RunWorkflowOnWorker` (rewritten) | `@comfyorg/sdk` via `ComfyLow` | derived from `worker_url` | worker bearer token |
| Bare local ComfyUI | `lib.comfy.RunWorkflow` (unchanged) | `comfy-executor.ts` | `endpoint` prop | none |

One node body runs all three: a shared runner takes a transport and a prompt
and yields the same frames. The three nodes differ only in how they build the
transport. When ComfyUI core serves v2, `lib.comfy.RunWorkflow` switches to the
SDK transport with its `endpoint` as base URL and `comfy-executor.ts` is
deleted.

Why not the SDK everywhere today: a local user would have to install and run
`comfy-api-proxy` next to ComfyUI. Why the worker moves now: we build that
image, so adding the v2 surface costs nothing for users and retires the
`comfy.*` bridge family.

## Design

### D1. Provider `comfy_cloud`

`packages/runtime/src/providers/comfy-cloud-provider.ts`, registered as
`PROVIDER_IDS.COMFY_CLOUD = "comfy_cloud"` with `{ COMFY_API_KEY: "" }`.
`requiredSecrets()` returns `["COMFY_API_KEY"]`. `generateMessage` and
`generateMessages` throw the standard unsupported error. No
`getAvailable*Models` overrides, because v2 enumerates nothing (fact 4), so
the derived capability list is empty. The provider exists for what the
registry gives every provider: `isProviderConfigured`, the settings card,
`getContainerEnv`, and a provider id for cost records.

Do not invent image models from stored workflows. If a "workflow as model"
feature is wanted later it is a separate design.

### D2. Secret

One line in `packages/config/src/setting-catalog.ts`:
`sec("COMFY_API_KEY", "Comfy Cloud", "... Get yours at https://platform.comfy.org")`.
Keys are prefixed `comfyui-`. The same key authenticates partner API nodes
inside a graph when passed as `extra_data.api_key_comfy_org`, which the SDK
does when `submit(wf, { apiKey })` is given one. The node passes the same
secret for both.

### D3. Transport and runner

New module `packages/integration-nodes/src/nodes/comfy-sdk.ts`:

```ts
interface ComfyTransport {
  submit(graph: WorkflowGraph, opts: { signal: AbortSignal; apiKey?: string }): Promise<Job>;
  assetFromBytes(bytes: Uint8Array, filename: string, contentType: string): AssetHandle;
}

function cloudTransport(apiKey: string): ComfyTransport;     // new Comfy({ apiKey })
function v2Transport(baseUrl: string, token?: string): ComfyTransport; // new ComfyLow(baseUrl, token) + factories
```

`cloudTransport` wraps the high-level `Comfy` client. `v2Transport` builds
`ComfyLow` plus `AssetFactory` and `JobFactory`, and reimplements `submit`
(materialize asset handles, mint an idempotency key, retry 429 with
`Retry-After` against the same 60 second budget). Open an upstream PR adding
`baseUrl?: string` to `ComfyOptions`, a one-line change since `ComfyLow`
already accepts it. When that ships, `v2Transport` collapses to
`new Comfy({ apiKey, baseUrl })` and the reimplemented submit is deleted.

`runComfyWorkflow(transport, prompt, dynamicProps, ctx)` is an async
generator shared by the Cloud and worker nodes:

1. Deep-clone the prompt. For each dynamic prop `"<id>:<field>"`: a media ref
   becomes `transport.assetFromBytes(...)` written into
   `prompt[id].inputs[field]` (the SDK substitutes the `core/ASSET` object at
   submit), a scalar is written directly.
2. `transport.submit(prompt, { signal })`. `QueueFull`, `InsufficientCredits`
   (402) and `WorkflowFormatUi` map to node errors with the SDK message.
3. Iterate `job.events()`:
   - `progress` to `node_progress` (`value` times `nodes_total`, or
     `step`/`steps` when present).
   - `log` and `statusChange` to `log_update`.
   - `preview` to a `preview` frame when the node's `previews` prop is on.
   - `outputReady` to one yielded frame `{ "<node_id>:<kind>": ref }` where
     `kind` is `image | audio | video` from `output.type`, and `text` and
     `file` outputs land on `"<node_id>:text"` and `"<node_id>:file"`. Bytes
     come from `output.toBytes()` during the run because the signed URL
     expires (fact 7). The ref is `{ type, uri: "", data: base64, mimeType }`.
4. On terminal status: `failed` throws with `job.error` (`code`, `message`,
   `node_id`, `class_type`), `canceled` throws a cancellation error,
   `succeeded` yields the final `{ output: job.outputs }` frame.
5. The node's abort signal aborts `submit` and calls `job.cancel()`. This is
   the cancellation the existing nodes lack.

Nodes set `autoSaveAsset = true` so refs are persisted instead of living as
base64 in the run record. Timeout default stays 600 seconds and is enforced
by the node via the signal, since Cloud caps runs at 30 or 60 minutes anyway.

### D4. Node `lib.comfy.RunWorkflowOnCloud`

Props: `workflow` (JSON string, required), `timeout`, `previews`.
`requiredSettings = ["COMFY_API_KEY"]`. `supportsDynamicInputs` and
`supportsDynamicOutputs` true, `metadataOutputTypes = { output: "dict[str, any]" }`.
Body is `runComfyWorkflow(cloudTransport(key), ...)`.

Cost: after the terminal status, if `job.metrics` contains a GPU-seconds key
(unknown until observed against a real job), report it through
`context.setProviderCost("comfy_cloud", usd, "USD", { billing_unit: "gpu_seconds", quantity, provider_request_id: job.id })`
with the plan rate table. Otherwise record `provider_request_id` only and
leave the amount null. Do not guess a number.

### D5. Node `lib.comfy.RunWorkflowOnWorker`, rewritten

Same props as today. `worker_url` is turned into an HTTP origin (`ws` to
`http`, `wss` to `https`, path dropped), and the body is
`runComfyWorkflow(v2Transport(origin, worker_token), ...)`. Outputs move to the
`<id>:<kind>` convention, which fixes the slot-naming gap and makes the node
stream. The `comfy.*` bridge calls (`comfyExecute`, `cancelComfyExecute`,
`comfyUpload`, and the rest in `python-bridge-base.ts`) lose their only
caller. Remove them from the TypeScript bridge, `swappable-python-bridge.ts`,
and the `comfy.execute` / `comfy.event` frame schemas in
`bridge-frames.ts` in the same change, with the `supportsComfy` gate replaced
by a `worker.status.comfy.api_v2: true` flag the new image reports.

Cross-repo dependency: the worker in `nodetool-core` mounts
`comfy-api-proxy`'s v2 routes on its existing port 7777 behind its existing
bearer auth. The RunPod proxy already exposes that port over HTTPS
(`https://<podid>-7777.proxy.runpod.net`), so no new port is published and
ComfyUI itself stays loopback-only. `comfy-api-proxy` is aiohttp, the same
stack as the worker, so mounting its routes is the intended path per its
README. Until that image ships, the old node body stays behind the
`supportsComfy` gate and the new body is selected on the `api_v2` flag.

### D6. Node `lib.comfy.RunWorkflow`, unchanged now

Keeps `comfy-executor.ts`. Two small fixes ride along because they share the
`runComfyWorkflow` frame contract: wire `cancel()` to the node's abort signal
and expose `include_temp`. When ComfyUI core serves v2, the body becomes
`runComfyWorkflow(v2Transport(endpoint), ...)` and the executor and its test
are deleted.

### D7. Web

- `DYNAMIC_COMFY_NODE_TYPE` becomes `DYNAMIC_COMFY_NODE_TYPES`, a set of all
  three types, in `nodeTypes.ts`, `dynamicSlotTypes.ts` and
  `ReactFlowWrapper.tsx`. All three get the Load Workflow dialog and
  schema-derived handles.
- `providerCatalog.ts` gains a Comfy Cloud card in the `media` section with a
  vendored icon and `docsUrl` pointing at platform.comfy.org.
- `nodeProvider.ts` maps `COMFY_API_KEY` to a display name. The
  `namespaceToSecretKey` map stays untouched, since only one of the three
  `lib.comfy` nodes needs a key. The missing-key badge for the Cloud node
  comes from its `requiredSettings` metadata, which is per node type.
- `optionalNodePacks.ts`: `lib.comfy` stays in the Developer Tools pack for
  now. Whether the Cloud node should be visible by default is Q1.

### D8. Protocol and cloud profile

- `PROVIDER_IDS.COMFY_CLOUD` in `packages/protocol/src/api-types.ts`.
- `CLOUD_NODE_ALLOWLIST` in `cloud-profile.ts` adds
  `lib.comfy.RunWorkflowOnCloud`. The comment that explains why the runners
  are named rather than whole-listed extends to three names.

### D9. Egress and packaging

- `packages/runtime/tests/url-egress-inventory.ts` and
  `docs/url-egress-inventory.md` gain an entry for the SDK transport:
  `cloud.comfy.org` fixed for the Cloud node, operator-configured for the
  worker node. The SDK attaches `Authorization` only to requests aimed at its
  own origin and follows the spec rule of resolving host-relative links
  against the request origin, which is the property the inventory records.
- `@comfyorg/sdk` is added to `packages/integration-nodes`, where the nodes
  live, matching `@fal-ai/client` in `fal-nodes`. Run `npm run backend:smoke`
  after adding it: the packaged Electron backend stages a flat `_modules`
  and `hash-wasm` ships WebAssembly inline, which has to be confirmed rather
  than assumed.

### D10. Tests

- `comfy-sdk.test.ts`: `runComfyWorkflow` against a fake transport whose
  `submit` returns a scripted `Job` with a scripted `events()` stream.
  Cases: scalar and media injection, per-output frames in arrival order,
  `failed` with `job.error`, `canceled`, abort mid-stream calls `cancel()`,
  `QueueFull` and 402 messages, `previews` on and off.
- `v2Transport` submit loop: 429 with `Retry-After` retries, budget exhaustion
  throws, idempotency key reused across retries.
- Node metadata tests for the new type and the rewritten worker node, in the
  existing `comfy.test.ts` style.
- One provider test in `packages/runtime/tests/providers/` for
  `requiredSecrets` and the empty capability list.
- Web: `comfyDynamicSchema.test.ts` is unchanged, `dynamicSlotTypes` test
  covers the set.
- `packages/protocol/tests/bridge-frames.test.ts` and
  `packages/runtime/tests/python-bridge-comfy.test.ts` shrink with the
  removed frames.

### D11. Docs

`docs/comfyui.md` node table grows a row and a Cloud section, the worker
section drops the bridge-blob description, and the `comfy.*` bridge surface
section is removed. `docs/providers.md` gains a row. `docs/python-bridge-protocol.md`
loses the `comfy.*` family. `.claude/skills/nodetool-model-provider-config/SKILL.md`
lists the key. `packages/integration-nodes/README.md` links the node.

## Sequencing

1. **Cloud.** D1, D2, D3 (`cloudTransport` only), D4, D7, D8, D9, D10,
   D11 for the Cloud parts. Ships on its own and needs nothing from
   `nodetool-core`. Open the upstream `baseUrl` PR at the same time.
2. **Worker.** `nodetool-core` mounts the v2 routes and reports
   `comfy.api_v2`. Then D3 `v2Transport`, D5, and the bridge removal. Ships
   when the image does.
3. **Local.** D6's two fixes ship with step 1. The executor switch waits on
   ComfyUI core.

## Risks

- **R1. `job.metrics` may never carry cost.** Then the Cloud node reports no
  amount, and the provider's cost column stays empty. Acceptable, and
  documented in the node description rather than estimated.
- **R2. The worker step is blocked on `nodetool-core`.** Step 1 does not
  depend on it, and the old worker body stays until the flag appears.
- **R3. SDK is 0.1.x.** The README marks `QueueFull.retryAfter` becoming
  nullable as a breaking change already. Pin the exact version and cover the
  surface we use with the fake-transport tests so a bump fails locally, not
  in a run.
- **R4. Packaged Electron.** `hash-wasm` and the ESM-only package are the two
  things `backend:smoke` has to prove.

## Open questions

- **Q1.** Should `lib.comfy.RunWorkflowOnCloud` be visible in the default node
  menu? Today the whole namespace is behind the Developer Tools pack.
- **Q2.** Under `retrySafe`, should a NodeTool retry of the same node run
  reuse the idempotency key (and then recover the first job on
  `idempotency_key_reuse`) or submit fresh? Fresh is simpler and costs a
  duplicate run on a retry after a successful submit.
- **Q3.** Does the worker expose the v2 routes on 7777 behind the worker
  token, or publish `comfy-api-proxy` on 8189 with `--token`? This design
  assumes 7777, which keeps RunPod's existing proxy URL working.
