# Kernel/Runtime/Agents/Websocket Bug Audit — Progress & Resume State

> Working artifact for an in-progress multi-round bug audit. **Delete this file
> before opening any PR.** It exists so the audit can resume after an ephemeral
> container is reclaimed. Branch: `claude/kernel-runtime-bug-audit-2e71pq`.

_Last updated: round 3 in flight; self-review pass done (3 regressions fixed)._

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
