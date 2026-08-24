# Provider contract probes

A cassette proves NodeTool still handles a response a provider gave us once. It
cannot notice that the provider changed the response today — replay never
reaches the network, so a renamed field or a dropped usage block is invisible
until a user hits it. The contract probes close that gap for the providers whose
wire shapes a run depends on most: OpenAI, Gemini, fal, KIE, and Replicate.

A probe has two halves, and both run the **same production decoder**:

- **Offline** — `packages/runtime/tests/providers/provider-contract-probes.test.ts`
  decodes a checked-in raw HTTP response fixture, then deletes each declared
  required field and requires the decoder to reject the result. Runs on every
  PR that touches `packages/runtime/src/providers/` (`nodetool harness gate`).
- **Live** — `npm run probe:providers` makes one real request per provider and
  decodes today's response. Runs nightly from
  `.github/workflows/provider-contract-probe.yml`.

This is not cassette replay and never writes a cassette. A cassette records a
normalized conversation; a probe pins one wire shape at the client boundary.

## The manifest

`packages/runtime/src/providers/contract/probe-manifest.ts` is the checked-in
list. Each entry names the provider, the model or endpoint, the production
decoder, the raw fixture, the required fields the positive controls delete,
and — where a live call is cheap enough — the single request that fetches it.

| Entry | Decoder | Live |
|---|---|---|
| `openai.chat-completion` | `decodeChatCompletion` | 1 request, ≤ USD 0.05 |
| `openai.models-list` | `decodeOpenAIModelList` | fixture only |
| `gemini.generate-content` | `decodeGeminiGenerateContent` | 1 request, ≤ USD 0.05 |
| `gemini.models-list` | `decodeGeminiModelsPage` | fixture only |
| `fal_ai.language-catalog` | `decodeFalLanguageCatalog` | 1 request, no key, free |
| `fal_ai.image-result` | `extractImageUrls` | fixture only |
| `fal_ai.video-result` | `extractVideoUrl` | fixture only |
| `fal_ai.audio-result` | `extractAudioUrl` | fixture only |
| `kie.error-envelope` | `kieEnvelopeError` | 1 request, free |
| `kie.create-task` | `decodeKieTaskSubmission` | fixture only |
| `kie.record-info` | `decodeKieRecordInfo` + `decodeKieResultUrls` | fixture only |
| `replicate.prediction-output` | `decodeReplicateOutput` | fixture only |

The budget is **one request and USD 0.05 per provider per run**, enforced by
`runProbes` and asserted by the manifest test. A fixture-only entry must say in
`liveGap` why there is no live probe; most say the same thing — a live result
would mean paying for a generation. Raising the budget is how those become live.

### Probing a different model

The two live chat probes send a fixed model id: `gpt-5.4-mini` for
`openai.chat-completion`, `gemini-3-flash` for `gemini.generate-content`.
`NODETOOL_PROBE_OPENAI_MODEL` and `NODETOOL_PROBE_GEMINI_MODEL` override them,
so you can ask whether a model you are about to adopt answers in the shape the
decoder reads, without editing the manifest.

```bash
NODETOOL_PROBE_OPENAI_MODEL=gpt-5.4 \
  npm run probe:providers -- --only openai.chat-completion
```

The budget does not follow the override. `runProbes` charges the entry's
declared `estimatedCostUsd` — USD 0.001 for both — not what the request actually
cost, so an override onto an expensive model spends more than the ledger says it
did. The request cap still holds at one per provider.

## Network failures are not schema failures

`runProbes` separates them, and the nightly job treats them differently:

- **network-failure** — no body reached the decoder (DNS, timeout, a 5xx, an
  HTML gateway page). Reported, does not fail the job. A nightly that cries
  wolf on every provider blip stops being read.
- **schema-failure** — the provider answered and the response no longer decodes
  into what NodeTool needs. Fails the job. This is the contract breaking.

`--strict-network` fails on network failures too, for a manual run where the
network is known good.

## What a run retains

Nothing of the body. `summarizeShape` reduces the response to its structure —
every string becomes `string(<length>)`, every number `number` — and only a
small allowlist of enum-like keys (`role`, `finish_reason`, `state`, `code`,
`content_type`, …) keeps a literal value. Free text a probe keeps, such as an
error message, goes through `redactText`, which strips credential-shaped tokens
and rewrites every URL to its origin.

That is a redaction *by construction* rather than a denylist of field names,
which is wrong the first time a provider adds a field. The uploaded artifact
therefore carries no credential, prompt, model output, request id, or signed
URL, and `provider-contract-probes.test.ts` asserts it on a payload seeded with
one of each.

## Adding an entry

1. Extract the decoder if it is still inline in a provider method, and have the
   provider call it. A decoder no test can reach without a network call is the
   problem this is fixing.
2. Add the raw response fixture under
   `packages/runtime/tests/fixtures/provider-contract/<provider>/`. Hand-write
   it, or capture one and strip it — no credential, no real signed URL, no user
   content.
3. Add the manifest entry with a `check` that asserts what a caller needs, and
   list the fields whose removal must break it. Run the test: a required field
   whose removal still passes is not required, and the test says so.
4. Add a `live` block only if one request fits the provider's budget; otherwise
   write the `liveGap`.
