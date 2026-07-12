# Kernel/Runtime/Agents/Websocket Bug Audit — Progress & Resume State

> Working artifact for an in-progress multi-round bug audit. **Delete this file
> before opening any PR.** It exists so the audit can resume after an ephemeral
> container is reclaimed. Branch: `claude/kernel-runtime-bug-audit-2e71pq`.

_Last updated: round 5 in flight (run `wf_5015e686-bee`, task `w0skqc2gu`). 73 fixes, 3 deferred.
Converging: R1=12, R2=25, R3=20, R4=13 confirmed. Loop NOT yet dry._

Round 4 (commit `3166ee9`) fixed 13: gemini usage tracking, replicate TTS encoded
path, comfy handshake timeout, openai Responses mid-turn abort, step-executor
removeThinkTags, agent {markdown} wrap, compiler prose false-success, media-tools
sample-rate + asset:// reads, vector-tools infinite-loop clamp, models-api path
traversal, llm-agent resume system prompt + planner cancel.

Round 4 uses `scripts/bug-audit-workflow-r4.mjs` (finders retargeted at the ~23
files NOT examined in rounds 1-3: durable-inbox, suspendable, io,
correlation-analysis; gemini/fal/replicate providers; step-executor, agent,
graph-planner, compiler-agent; mcp/media/pdf/vector/filesystem tools; server,
models-api, openai-api, screenshot-server, llm-agent).

## Goal (original task)

Thorough bug audit over `packages/kernel`, `packages/runtime`, `packages/agents`,
`packages/websocket`. Finder subagents per subsystem × error class (correctness,
races/actor-messaging, resource leaks, error-handling, security). Every finding
adversarially verified by **3 independent skeptics**; only findings confirmed by
**≥2/3** count. Confirmed bugs: fix + regression test + `npm run check` green +
commit + push. **Loop-until-dry: stop only after two consecutive finder rounds
produce no new confirmed findings.**

## Status

| Round | Finders | Confirmed | State | Commit |
|-------|---------|-----------|-------|--------|
| 1 | 13 | 12 | fixed + tested + pushed | `da7f7f3` |
| 2 | 13 | 25 | fixed + tested + pushed | `bfa9af9` |
| 3 | 13 | ? | **IN FLIGHT** (workflow run `wf_b540d44a-1bb`, task `wexqladdr`) | — |
| self-review | — | 3 regressions in the fixes themselves | fixed + tested + pushed | `e4a676e` |

Self-review (commit `e4a676e`) fixed 3 defects the round 1/2 fixes introduced:
trigger-wakeup concurrent-duplicate dedup (in-flight inputId set); edit-search
dangling-symlink create escape (`lstat` not `access`); comfy readyState fast-fail
discarding a buffered terminal frame (replay before fast-fail).

Round 3 (commit `51b9194`) confirmed 20 bugs in newly-swept files; #2 was already
fixed by the self-review. **17 fixed + tested**: trigger dead-waiter, _inboxes
eviction, graph I/O namespace classify, context storage-URI throw + http body
drain, base/openai per-tool error isolation, python-websocket close-during-
reconnect, prompt-asset prototype `in`, js-sandbox SSRF + body-cap + workspace
symlink, edit_file replace_all deletion, ws-runner slot-leak + send-mode race,
mcp-server session-transport leak, bundle-import 400.

**Running total: 40 (rounds 1-2) + 3 (self-review) + 17 (round 3) = 60 fixes.**

### Deferred (confirmed but NOT fixed — need deeper work + integration testing)

- **#7 anthropic-provider extended-thinking round-trip** — when `thinkingBudget`
  is set with tools, multi-turn tool loops 400 because the thinking block +
  signature aren't preserved. Fix threads a new raw-parts field through the
  SHARED `generateLoop` (all providers) + convertMessage; needs a live
  thinking-model round-trip to verify. High blast radius — do carefully.
- **#15 long-term-memory enforceMaxItems eviction race** — offset pagination is
  corrupted by concurrent recall/remember mutations. A naive per-instance write
  mutex (attempted, reverted) shifts read/write timing and breaks a synthesis
  test; the right fix is a vectorstore-level atomic access-bump / snapshot get.
- **#16 long-term-memory recall re-embed** (low/perf) — bumpAccess re-embeds
  every returned item; needs a metadata-only update path on VectorCollection or
  reuse of the stored embedding. Naturally fixed alongside #15.

### Loop-until-dry status

