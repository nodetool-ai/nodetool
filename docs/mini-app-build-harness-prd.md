# PRD: Mini-App Build Harness

**Author:** Matti Georgi
**Status:** Draft — for review
**Last updated:** 2026-08-02
**Design doc:** [mini-app-build-harness-design.md](mini-app-build-harness-design.md)
**Implementation plan:** [mini-app-build-harness-implementation-plan.md](mini-app-build-harness-implementation-plan.md)
**Related:** [mini-apps.md](mini-apps.md) · [app-builder.md](app-builder.md) · `nodetool app debug` (CLAUDE.md) · `packages/agents` app-tools eval

---

## 1. Summary

Today an agent can *check* a mini app (`nodetool app debug`) and can *edit* one
(the `ui_app_*` tools), but nothing closes the loop. There is no command that
takes "build me a product-photo captioner with an approve step" and returns a
working, verified app — workflows included.

The Build Harness is that command:

```bash
nodetool app build "Turn a product photo into three caption options; \
  let me pick one and post-process it" -o captioner.app.json
```

Plan the workflows, author the app document, validate the wiring, run every
operation headlessly, judge the result against the intent, repair what failed,
repeat until green or out of budget. Output: an `ApplicationBundle` that
imports and runs anywhere, plus the debug bundle proving it works.

The bet is simple: **the model is good enough to one-shot a medium-complex app
if the harness gives it the same feedback loop a human gets from the editor.**
Every piece of that loop already exists in the repo. This PRD wires them into
one machine and puts a number on it.

**North-star metric: one-shot rate on the `app-build` eval suite** — the share
of medium-complexity prompts that produce a green app with zero human edits.

## 2. Problem

### 2.1 The loop is open

The build story for an agent today:

1. Plan a workflow — GraphPlanner exists, evaled (`graph-planner`, `graph-e2e`).
2. Author the app document — `ui_app_*` tools exist, evaled (`app-tools`),
   and run headlessly against `@nodetool-ai/app-runtime` doc-ops.
3. Verify — `nodetool app debug` validates bindings, simulates the runtime,
   runs the kernel, and emits an `AppDebugReport` with a verdict.

Each stage is solid in isolation. But nothing *drives* them in sequence, feeds
the verdict back into the tools, or decides when to stop. An agent in editor
chat improvises this loop turn by turn; an agent in CI or the CLI cannot run it
at all. The result: app-building quality is whatever the conversation happens
to produce, and we cannot measure or regress-test it.

### 2.2 Verification has blind spots

`app debug` cannot see everything the web runtime does, so a "green" app can
still be broken on screen:

- `visibleWhen` / `disabledWhen` / `format` are not simulated — a widget hidden
  by a wrong condition reports as fine.
- `from: "resource"` params have no headless provider — any app that reads a
  picker cannot be exercised.
- Interaction scripts are hand-written JSON. Nobody writes them, so the
  approve-then-continue and slider-rerun shapes — the ones the
  [guide](mini-apps-guide.md) teaches — go untested.

A build loop is only as good as its oracle. These gaps are the oracle's bugs.

### 2.3 There is no score

`graph-planner` reports a one-shot rate for graphs. No suite reports one for
apps. Without a number, model upgrades, prompt changes, and tool-contract edits
ship blind — we find out an app shape regressed when a user hits it.

### 2.4 Why now

The example-apps pipeline (`scripts/build-example-apps.mjs`) hand-curates
bundles because generation isn't trusted. Mobile ships app screens. The
marketing site generates `/apps/*` landing pages. Every one of these consumes
finished apps; none can produce them. App supply is the bottleneck, and the
supply chain should be a prompt.

## 3. Users

**Agents first.** The harness is an agent-facing product; humans read its
output, they don't operate it.

| User | Surface | What they need |
| --- | --- | --- |
| Editor chat agent | `ui_app_*` + a `build_app` tool | One tool call that returns a working draft to refine with the user |
| CLI / CI agent (Claude Code, cron) | `nodetool app build` | Prompt in, bundle + verdict out, exit code that means something |
| Eval runner | `nodetool eval app-build` | The one-shot number, per case, gated with `--min-success` |
| Human builder | App Builder | Imports the generated bundle and tweaks in Design view — never debugs wiring by hand |

