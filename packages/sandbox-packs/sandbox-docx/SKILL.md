---
name: sandbox-docx
description: Build a Word document in a Code node or CodeAct action, with docx running on the host
---

# Word documents in the sandbox

Specifier: `@nodetool-ai/sandbox-docx`. Import it at the top of the body.

`docx` builds a document out of class instances (`Paragraph`, `TextRun`,
`Table`, …) that cannot cross the guest boundary as plain data. This pack is a
**host module**: you describe the document as a JSON element list and the host
builds the real `.docx` bytes.

## build — element list to `.docx` bytes

```js
import { build } from "@nodetool-ai/sandbox-docx";

const bytes = await build({
  properties: { title: "Q3 Report", author: "NodeTool" },
  elements: [
    { type: "heading", text: "Q3 Report", level: 1 },
    { type: "paragraph", text: "Revenue grew 12% quarter over quarter.", bold: true },
    { type: "table", rows: [["Month", "Revenue"], ["Jul", "120k"], ["Aug", "134k"]] },
    { type: "pageBreak" },
    { type: "paragraph", text: "See appendix for methodology.", alignment: "CENTER" }
  ]
});
await workspace.writeBytes("report.docx", bytes);
```

Element types:

- `heading` — `text`, `level` (1–6, default 1)
- `paragraph` — `text`, `alignment` (`LEFT`/`CENTER`/`RIGHT`/`JUSTIFY`, default
  `LEFT`), `bold`, `italic`, `fontSize` (points, default 12)
- `table` — `rows`, a 2D array; every cell is stringified
- `image` — `data` (a `Uint8Array`), `width`/`height` in inches
- `pageBreak` — no fields

`properties.title`/`author`/`subject`/`keywords` set the document's metadata.

## Gotchas

- **`build` is async** and returns a `Uint8Array`.
- **Writing only.** To read an existing `.docx`, use
  `@nodetool-ai/sandbox-mammoth` instead — these are two different libraries on
  two different sides of the format.
- **Images are inches, not pixels.** `width`/`height` follow docx's own
  convention; omit them and the image renders at a fixed placeholder size.
- **10 MB per image.** The shared host-module input cap applies to each
  `data` field.
