---
name: sandbox-epub
description: Read an EPUB's metadata, table of contents, and chapters in a Code node or CodeAct action, with epub2 running on the host
---

# EPUB e-books in the sandbox

Specifier: `@nodetool-ai/sandbox-epub`. Import it at the top of the body.

epub2 reads from a file path, not a buffer, so this pack is a **host module**:
the host stages your bytes in a temp file for the call and removes it
afterward. The import resolves to a generated facade over NodeTool's own
implementation.

## metadata — title, author, language, and the rest

```js
import { metadata } from "@nodetool-ai/sandbox-epub";

const bytes = await workspace.readBytes("book.epub");
const meta = await metadata(bytes);   // { title, creator, language, publisher, ... }
```

## tableOfContents — chapter titles in reading order

```js
import { tableOfContents } from "@nodetool-ai/sandbox-epub";

const toc = await tableOfContents(bytes);
// [{ id, title, href, order }, ...]
```

## extractText — every chapter, concatenated

```js
import { extractText } from "@nodetool-ai/sandbox-epub";

const text = await extractText(bytes);
const withCustomBreaks = await extractText(bytes, { chapterSeparator: "\n\n---\n\n" });
```

`chapterSeparator` defaults to `"\n\n"`.

## extractChapters — each chapter as its own item

```js
import { extractChapters } from "@nodetool-ai/sandbox-epub";

const chapters = await extractChapters(bytes);
// [{ id, title, href, text }, ...]
```

Get the bytes from `workspace.readBytes`, or from a fetched body with
`await response.bytes()`.

## Gotchas

- **Every export is async.**
- **10 MB per book.** Larger input is refused by name.
- **HTML is stripped, not rendered.** `extractText`/`extractChapters` return
  plain text — no headings, links, or images survive the conversion.
