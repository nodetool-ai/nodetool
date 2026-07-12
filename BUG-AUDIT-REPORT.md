# Kernel/runtime adversarial bug audit

## Result

The nine audit rounds confirmed 201 unique defects. The branch fixes 199 of
them; four confirmed items remain deferred. The old progress total of “159
fixes” counted all 20 round-3 confirmations even though three were deferred.
The reconciled pre-round-9 fixed count is 156. Round 9 fixed 43 findings,
including the previously deferred Anthropic thinking round-trip.

Every finding was reviewed by three independent skeptics and required at least
two confirm votes. Each fix commit carries the required Claude attribution and
session trailers.

## Fixed ledger

| Round | Fixed | Files / cause and fix | Severity | Commit |
|---|---:|---|---|---|
| 1 | 12 | Runtime cancellation/reconnect/stream cleanup; Comfy submit race; prompt asset handling; agent fan-out/lifecycle; Grep ReDoS, OOM, and symlink escape | High–Low | `da7f7f3d3` |
| 2 | 25 | Graph prototype keys; trigger timing/races; context cache/retry; provider cancellation; bridge/Comfy races; planner cache; edit/search escapes; runner slot/reconnect; workflow IDOR; OAuth token handling; zip bomb | High–Low | `bfa9af93b` |
| Self-review | 3 | Concurrent wakeup dedup, dangling-symlink edit escape, buffered Comfy terminal frame | High–Medium | `e4a676e59` |
| 3 | 17 | Trigger waiter/inbox lifecycle; graph I/O classification; storage URI/error-body handling; tool error isolation; bridge reconnect; asset prototype key; JS sandbox SSRF/OOM/symlink; edit deletion; runner and MCP lifecycle; bundle error mapping | High–Low | `51b9194e0` |
| 4 | 13 | Gemini usage, Replicate TTS encoding, Comfy handshake, OpenAI abort, executor thinking tags/result shape, compiler exhaustion, media sample rate/assets, vector chunk progress, model cache traversal, resumed agent prompt/cancel | High–Low | `3166ee99f` |
| 5 | 18 | Ollama conversion, WAV bounds, SDK tool exposure, provider download SSRF/polling/usage, unit dimensions, model traversal/user secret/glob, workflow prototype/rate map, timeline and sketch CAS/version pruning | High–Low | `4797c1b3a` |
| 6 | 24 | Storage/workspace/message IDOR and traversal; asset/packs persistence; pagination; media URI parsing; Python EPIPE/startup/discovery; Unicode splitting; o-model matching; tool choice; domain filters; HTTP SSRF; entity decode; email archive; binary assets | High–Low | `b19860042` |
| 7 | 25 | Workflow-chat stop and URI SSRF; agent cancellation/session/buffering; HTTP ranges; thumbnails; MCP bootstrap; collection degradation; file symlink; media MIME; bridge delegates; provider SSRF/retry/search/speed; nested child errors; graph dynamic-property pruning | High–Low | `6031520c2` |
| 8 | 19 | HF cache path; socket disconnect queueing; MCP TOML injection; secret masks; media traversal/MIME; auth prototype keys; telemetry flush; scalar schema; PCM view; parser escaping; retry caps/timeouts; dynamic edges; secret binding; workspace names; TODO LRU; security-monitor parsing | High–Low | `b7cd688bb` |

The commit bodies above enumerate every fixed bug individually with its cause
and correction. Round 9 is expanded below because it was the interrupted handoff
round and its candidates had not previously been consolidated.

### Round 9 fixed findings

