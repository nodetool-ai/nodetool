---
name: sandbox-color
description: Convert, mix, and measure colors inside a Code node or CodeAct action, with culori running in the guest
---

# Color in the sandbox

Specifier: `@nodetool-ai/sandbox-color`. One module, culori's root export.
Declare it in the node's `packages` property and import it at the top of the body.

## Parse and convert

```js
import { parse, formatHex, converter } from "@nodetool-ai/sandbox-color";

const color = parse(inputs.hex);
const rgb = converter("rgb")(color);
return { hex: formatHex(color), rgb };
```

## Mix and difference

```js
import { interpolate, formatHex, differenceCiede2000 } from "@nodetool-ai/sandbox-color";

const mix = interpolate(["#2563eb", "#f97316"]);
const mid = formatHex(mix(0.5));
const delta = differenceCiede2000()("#2563eb", "#f97316");
return { mid, delta };
```

## Gotchas

- **Objects, not CSS strings, after parse.** A parsed color is `{ mode, ...channels }`.
- **Named imports.** There is no useful default export.
