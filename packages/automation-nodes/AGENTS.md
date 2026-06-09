# automation-nodes — Triggers, Filesystem, SQLite, OS

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **automation-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first — the output-slot contract bit this package hardest. This overlay covers automation-specific correctness.

## Output-slot contract (the headline bug)

- **Every key a node returns must be a declared `metadataOutputTypes` slot.**
  `Insert`/`Update`/`Delete`/`ExecuteSQL`/`SplitPath`/`SplitExtension` declared a
  single `output` slot but returned `row_id`/`rows_affected`/`dirname`/… — keys
  the editor never exposed as handles, so the data was unreachable downstream. The
  `assertKeysDeclared` invariant in `tests/output-slots-and-fixes.test.ts` pins
  this; **never test a node only as a terminal sink** (sinks hide the mismatch).
- **`SaveImageFile`/`SaveVideoFile` outputs need the `type` discriminator**
  (`type: "image"`/`"video"`).

## Dependencies

- **Every imported runtime module must be a declared dependency in this package's
  own `package.json`** — `cheerio`/`turndown`/`sharp` were imported but resolved
  only via monorepo hoisting, which breaks on standalone install.

## Filesystem & SQLite

- **Don't overload `fs.mkdir`'s `recursive` flag to express "error if exists".**
  `recursive` means parents-plus-idempotent, so passing `exist_ok` as `recursive`
  also disables parent creation. Always `mkdir({ recursive: true })` and check
  existence separately.
- **Validate dynamic SQL has at least one column/value before string-building** —
  empty `data`/`columns` otherwise emits syntactically invalid SQL. Throw a clear
  message.
- **A glob-to-regex converter must translate every metacharacter the contract
  promises** — `*` → `.*` **and** `?` → `.` — not just `*`.

## Triggers & timeouts

- **In a drift-compensated scheduler, the first tick lands one full interval after
  the initial delay unless an on-start emission consumed that slot.** Offset by
  whether the start tick fired (`driftOffset = emitOnStart ? 0 : 1`); otherwise the
  first tick fires immediately when `emit_on_start = false`.
- **Never swallow a setup failure that leaves an async generator blocked
  forever.** If `fs.watch` fails for every path (zero watchers), throw with the
  underlying message instead of hanging on `queue.get()`.
- **A declared timeout option must actually bound the wait** — implement
  `timeout_seconds` with `Promise.race([iterator.next(), timeoutPromise])` (a
  `unique symbol` sentinel so TS narrows the result), clearing the timer each
  iteration.
