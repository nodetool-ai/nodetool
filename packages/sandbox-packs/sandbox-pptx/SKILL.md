---
name: sandbox-pptx
description: Extract text from a PowerPoint file, whole or per slide, in a Code node or CodeAct action, with office-text-extractor running on the host
---

# PowerPoint text in the sandbox

Specifier: `@nodetool-ai/sandbox-pptx`. Import it at the top of the body.

office-text-extractor reads a `.pptx` buffer through Node's own zip/XML stack;
it is not a guest-module candidate. This pack is a **host module**: the import
resolves to a generated facade over NodeTool's own implementation.

## extractText — whole deck to plain text

```js
import { extractText } from "@nodetool-ai/sandbox-pptx";

const bytes = await workspace.readBytes("deck.pptx");
const text = await extractText(bytes);
```

All slides concatenated, in order.

## extractSlides — one item per slide

```js
import { extractSlides } from "@nodetool-ai/sandbox-pptx";

const slides = await extractSlides(bytes);
// [{ index: 0, slideNumber: 1, text: "Welcome to slide one" }, ...]
```

Get the bytes from `workspace.readBytes`, or from a fetched body with
`await response.bytes()`.

## Gotchas

- **Both exports are async.**
- **10 MB per deck.** Larger input is refused by name.
- **Text only.** Neither export reads speaker notes, images, or slide layout —
  just the text runs on each slide.
