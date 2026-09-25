---
title: "Higgsfield provider research and implementation plan"
---

# Higgsfield provider research and implementation plan

**Status:** Implemented for the current image and video endpoint catalog, including the Genjutsu and Cinema Studio endpoints. Undocumented artifact families remain out of scope.
**Question:** How should NodeTool integrate the Higgsfield API without losing
model-specific capability, reliable asynchronous execution, or media safety?

## 1. Recommendation

Build `higgsfield` as a manifest-backed media provider and node pack. Use a
small, direct REST client for authentication, upload, submit, poll, cancel,
estimate, and result download. Do not use `@higgsfield/client` as the runtime
dependency: its documented TypeScript surface is oriented around automatic
polling, while NodeTool needs to own request IDs, cancellation, timeouts,
telemetry, durable generation lookup, and safe result ingestion.

Start with image and video models, including text-to-image, image editing,
text-to-video, image-to-video, reference-to-video, video editing, video
extension, and motion-transfer endpoints when their individual schemas are
verified. The shared API also describes audio and 3D artifacts. Add those only
after one public, model-specific schema and a NodeTool output contract are
verified for each artifact type.

The provider must be manifest-backed, not OpenAPI-backed. Higgsfield's own
documentation says that `/docs/openapi.json` is supplementary and not an
authoritative model catalog. It currently contains only a small subset of the
public catalog and omits documented upload and estimate endpoints. The public
model explorer exposes endpoint-specific IDs and parameter tables, but no
documented machine-readable catalog endpoint was found. The first shipped
manifest should therefore be curated from verified model pages and protected by
a source-link and schema-drift test. A catalog sync job is appropriate only
when Higgsfield documents a stable listing endpoint or supplies a supported
export.

## 2. Verified API surface

| Area | Observed contract | NodeTool consequence |
| --- | --- | --- |
| Authentication | Every API call uses `Authorization: Key <key-id>:<secret>`. Legacy `hf-api-key` and `hf-secret` headers exist but are discouraged. | Store `HIGGSFIELD_API_KEY_ID` and `HIGGSFIELD_API_KEY_SECRET` separately, compose the header only at the request boundary, and redact both from logs and spans. |
| Model invocation | `POST https://api.higgsfield.ai/<model-id>` submits JSON and returns a request controller. Each model has its own endpoint and input schema. | Model ID is a manifest field. The factory creates typed node properties from each verified schema rather than maintaining generic, lossy image and video forms. |
| Lifecycle | Submission returns `request_id`, `status_url`, and `cancel_url`. States are `queued`, `in_progress`, `completed`, `failed`, `nsfw`, and `canceled`. Only queued work can be canceled. | Persist the provider request ID immediately. Use returned controller URLs during the live run. When only the ID survives, recover through the documented ID-based endpoints described in P3. Translate `completed` to success, `failed` and `nsfw` to terminal generation errors, and `canceled` to NodeTool cancellation. |
| Output | Completed responses can include `images`, `video`, `audio`, or `audios`. Shared docs also name `zip`, `mov`, `jsx`, `fbx`, and `ply` artifacts for some video and 3D operations. | The transport must extract every known output URL, then the factory must expose all semantically distinct outputs. Do not ship a model whose multiple artifacts cannot be represented by declared slots. |
| Input media | A caller can pass public HTTPS URLs, or create a presigned URL at `POST /files/generate-upload-url`, PUT bytes with all returned headers, then pass `public_url`. Upload URLs expire after one hour. Documented types are JPEG, PNG, WebP, GIF, WAV, and MP4. | Resolve NodeTool `AssetRef` bytes, select and validate the MIME type, request an upload URL, upload without Higgsfield credentials, and pass the returned public URL. Reuse the package's safe external-media controls for downloads. |
| Polling | Higgsfield recommends a two-second initial delay, 1.5x backoff up to ten seconds, jitter, and an application-level timeout. Retry only polling GETs for transport/5xx failures. | Implement abort-aware polling with those bounds. Never retry a submission POST after an ambiguous failure because submissions have no idempotency key. |
| Webhooks | `hf_webhook` is a submission query parameter. Higgsfield POSTs terminal results, may deliver duplicates, retries network/5xx failures for up to two hours, and expects a response within ten seconds. The documentation does not describe a webhook signature. | Do not expose webhooks in the first release. Polling is sufficient for in-process workflow runs. Add a public route only after Higgsfield provides an authenticity mechanism or an explicit NodeTool policy accepts an unauthenticated, schema-validated callback. |
| Errors and limits | 400 can mean invalid input or concurrency reached. 401, 403, 404, 422, 423, 500, and 503 have documented meanings. Limits are account/model concurrency, with no standard rate-limit or `Retry-After` headers. Each response carries `X-Correlation-ID`. | Classify errors without parsing message text for durable decisions. Bound concurrent submissions per credential, retry polling 5xx only, and attach correlation ID plus request ID to structured diagnostics. |
| Billing | `POST /estimate/<model-id>` accepts the generation parameters and returns account-specific `credits` and `usd`. Successful generations are charged. Failed, NSFW, and successfully canceled queued work are refunded. Output URLs last at least seven days. | Add an optional estimate API and cost preview after the execution path ships. Absorb completed media into NodeTool storage immediately, because Higgsfield output is transient. Do not invent static price catalog entries from storefront prices. |
| SDKs | Official Python and TypeScript SDKs cover auth, uploads, polling, and cancellation. The documented TypeScript v2 example uses `subscribe(..., { withPolling: true })`; explicit lifecycle control is documented via Python. | Direct REST avoids a runtime dependency and supports the lifecycle NodeTool actually needs. The SDKs remain useful only as contract references and optional test comparators. |

