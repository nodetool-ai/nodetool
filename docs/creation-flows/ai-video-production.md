# AI video production implementation

This guide describes the AI video production behavior implemented in the existing Video, Storyboard, Script, timeline, and agent surfaces. The product requirements are in [AI Video Production PRD](ai-video-production-prd.md).

## Authoring and request data

Production authoring uses the shared protocol in [`production-authoring.ts`](../../packages/protocol/src/production-authoring.ts). Existing documents can carry `creative_context`. Beats and shots can carry a `production` requirement with an editorial purpose, visual treatment, speech mode and binding, local direction, references, duration, and a requested take count from one through three.

The setup flows keep these fields in their existing Idea and review surfaces. A reviewed plan stores a `production_review_fingerprint`. If production context changes, the flow requires the creator to return to review before generation continues.

The timeline compiler turns a reviewed requirement into one immutable snapshot per candidate. The snapshot captures the destination, operation, batch and variation identity, prompt, references, route, speech inputs, provider and model, output format, duration, and authoring fingerprint. Reference bindings resolve to asset IDs before dispatch. Credentials and signed URLs are not stored in the snapshot.

## Generation routes

The compiler selects one of three routes:

- `reference_to_video` passes resolved product, character, location, or style assets to a reference-capable video provider.
- `text_to_video` is used when no reference input is required.
- `audio_driven_performance` is used for on-camera speech. It requires recorded speech audio, a character reference, and provider support for the route.

Product close-ups require a product reference. On-camera speech does not fall back to a silent portrait or separate narration. Speech duration is checked against the requested slot in milliseconds before dependent video generation. Speech bindings can retain script line, speaker, voice, audio, and word-timing data.

## Candidates and acceptance

Each destination receives one to three stable candidates. Batch, request, candidate, variation, and variation-index values are assigned before provider dispatch, so completion order does not change take numbering. Candidates land append-only and remain inactive. A candidate can be recovered from its existing generation record instead of submitting the same logical request again.

Preview state is separate from document state. In the storyboard gallery, selecting a production candidate previews it. The explicit `Use` action applies it. Timeline audition uses a destination-to-candidate map, and `Use draft` validates and applies a selection atomically within one document. Candidates must be ready, belong to the expected batch, match their immutable snapshot, and target an unaccepted destination. A conflict rejects the whole draft. Existing undo state restores all affected destinations together.

## Recovery and validation

Preparation captures the authenticated owner and project, destination revision, reviewed plan fingerprint, resolved inputs, route, timing, and candidate count. Submission rechecks owner, project, destination revision, provider capability, asset access, and required inputs. Deleted or changed destinations do not recreate slots or rewrite snapshots.

Generation records retain successful intermediate assets and candidate status. Failed candidates can be retried independently. The implementation rejects invalid candidate counts, missing route inputs, unsupported reference routes, missing audio or character references for on-camera speech, invalid word timings, and speech that exceeds its production slot.

## Agent parity

The shared agent capability in [`video-production.ts`](../../packages/agents/src/capabilities/video-production.ts) exposes preparation, submission, candidate inspection, and acceptance. Preparation requires a reviewed request and a plan fingerprint. Submission consumes the captured prepared manifest rather than an edited copy. Inspection returns candidates and an explicit preview selection. Acceptance supports `use_take` and `use_draft` through the host acceptance adapter in [`video-production-acceptance.ts`](../../packages/agents/src/capabilities/video-production-acceptance.ts).

Agent acceptance rechecks authorization, target revisions, candidate provenance, readiness, batch membership, and document state before applying. It does not activate generated results during submission, and it uses the same candidate and acceptance contract as the editor surfaces.

