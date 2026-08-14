---
name: sandbox-pdflib
description: Build and merge PDF files in a Code node or CodeAct action, with pdf-lib running on the host
---

# PDF writing in the sandbox

Specifier: `@nodetool-ai/sandbox-pdflib`. Declare it in the node's `packages`
property and import it at the top of the body.

This pack **writes** PDFs. To extract text from an existing file, use
`@nodetool-ai/sandbox-pdf` instead.

## build — pages to PDF bytes

Coordinates are **top-left**, in PDF points (72 per inch). A US Letter page
is 612×792.

```js
import { build } from "@nodetool-ai/sandbox-pdflib";

const bytes = await build({
  pages: [
    {
      width: 612,
      height: 792,
      items: [
        { type: "text", x: 72, y: 72, text: "Hello", size: 24, color: "#111827" },
        { type: "image", x: 72, y: 120, width: 200, height: 120, data: inputs.logo }
      ]
    }
  ]
});
await workspace.writeBytes("hello.pdf", bytes);
```

Item types:

- `text` — `x`, `y`, `text`, `size` (points, default 12), `color` (hex)
- `image` — `x`, `y`, `width`, `height`, `data` (`Uint8Array` PNG or JPEG)

## merge — concatenate PDFs

```js
import { merge } from "@nodetool-ai/sandbox-pdflib";

const bytes = await merge([inputs.first, inputs.second]);
await workspace.writeBytes("combined.pdf", bytes);
```

Each entry is a `Uint8Array` of an existing PDF.

## Gotchas

- **Host module.** `build` and `merge` are async and return a `Uint8Array`.
- **At most 200 pages** (or 200 source documents for `merge`).
- **Images are PNG or JPEG bytes**, sniffed from the magic header.