NOT dry. R1=12, R2=25, R3=20 confirmed — each round expands file coverage and
finds ~20 more real bugs (the codebase is large). Two consecutive dry rounds
(the termination condition) are likely several rounds away. Next: round 4 on the
remaining unexamined files, excluding all fixed bugs + the 3 deferred, then keep
looping. The 3 deferred bugs will keep re-surfacing in finder output until fixed;
list them in `exclude` with a "DEFERRED" note.

Round 1's verifiers for `agents-memory-planner`, `ws-runner`, `ws-api-security`,
`ws-media-servers` were cut short by a session limit; **round 2 re-ran those with
full verification** and confirmed the serious ones (IDOR, zip-bomb, OAuth
ciphertext-as-token, job-slot leak, plan-cache bugs).

**37 bugs fixed so far.** Not yet dry — round 2 found 25, so at minimum rounds 3
and 4 are needed (two consecutive dry rounds to terminate).

## Fixed bugs (37) — see commit messages `da7f7f3` and `bfa9af9` for details

Round 1 (12): openai AbortSignal; python-websocket unsupervised reconnect;
python-bridge streaming cleanup + `_send` leak; comfy close-during-submit hang;
empty text asset token leak; fan-out result order; all-error fan-out reported
success; no terminal `task_update` on failure (+ `TaskFailed` protocol event);
GrepTool ReDoS / OOM / symlink escape.

Round 2 (25): graph `in`/bracket prototype pollution (graph.ts + graph-utils.ts);
trigger setTimeout overflow; trigger-wakeup idempotency-before-append;
trigger-manager stop-vs-start race; context cache key nested-value loss; http
retry of non-retryable status; context `process.env` in browser; anthropic
AbortSignal; python-websocket reconnect epoch (setTarget race); python-bridge
cancel no-op; comfy listener-after-submit (buffer+replay); task-executor
duplicate-item collision; plan-cache shared-mutable clone; plan-cache key omits
schema/inputs; EditFileTool + GlobTool symlink escape; GrepTool
alternation-overlap ReDoS; unified-runner job-slot try/finally; unified-runner
await reconnect/resume; http-api IDOR on workflow versions; oauth-api
ciphertext-as-token (HF whoami, GitHub user, HF refresh); workflow-bundle
zip-bomb.

## How to resume after a restart

1. Environment (sandboxed/proxied):
   ```bash
   nvm use
   npm install --ignore-scripts          # keytar/electron/onnx postinstalls 403 otherwise
   npm run build:packages                # required for cross-package typecheck
   npm run rebuild:native                # better-sqlite3 for agents LTM/vectorstore tests
   ```
2. Recreate the workflow script (see `scripts/bug-audit-workflow.mjs`, committed
   alongside this file — it is the finder+3-skeptic-verify workflow, parameterized
   by `args.round`, `args.exclude`, `args.focusNote`).
3. Re-run the next round via the `Workflow` tool with `scriptPath` pointing at
   that script, passing `exclude` = every already-fixed bug (file+title) and a
   `focusNote` telling finders those are FIXED and to report only NEW defects.
4. For each ≥2/3-confirmed finding: fix, add a regression test, keep the affected
   package suites green, commit, push.
5. Continue until **two consecutive rounds** yield zero new confirmed findings.

## Verification commands

```bash
npm run build:packages   # typecheck all
npx vitest run --root packages/kernel      # 821 pass
npx vitest run --root packages/runtime     # 1954 pass
npx vitest run --root packages/agents      # 1221 pass (needs rebuild:native)
npx vitest run --root packages/websocket   # 911 pass
npx vitest run --root packages/cli         # 323 pass
```
Note: `mobile/` typecheck fails in this env (its deps aren't installed — it is
intentionally NOT a root workspace); unrelated to these changes.

## Refuted findings (kept out, with reason) — see round reports

Round 1 genuinely-refuted (0/3): js-sandbox SSRF/`Function` recovery (QuickJS
WASM sandbox, no host fetch to internal endpoints; eval/Function deleted at
init); context copy()/emit() (fields are copied; listeners intentionally
fire-and-forget); anthropic signal (aborts via SDK stream — later re-examined
and a real non-streaming gap WAS confirmed in round 2 at a different line and
fixed); durable-inbox cleanupConsumed; graph schema collision; plan-cache
variants (round-1 unverified → confirmed+fixed in round 2). Round 2
genuinely-refuted (≤1/3): popMessageAsync undefined; openai streaming toolChoice
drop; anthropic thinkingBudget>max_tokens; FileCheckpointStore fire-and-forget;
stop sets finished directly; mcp-server arbitrary user_id.
