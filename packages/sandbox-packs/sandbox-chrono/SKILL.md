---
name: sandbox-chrono
description: Parse English dates such as next Tuesday in a Code node or CodeAct action, with chrono-node running on the host
---

# Natural-language dates in the sandbox

Specifier: `@nodetool-ai/sandbox-chrono`. Declare it in the node's `packages`
property and import it at the top of the body.

chrono-node does not compile into QuickJS, so this pack is a **host module**.
You pass text; you get ISO strings back.

## parseDate — first match

```js
import { parseDate } from "@nodetool-ai/sandbox-chrono";

const iso = await parseDate(inputs.text, inputs.now);
return { iso };
```

`inputs.now` is an optional reference timestamp (ISO string or epoch ms).

## parse — every match

```js
import { parse } from "@nodetool-ai/sandbox-chrono";

const hits = await parse(inputs.text, inputs.now);
return { hits };
```

Each hit is `{ text, start, end }` with ISO strings (`end` may be `null`).

## Gotchas

- **Async host calls.** Always `await`.
- **UTC.** The guest still has no time-zone database.
- **Pair with `@nodetool-ai/sandbox-dates`** to format the Date you parse.