Sources: [documentation index](https://docs.higgsfield.ai/docs/llms.txt),
[authentication](https://docs.higgsfield.ai/docs/authentication), [request
lifecycle](https://docs.higgsfield.ai/docs/concepts/requests),
[polling](https://docs.higgsfield.ai/docs/concepts/polling),
[uploads](https://docs.higgsfield.ai/docs/concepts/file-uploads),
[errors](https://docs.higgsfield.ai/docs/concepts/errors), [rate
limits](https://docs.higgsfield.ai/docs/concepts/rate-limits), [billing and
retention](https://docs.higgsfield.ai/docs/concepts/billing-and-retention),
[webhooks](https://docs.higgsfield.ai/docs/how-to/webhooks), and [SDKs](https://docs.higgsfield.ai/docs/how-to/sdk).

## 3. Model catalog and feature coverage

Higgsfield presents a broad, changing multi-vendor catalog behind the common
asynchronous contract. The public explorer currently exposes these product
families:

| Family | Verified examples and feature shape | Integration treatment |
| --- | --- | --- |
| Text-to-image | Soul 2, Marketing Studio Image, Recraft 4.1, Qwen Image 3, Z-Image Turbo | Typed image nodes. Preserve each model's resolution, aspect ratio, batch, seed, output-format, styling, and prompt-enhancement options. |
| Image editing | Marketing Studio Image accepts `image_urls`. Grok Imagine Image 2.0 accepts optional `image_urls` and has quality, resolution, and aspect-ratio controls. | Expose typed image or `list[image]` inputs, never raw URL strings. |
| Text-to-video | Seedance 2.5, Kling 3.0, MiniMax H3, Wan 3.0, LTX 2.5, Grok Imagine Video, Cinema Studio | Typed video nodes with model-specific duration, resolution, aspect ratio, sound/audio, output-format, camera, CFG, multi-shot, and multi-prompt properties. |
| Image/reference-to-video | Seedance, Kling, Grok, and related variants expose image or reference inputs. | Map images, video, and audio references to typed input fields. When the upstream schema has one heterogeneous reference array, use the AtlasCloud `wrapInto` approach to preserve media typing. |
| Video transformation | Seedance video edit/extend, Kling video edit/reference/motion control, Genjutsu motion transfer/object swap | Ship only after verifying every input and every output from that model page. These belong to `video_to_video` or `reference_to_video`, not a generic text-to-video node. |
| Marketing workflows | Marketing Studio has direct generation/editing and preset-enhanced mode. Enhanced requests require one product image, `preset_id`, and a live visible-preset catalog. They cost 10% more. | Add a dedicated preset-list API/tool and a specialized node or dynamic property source. Never bake CMS-managed preset UUIDs into the manifest. |
| Audio and 3D | The common output and webhook contracts mention audio and 3D artifacts, but the public catalog and supplementary OpenAPI inspected here do not provide a complete verifiable model list or typed schema for them. | Treat as a deliberately deferred capability, not proof that it is unsupported. |

Representative schema evidence shows why a generic form would lose value:

- [Seedance 2.5](https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference)
  takes prompt, 4–30 second duration, 480p/720p resolution, six aspect ratios,
  MP4/MOV output, and optional audio.
- [Kling 3.0 Standard](https://open.higgsfield.ai/models/kling-video/v3.0/std/text-to-video/api-reference)
  adds sound, element IDs, CFG scale, multi-shot, and `multi_prompt`.
- [Marketing Studio Image](https://open.higgsfield.ai/models/marketing-studio/image/api-reference)
  has a paginated live preset list and distinct direct/editing versus enhanced
  modes.
- [Grok Imagine Image 2.0](https://open.higgsfield.ai/models/xai/grok-imagine-image-2.0/api-reference)
  supports image editing, quality, 1K/2K resolution, and a distinct aspect
  ratio set.
- [Recraft 4.1](https://open.higgsfield.ai/models/recraft/v4.1/text-to-image/api-reference)
  accepts structured color and background-color objects in addition to image
  generation controls.

The public model explorer is discovery evidence, not a stable API contract. It
shows the current direct image and video families and links each family to
endpoint-specific variants. The manifest maps those direct endpoints, including
the related-model variants listed on the official family pages. Genjutsu motion
transfer, Genjutsu object swap, and Cinema Studio 4.0 now publish API-reference
pages with the same `POST https://api.higgsfield.ai/<model-id>` contract and a
typed input schema, so the manifest includes them. The explorer's Product
Shots, Graphic Ads, and Marketplace Design workflows route to Marketing Studio
Image and need no separate entry. The catalog also lists
`higgsfiled/genjutsu/motion-transfer/v1.0`, a misspelled alias of the Genjutsu
motion-transfer workflow, which the manifest omits. See [the public explorer](https://open.higgsfield.ai/explore),
[image explorer](https://open.higgsfield.ai/explore/image), and [video explorer](https://open.higgsfield.ai/explore/video).

### Current direct endpoint catalog

The checked-in manifest covers every endpoint reachable from the explorer's
catalog families and their related-model tables. Three inferred routes were removed after the
official API pages returned 404s: Grok Imagine Video text-to-video and
image-to-video siblings, plus Kling 2.5 Turbo Standard text-to-video.

- Image: Marketing Studio Image with its 2.5 Flare and 2.5 Sunburst variants,
  Grok Imagine 2.0, Soul 2, Ideogram 4.0, Recraft 4.1 with its Pro, Utility,
  and Utility Pro variants, Soul Standard, Qwen Image 3 text and edit, and
  Z-Image Turbo.
- Higgsfield: Cinema Studio 4.0 and Genjutsu motion transfer and object swap.
- ByteDance: Seedance 2.5 and Seedance 2.0 text, image, reference, edit, and
  extension endpoints.
- Kling: 3.0 standard, pro, 4K, turbo, and motion-control endpoints, O3
  first/last-frame, image-reference, video-edit, and video-reference endpoints,
  2.6 text/image/motion-control endpoints, Omni first/last-frame,
  image-reference, video-edit, and video-reference endpoints, and 2.5 Turbo
  standard image and pro text/image endpoints.
- Alibaba, MiniMax, Lightricks, xAI, and PixVerse: Wan 3.0 Prime, Wan 3.0,
  Wan 2.7, Wan 2.6, Happy Horse 1.1, Happy Horse 1.0, MiniMax H3, MiniMax
  Hailuo 2.3 Standard, LTX 2.5 Fast/Pro, Grok Imagine Video 1.5, and PixVerse
  V6 across the direct modes exposed by their official related-model tables.

The endpoint IDs and field lists are stored in
[`packages/higgsfield-nodes/src/higgsfield-manifest.json`](https://github.com/nodetool-ai/nodetool/blob/main/packages/higgsfield-nodes/src/higgsfield-manifest.json),
with source links and verified field names in
[`packages/higgsfield-nodes/src/schema-fixtures/catalog.json`](https://github.com/nodetool-ai/nodetool/blob/main/packages/higgsfield-nodes/src/schema-fixtures/catalog.json).
The official [MiniMax H3 family page](https://open.higgsfield.ai/models/minimax/h3/text-to-video/playground),
[Wan family page](https://open.higgsfield.ai/models/alibaba/wan-3.0-prime/text-to-video/playground),
[Kling family page](https://open.higgsfield.ai/models/kling-video/v2.6/pro/text-to-video/playground),
and [LTX family page](https://open.higgsfield.ai/models/lightricks/ltx-2.5/text-to-video/pro/playground)
provide the related endpoint tables used for this expansion.

## 4. Implementation plan

### P1 — Establish the package and credential boundary

1. Add `packages/higgsfield-nodes/` to the root workspace and create its
   `AGENTS.md` plus `CLAUDE.md` pointer. Model it on `atlascloud-nodes` because
   both are asynchronous multi-model media APIs.
2. Add `HIGGSFIELD_API_KEY_ID` and `HIGGSFIELD_API_KEY_SECRET` to
   `packages/config/src/setting-catalog.ts`. Register `PROVIDER_IDS.HIGGSFIELD`
   in `packages/protocol/src/api-types.ts`, the provider registry, built-in pack
   catalog, node search prefixes, and Settings labels.
3. Create `higgsfield-transport.ts` in `packages/runtime/src/providers/` with
   exact Zod-validated response shapes for submission, status, upload URL,
   estimate, error, and media outputs. Use `Authorization: Key id:secret` only
   at this boundary. Instrument each external request and retain the response
   correlation ID.
4. Implement abort-aware helpers: `higgsfieldCreateUploadUrl`,
   `higgsfieldUploadMedia`, `higgsfieldSubmit`, `higgsfieldGetStatus`,
   `higgsfieldAwaitResult`, `higgsfieldCancel`, `higgsfieldEstimate`, and
   `higgsfieldDownloadResult`. Retry only idempotent status GETs and billed
   result downloads, never job-creating POSTs.

### P2 — Ship manifest-driven image and video nodes

1. Add `higgsfield-manifest.json`, `higgsfield-factory.ts`, and
   `higgsfield-base.ts` to `packages/higgsfield-nodes/`. Reuse the current
   factory conventions: typed `AssetRef` defaults, `metadataOutputTypes`,
   `loadMediaRefBytes`, and `fetchExternalMedia` for billed outputs.
2. Define a manifest schema with: stable model ID, title, source documentation
   URL, modality/task classification, output slots, poll budget, parameter
   schema, asset-field mapping, and an explicit lifecycle/config version.
3. Seed it with the current source-backed direct endpoint catalog. Every
   manifest entry must have a source link, a catalog fixture entry, typed input
   fields, and an output contract. Add future endpoints only after the same
   evidence is captured.
4. Register the pack in `packages/websocket/src/node-registry-setup.ts` and add
   `@nodetool-ai/higgsfield-nodes` to `packages/websocket/package.json`.
5. Register `{ pkg: "@nodetool-ai/higgsfield-nodes", path: "higgsfield-manifest.json" }`
   in [PACKAGE_RUNTIME_ASSETS](https://github.com/nodetool-ai/nodetool/blob/main/packages/config/src/package-asset-registry.ts).
   Copy the manifest into `dist`, expose it from package exports, and load it
   through `loadPackageAssetJson`. Registration is required in development as
   well as the packaged backend because the loader rejects unregistered assets.

### P3 — Add the generic provider capability layer

1. Create `HiggsfieldProvider` in `packages/runtime/src/providers/`, register
   it from `index.ts`, and use the manifest loaders for available image/video
   models and offline model validation.
2. Implement `textToImage`, `imageToImage`, `textToVideo`, `imageToVideo`,
   and `referenceToVideo` only where manifest evidence establishes the input
   mapping. Forward model-specific options without dropping them, but reject
   unrecognized options before submission.
3. Persist the full upstream `request_id` as `provider_request_id` at acceptance,
   before waiting for completion. Use NodeTool's awaited durable acceptance hook
   through `recordGenerationReceiptAsync` so a worker restart after acceptance
   does not lose the ID. Use terminal error classes that retain both
   Higgsfield's `error` and `X-Correlation-ID`.
4. Add generated-output ingestion through NodeTool storage during the same run.
   Retention is not a reason to leave external URLs in persisted workflow state.
5. Implement `getGeneration(requestId, options)` as a single status lookup using
   the existing [ProviderGenerationLookup](https://github.com/nodetool-ai/nodetool/blob/main/packages/runtime/src/providers/provider-generations.ts)
   interface. For restart recovery or an ID-only lookup, explicitly allow
   `GET https://api.higgsfield.ai/requests/{request_id}/status` and
   `POST https://api.higgsfield.ai/requests/{request_id}/cancel`, as documented
   in the [status reference](https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status)
   and [cancellation reference](https://docs.higgsfield.ai/docs/api-reference/requests/cancel-a-queued-request).
   Validate the upstream UUID and encode it as one path segment. Authenticate
   with the owning account's credentials. This is the recovery exception to
   using returned controller URLs during a live run. Recovery must never submit
   a replacement generation. Treat a successful cancellation's empty `202`
   response as accepted and a `400` after processing starts as a cancellation
   rejection, not a canceled generation.

### P4 — Add dynamic catalog features only after the core is sound

1. Implement the Marketing Studio presets client, including cursor pagination,
   credential forwarding, and a refreshable UI selection. Require it only when
   `enhance_prompt` is true.
2. Add an estimate endpoint to generic-node preflight or cost UI. The estimate
   must use the exact payload that will be submitted, minus NodeTool-only
   properties, and must never become a static rate table.
3. Add audio, 3D, webhook acceleration, and new model families only with a
   source-backed schema, typed output mapping, cancellation behavior, and
   regression fixture. Webhooks remain optional optimization over polling.
4. Create a schema-import or drift-check script only after a documented
   machine-readable catalog is available. Until then, a failing test should
   ensure every manifest entry has a reachable source page and a stored schema
   fixture.

## 5. Verification plan

| Layer | Required evidence |
| --- | --- |
| Transport | Unit tests for auth composition, request/status parsing, each terminal status, 400 concurrency vs validation handling, 401/403/422 no-retry, 5xx GET retry, ambiguous POST no-retry, cancellation, timeout, and correlation-ID capture. |
| Upload | Tests that every returned upload header is sent, credentials are not sent to the presigned host, MIME validation rejects unsupported content, and an uploaded `public_url` is substituted into the model payload. |
| Factory | Tests for scalar, enum, object, array, single media, list media, heterogeneous reference groups, all declared output slots, and models whose output cardinality cannot be represented. |
| Provider | Contract tests for manifest model enumeration, each initial generic capability, request-ID lookup, terminal result mapping, and immediate result absorption. Test restart recovery after durable acceptance with all in-memory controller state discarded: recover status and completed outputs using the saved ID and owning credentials, cancel queued work through the ID-based endpoint, preserve running status when cancellation is rejected, and assert that recovery makes no generation POST. |
| Security | Add all Higgsfield submit, status, upload, and result hosts to the URL egress inventory. Verify hostile output URLs cannot reach private/local addresses and result downloads retry only after a job is accepted. |
| Packaging | Manifest asset is registered in `PACKAGE_RUNTIME_ASSETS`, copied into `dist`, exposed from package exports, and loaded through `loadPackageAssetJson`. Verify registered loading and rejection of an unregistered manifest, plus manifest staging and loading in the bundled backend. Run `npm run backend:smoke` when adding the manifest asset. |
| Repository gate | Run `npm run test:affected`, `npm run typecheck`, `npm run lint`, and `npm run dev:nodetool -- harness gate --base origin/main`. |

## 6. Risks and decisions needed before coding

**R1 — Catalog freshness.** There is no verified public model-list endpoint.
The implementation must not pretend static coverage is the whole Higgsfield
catalog. The curated-manifest approach makes coverage explicit and safe, but
new models require an update until Higgsfield supplies an official catalog.

**R2 — Webhook authenticity.** The webhook guide specifies delivery and retry
behavior but no signing header or verification recipe. A public callback route
without verification would expand NodeTool's attack surface. Poll first.

**R3 — Timeout ownership.** Higgsfield asks clients to choose a model-specific
application timeout, but does not publish all expected durations. Store a
conservative per-manifest budget and let a workflow-level timeout shorten it.

**R4 — Exact cost accounting.** Estimate responses are account and parameter
specific. Use the authenticated estimate when available; do not infer cost from
the explorer's promotional storefront prices.

**R5 — Model access.** A documented model can still return 404, 423, or 503
for a given account. Model visibility in a NodeTool manifest means supported
integration, not guaranteed entitlement.

## 7. Explicit non-goals for the first release

- Browser-side Higgsfield requests or credentials.
- Automatic retry of a generation submission.
- A generic untyped JSON node as the primary user experience.
- An unauthenticated public webhook endpoint.
- Static pricing claims based on storefront prices.
- Shipping unverified audio or 3D model nodes solely because the shared result
  envelope can represent their artifacts.
