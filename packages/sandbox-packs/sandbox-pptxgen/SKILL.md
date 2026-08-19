---
name: sandbox-pptxgen
description: Build PowerPoint files in a Code node or CodeAct action, with PptxGenJS running on the host
---

# PowerPoint writing in the sandbox

Specifier: `@nodetool-ai/sandbox-pptxgen`. Import it at the top of the body.

This pack **writes** PPTX files. To extract text from an existing deck, use
`@nodetool-ai/sandbox-pptx` instead.

## build — slides to PPTX bytes

Positions are **inches from the top-left**. A widescreen slide is 13.33×7.5.

```js
import { build } from "@nodetool-ai/sandbox-pptxgen";

const bytes = await build({
  title: "Q3 Review",
  author: "NodeTool",
  slides: [
    {
      background: "#0f172a",
      items: [
        { type: "text", x: 0.5, y: 0.4, w: 12, h: 1, text: "Q3 Review", fontSize: 36, color: "#ffffff", bold: true },
        { type: "shape", shape: "rect", x: 0.5, y: 1.6, w: 4, h: 0.15, fill: "#38bdf8" },
        { type: "image", x: 8, y: 2.5, w: 4, h: 3, data: inputs.chart }
      ]
    }
  ]
});
await workspace.writeBytes("q3.pptx", bytes);
```

Item types:

- `text` — `x`, `y`, `w`/`h` (or `width`/`height`), `text`, `fontSize`,
  `color` (hex), `bold`, `align` (`left`/`center`/`right`)
- `image` — `x`, `y`, `w`/`h`, `data` (`Uint8Array` PNG or JPEG)
- `shape` — `shape` (PptxGenJS name, default `rect`), `x`, `y`, `w`/`h`,
  `fill` (hex)

## Gotchas

- **Host module.** `build` is async and returns a `Uint8Array`.
- **At most 200 slides.**
- **Hex colors** may include a leading `#`.
