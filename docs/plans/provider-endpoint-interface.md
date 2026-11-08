# Provider endpoint interface

Provider node packs call their vendors through the provider interface instead
of carrying their own transport. This document is the design and the task
plan for that change.

## Problem

Every vendor that ships a node pack already has a provider class in
`packages/runtime/src/providers/`. The packs do not use it. They carry a
second transport for the same vendor:

| Pack | Call path today | Runtime provider |
|---|---|---|
| `fal-nodes` | `falSubmitWithGeneration` (`src/fal-base.ts`) opens `context.runGenerationWith`, but the request runs in the node through `@fal-ai/client` with the API key. `src/fal-provider.ts` is a second `FalProvider`, exported from the pack. | `fal-provider.ts` (`fal_ai`) |
| `replicate-nodes` | `replicateSubmit` (`src/replicate-base.ts`) calls `replicate.run()`. No generation record. | `replicate-provider.ts` (`replicate`) |
| `kie-nodes` | Raw `fetch` to create, poll, upload and download (`src/kie-base.ts`). No generation record. | `kie-provider.ts` (`kie`) |
| `higgsfield-nodes` | Calls runtime transport helpers (`higgsfieldSubmit`, `higgsfieldAwaitResult`) directly. | `higgsfield-provider.ts` |
| `topaz-nodes` | `fetchWithRetry` from `@nodetool-ai/runtime/provider-transport` in the node. | `topaz-provider.ts` (`topaz`) |
| `atlascloud-nodes`, `minimax-nodes`, `together-nodes`, `reve-nodes`, `huggingface-nodes` | Raw `fetch` or a vendor SDK in the node. | One provider each |
| `elevenlabs-nodes` | `fetch` for request and response nodes, a `ws` WebSocket for the realtime nodes. | `elevenlabs-provider.ts` (`elevenlabs`) |

This split has four costs.

1. Each vendor has two transports with their own retry rules, timeouts,
   upload paths and cost handling, and they drift.
2. Nodes hold API keys. `getReplicateApiKey`, `getApiKey` (KIE) and
   `getFalApiKey` read `secrets` and fall back to `process.env`.
3. Only FAL writes a generation record. The other packs bypass
   `runGenerationWith`, so their calls have no `Prediction` row and no
   receipt.
4. A host that runs node code somewhere other than the server, such as the
   native graph runner, has to support every vendor SDK separately. With one
   provider interface it needs only a few provider operations.

## Goals

1. Every request and response node in the packs above reaches its vendor
   through `context.getProvider(<id>)`.
2. Node code never reads a provider API key.
3. Every provider call runs inside the generation seam, so it writes the same
   record, receipt and terminal messages.
4. One vendor transport per vendor, in `packages/runtime/src/providers/`.
5. Node types, inputs, outputs and the manifests keep their current shape.
   Existing workflows run unchanged.

## Non-goals

