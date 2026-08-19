---
name: sandbox-html
description: Select elements out of HTML and convert a page to markdown in a Code node or CodeAct action, with cheerio and turndown running on the host
---

# HTML in the sandbox

Specifier: `@nodetool-ai/sandbox-html`. Import it at the top of the body.

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

## toText — a whole page as plain text

```js
import { toText } from "@nodetool-ai/sandbox-html";

const text = await toText(inputs.html);
return { text };
```

Strips `<script>`/`<style>` and every tag, then collapses whitespace.

## extractLinks / extractImages / extractAudio / extractVideos

```js
import {
  extractLinks,
  extractImages,
  extractAudio,
  extractVideos
} from "@nodetool-ai/sandbox-html";

const links = await extractLinks(inputs.html, inputs.baseUrl);
// [{ href, text, type: "internal" | "external" }, ...]

const images = await extractImages(inputs.html, inputs.baseUrl); // string[] of resolved URLs
const audio = await extractAudio(inputs.html, inputs.baseUrl);
const videos = await extractVideos(inputs.html, inputs.baseUrl);
```

`baseUrl` is optional. When set, relative `src`/`href` values resolve against
it and `extractLinks` classifies same-origin links as `internal`. Each
extractor returns at most 1000 items.

## extractMetadata — title, description, keywords

```js
import { extractMetadata } from "@nodetool-ai/sandbox-html";

const { title, description, keywords } = await extractMetadata(inputs.html);
```

Any field the page doesn't set comes back `null`.

## extractReadableText — strip chrome, keep the article

```js
import { extractReadableText } from "@nodetool-ai/sandbox-html";

const article = await extractReadableText(inputs.html);
```

Removes `script`/`style`/`nav`/`aside`/`footer`/`header`, then returns the
text of the first match among `article`, `main`, `[id*=content]`,
`[class*=content]`, or `body`. A page with none of those returns
`"No main content found"`.

## Getting a page's base URL

No import needed — `new URL(pageUrl).origin` gives the base URL to pass into
the extractors above.

## Gotchas

- **Every export is async.**
- **5 MB of HTML per call.** Larger input is refused by name.
- **A selector that matches nothing returns `[]`**, never `null`. An invalid
  selector throws with cheerio's own message.
- **Extractors cap at 1000 items.** Anything past that is silently dropped.