| IDs | Files | Cause / fix | Severity | Commit |
|---|---|---|---|---|
| 1, 15 | `agents/src/tools/control-tool.ts`, `llm-nodes/src/nodes/agents.ts` | Control schemas accepted undeclared properties and sanitized names collided; enforce the whitelist and stable unique names on both execution paths | High / Medium | `23ff7be1d` |
| 2, 3, 17–20 | `runtime/src/context.ts` | Error bodies leaked, persisted assets bypassed the resolver, provider construction raced, abandoned streams lacked terminal state, Retry-After was unbounded, listeners were not isolated; add cancellation/resolution, shared in-flight construction, bounded abortable waits, finalization, and listener isolation | High / Medium | `817008419` |
| 4, 5 | `websocket/src/unified-websocket-runner.ts`, `lib/asset-paths.ts` | MIME-derived filenames diverged from stored keys and detached sends could reject after disconnect; use the canonical filename map, recheck the socket after the lock, and catch detached sends | High | `e21c3f2bb` |
| 6 | `runtime/src/providers/base-provider.ts` | Provider media resolution accepted arbitrary `file://` and traversing storage paths; contain decoded paths and realpaths to the asset root | High | `04b85fd1c` |
| 7, 24 | `runtime/src/providers/base-provider.ts` | Image follow-ups split sibling tool results and parallel tools ran after abort; buffer image messages until all tool results and gate dispatch on cancellation | High / Medium | `04b85fd1c` |
| 8, 25, 40 | `runtime/src/providers/anthropic-provider.ts` | Signed thinking blocks were dropped, incompatible thinking options were forwarded, and unsupported-only user content became empty; preserve/replay thinking blocks, normalize thinking requests, reject unsupported content clearly | High / Medium / Low | `04b85fd1c` |
| 9, 30, 41 | `agents/src/task-executor.ts` | Finish-step selection could deadlock, nested fan-out values stringified incorrectly, and dependency-free process steps omitted memory/timing; select a dependency sink, serialize templates correctly, and persist terminal step state | High / Medium / Low | `23ff7be1d` |
| 10 | `kernel/src/actor.ts` | Repeating drivers destructively consumed max-scope side inputs; retain side inputs while draining the driver scope | High | `23ff7be1d` |
| 11, 33 | `models/src/timeline-sequence.ts` | Project limiting preceded tenant scope and timestamp writes could defeat CAS; scope in SQL before limit and enforce monotonic update tokens | High / Medium | `23ff7be1d` |
| 12 | `websocket/src/http-api.ts` | Bundle export raw-fetched graph asset URLs; route downloads through the private-address and redirect guard | High | `e21c3f2bb` |
| 13 | `runtime/src/context-packer.ts` | Token estimates omitted tool calls and arguments; include their serialized cost | Medium | `817008419` |
| 14 | `runtime/src/providers/cassette-provider.ts` | A global seen-set labeled shared acyclic references as circular; unwind the active recursion set | Medium | `04b85fd1c` |
| 16 | `agents/src/agent-workflow-runner.ts` | Closing the async generator left the workflow running; cancel the runner in generator cleanup | Medium | `23ff7be1d` |
| 21–23, 39 | `websocket/src/unified-websocket-runner.ts` | Stop marked jobs finished before cancellation, cancelled unrelated waiters, queue handoff escaped disconnect, and superseded workflow jobs stayed running in storage; wait for runner completion, scope waiters, track dequeued jobs, and persist cancellation | Medium / Low | `e21c3f2bb` |
| 26–28 | `runtime/src/providers/openai-provider.ts`, `openai-compat-provider.ts` | Streaming dropped tool choice/calls and PCM chunks lost byte alignment; forward tool choice, flush accumulated calls on terminal frames, and carry partial samples | Medium | `04b85fd1c` |
| 29, 42 | `agents/src/step-executor.ts`, `compiler-agent.ts` | Raw UTF-16 slicing split surrogate pairs and object validation accepted arrays; use the shared safe truncator and reject arrays | Medium / Low | `23ff7be1d` |
| 31, 32 | `kernel/src/graph.ts` | Target handle validation read inherited prototype members and edge pruning deleted runtime fallback defaults; use own-property checks and preserve connected fallbacks | Medium | `23ff7be1d` |
| 34, 43 | `models/src/timeline-sequence.ts`, `websocket/src/unified-websocket-runner.ts`, `trpc/routers/timeline.ts` | Agent timeline updates bypassed CAS and exhausted CAS retries surfaced as 500; use conditional updates and map conflicts to a client conflict response | Medium / Low | `23ff7be1d` |
| 35, 36 | `websocket/src/http-api.ts` | The Node bridge buffered full storage bodies and gzipped ranged/media responses synchronously; stream with backpressure and gzip only eligible full text/JSON responses | Medium | `e21c3f2bb` |
| 37, 38 | `runtime/src/providers/scripted-provider.ts` | The test provider discarded tool calls and marked every unspecified chunk terminal; retain tool calls and mark only the final chunk done | Low | `04b85fd1c` |

## Notable refutations

| Claim | Refutation |
|---|---|
| JS sandbox host escape through `eval`/`Function` | QuickJS runs without host networking; both constructors are removed during initialization. Later, distinct fetch-bridge SSRF and workspace-symlink findings were confirmed and fixed. |
| ProcessingContext `copy()`/`emit()` loses fields | Fields are copied; message listeners were intentionally fire-and-forget. Round 9 later confirmed the narrower issue that one throwing listener starved the rest. |
| Durable inbox `cleanupConsumed` loses live inputs | The claimed interleaving could not occur under the inbox ownership and acknowledgement sequence. |
| OpenAI streaming tool choice was already handled | Earlier reviewers refuted a different call path. Round 9 traced the streaming Chat Completions path and confirmed that it omitted `toolChoice`; that distinct defect is fixed. |
| `popMessageAsync` returns undefined incorrectly | The queue contract permits the empty result at that boundary and callers already handle it. |
| MCP server accepts arbitrary `user_id` | Authentication context, not the payload field, determines server-side identity on the examined path. |
| Round-9 PCM chunk alignment (#28) | One skeptic argued current consumers preserve alignment, but two independently reproduced the odd-byte/view-offset failure. Under the audit rule it remained confirmed and was fixed. |

## Deferred confirmed findings

| Area | Defect | Reason deferred |
|---|---|---|
| Agent long-term memory | Concurrent max-item eviction uses unstable offset pagination | Needs a vector-store-level atomic access bump or snapshot operation; a per-instance mutex changes read/write timing and broke synthesis behavior. |
| Agent long-term memory | Recall re-embeds unchanged content | Needs a metadata-only vector update or reuse of the stored embedding; should land with the concurrency change. |
| Collections router | Cross-tenant collection IDOR | Requires per-user vector-store namespacing, data migration, and coordinated RAG-node/UI changes. |
| Collection tools | Cross-tenant collection IDOR | Same namespacing and migration dependency as the router. |

## Verification

- `npm run build:packages`: 56/56 package builds passed.
- `npx oxlint packages/*/src`: no errors; existing warnings remain.
- Vitest: kernel 823, runtime 1,991, agents 1,249, models 641, websocket 929 tests passed.

