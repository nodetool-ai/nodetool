# SDK Lifecycle v1 Draft

## Implementation status

Capabilities and preflight are implemented as feature-flagged production HTTP
and correlated WebSocket operations. The remaining job lifecycle operations
in this draft are planned. The server contains transport-independent,
schema-validating builders for:

- capability responses;
- static preflight using the existing graph/per-node validator;
- workflow etag and graph-derived input validation;
- cost summaries using the existing workflow cost estimator;
- deterministic credential, runtime, provider, model, and asset requirement
  discovery;
- availability preflight through injected read-only probes, with conservative
  runnable decisions and redacted probe failures;
- execution preflight composition for worker, target, capacity, and queue
  readiness, again through injected read-only probes;
- one transport-neutral orchestrator and an adapter over NodeTool's existing
  owner/public/collaborator workflow authorization and graph-derived
  interface service;
- a principal-bound NodeTool service that reuses per-user credential,
  registered-provider, and owner-scoped asset checks;
- locally authoritative Node/TypeScript, hydrated Python bridge, and
  allow-listed FFmpeg/FFprobe runtime probes;
- asset requirement discovery from both structured `asset_id` values and
  canonical `asset://` or `/api/storage/` references nested in inputs;
- a read-only view of the exact authenticated live runner's real admission
  counters and execution readiness composition that reports likely queueing
  without reserving work;
- explicit local, attached-worker, and live-runner execution targets without
  attaching, provisioning, or falling back to a different target.

`GET /api/sdk/v1/capabilities`, `POST /api/sdk/v1/preflight`, and
`POST /api/sdk/v1/assets/temporary` are available by default. A deployment can
disable them with `NODETOOL_DISABLE_SDK_LIFECYCLE_V1=1`. They share the same
typed service boundary and authenticated principal. They are not duplicated as
WebSocket RPC commands.

This document is the design note for possible future acknowledged submission,
snapshot, subscription, and lifecycle-cancellation operations. Those roadmap
items are intentionally absent from the public v1 declarations and generated
client schemas until implemented.

The capability profile `temporary_asset_upload = available` advertises the
multipart temporary-input route. It writes directly to configured temporary
storage and returns a runtime-resolvable URI. It deliberately creates no Asset
row, thumbnail, asset-list entry, or durable provenance record. The temporary
store's retention policy owns cleanup. SDK execution defaults generated-asset
persistence to `temporary`; callers explicitly request `auto` when normal
asset autosave is required. Unannotated non-SDK `run_job` behavior remains
`auto`.

## Identifiers and time

- `request_id` correlates one WebSocket command with exactly one
  `rpc_response`. It is client-generated, non-empty, and not a durable job key.
- `client_request_id` correlates application logs and submission attempts. It
  is echoed by the submission acknowledgement.
- `idempotency_key` identifies one logical submission within the authenticated
  user/workspace scope and advertised retention period.
- `job_id`, `workflow_id`, `workspace_id`, and `asset_id` are opaque strings.
  Clients must not derive routing, ownership, or time from their format.
- Timestamps are RFC 3339 strings with an explicit offset. The server emits
  UTC. Clients compare instants, not timestamp text.
- Event `sequence` is a positive, monotonically increasing integer scoped to
  one job. Sequence zero means no event has yet been persisted.

Retrying a submission with the same idempotency key and equivalent normalized
request returns the original job. Reusing the key with a different workflow,
revision, workspace, or inputs is a conflict. The server advertises the
retention window before idempotent submission becomes available.

## Public job states

The public states are:

| State              | Terminal | Meaning                                            |
| ------------------ | -------- | -------------------------------------------------- |
| `accepted`         | No       | Persisted and admitted, before queue or execution  |
| `queued`           | No       | Waiting for capacity; `queue_position` is present  |
| `running`          | No       | Actively executing                                 |
| `suspended`        | No       | Paused on a resumable workflow condition           |
| `recovering`       | No       | Server is reconciling execution after interruption |
| `cancel_requested` | No       | Cancellation accepted but execution not terminal   |
| `completed`        | Yes      | Authoritative result manifest is persisted         |
| `failed`           | Yes      | Safe public error is persisted                     |
| `cancelled`        | Yes      | Execution is durably cancelled                     |

Internal `scheduled`/`pending` states map to `accepted`. Internal `paused` maps
to `suspended`. Internal error aliases map to `failed`. These mappings do not
change the existing database vocabulary.

Terminal states are immutable. A job cannot be observed as `completed` until
its final outputs, asset references, cost, and provenance manifest are
persisted. The runtime schema enforces a non-null result for `completed` and
forbids a terminal result on non-terminal snapshots.

## Preflight and submission

`POST /api/sdk/v1/preflight` is side-effect free. It does not create a job, reserve a
provider request, download a model without explicit approval, or start paid
work. It reports:

- graph, pin, and type issues;
- provider, credential, model, node-pack, runtime, asset, worker, and approval
  requirements;
- whether each requirement blocks execution;
- estimated, partial, exact, or unknown cost confidence.

`submit_job` requires a successful-enough authoritative preflight, a workflow
interface version, workflow etag, `client_request_id`, and `idempotency_key`.
The server persists the accepted/queued job and idempotency record before
returning acknowledgement. Submission acknowledgement is separate from the
event stream.

## Snapshots, events, and reconnect

`get_job_snapshot` is authoritative. A snapshot contains current state,
timestamps, last persisted sequence, preflight summary, and terminal result or
error when applicable.

`subscribe_job(job_id, after_sequence)` first establishes an authoritative
snapshot, then replays retained events after the requested sequence and
continues with live events. Every event carries job ID, workflow ID, workspace
ID, timestamp, and sequence.

Clients must:

1. discard duplicate sequences;
2. process known events in sequence order;
3. safely advance past unknown event types;
4. request a fresh snapshot if replay is expired or a sequence gap cannot be
   filled;
5. treat the snapshot as authoritative when provisional events disagree.

Reconnect to queued, running, suspended, recovering, or cancel-requested jobs
returns their current snapshot and replay range. Reconnect to a terminal job
returns the persisted terminal snapshot. Missing, inaccessible, and
cross-workspace jobs share the same not-found response. Expired jobs use a
stable expiry code without revealing another tenant's resources.

## Cancellation

Cancellation is idempotent:

- queued work can become `cancelled` immediately;
- active work first becomes `cancel_requested`;
- a provider may finish before cancellation takes effect;
- cancellation after a terminal state returns the existing terminal snapshot.

Clients must not treat a cancellation acknowledgement as terminal unless the
returned snapshot is `cancelled`.

## Results and assets

The result manifest contains JSON-safe output values plus an explicit list of
every durable asset referenced by those outputs. Each asset reference carries
an opaque ID, canonical URI, MIME type, optional size and SHA-256 checksum,
and an optional expiring download URL.

Large image, audio, video, document, and model data travels by asset reference,
not inline WebSocket payload. `outputs` may contain scalar or structured JSON;
the `assets` bindings identify the output name and nested path at which each
durable asset is materialized.

Provenance contains normalized/redacted inputs, workflow revision, providers,
models, seed, and reconciled cost. It never contains credentials,
authorization headers, provider secrets, or unbounded inline media.

## Ownership

All preflight, submission, snapshot, subscription, cancellation, result, and
asset operations use the same authenticated user/workspace authorization.
Caller-supplied identity headers are not trusted. A job and every result asset
inherit the accepted submission's ownership scope.
