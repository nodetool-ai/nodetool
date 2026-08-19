---
name: sandbox-mammoth
description: Read a Word document as text or HTML in a Code node or CodeAct action, with mammoth running on the host
---

# Word documents in the sandbox (reading)

Specifier: `@nodetool-ai/sandbox-mammoth`. Import it at the top of the body.

mammoth reads a `.docx` buffer through Node's own zip/XML stack; it will never
be a guest module. This pack is a **host module**: the import resolves to a
generated facade over NodeTool's own implementation.

## extractRawText — docx bytes to plain text

```js
import { extractRawText } from "@nodetool-ai/sandbox-mammoth";

const bytes = await workspace.readBytes("report.docx");
const text = await extractRawText(bytes);
```

Formatting is discarded — this is the fast path when you only need the words.

## convertToHtml — docx bytes to HTML

```js
import { convertToHtml } from "@nodetool-ai/sandbox-mammoth";

const html = await convertToHtml(bytes);
```

Headings, lists, tables, bold/italic runs, and embedded images (as base64 data
URIs) survive the conversion. Track changes, headers/footers, footnotes, and
exact visual layout do not — mammoth targets semantic HTML, not a pixel-exact
render.

Get the bytes from `workspace.readBytes`, or from a fetched body with
`await response.bytes()`.

## Gotchas

- **Both exports are async.**
- **10 MB per document.** Larger input is refused by name.
- **Reading only.** To build a `.docx`, use `@nodetool-ai/sandbox-docx`
  instead.
