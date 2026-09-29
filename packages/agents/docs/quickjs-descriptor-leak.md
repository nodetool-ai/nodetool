# QuickJS descriptor handle leak

The dependency's `handleToNative.setProperties` reads six descriptor fields
with `ctx.getProp`. Its early returns for `undefined` and boolean flags do not
dispose the returned `Lifetime`. These are allocated handles even though their
values are primitive. They survive context and runtime disposal in the shared
WASM allocation space. The same marshaler also forgets the string handle
from `ctx.getProp(symbol, "description")`.

## Evidence

- The original shipped sequence passed kite, prism, t-minus-30 and tidewater,
  then aborted while disposing Voltra. Repeating Voltra alone aborted on its
  fourth run. Two runs were insufficient to detect it.
- Tracking `getProp` handles before context disposal found 143,789, 92,643,
  64,258, 150,593 and 150,813 live primitive handles across the five runs.
  No live object handles appeared in that instrumentation. This identifies the
  allocation leak, but does not identify the internal GC object named by the
  final assertion.
- Adding disposal to only those two early-return branches in a temporary copy
  of the dependency made the five shipped runs pass and let a reduced timeline
  case run 30 times. The installed dependency was restored afterward.
- The standalone program below aborts on run five with the installed release
  variant. It imports neither NodeTool nor its serializer registration, so
  those are not required for the failure. The retained test runs the same
  program 30 times on one engine through the compatibility adapter.
- Moving all timeline stubs into the guest let the five original scripts pass.
  Sending JSON copies of their documents through a top-level callback on a
  pooled worker also passed. The closure-bearing callback input cannot cross
  `postMessage` unchanged because functions are not cloneable.
- A worker-compatible top-level RPC callback still marshals its arguments
  before `postMessage` refuses their closures. Repeating that sequence on a
  real pooled worker with the raw dependency aborted on run five. With the
  adapter, 30 runs passed on the same worker. The integration regression is
  `tests/js-sandbox-worker-engine.test.ts`. It verifies that the host callback
  was never reached and the worker was reused.

An audit of the standalone program measured 162,064 `getProp` allocations.
After runtime disposal, the unmodified dependency left 135,051 handles alive.
The primitive adapter reduced that to one symbol-description string. Giving
symbol descriptions context-scoped ownership removes the remaining allocation.
The ownership regression checks that reads occurred and no returned property
handle remains alive after disposal.

## Local compatibility adapter

`src/js-sandbox-worker/engine.ts` wraps each engine's public `newContext` method
and installs a public `getProp` adapter before the dependency bootstraps it.
For `undefined` and boolean values, it disposes the allocated property handle
and returns `context.undefined`, `context.true` or `context.false`. These are
static handles whose disposal is a no-op. Callers that already dispose their
property handles continue to work. Symbol-description handles are also registered with a context scope, which
disposes any that callers have not already released before context teardown.
Other values retain their original ownership.

Both execution paths use this loader and keep their cached engine. There is no
run-count threshold or bake-specific engine option. Remove the adapter when an
upstream fix passes `tests/js-sandbox-engine.test.ts` without it.

The worker pool previously retained a worker after a caught interpreter abort.
A real-worker probe returning a named function triggered the dependency's
separate recursive function-marshaling failure and cleanup assertion. The next
`return 42` succeeded on that same worker. With the pool change, the abort is
reported as a worker failure, the thread is terminated, and the next run uses a
replacement. Ordinary guest errors still return through the interpreter's
normal result path.

The adapter addresses the observed descriptor leak. It does not claim to fix
other dependency defects, including recursive marshaling of named functions or
all host-promise error paths.

## Verification

On Node 22.22.1, the requested sandbox, timeline bake, shipped rebake, CodeAct
timeline package, timeline capability and worker protocol suites, together with
the direct-engine regressions, passed three times: 299 tests per pass. The
separate real-worker regression passed three times, each with 30 runs on one
worker. The direct-engine regression also uses 30 runtimes on one engine.

The original shared-engine test failed before the adapter, the symbol ownership
check failed before context-scoped disposal, and the worker replacement check
failed before the pool discarded interpreter failures. Each passed afterward.

Workspace builds, root typecheck, root lint, touched-file oxlint, agent-document
validation and all 19 selected harness selfchecks passed.

`npm run test:affected` still fails two pre-existing working-tree tests:

- [gate-from-context.test.ts](../tests/gate-from-context.test.ts) finds the
  timeline bake's `ungatedCapabilityRun` call missing from its allowlist. The
  saved original bake already contained that call.
- [sandbox-json-transport.test.ts](../tests/sandbox-json-transport.test.ts)
  receives empty bytes and a non-Date value for injected globals. Both the
  saved original sandbox and the corrected sandbox reproduce that result.

Those changes were left intact. Repository-wide verification is not fully
passing.

## Upstream issue draft

Title: `handleToNative` leaks primitive descriptor handles across sandbox runs

With `@sebastianwessel/quickjs@3.0.1` and
`@jitl/quickjs-ng-wasmfile-release-sync@0.31.0`, this standalone ESM program
aborts on its fifth run with `list_empty(&rt->gc_obj_list)` in `JS_FreeRuntime`:

```js
import { loadQuickJs } from "@sebastianwessel/quickjs";
import variant from "@jitl/quickjs-ng-wasmfile-release-sync";

const engine = await loadQuickJs(variant);
for (let run = 1; run <= 30; run++) {
  console.log("run", run);
  await engine.runSandboxed(
    async ({ evalCode }) => {
      const result = await evalCode(`
        const a = Array.from({length: 300}, (_, i) => {
          const o = {i, arr: [], nested: {x: 1}};
          for (let j = 0; j < 13; j++) o['fn' + j] = (opts = {}) => a;
          return o;
        });
        await env.capture(a);
        await env.capture(a);
        export default 42;
      `);
      if (!result.ok) throw new Error(JSON.stringify(result));
    },
    { env: { capture: async () => ({ ok: true }) } }
  );
}
```

In `src/sandbox/handleToNative/handleToNative.ts`, the descriptor reducer returns
without `h.dispose()` in the `t === 'undefined'` branch and the boolean flag
branch. Put ownership of each `ctx.getProp(value, key)` handle in a
`try/finally` so every branch and conversion failure disposes it. Instrumenting
these reads confirms the primitive handles remain alive. Fixing those two
branches removes the observed sequential-run abort. The symbol branch also needs to dispose the property handle after reading its
string. The precise internal GC object behind the assertion has not been
isolated.

This draft is saved locally and has not been submitted upstream.
