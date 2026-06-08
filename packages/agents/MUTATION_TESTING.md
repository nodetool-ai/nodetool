# Mutation Testing — `@nodetool-ai/agents`

The agent package's pure, deterministic core (the chat permission gate, the
control-tool plumbing, JSON extraction, and the math/utility helpers) is
verified with **mutation testing** in addition to ordinary coverage. Line
coverage only proves code *ran*; mutation testing proves the tests would
actually *fail* if the behaviour changed.

## Running it

```bash
npm run test:mutation --workspace=packages/agents
# or, from packages/agents:
npx stryker run
```

The HTML report lands in `reports/mutation/mutation.html` (git-ignored).

## Scope

The agents package is large (~19k LOC) and most of it is I/O-bound glue around
LLM providers, browsers, HTTP, email, and the workflow kernel — surface that
mutation testing can't meaningfully verify without a live model. So the gate is
scoped (in `stryker.config.json` `mutate`) to the **pure, deterministic modules
with strong unit suites**, the analog of the security package's crypto/key core:

```
src/tools/tool-permissions.ts      # the chat permission gate (security-critical)
src/tools/control-tool.ts          # control-edge tool name/schema construction
src/tools/calculator-tool.ts       # safe expression evaluation
src/tools/math-tools.ts            # statistics / geometry / trig / unit conversion
src/utils/json-parser.ts           # extractJSON from LLM text
src/utils/remove-base64-images.ts  # message-content filtering
src/utils/wrap-generators-parallel.ts  # async-generator merge
```

A dedicated `vitest.mutation.config.ts` restricts the runner to the fast,
hermetic unit tests covering these files so the dry-run stays quick and never
touches the network / LLM-backed e2e suites.

## Current status

```
File                        | % score | killed | survived
----------------------------|---------|--------|---------
calculator-tool.ts          |  100.00 |     40 |        0
control-tool.ts             |  100.00 |     83 |        0
math-tools.ts               |  100.00 |    540 |        0
tool-permissions.ts         |  100.00 |    156 |        0
json-parser.ts              |  100.00 |     43 |        0
remove-base64-images.ts     |  100.00 |     21 |        0
wrap-generators-parallel.ts |  100.00 |     18 |        0
----------------------------|---------|--------|---------
All files                   |  100.00 |    901 |        0
```

(Timeouts count as killed — they are infinite-loop mutants the scheduler tests
detect.) The config gate (`stryker.config.json`) **breaks below 90%** so a
regression in test quality fails fast.

## How the suite was hardened

Mutation testing surfaced gaps that high line coverage hid. The tests added to
close them target *observable behaviour*, not implementation details (each pins
one externally-meaningful property and reads as Arrange/Act/Assert):

- **Permission classification table** (`tool-permissions-hardening.test.ts`): a
  data-driven check that *every* entry in `TOOL_PERMISSION_CATEGORIES` maps to
  one of the four valid categories — killing the ~90 "blank a category string"
  mutants at once.
- **Permission gate contracts** (same file): the `GatedTool` forwarding getters
  (`inputSchema`, `userMessage`), the exact operator-facing block/deny messages
  (tool name + remediation hint), and that a plain `allow` is *not* persisted to
  the session allowlist (only `allow_for_chat` is).
- **Control-tool construction** (`control-tool-hardening.test.ts`): the
  object-spread vs string-wrap branch (including `null`, since `typeof null ===
  "object"`), the comma-joined "Available properties" description, the empty
  case, and the `with properties:` join separator (needs ≥2 properties to be
  observable).
- **JSON extraction** (`json-parser-hardening.test.ts`): a fenced *primitive*
  (only the fence path can recover it), a `}` inside a string value, and an
  escaped quote before a brace — driving the balanced-brace state machine.
- **Calculator result guard** (`calculator-tool-hardening.test.ts`): the input
  schema shape and a *boolean* result (finite when coerced, so only the
  `typeof result !== "number"` operand rejects it).
- **Math tools** (`math-tools-hardening.test.ts`): exact formula results (with
  inputs chosen so each operator matters — non-zero distance origins, a Heron's
  triangle where `s - c !== 1`, asymmetric data), every per-statistic / shape /
  trig-function / unit branch, the schema/enum/description contracts, and the
  non-numeric guard paths (driven with `BigInt` inputs that throw inside the
  `try`).

## Equivalent & non-behavioral mutants

Some mutants **cannot** be killed because they don't change observable
behaviour. Chasing them is wasted effort, so they're suppressed at the source
with a line-scoped `// Stryker disable` comment that documents *why*:

- **`extractJSON` `text.trim()`** — `JSON.parse` already tolerates surrounding
  whitespace and strategy 3 scans via `indexOf`, so dropping the trim changes no
  result.
- **`extractJSON` fence regex** — strategy 3 (balanced braces) recovers any
  fenced object/array and the captured group is `.trim()`'d before parsing, so
  whitespace-class tweaks to the fence regex are non-behavioral.
- **`extractJSON` fence conditional / scan bounds** — the `if (fenceMatch?.[1])`
  → `true` mutant only forces a parse on a missing capture (caught below); the
  `startIdx === -1` skip and the `< length` loop bound only affect indices that
  match no branch.
- **`sanitizeToolName` edge-strip regex** — the preceding collapse leaves at
  most one edge underscore, so `_+`→`_` at the edges matches identical text.
- **`sanitizeToolName` 64-char truncation** — at the boundary `slice(0, 64)` is
  a no-op, so `> 64`→`>= 64` and the always-truthy guard are byte-identical.
- **`wrapGeneratorsParallel` empty-array guard** — falling through runs the loop,
  which immediately breaks on zero active slots.
- **`StatisticsTool` mode sentinel** — the `"No unique mode"` initial value is
  always overwritten by the first value (count ≥ 1 > 0) for the guaranteed
  non-empty data, so it is never returned.

Each suppression is line-scoped and carries a reason, so the headline score
reflects the quality of the tests over *behavioural* code rather than being
inflated or penalised by mutants no test could legitimately catch.
