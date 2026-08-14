---
name: sandbox-fabric
description: Build, parse, and rasterize SVG with Fabric.js (renderSVG, loadSVG, render)
---

# Fabric.js in the sandbox

Specifier: `@nodetool-ai/sandbox-fabric`. Declare it in the node's `packages`
property and import it at the top of the body.

## render — Canvas spec / JSON to image bytes

Renders a scene description (objects, dimensions, background color) to raster
image bytes (`Uint8Array`):

```js
import { render } from "@nodetool-ai/sandbox-fabric";

const imageBytes = await render({
  width: 800,
  height: 600,
  backgroundColor: "#f8fafc",
  objects: [
    {
      type: "rect",
      left: 100,
      top: 100,
      width: 200,
      height: 120,
      fill: "#3b82f6",
      rx: 10,
      ry: 10
    },
    {
      type: "textbox",
      left: 120,
      top: 140,
      text: "NodeTool & Fabric.js",
      fontSize: 20,
      fill: "#ffffff"
    }
  ]
}, { format: "png", multiplier: 1 });

return { image: imageBytes };
```

## renderSVG — Canvas spec / JSON to SVG string

Renders a scene specification directly into an SVG string:

```js
import { renderSVG } from "@nodetool-ai/sandbox-fabric";

const svgString = await renderSVG({
  width: 500,
  height: 500,
  backgroundColor: "#ffffff",
  objects: [
    {
      type: "circle",
      left: 250,
      top: 250,
      radius: 100,
      fill: "#ef4444"
    }
  ]
});

return { svg: svgString };
```

## toDataURL — Canvas spec to Data URL

Exports the scene as a base64 Data URL string:

```js
import { toDataURL } from "@nodetool-ai/sandbox-fabric";

const dataUrl = await toDataURL({
  width: 400,
  height: 300,
  objects: [
    { type: "rect", left: 50, top: 50, width: 100, height: 100, fill: "green" }
  ]
}, { format: "png" });

return { dataUrl };
```

## loadSVG — Parse SVG string into Fabric objects

Parses an SVG document into Fabric objects and canvas options:

```js
import { loadSVG, render } from "@nodetool-ai/sandbox-fabric";

const parsed = await loadSVG("<svg ...>...</svg>");
const imageBytes = await render({
  width: 600,
  height: 400,
  objects: parsed.objects
});

return { image: imageBytes };
```

## Gotchas

- **Host execution.** Fabric.js depends on canvas and DOM APIs that do not exist
  in the pure WebAssembly QuickJS guest. It runs on the host and passes plain
  serializable data across the sandbox boundary.
- **Dimensions are bounded.** Canvas dimensions are clamped to a maximum of 8192
  pixels to prevent excessive memory consumption.
