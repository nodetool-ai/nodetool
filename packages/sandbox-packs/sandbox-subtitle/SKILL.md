---
name: sandbox-subtitle
description: Parse and stringify SRT/WebVTT captions in a Code node or CodeAct action, with subtitle running on the host
---

# Captions in the sandbox

Specifier: `@nodetool-ai/sandbox-subtitle`. Import it at the top of the body.

The published subtitle bundle uses streams the guest refuses, so this pack
is a **host module**. You work with plain cue objects.

## parse — SRT or VTT to cues

```js
import { parse } from "@nodetool-ai/sandbox-subtitle";

const cues = await parse(inputs.captions);
return { cues };
```

Each cue is `{ start, end, text }` with times in milliseconds.

## stringify — cues to SRT or VTT

```js
import { stringify } from "@nodetool-ai/sandbox-subtitle";

const srt = await stringify(inputs.cues, { format: "SRT" });
return { srt };
```

Pass `{ format: "WebVTT" }` for VTT.

## Gotchas

- **Async host calls.** Always `await`.
- **Cue text keeps newlines.** Split on `\n` if you need lines.