1. Realtime WebSocket nodes (`elevenlabs-nodes` realtime STT and TTS). They
   need a session interface. See [Follow-up: realtime sessions](#follow-up-realtime-sessions).
2. Changes to the provider capability methods (`textToImage` and so on) or to
   the providers used by `llm-nodes`, which already go through `getProvider`.
3. Server WebSocket commands, and the native graph runner. They are consumers
   of this interface and come later.
4. Moving pricing tables. Pack-level pricing (`fal-cost.ts`, `fal-billing.ts`,
   `kie-pricing-api.ts`, the unit pricing catalogs) stays where it is.

## Design

### Endpoint calls on `BaseProvider`

The manifest-driven packs (FAL, Replicate, KIE, AtlasCloud, Higgsfield) build
nodes at load time from JSON manifests through their factory files
(`fal-factory.ts`, `replicate-factory.ts`, `kie-factory.ts`,
`higgsfield-factory.ts`, `atlascloud-factory.ts`). Each node posts
vendor-shaped JSON to one of hundreds of endpoints. The capability methods
cannot carry those arguments, so the provider interface gains a raw call.

Add to `packages/runtime/src/providers/base-provider.ts`:

```ts
export interface EndpointProgress {
  /** Human-readable status, such as a queue position or a vendor log line. */
  message?: string;
  /** 0 to 1 when the vendor reports it. */
  progress?: number;
}

export interface EndpointCallRequest {
  /** The vendor's endpoint or model id, such as "fal-ai/flux/dev",
   * "owner/model:version" or a KIE model name. */
  model: string;
  /** Arguments exactly as the vendor expects them. Media inputs are URLs the
   * caller obtained from uploadMedia or already had. */
  input: Record<string, unknown>;
  /** A vendor sub-route for providers with several endpoint families, such as
   * a KIE custom endpoint path or the Suno route. Providers document the
   * values they accept and reject others. */
  route?: string;
  signal?: AbortSignal;
  onProgress?: (event: EndpointProgress) => void;
}

export interface EndpointCallResult {
  /** The vendor's output JSON, unchanged. */
  output: unknown;
  /** The vendor's request, prediction or task id. */
  requestId: string | null;
  /** Vendor billing data the pack needs for cost reporting, such as KIE
   * credits consumed. Opaque to the runtime. */
  metadata?: Record<string, unknown>;
}

export interface MediaUpload {
  bytes: Uint8Array;
  mimeType: string;
  filename?: string;
  signal?: AbortSignal;
}
```

Add three methods with defaults:

```ts
/** True when callEndpoint is implemented. uploadMedia may still throw when
 * the vendor has no standalone upload step. */
supportsEndpointCalls(): boolean { return false; }

async callEndpoint(_req: EndpointCallRequest): Promise<EndpointCallResult> {
  throw new Error(`${this.provider} does not support endpoint calls`);
}

/** Store bytes where the vendor can read them and return the URL. */
async uploadMedia(_upload: MediaUpload): Promise<string> {
  throw new Error(`${this.provider} does not support media uploads`);
}

/** Fetch a result URL the vendor returned. The default uses fetchExternalMedia.
 * A provider whose result URLs need credentials overrides it. */
async downloadMedia(url: string, signal?: AbortSignal): Promise<Uint8Array>;
```

`downloadMedia` keeps result downloads inside the provider, so a vendor that
signs or authenticates result URLs keeps its credentials there. The default
implementation calls `fetchExternalMedia`, which applies the existing egress
policy.

Each provider implements these methods from code it already has: FAL's
`subscribe` and storage upload, Replicate's prediction run and files upload,
KIE's create-task, poll and upload, Higgsfield's submit and await. A provider
that supports endpoint calls returns `true` from `supportsEndpointCalls`.

### One context entry point for nodes

Nodes do not call `runGenerationWith` and `getProvider` themselves. Add to
`ProcessingContext` (`packages/runtime/src/context.ts`):

```ts
async callProviderEndpoint(args: {
  provider: string;                       // PROVIDER_IDS value
  capability: GenerationRequest["capability"];
  model: string;
  input: Record<string, unknown>;
  route?: string;
  nodeId?: string;
  onProgress?: (event: EndpointProgress) => void;
  signal?: AbortSignal;
}): Promise<EndpointCallResult>
```

It does what `falSubmitWithGeneration` does today, for every vendor:

1. When `currentGenerationProviderRequestOptions()` reports an enclosing
   seam, it calls `provider.callEndpoint` directly, so no second ledger row
   opens.
2. Otherwise it calls `runGenerationWith` with `provider`, `capability`,
   `model`, `params: input`, `nodeId` and `origin: { surface: "workflow",
   node_id }`, and the call function invokes `provider.callEndpoint` with the
   seam's abort signal.
3. It returns the provider's result with `requestId` filled from the receipt
   when the provider did not set it.

Add `uploadProviderMedia({ provider, bytes, mimeType, filename, signal })` and
`downloadProviderMedia({ provider, url, signal })` as thin wrappers over
`getProvider(provider)`.

The context resolves the provider through its existing path: an injected
resolver, else the registry with `getSecret`. The registry already falls back
to environment variables through `readCredentialEnv`, so nodes lose nothing by
dropping their own `process.env` reads.

### Credentials

Nodes keep their `requiredSettings` declarations. The UI uses them to show
which key a node needs, and `_resolveSecrets` still checks them before
`process` runs. Nodes stop passing the resolved key anywhere. These functions
go away once their callers move: `getFalApiKey`, `getReplicateApiKey`, KIE
`getApiKey`, and any per-pack key helpers in the other packs.

### Cost reporting

Packs that report vendor billing (`reportKieProviderCost`, FAL billing, the
KIE cost reconciler) keep that code. They read what they need from
`EndpointCallResult.metadata` and `requestId` instead of from the raw
response. `registerKieCostReconciler` reads `KIE_API_KEY` itself today. It
moves to a provider method (`KieProvider.fetchBillingCost(requestId)`) so the
key stays in the provider.

### Inputs, uploads and outputs

The node flow becomes:

1. Resolve input media refs to bytes with the existing helpers
   (`loadMediaRefBytes`, `assetToUrl` and similar).
2. Upload bytes the vendor needs as URLs through `context.uploadProviderMedia`.
   Pass through URLs that are already public, as the packs do today.
3. Call `context.callProviderEndpoint`.
4. Map `output` to node outputs with the existing pack mappers
   (`outputToImageRef`, `falOutputToRefs` and similar).
5. Download result URLs through `context.downloadProviderMedia` where the pack
   downloads today. Keep URL pass-through where the pack returns URLs today.

Pack mappers and manifest handling stay in the packs. Only transport moves.

### Duplicate code to remove

1. `packages/fal-nodes/src/fal-provider.ts`, the second `FalProvider`. Check
   its importers first. If anything outside the pack uses its exports, point
   them at the runtime `FalProvider`. Remove the export from
   `packages/fal-nodes/src/index.ts`.
2. Transport helpers in the packs that no caller uses after migration:
   `falSubmit`, `falSubmitWithMeta`, `falUpload`, `replicateSubmit`,
   `uploadToReplicate`, the KIE `submitTask`, `pollKieTask`, `uploadFile` and
   the custom-endpoint helpers, the Topaz `fetchWithRetry` call sites, and the
   per-pack `fetch` wrappers in the hand-written packs.
3. Pack-local copies of vendor constants (base URLs, poll intervals) that now
   live only in the runtime provider.

### Egress inventory

`docs/url-egress-inventory.md` lists pack files that fetch caller-provided or
provider-returned URLs, and `packages/runtime/tests/url-egress-audit.test.ts`
enumerates those call sites. Moving a fetch from a pack into a provider moves
its inventory row. Every migration task updates both in the same commit. The
audit must still inspect at least one call site per row, as it does today.

### Consumers after this change

These are out of scope here and listed so the interface fits them.

1. **Native graph runner.** Its guest already wraps provider calls as host
   operations (`provider:<id>:open/next/close`, `prediction:<id>:<capability>`).
   Endpoint calls add `provider:<id>:callEndpoint`, `uploadMedia` and
   `downloadMedia`. The embedder decides whether they run on the server, in a
   sidecar or in process.
2. **Server WebSocket.** A single `provider_call` command that runs a provider
   method inside the generation seam can replace per-mode fields on
   `generate_media`.
3. **Parity and unit tests.** One scripted provider that answers
   `callEndpoint` makes every pack testable without the network.

### Follow-up: realtime sessions

The ElevenLabs realtime nodes keep a WebSocket open and exchange frames in
both directions. A request and response call does not fit. The follow-up adds
a session interface to `BaseProvider`:

```ts
openSession(req: { model: string; config: Record<string, unknown>;
  signal?: AbortSignal }): Promise<ProviderSession>;

interface ProviderSession {
  send(frame: Uint8Array | string): Promise<void>;
  receive(): AsyncIterable<Uint8Array | string>;
  close(): Promise<void>;
}
```

This matches the guest's existing cursor shape (`open`, `next`, `close`). It
is a separate pull request.

## Testing strategy

1. **Runtime unit tests** for `callProviderEndpoint`: it opens one generation
   record, it opens none inside an enclosing seam, it forwards the abort
   signal, it fills `requestId` from the receipt, and an unsupported provider
   produces the default error.
2. **Provider unit tests** per vendor for `callEndpoint`, `uploadMedia` and
   `downloadMedia`, with `fetch` or the vendor SDK mocked at the provider
   boundary, as each provider's existing tests do.
3. **Pack tests** mock the provider instead of `fetch` or the SDK. Use
   `context.setProviderResolver` with the scripted provider. Extend
   `packages/runtime/src/providers/scripted-provider.ts` to answer
   `callEndpoint`, `uploadMedia` and `downloadMedia` from scripted responses
   and to record each request.
4. **Behavior parity per pack.** Before changing a pack, record the request
   its current code sends for at least two representative nodes (one image,
   one video or audio where the pack has them). The migrated code must send
   the same endpoint, route and input JSON. Compare in a test, not by hand.
5. **Generation records.** For each pack, one test asserts that a node run
   emits a `prediction` message with the provider id, the capability and the
   model, which proves the call went through the seam.

## Tasks

Each task lists the files it changes and the tasks it depends on. Tasks in
the same phase can run in parallel. Each task updates the tests next to the
code it changes. Run only the affected package tests inside a task. The full
gate runs once, in T8.

### Phase 1: interface

**T1. Endpoint interface and context entry point.** Depends on nothing.
- `packages/runtime/src/providers/base-provider.ts`: add `EndpointProgress`,
  `EndpointCallRequest`, `EndpointCallResult`, `MediaUpload`,
  `supportsEndpointCalls`, `callEndpoint`, `uploadMedia`, `downloadMedia`.
  Export the types from the runtime barrel.
- `packages/runtime/src/context.ts`: add `callProviderEndpoint`,
  `uploadProviderMedia`, `downloadProviderMedia`.
- `packages/runtime/src/providers/scripted-provider.ts`: scripted endpoint
  responses and a request log.
- Tests: the runtime unit tests in [Testing strategy](#testing-strategy) item 1.
- Acceptance: `npm run test --workspace=packages/runtime` passes for the new
  and touched test files, and `npm run build:packages` builds the runtime.

### Phase 2: provider implementations and pack migrations

One task per vendor. Each task implements the endpoint methods on the runtime
provider, then migrates the pack, removes the pack's duplicate transport and
key helpers, and updates the egress inventory and audit rows it moves. Each
task depends on T1 only, so all of them run in parallel.

**T2. FAL.** Depends on T1.
- `packages/runtime/src/providers/fal-provider.ts`: `callEndpoint` from the
  existing `subscribe` path with queue progress mapped to `onProgress`,
  `uploadMedia` from the existing storage upload, `supportsEndpointCalls`.
- `packages/fal-nodes/src/fal-base.ts`, `fal-factory.ts`, `fal-dynamic.ts`:
  replace `falSubmitWithGeneration`, `falSubmitWithMeta`, `falSubmit` and
  `falUpload` with the context calls. Keep `falCapabilityForOutputType`, the
  output mappers and the billing code.
- Remove `packages/fal-nodes/src/fal-provider.ts` and its export after
  checking importers across the repository.
- Remove `getFalApiKey` and the `@fal-ai/client` dependency of the pack if
  nothing else in the pack uses it.

**T3. Replicate.** Depends on T1.
- `packages/runtime/src/providers/replicate-provider.ts`: `callEndpoint` from
  `runWithInput`, with `withReplicateRetry`. `uploadMedia` through the files
  API.
- `packages/replicate-nodes/src/replicate-base.ts`, `replicate-factory.ts`:
  use the context calls. Remove `getReplicateApiKey`, `replicateSubmit`,
  `uploadToReplicate`, `uploadBytesToReplicate`, and the `replicate`
  dependency of the pack if unused.

**T4. KIE.** Depends on T1.
- `packages/runtime/src/providers/kie-provider.ts`: `callEndpoint` covering
  the job API (`createTask` and polling), custom endpoints and Suno through
  `route`. `uploadMedia` from the upload URL. `downloadMedia` for result
  files. `fetchBillingCost(requestId)` for the reconciler. Return credits
  consumed in `metadata`. Keep the webhook path (`KIE_WEBHOOK_URL`) inside the
  provider.
- `packages/kie-nodes/src/kie-base.ts`, `kie-factory.ts`, `index.ts`,
  `video-clip.ts`: use the context calls. Move `registerKieCostReconciler` to
  the provider method. Remove `getApiKey` and the raw `fetch` helpers.

**T5. AtlasCloud, Higgsfield and Topaz.** Depends on T1.
- Runtime providers: `atlascloud-provider.ts` from `runJob` and the
  transport, `higgsfield-provider.ts` from `run` and the uploads,
  `topaz-provider.ts` from its submit, poll and download.
- Packs: `atlascloud-nodes/src/atlascloud-factory.ts` and its base,
  `higgsfield-nodes/src/higgsfield-base.ts`, `higgsfield-factory.ts`,
  `index.ts`, `topaz-nodes/src/topaz-base.ts`. Stop importing transport
  helpers from `@nodetool-ai/runtime` and `@nodetool-ai/runtime/provider-transport`
  in node code.

**T6. MiniMax, Together and Reve.** Depends on T1.
- Runtime providers: `minimax-provider.ts`, `together-provider.ts`,
  `reve-provider.ts`.
- Packs: `minimax-nodes/src/minimax-base.ts` and `src/nodes/*`,
  `together-nodes/src/together-base.ts`, `reve-nodes/src/reve-base.ts`.
  Keep `isSafeHttpUrl` predicates only where the inventory still lists them.

**T7. Hugging Face and ElevenLabs request nodes.** Depends on T1.
- Runtime providers: `huggingface-provider.ts` (from its client),
  `elevenlabs-provider.ts` (from `requestSpeech` and the other request paths).
- Packs: `huggingface-nodes/src/huggingface-base.ts` and the node files,
  `elevenlabs-nodes` request and response nodes. Leave
  `realtime-stt.ts` and `realtime-tts.ts` unchanged.

### Phase 3: integration

**T8. Merge, verify and document.** Depends on T2 to T7.
- Merge the phase 2 work into the feature branch. Resolve conflicts in
  `docs/url-egress-inventory.md`, `packages/runtime/tests/url-egress-audit.test.ts`
  and the runtime barrel.
- Update guidance in the same pull request:
  - `packages/AGENTS.md`: provider nodes call `context.callProviderEndpoint`
    and never read provider keys.
  - `packages/system-skills/nodetool-custom-node-developer/SKILL.md`: the same
    rule for authors of provider nodes.
  - Each migrated pack's README or AGENTS overlay where it describes the old
    transport.
- Run `npm run check:agents-docs` if agent docs changed.
- Run the verification in the [mandatory post-change checks](https://github.com/nodetool-ai/nodetool/blob/main/AGENTS.md#mandatory-post-change-verification):
  `npm run build:packages`, then `npm run test:affected`, `npm run typecheck`,
  `npm run lint`, `npm run dev:nodetool -- harness gate --base origin/main`.
- Open the pull request against `main`.

### Dependency summary

| Task | Depends on | Parallel with |
|---|---|---|
| T1 | none | none |
| T2 | T1 | T3, T4, T5, T6, T7 |
| T3 | T1 | T2, T4, T5, T6, T7 |
| T4 | T1 | T2, T3, T5, T6, T7 |
| T5 | T1 | T2, T3, T4, T6, T7 |
| T6 | T1 | T2, T3, T4, T5, T7 |
| T7 | T1 | T2, T3, T4, T5, T6 |
| T8 | T2 to T7 | none |

## Risks

1. **Behavior drift between the two transports.** The pack and provider
   copies may differ in retries, timeouts, upload targets or output shapes.
   The request parity tests in [Testing strategy](#testing-strategy) item 4
   pin the request. Where the copies differ, keep the pack's behavior for the
   node path and note the difference in the pull request.
2. **Generation records for packs that had none.** Replicate, KIE and the
   hand-written packs start writing `Prediction` rows and `prediction`
   messages. Check the cost ledger does not double count calls that also
   report `provider_cost` through `node_update`.
3. **Nested seams.** Some providers call each other or run inside an outer
   generation. `callProviderEndpoint` must keep the
   `currentGenerationProviderRequestOptions` check so no second row opens.
4. **Hidden importers.** `FalProvider` from `fal-nodes` and pack transport
   helpers may be imported elsewhere. Enumerate importers with a repository
   search before deleting.
