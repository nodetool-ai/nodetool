# SDK v1 golden fixtures

The committed fixtures cover every implemented SDK v1 HTTP operation and the
public execution wire. Replay tests live in `packages/websocket/tests/`:

- `sdk-v1-http-goldens.test.ts` reads `http-*.json`.
- `sdk-v1-execution-contract.test.ts` reads `execution-wire.json`.

The original capture record is
`docs/sdk/phase-0-baseline-2026-08-22.md`. The Phase 8 pre-release cleanup
intentionally removes the unused compatibility transports recorded there.

## HTTP fixtures

There is one `http-*.json` file per operation. `route` records the owning
Fastify route, authentication policy, and feature flag. Each capture records:

- `via`: `fastify` for the production route plugin or `handler` for the
  specialized multipart upload adapter.
- `env`: the effective SDK feature flags.
- `request`: method, path, headers, JSON body, and optional multipart details.
- `response`: status, content type, and exact JSON body.

`not_captured` explains any standard error class without a fixture and where
that behavior is tested.

## Execution fixture

`execution-wire.json` freezes all six C# SDK commands plus target selection,
replay, live updates, terminal results, and protocol rejection events. Its test
also verifies that the operation registry and live runner switch have the same
complete command inventory.

## Determinism

The tests pin all inputs that could otherwise vary: time, workflow ids,
services, upload ids and limits, and pack configuration. A fixture diff must
therefore represent a deliberate public contract change.

## Regenerating

```bash
cd packages/websocket
NODETOOL_UPDATE_SDK_V1_GOLDENS=1 npx vitest run tests/sdk-v1-http-goldens.test.ts
npx vitest run tests/sdk-v1-http-goldens.test.ts tests/sdk-v1-execution-contract.test.ts
```

Review fixture changes before committing them. After the deliberate Phase 8
contract cleanup, any unreviewed byte change is a regression.
