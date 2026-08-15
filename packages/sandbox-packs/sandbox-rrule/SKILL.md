---
name: sandbox-rrule
description: Expand iCalendar recurrence rules inside a Code node or CodeAct action, with rrule running in the guest
---

# Recurrence in the sandbox

Specifier: `@nodetool-ai/sandbox-rrule`. One module, rrule. Declare it in
the node's `packages` property and import it at the top of the body.

## Build a rule and expand it

```js
import { RRule } from "@nodetool-ai/sandbox-rrule";

const rule = new RRule({
  freq: RRule.WEEKLY,
  interval: 1,
  count: 4,
  dtstart: new Date(inputs.start)
});
return { dates: rule.all().map((d) => d.toISOString()) };
```

## Parse an RRULE string

```js
import { rrulestr } from "@nodetool-ai/sandbox-rrule";

const rule = rrulestr(inputs.rrule);
return { dates: rule.between(new Date(inputs.from), new Date(inputs.to)).map((d) => d.toISOString()) };
```

## Gotchas

- **UTC.** Same guest limit as date-fns.
- **Cap `count` / `between`.** An unbounded `all()` can allocate
  without end.