## 4. What "medium complex" means

The target is pinned so "one-shot" can't be gamed by easy prompts. A
medium-complex app has, per the eval suite's case definitions:

- **2+ operations** over 2+ workflows (e.g. draft → approve → publish),
- **8–15 widgets**, at least one layout container deep,
- **variables**, including one `persist: true` app-scoped setting,
- **one streaming output** folded into a display widget,
- **one gated flow** — a second operation reading a variable the first wrote,
- **one conditional** (`visibleWhen`/`disabledWhen`) that must actually gate.

Roughly: the "review before publish" and "settings that stick" shapes from the
guide, combined. Below this is a form; above it is a product.

## 5. Product

### 5.1 The loop

```
prompt ──▶ SPEC ──▶ PLAN ──▶ AUTHOR ──▶ CHECK ──▶ RUN ──▶ JUDGE ──▶ green? ──▶ bundle
                     ▲                                        │
                     └──────────── REPAIR (bounded) ◀─────────┘
```

| Stage | What runs | Exists today |
| --- | --- | --- |
| **Spec** | LLM turns the prompt into an app spec: operations, widget list, variables, interaction expectations | New |
| **Plan** | GraphPlanner authors each workflow the spec names (or binds an existing one by id) | `packages/agents` GraphPlanner |
| **Author** | LLM drives `ui_app_*` against the headless bridge to build the document | `evals/surfaces/app.ts` bridge, promoted out of evals |
| **Check** | Static wiring pass — `app debug --no-run` + `validate` per workflow | `packages/cli/src/app-debug/` |
| **Run** | Every operation, headlessly, with an interaction script **derived from the spec** (fill inputs, click run triggers, write the gate variable, click the second trigger) | `app debug` runtime + new script derivation |
| **Judge** | LLM judge scores final widget states against the spec's expectations, same pattern as `graph-e2e`'s goal judge | `evals/goal-judge.ts` pattern |
| **Repair** | Failures (validation issues, run errors, judge misses) go back to the author stage as a diff-shaped complaint; bounded rounds | New |

Two hard rules, borrowed from the supervisor PRD's spine:

- **Deterministic before generative.** Check runs before Run, Run before
  Judge; an LLM judge never sees an app the static validator rejected. The
  cheap oracle always fires first.
- **Fail closed on budget.** Repair rounds (default 3), wall clock, and USD
  cost are capped. Out of budget → the harness returns the best attempt marked
  `failed`, with the full report of why. It never returns a silent
  half-working bundle as success.

### 5.2 Surfaces

```bash
nodetool app build "<prompt>"                    # bundle + report to nodetool-debug/
nodetool app build "<prompt>" --workflow <id>    # bind existing workflow(s), plan none
nodetool app build "<prompt>" --json             # full BuildReport for agents
nodetool app build "<prompt>" --max-repairs 5 --cost-cap 1.00
nodetool app build spec.json                     # skip the Spec stage, build from a spec file
```

- **`build_app` tool** on the server (like `debug_workflow`): editor chat and
  MCP agents call the same loop, get the same `BuildReport`.
- **`nodetool eval app-build`**: the suite from §4, standard eval flags,
  `--min-success` as a CI gate. Two deterministic cases run without providers.

### 5.3 The report

`BuildReport` extends the existing `AppDebugReport`: per-stage outcome, every
repair round with what was complained about and what changed, per-stage token
and dollar cost, and the final verdict. `report.md` reads top-down as a story:
what was built, what broke, what fixed it, what it cost. Spans follow the
existing OTel hierarchy (`app.build` → `agent.plan` / `app.author` /
`app.check` / `app.run` / `app.judge`).

## 6. Requirements

