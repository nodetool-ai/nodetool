---
name: sandbox-csv
description: Parse and write CSV in a Code node or CodeAct action, with papaparse running on the host behind a generated facade
---

# CSV in the sandbox

Specifier: `@nodetool-ai/sandbox-csv`. Import it at the top of the body.

papaparse imports `node:stream`, so it cannot be compiled into the guest. This
pack is a **host module**: the import resolves to a generated facade whose two
exports call NodeTool's own implementation. Both are `async` — a host call is a
round trip.

## parse — CSV text to records

```js
import { parse } from "@nodetool-ai/sandbox-csv";

const rows = await parse(inputs.csv);           // records keyed by the header row
const raw = await parse(inputs.csv, { header: false });   // string[][]
return { count: rows.length, first: rows[0] ?? null };
```

Options: `header` (default `true`), `delimiter` (one character; omit to
auto-detect).

Values stay **strings**. There is no `dynamicTyping`, so a column never changes
shape between runs — convert what you need with `Number()` or `new Date()`.

## stringify — records back to CSV

```js
import { stringify } from "@nodetool-ai/sandbox-csv";

const csv = await stringify(inputs.rows, { delimiter: ";" });
return { csv };
```

Takes records or row arrays. Options: `header` (default `true`), `delimiter`
(exactly one character).

## Gotchas

- **Every export is async.** `parse(...)` without `await` gives you a Promise.
- **5 MB of text per call.** Input over that is refused by name. Split a bigger
  file, or read it in slices with `workspace.read`.
- **Bounded concurrency still helps.** Host calls start when invoked, so
  `Promise.all` over several `parse` calls runs them together; `parallelMap`
  is the bounded form.
