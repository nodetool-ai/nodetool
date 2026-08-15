---
name: sandbox-ics
description: Build .ics calendar files in a Code node or CodeAct action, with ics running on the host
---

# iCalendar in the sandbox

Specifier: `@nodetool-ai/sandbox-ics`. Declare it in the node's `packages`
property and import it at the top of the body.

The published ics bundle does not compile into QuickJS, so this pack is a
**host module**.

## createEvent — one event

```js
import { createEvent } from "@nodetool-ai/sandbox-ics";

const ics = await createEvent({
  title: inputs.title,
  start: inputs.start,
  duration: { hours: 1 },
  location: inputs.location
});
return { ics };
```

`start` is `[year, month, day, hour, minute]`, e.g. `[2026, 8, 15, 10, 0]`.

## createEvents — many

```js
import { createEvents } from "@nodetool-ai/sandbox-ics";

const ics = await createEvents(inputs.events);
return { ics };
```

## Gotchas

- **Throws on a bad event.** The host unwraps ics's `{ error, value }` bag.
- **Pair with `@nodetool-ai/sandbox-rrule`** to expand a series first.
