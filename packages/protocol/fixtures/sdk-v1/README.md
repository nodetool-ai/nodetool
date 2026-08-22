# SDK v1 Phase 0 golden fixtures

Captured baseline for every implemented SDK v1 operation
(docs/sdk/sdk-trpc-consolidation.md, Phase 0). The replay tests live in
`packages/websocket/tests/`:

- `sdk-v1-http-goldens.test.ts` reads `http-*.json`
- `sdk-v1-ws-goldens.test.ts` reads `ws-*.json`

Baseline record: `docs/sdk/phase-0-baseline-2026-08-22.md`.

## HTTP fixtures (`http-*.json`)

One file per operation. `route` names the owning Fastify route module, the
auth policy, the feature flag, and whether the `http-api.ts` second
dispatcher also serves the path. `captures` maps a capture name to:

- `via` — the dispatch path that produced it: `fastify` (the production
  route plugins), `http-api-dispatcher` (`handleApiRequest`), or `handler`
  (the multipart upload handler, the only injection point for `createId`
  and the upload limit).
- `env` — the three SDK flags with their effective values for the capture.
- `request` — method, path (with query), the headers the test sends, the
  JSON body, and a `multipart` descriptor for upload captures (the real
  multipart boundary is random and is not recorded).
- `response` — status, content type, and the exact JSON body.

`not_captured` explains every standard error class (feature-disabled, auth
failure, method-not-allowed) that has no capture, and where that behavior is
pinned instead.

## WebSocket fixtures (`ws-*.json`)

One file per command capture, including two feature-disabled error
envelopes. Each records the request and response envelopes plus their exact
MessagePack encoding (`messagepack_request_hex`, `messagepack_response_hex`,
via `packWebSocketMessage`). Key order in `request`/`response` is wire
order — these two objects are deliberately not key-sorted, because the test
asserts they re-encode to the recorded bytes.

## Determinism

Captures are byte-stable because the tests pin every input: `Date` is
frozen (workflow timestamps and etags derive from it), workflow ids are
fixed, all SDK services (capabilities, preflight, model catalog, model
downloads) are injected constants, the upload id and limit are injected,
and `NODETOOL_PACKS_CONFIG` points at a nonexistent file so
`unavailable_packs` reflects only the in-repo pack catalog. Nothing in
these fixtures is volatile; a diff means the public contract moved.

## Regenerating

```bash
cd packages/websocket
NODETOOL_UPDATE_SDK_V1_GOLDENS=1 npx vitest run tests/sdk-v1-http-goldens.test.ts tests/sdk-v1-ws-goldens.test.ts
npx vitest run tests/sdk-v1-http-goldens.test.ts tests/sdk-v1-ws-goldens.test.ts
```

Review the fixture diff before committing: during convergence
(Phases 1 to 3) the public bodies and bytes must not change, so a
regeneration that alters anything other than a deliberately-versioned
contract change is a regression, not an update.
