---
name: sandbox-exif
description: Read EXIF from image bytes in a Code node or CodeAct action, with exifr running on the host
---

# Photo metadata in the sandbox

Specifier: `@nodetool-ai/sandbox-exif`. Import it at the top of the body.

exifr does not compile into QuickJS, so this pack is a **host module**.

## parse — bytes to tags

```js
import { parse } from "@nodetool-ai/sandbox-exif";

const tags = await parse(inputs.bytes);
return {
  make: tags?.Make ?? null,
  model: tags?.Model ?? null,
  takenAt: tags?.DateTimeOriginal ?? null
};
```

`inputs.bytes` is a `Uint8Array` from `workspace.readBytes` or `image.bytes`.

## Gotchas

- **Named export `parse`.** Not the library's default export.
- **Missing tags return `null`.** A stripped JPEG has no EXIF.
