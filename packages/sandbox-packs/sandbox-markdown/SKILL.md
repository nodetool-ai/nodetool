---
name: sandbox-markdown
description: Parse markdown into a token stream inside a Code node or CodeAct action, with marked's lexer running in the guest
---

# Markdown in the sandbox

Specifier: `@nodetool-ai/sandbox-markdown`. One module, the `marked` root
export. Import it at the top of the body.

`marked` is pure JavaScript — no Node builtins, no DOM — so it compiles
straight into the QuickJS guest. There is no pre-built "extract headers"
helper; `marked.lexer` gives you the token stream and you read what you need
out of it.

## lexer — markdown text to tokens

```js
import { marked } from "@nodetool-ai/sandbox-markdown";

const tokens = marked.lexer(inputs.markdown);
return { tokenCount: tokens.length };
```

Each token carries a `type` (`heading`, `paragraph`, `list`, `code`, `table`,
`link` tokens nested inside `paragraph`/`text` tokens, etc.) and the fields
that type needs.

## Headers → a document outline

```js
import { marked } from "@nodetool-ai/sandbox-markdown";

const headers = marked.lexer(inputs.markdown)
  .filter((t) => t.type === "heading")
  .map((t) => ({ level: t.depth, text: t.text }));
return { headers };
```

## Links → a flat list

`marked` nests inline tokens (links, emphasis) inside block tokens. Walk
`tokens.links` for a document's reference-style link definitions, or walk each
block's `.tokens` for inline links:

```js
import { marked } from "@nodetool-ai/sandbox-markdown";

function collectLinks(tokens, out = []) {
  for (const t of tokens) {
    if (t.type === "link") out.push({ href: t.href, text: t.text });
    if (t.tokens) collectLinks(t.tokens, out);
    if (t.items) collectLinks(t.items, out);
  }
  return out;
}

const links = collectLinks(marked.lexer(inputs.markdown));
return { links };
```

## Lists → nested items

```js
import { marked } from "@nodetool-ai/sandbox-markdown";

const lists = marked.lexer(inputs.markdown)
  .filter((t) => t.type === "list")
  .map((t) => ({
    ordered: t.ordered,
    items: t.items.map((item) => item.text)
  }));
return { lists };
```

## Code blocks → language + source

```js
import { marked } from "@nodetool-ai/sandbox-markdown";

const codeBlocks = marked.lexer(inputs.markdown)
  .filter((t) => t.type === "code")
  .map((t) => ({ language: t.lang || "text", code: t.text }));
return { codeBlocks };
```

## Tables → rows of records

```js
import { marked } from "@nodetool-ai/sandbox-markdown";

const tables = marked.lexer(inputs.markdown)
  .filter((t) => t.type === "table")
  .map((t) => {
    const headers = t.header.map((cell) => cell.text);
    return t.rows.map((row) =>
      Object.fromEntries(row.map((cell, i) => [headers[i], cell.text]))
    );
  });
return { tables };
```

## Markdown → HTML

```js
import { marked } from "@nodetool-ai/sandbox-markdown";

const html = marked.parse(inputs.markdown);
return { html };
```

## Gotchas

- **Everything runs in the guest.** The 64 MB guest heap holds your input text,
  the token tree, and the returned value at once.
- **`marked.lexer` is synchronous**, unlike `marked.parse` (which can be async
  when you register an async extension — the default configuration is not).
- **Token shapes differ by type.** A `list` token's items are themselves
  tokens with their own `.tokens`; a `table` token has `header`/`rows`, not a
  flat `cells` array. Log a sample token when a shape is unclear.
- **This pack is the only route to markdown parsing.** There is no
  `data.parseMarkdown` global; every library the sandbox offers is an
  importable module, and this is the one for markdown.
