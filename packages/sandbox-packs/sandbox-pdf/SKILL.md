---
name: sandbox-pdf
description: Extract the embedded text of a PDF, whole or per page, in a Code node or CodeAct action, with pdf-parse running on the host. It reads text the PDF already carries; it does not OCR a scanned page.
---

# PDF text in the sandbox

Specifier: `@nodetool-ai/sandbox-pdf`. Import it at the top of the body.

pdf-parse drives pdf.js, which needs Node builtins and a canvas; it is not a
guest-module candidate. This pack is a **host module**: the import resolves to a
generated facade over NodeTool's own implementation.

## extractText — whole document to plain text

```js
import { extractText } from "@nodetool-ai/sandbox-pdf";

const bytes = await workspace.readBytes("report.pdf");
const text = await extractText(bytes);
```

All pages concatenated, in order, with no page markers.

## extractPages — one item per page

```js
import { extractPages } from "@nodetool-ai/sandbox-pdf";

const pages = await extractPages(bytes);
// [{ index: 0, pageNumber: 1, text: "Quarterly report" }, ...]
```

Get the bytes from `workspace.readBytes`, or from a fetched body with
`await response.bytes()`.

## Gotchas

- **Both exports are async.**
- **10 MB per document.** Larger input is refused by name.
- **No OCR.** Both exports read the text layer the PDF already carries. A
  scanned page is an image and comes back empty — run
  `@nodetool-ai/sandbox-ocr` over the page image, or a vision model, for that.
- **Text only.** Neither export reads images, tables as tables, or form fields.
  Layout is approximated from text positions, so column order in a
  multi-column page is not guaranteed.
- **An encrypted or malformed PDF throws** with the reason pdf.js gives.
