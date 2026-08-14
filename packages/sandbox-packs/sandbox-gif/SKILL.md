---
name: sandbox-gif
description: Encode an animated GIF from RGBA frames inside a Code node or CodeAct action, with gifenc running in the guest
---

# GIF encoding in the sandbox

Specifier: `@nodetool-ai/sandbox-gif`. One module, gifenc. Declare it in
the node's `packages` property and import it at the top of the body.

## Frames to a GIF

```js
import { GIFEncoder, quantize, applyPalette } from "@nodetool-ai/sandbox-gif";

const gif = GIFEncoder();
for (const frame of inputs.frames) {
  const palette = quantize(frame.rgba, 256);
  const index = applyPalette(frame.rgba, palette);
  gif.writeFrame(index, inputs.width, inputs.height, {
    palette,
    delay: frame.delay ?? 100
  });
}
gif.finish();
return { bytes: gif.bytes() };
```

Each `frame.rgba` is a `Uint8Array` of length `width * height * 4`.
`delay` is milliseconds.

## Gotchas

- **You supply RGBA.** Decode a still with `image.bytes` / canvas, then
  pack frames yourself.
- **`gif.bytes()` is a `Uint8Array`.** Write it with
  `workspace.writeBytes`.
