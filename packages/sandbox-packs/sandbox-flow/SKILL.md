---
name: sandbox-flow
description: Call NodeTool nodes as typed async functions from sandbox code, one importable module per node namespace, with streaming and plain JavaScript control flow
---

# Calling nodes from the sandbox

Specifier: `@nodetool-ai/sandbox-flow`. Each node namespace is its own module —
`@nodetool-ai/sandbox-flow/nodetool.text`,
`@nodetool-ai/sandbox-flow/lib.audio`, and so on for all 69. Every node type is
a generated async function whose name and inputs come from the node's own
metadata, so a type this pack does not export has no import to resolve.

This is not the graph DSL. Nothing is built, saved, or scheduled: the call runs
the node and resolves to its outputs. `await` is the edge, a variable is the
wire, `Promise.all` is the fan-out, and `if`/`for`/`try` are themselves.

```js
import { concat } from "@nodetool-ai/sandbox-flow/nodetool.text";

const r = await concat({ a: "hello ", b: "world" });
return r.output;
```

## Two imports, both required

1. `import { … } from "@nodetool-ai/sandbox-flow/<namespace>";` — the nodes.
2. `import "@nodetool-ai/sandbox-nodetool/flow";` — the capability module.

The second one is not decoration. The host mounts a capability module by
reading the **body's** static imports, and this pack's guest code calls into
`@nodetool-ai/sandbox-nodetool/flow`. Without the body-side import the facade
is never mounted and the pack's own import of it is refused by name.

```js
import "@nodetool-ai/sandbox-nodetool/flow";
import { concat } from "@nodetool-ai/sandbox-flow/nodetool.text";
```

## Streaming

A node that streams its output carries a `.stream` member; a one-shot node does
not, so the surface tells you which is which. Awaiting the plain call on a
streaming node still works — it drains the node and returns the last value per
slot.

```js
import "@nodetool-ai/sandbox-nodetool/flow";
import { agent } from "@nodetool-ai/sandbox-flow/nodetool.agents";

let text = "";
for await (const chunk of agent.stream({ objective: "Summarize the file" })) {
  text += chunk.chunk ?? "";
  if (text.length > 2000) break; // closes the stream; the node stops
}
return text;
```

Breaking early releases the stream on the host. Read it to the end, or break —
both are fine; abandoning the loop object without either is what leaks.

A node written against the streaming-input contract streams `{slot, value}`
instead of partial outputs, one item per emission, and its inputs accept an
array wherever a single value goes:

```js
import { take } from "@nodetool-ai/sandbox-flow/nodetool.control";

const kept = [];
for await (const { slot, value } of take.stream({ input_item: [1, 2, 3], n: 2 })) {
  if (slot === "output") kept.push(value);
}
```

Arrays are the whole of streaming input in this version. An async iterable on
an input handle is not accepted.

## Errors

A node that fails rejects the call with its own error. There is no verdict
machinery and no per-node error stream — your `try`/`catch` is the supervisor,
and retry, fallback, and timeout are yours to write:

```js
import "@nodetool-ai/sandbox-nodetool/flow";
import { textToSpeech } from "@nodetool-ai/sandbox-flow/gemini.audio";

try {
  return await textToSpeech({ text: draft });
} catch (error) {
  return { error: String(error) };
}
```

## Fan-out

Concurrency is `Promise.all`, and it is real: the calls run at once.

```js
const summaries = await Promise.all(
  documents.map((document) => summarizer({ text: document }))
);
```

Nothing throttles this. A hundred items is a hundred concurrent model calls —
batch them yourself when that matters.

## The untyped root

`import { callNode } from "@nodetool-ai/sandbox-flow"` takes a node type as a
string and checks nothing until the host answers. Use it when the type is
decided at run time; otherwise import the namespace, where a wrong name is an
import error rather than a failed call.

## Gotchas

- **Inputs are values, not handles.** There is nothing to wire and no
  `.output()` — the call returns the outputs record.
- **No graph comes out of this.** Nothing opens in the editor, validates, or
  replays. When the artifact matters, build a graph with
  `@nodetool-ai/sandbox-dsl` instead.
- **A missing property is the node's default**, exactly as in a graph run.
- **Names follow the node class**: `nodetool.text.Concat` is `concat`,
  `nodetool.constant.Integer` is `integer`. Reserved words take a trailing
  underscore (`if_`).
