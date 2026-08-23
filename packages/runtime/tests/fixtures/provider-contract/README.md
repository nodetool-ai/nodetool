# Raw provider response fixtures

One checked-in raw HTTP response body per entry in the provider contract probe
manifest (`packages/runtime/src/providers/contract/probe-manifest.ts`). They are
the offline half of the probe: `provider-contract-probes.test.ts` runs each
entry's production decoder over its fixture, then deletes each declared
required field and requires the decoder to reject the result.

These are hand-written and carry no credential, no real signed URL, and no user
content. They are **not** cassettes — a cassette records a normalized
conversation for replay, these record one wire shape at the client boundary.
Add a field when a provider adds one NodeTool reads; never trim a fixture to
make a failing check pass.
