# SDK Protocol v1 Compatibility Rules

Rules for changing the public SDK v1 contract, the layout of the released
contract bundle, and the semantic diff that classifies contract changes.
The plan behind this file is `docs/sdk/sdk-trpc-consolidation.md` §5.5.

## Change rules

- **Response additions are tolerated.** Generated response schemas allow
  additional fields at every object level. Consumers must ignore response
  fields, event types, and enum values they do not understand. Adding an
  optional response field, a new operation, or a new planned operation is an
  additive change and needs no version decision.
- **Request changes need an explicit decision.** Generated request schemas
  reject unknown fields, so a new request field, a changed request schema, or
  a new required body on an existing operation is not additive. It requires a
  protocol version bump or an advertised capability that the client checks
  before sending the new shape.
- **Error codes are stable.** A declared error status (HTTP) or error code
  (WebSocket) may be added to an operation, but not removed or repurposed
  within protocol v1. Descriptions may be reworded; the status/code set a
  client can rely on only grows.
- **Operation identity is fixed.** An operation ID keeps its method and path
  (HTTP) or channel, command, and direction (WebSocket) for the life of
  protocol v1. A planned operation may become implemented; the reverse is a
  regression that the diff flags.

## Bundle layout

`npm run build:sdk-contract-bundle --workspace=packages/protocol` stages the
bundle in `packages/protocol/dist/sdk-contract-bundle/` and writes the archive
`packages/protocol/dist/nodetool-sdk-v1-contract-<protocol_version>.tar`:

```
sdk-v1.bundle.json                    bundle index: digests, commit, release
schema/sdk-v1.openapi.json            full HTTP contract (implemented + planned)
schema/sdk-v1.openapi.implemented.json  implemented-only client-generation input
schema/sdk-v1.asyncapi.json           full WebSocket contract
schema/sdk-v1.asyncapi.implemented.json implemented-only WebSocket profile
schema/sdk-v1.discovery.schema.json   discovery request/response components
schema/sdk-v1.lifecycle.schema.json   lifecycle request/response components
schema/sdk-v1.operations.json         operation manifest with status per operation
schema/sdk-v1.manifest.json           artifact manifest with per-artifact digests
fixtures/…                            JSON goldens and MessagePack hex captures
docs/protocol-v1-compatibility.md     this file
```

The archive is a plain USTAR tar with fixed metadata (mtime 0, uid/gid 0,
mode 0644, sorted entries) under one top-level directory named after the
archive. The same inputs and the same `--commit`/`--release` values produce
byte-identical output; the producing commit and release live only in
`sdk-v1.bundle.json`.

## Digest scheme and verification

`sdk-v1.bundle.json` lists every bundled file with its SHA-256 digest and
size, plus one bundle digest. To verify a bundle:

1. For each entry in `files`, recompute the SHA-256 of that file's bytes and
   compare it to the recorded `sha256`.
2. Format one line per file as `<sha256>  <path>\n` (two spaces, LF), sort
   the lines bytewise, and concatenate them.
3. The SHA-256 of that concatenation must equal `bundle_digest`.

The index itself is not part of `files` — it carries the digest, so it cannot
be covered by it. Consumers pin `bundle_digest`, the NodeTool `release`, and
`protocol_version`.

## Semantic diff categories

`tsx packages/protocol/scripts/diff-sdk-contract.ts <old> <new> [--json]`
compares two operation manifests (or two bundle/schema directories, which also
compares JSON-schema `$defs` and the implemented OpenAPI route inventory) and
classifies every change:

- **additive** — new operation (implemented or planned), planned →
  implemented, added error declaration, new schema definition, new response
  property.
- **risky** — changed auth or feature policy, changed error description,
  implemented → planned, changed response content type or success status,
  changed response schema reference, removed or changed non-request schema
  definition.
- **breaking** — removed operation, changed method/path or
  channel/command/direction, changed transport, removed declared error
  status/code, changed request content type, parameters, body requirements, or
  request schema on an existing operation, removed required response property,
  route removed from the implemented OpenAPI profile.

Exit codes: `0` for no or additive-only changes, `2` when the diff contains a
risky change and no breaking one, `3` when it contains a breaking change.
