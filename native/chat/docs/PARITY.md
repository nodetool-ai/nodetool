# Native chat parity

Native chat remains opt-in. This checklist defines the initial delivery scope
and records the evidence required before promoting it. Implementation alone
is not evidence of platform support.

| Action or event | Initial delivery requirement | Evidence |
| --- | --- | --- |
| Thread list, creation, selection | Required | Native session and UI tests |
| Paged server history | Required | Model pagination and HTTP contract tests |
| Per-thread drafts and turn state | Required | Concurrent-thread and draft-switch tests |
| Plain text, Markdown, code copy | Required | Delegate and composer interaction tests |
| Repeated text deltas and final echo | Required | Shared web/C++ conformance fixture |
| Provider and model selection | Required | Composer values reach prompt envelope |
| Send and stop | Required | Session transport tests and local server smoke |
| Disconnect during a turn | Required | Interrupted state without automatic resend |
| Tool progress and results | Required | Structured-part preservation tests |
| Tool and plan approval | Required | Authoritative IDs and duplicate-response guard tests |
| Clarification | Required when exposed by server | Structured content or tool response tests |
| Attachment upload | Required | Progress, cancel, failure, and returned asset ID tests |
| Images | Required | Authenticated media resolution and logout cleanup tests |
| Audio and video | Readable fallback allowed | No enabled playback action without implementation |
| Planning, tasks, workflow and generation updates | Required readable projection | Unknown payload preserved, no silent discard |
| Secret requests | Explicit declined/unsupported path allowed | No secret entry over chat socket |
| Editor actions | Only advertised host capabilities | Unsupported actions return an error |
| Timeline context and a supported edit | Required for timeline integration | Undo and save/reload through existing timeline commands |
| Rewind, regeneration, sent-message editing | Deferred | No misleading controls |
| Browser/editor-specific rich panels | Deferred | Readable preserved payload |
| Durable native draft storage | Deferred | Drafts survive thread switching within the session |

## Acceptance evidence

The fixture suite compares deterministic state, not visual resemblance. The
long-history benchmark must load pages representing 10,000 messages, report
its machine and elapsed work, and check the configured retained-message bound.
That model benchmark does not measure GUI frame time or input-to-paint latency.

The targets in [PLAN.md](PLAN.md) remain acceptance targets until measured:
p95 GUI work below 8 ms and p95 input-to-paint below 50 ms on a stated machine.
A web baseline using the same corpus is required for comparative claims.
Screen-reader behavior, IME composition, scaling, and installed artifacts need
platform testing. An offscreen Linux test cannot establish macOS or Windows
support.
