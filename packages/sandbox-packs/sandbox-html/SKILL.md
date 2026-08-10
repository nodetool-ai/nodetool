---
name: sandbox-html
description: Select elements out of HTML and convert a page to markdown in a Code node or CodeAct action, with cheerio and turndown running on the host
---

# HTML in the sandbox

Specifier: `@nodetool-ai/sandbox-html`. Declare it in the node's `packages`
property and import it at the top of the body.

cheerio imports 25 Node builtins and turndown wants a DOM, so neither compiles
into the guest. This pack is a **host module**: the import resolves to a
generated facade over NodeTool's own implementation. Both exports are `async`.

## select — CSS selection

```js
import { select } from "@nodetool-ai/sandbox-html";

const hrefs = await select(inputs.html, "a[href]", { attr: "href", limit: 500 });
const titles = await select(inputs.html, "h2");   // trimmed text of each match
return { hrefs, titles };
```

Returns trimmed text per match, or the named attribute when `attr` is set.
`limit` defaults to **100** and is clamped to **1000** — the cap is in the host
implementation, so raising it in the call does nothing.

## toMarkdown — a whole page

```js
import { toMarkdown } from "@nodetool-ai/sandbox-html";

const markdown = await toMarkdown(inputs.html);
return { markdown };
```

The usual first step before summarizing or indexing a fetched page. Pass
`{ turndown: {...} }` to override turndown's own options.

## Gotchas

- **Every export is async.**
- **5 MB of HTML per call.** Larger input is refused by name.
- **A selector that matches nothing returns `[]`**, never `null`. An invalid
  selector throws with cheerio's own message.
