---
name: sandbox-tokens
description: Count, encode, and decode LLM tokens in a Code node or CodeAct action, with js-tiktoken running on the host
---

# Token counting in the sandbox

Specifier: `@nodetool-ai/sandbox-tokens`. Import it at the top of the body.

One encoding's BPE ranks are several megabytes, well past the 1 MB cap on a
compiled guest module, so this pack is a **host module**: the import resolves to
a generated facade over NodeTool's own implementation. The ranks load once per
process per encoding.

This is what the removed `nodetool.text.CountTokens` node did.

## count — how many tokens a text costs

```js
import { count } from "@nodetool-ai/sandbox-tokens";

const tokens = await count(inputs.text, "cl100k_base");
return { tokens, fitsContext: tokens < 8000 };
```

Encodings: `cl100k_base` (default — GPT-4, GPT-3.5), `o200k_base` (GPT-4o),
`p50k_base`, `r50k_base`. Empty text is 0 without loading anything.

## encode / decode — the token ids themselves

```js
import { encode, decode } from "@nodetool-ai/sandbox-tokens";

const ids = await encode(inputs.text);
// Truncate on a token boundary rather than a character one.
return { head: await decode(ids.slice(0, 500)) };
```

## Gotchas

- **All three are async.**
- **5 MB per call**, the shared host-module text cap.
- **tiktoken is OpenAI's tokenizer.** Anthropic, Gemini, and local models count
  differently — treat the number as an estimate for anything else.
- **Round-tripping is not free.** `decode(encode(t))` allocates the ranks and
  two passes; use `count` when you only need the number.
