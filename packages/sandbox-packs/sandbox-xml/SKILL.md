---
name: sandbox-xml
description: Parse XML feeds and sitemaps in a Code node or CodeAct action, with fast-xml-parser running on the host
---

# XML in the sandbox

Specifier: `@nodetool-ai/sandbox-xml`. Import it at the top of the body.

fast-xml-parser reads a bare `window`, which the guest does not have, so it
cannot be compiled in. This pack is a **host module**: the import resolves to a
generated facade over NodeTool's own implementation.

## parse — XML to a plain object

```js
import { parse } from "@nodetool-ai/sandbox-xml";

const feed = await parse(inputs.xml);
const items = feed?.rss?.channel?.item ?? [];
return { titles: items.map((i) => i.title) };
```

Attributes ride along prefixed `@_` so they never collide with child-element
keys; pass `{ attributes: false }` to drop them. Text values stay text — a
numeric-looking id must not change shape between runs.

Invalid XML throws with the parser's own reason rather than returning a partial
tree.

## Gotchas

- **`parse` is async.**
- **5 MB of text per call.**
- **A single child is not an array.** `channel.item` is one object when the feed
  has one item; normalize with `[].concat(x ?? [])`.
