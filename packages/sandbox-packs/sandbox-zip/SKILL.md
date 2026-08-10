---
name: sandbox-zip
description: Deflate, gzip and zip data you produced, inside a Code node or CodeAct action, with fflate running in the guest. Untrusted archives belong on the data.unzip bridge
---

# Compression in the sandbox

Specifier: `@nodetool-ai/sandbox-zip`. One module, the fflate root export.
Declare it in the node's `packages` property and import it at the top of the
body.

Use the synchronous entry points. The streaming and callback APIs schedule
work, and the guest has no timers to schedule it with.

## zipSync — pack bytes you hold

```js
import { zipSync, strToU8 } from "@nodetool-ai/sandbox-zip";

const archive = zipSync({
  "report.md": strToU8(inputs.markdown),
  "data.json": strToU8(JSON.stringify(inputs.rows))
});
return { archive };
```

## gzipSync / gunzipSync — one payload

```js
import { gzipSync, gunzipSync, strToU8, strFromU8 } from "@nodetool-ai/sandbox-zip";

const packed = gzipSync(strToU8(inputs.text), { level: 6 });
return { bytes: packed, roundTrip: strFromU8(gunzipSync(packed)) };
```

`strToU8` and `strFromU8` are the UTF-8 converters; there is no `Buffer` and no
`TextEncoder` in the guest.

## Decompressing an archive you did not create

Use `data.unzip`, not this pack.

```js
const files = await data.unzip(inputs.archive);
```

The bridge refuses an archive that inflates past 50 MB. The guest heap does
**not** replicate that limit: 64 MB of heap does not bound what a decompressor
can be told to produce, and a zip bomb sized to fit the heap still costs you the
whole run. `unzipSync` inside the guest has no such ceiling, so reach for it
only on bytes you produced or bytes whose provenance you control.

## Gotchas

- **Bytes only.** Every fflate entry point takes and returns `Uint8Array`.
  Convert with `strToU8` / `strFromU8`.
- **Input and output share the heap.** Compressing a 30 MB payload holds the
  input, the output, and fflate's window at once, inside 64 MB.
- **No timers, no workers.** `zip`, `unzip`, `gzip` (the async forms) and
  `AsyncZipDeflate` need a scheduler the guest does not have. The `*Sync`
  names are the whole usable surface.
- **`data.zip` and `data.unzip` stay** and stay hardened. Nothing in this pack
  changes their 10 MB input cap or their 50 MB total-inflation cap.