| # | Requirement | Priority |
| --- | --- | --- |
| R1 | `nodetool app build` runs the full loop from a prompt and emits an `ApplicationBundle` + `BuildReport` | P0 |
| R2 | Author stage drives the real `ui_app_*` contract headlessly — no forked tool surface | P0 |
| R3 | Interaction scripts derived from the spec; every operation and every declared event path exercised | P0 |
| R4 | Repair loop consumes verdict issues as structured complaints; bounded by rounds, wall clock, and cost; fails closed | P0 |
| R5 | `app-build` eval suite with ≥8 medium-complex cases and `--min-success` gating | P0 |
| R6 | Headless runtime simulates `visibleWhen`/`disabledWhen`/`format`; a click on a hidden/disabled widget is a run failure | P0 |
| R7 | Headless resource provider: seedable in-memory collections so `from: "resource"` params run | P1 |
| R8 | LLM judge stage scoring widget end-states against spec expectations | P1 |
| R9 | `build_app` server tool + HTTP surface | P1 |
| R10 | `--supervise` composes: the run stage can put the supervisor on workflow failures | P1 |
| R11 | Example-apps pipeline can regenerate a curated bundle via `app build spec.json` and diff against the shipped one | P2 |
| R12 | `--watch` on a spec file: edit spec, re-run loop, print verdict diff (mirrors `debug --watch`) | P2 |

## 7. Non-goals

- **Pixel truth.** No browser, no screenshots, no layout aesthetics. The
  browser surface stays where it is (`web` e2e); this harness judges wiring
  and behavior. A beautiful-but-miswired app fails; an ugly-but-correct one
  passes.
- **Replacing the App Builder.** Humans still refine in Design view. The
  harness produces the first 90%, not the last 10%.
- **Open-ended agents.** An app with no fixed shape is Chat's job
  ([mini-apps.md](mini-apps.md) says so); the harness refuses specs it cannot
  pin to operations and widgets rather than guessing.
- **Publishing.** The output is a bundle. Releases, spending limits, and
  sharing stay in the app lifecycle, untouched.

## 8. Success metrics

| Metric | Target | Where it's read |
| --- | --- | --- |
| One-shot rate, `app-build` suite (zero repair rounds) | ≥ 60% at launch, ≥ 80% two model generations later | eval report, CI gate |
| Green-within-budget rate (≤ 3 repairs) | ≥ 90% | eval report |
| Repair convergence | median ≤ 1 round | `BuildReport` |
| Cost per green app | ≤ $0.50 median on the suite | prediction ledger (`nodetool costs`, tagged `app-build`) |
| Wall clock per app | ≤ 3 min median, providers warm | eval report |
| Oracle honesty | 0 known false-greens: every R6/R7 gap closed or listed in the report's `notSimulated` field | `BuildReport` |

The last row is the one that keeps the rest honest: a rising one-shot rate
against a blind oracle is noise, not progress.

## 9. Milestones

1. **M1 — Close the oracle gaps.** R6 + R7 in `app debug`. Ship independently;
   existing users of the debug harness benefit immediately.
2. **M2 — The loop.** Spec → Plan → Author → Check → Run wired into
   `nodetool app build` with repair (R1–R4). Judge stubbed to
   verdict-only.
3. **M3 — The score.** `app-build` suite + judge stage (R5, R8), CI gate on
   deterministic cases, nightly full run.
4. **M4 — Surfaces.** `build_app` tool (R9), supervisor composition (R10),
   then the P2 conveniences.

## 10. Risks

| Risk | Mitigation |
| --- | --- |
| Repair loops oscillate (fix A breaks B, fix B breaks A) | Complaints carry the full issue set, not the delta; a round that reintroduces a previously-fixed issue ends the loop early as `failed` |
| Judge grades its own homework (same model plans and judges) | Judge model is independently configurable, defaults to a different model than the builder; deterministic cases skip the judge entirely |
| Spec stage invents unbuildable apps | Spec is validated against the widget catalog and operation schema before Plan spends a token; unpinnable prompts are rejected at spec time (§7) |
| Headless/browser drift makes green apps break in the web runtime | Author and Run stages consume `@nodetool-ai/app-runtime` doc-ops and fold — the same code the browser runs; anything the harness cannot share it must list in `notSimulated` |
| Cost blowups on hard prompts | Same posture as the supervisor: caps are defaults, not options; exhausting one is a normal, reported outcome |
