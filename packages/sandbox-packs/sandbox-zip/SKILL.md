---
name: sandbox-zip
description: Read and write zip archives in a Code node or CodeAct action, with fflate running on the host under a 50 MB inflation cap
---

# Zip archives in the sandbox

Specifier: `@nodetool-ai/sandbox-zip`. Import it at the top of the body.

## Why this one runs on the host

fflate is pure JavaScript and the sandbox compiler admits it, so this pack
*could* have shipped as a guest module — and an earlier version did. It does
not, because of the cap: a zip bomb is a policy question, and a policy enforced
inside the guest is enforced by code the guest can simply not call. The guest's
64 MB heap does not replicate it either — fflate inflates into host memory
first. So the library stays on the host, with `unzip` refusing anything that
inflates past **50 MB**, and there is no second route around that number.

## unzip — extract an archive

```js
import { unzip } from "@nodetool-ai/sandbox-zip";

const files = await unzip(inputs.archive);          // { "a/b.txt": Uint8Array }
const readme = new TextDecoder().decode(files["README.md"]);
return { names: Object.keys(files), readme };
```

Entry values arrive as real `Uint8Array`s. Decode text with `TextDecoder`.

## zip — build one

```js
import { zip } from "@nodetool-ai/sandbox-zip";

const archive = await zip({
  "report.md": inputs.markdown,                     // strings are UTF-8 encoded
  "data.json": JSON.stringify(inputs.rows)
});
await workspace.writeBytes("out.zip", archive);
return { bytes: archive.length };
```

Entry values are `Uint8Array` or `string`.

## Gotchas

- **Both exports are async.**
- **10 MB in, 50 MB out.** The archive itself is capped at 10 MB; the sum of the
  entries `unzip` produces — and the sum of what `zip` is handed — is capped at
  50 MB, checked as the entries are walked so a bomb stops part way.
- **No streaming.** The whole archive is materialized. For a payload near the
  cap, write entries to the workspace as you go instead.
