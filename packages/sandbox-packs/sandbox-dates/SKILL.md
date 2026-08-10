---
name: sandbox-dates
description: Date arithmetic, parsing and formatting inside a Code node or CodeAct action, with date-fns running in the guest
---

# Dates in the sandbox

Specifier: `@nodetool-ai/sandbox-dates`. One module, date-fns's root export —
around 250 named functions. There is no default export, so import the names you
use.

## Arithmetic and comparison

```js
import { addDays, differenceInCalendarDays, isBefore } from "@nodetool-ai/sandbox-dates";

const due = addDays(new Date(inputs.startedAt), 30);
return { due: due.toISOString(), overdue: isBefore(due, new Date()), days: differenceInCalendarDays(due, new Date()) };
```

## Parsing and formatting

```js
import { parseISO, format, isValid } from "@nodetool-ai/sandbox-dates";

const when = parseISO(inputs.timestamp);
if (!isValid(when)) return { label: "unknown" };
return { label: format(when, "EEEE, d MMMM yyyy") };
```

`format` uses date-fns's own English locale tables, not `Intl` — which the
guest does not have. That is why formatting works here at all, and it is also
the limit: another language means another locale, and locales live at
`date-fns/locale`, a subpath this pack does not publish.

## Gotchas

- **UTC only.** The guest runs with no time-zone database, so `new Date()` and
  every conversion behave as UTC. Anything zone-aware — "9 am in Berlin" —
  belongs on the host, not here.
- **Named imports only.** `import dates from "@nodetool-ai/sandbox-dates"` gets
  you nothing; date-fns is pure ESM with no default export.
- **Import what you use.** The bundle is about 176 KB and loads as one module
  per invocation, so a node that needs one comparison pays for all of it. For a
  single `Date` subtraction, plain arithmetic is cheaper.
- **No timers.** `setTimeout` does not exist in the guest. date-fns needs none,
  but code around it must not either.
