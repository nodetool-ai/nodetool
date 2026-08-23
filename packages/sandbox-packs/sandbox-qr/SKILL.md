---
name: sandbox-qr
description: Encode text into a QR matrix or SVG inside a Code node or CodeAct action, with uqr running in the guest
---

# QR codes in the sandbox

Specifier: `@nodetool-ai/sandbox-qr`. One module, the `uqr` root export.
Import it at the top of the body.

## encode — text to a QR matrix

```js
import { encode } from "@nodetool-ai/sandbox-qr";

const qr = encode(inputs.text);
return { size: qr.size, data: qr.data };
```

`data` is a boolean matrix (`true` is a dark module). `size` is the module count.

## encode — text to SVG

```js
import { encode } from "@nodetool-ai/sandbox-qr";

const qr = encode(inputs.text);
const cells = [];
for (let y = 0; y < qr.size; y++) {
  for (let x = 0; x < qr.size; x++) {
    if (qr.data[y][x]) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  }
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges">${cells.join("")}</svg>`;
return { svg, size: qr.size };
```

Or pass the matrix to `@nodetool-ai/sandbox-fabric` if you already have that pack.

## Gotchas

- **Guest only.** No canvas, no PNG encoder. Build SVG yourself or rasterize with Fabric.
- **Named export.** `import { encode } from "@nodetool-ai/sandbox-qr"`.
